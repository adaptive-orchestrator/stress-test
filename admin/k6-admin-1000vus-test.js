import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics để theo dõi performance
const responseTime = new Trend('custom_response_time');
const requestCount = new Counter('custom_request_count');
const errorCount = new Counter('custom_error_count');
const activeVUs = new Gauge('custom_active_vus');

export const options = {
  stages: [
    // Warm-up phase
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    // Ramp-up to high load
    { duration: '1m', target: 300 },
    { duration: '2m', target: 500 },
    // Peak load - 1000 VUs
    { duration: '2m', target: 1000 },
    { duration: '3m', target: 1000 },  // Sustain 1000 VUs for 3 minutes
    // Cool-down
    { duration: '1m', target: 500 },
    { duration: '30s', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'], // 95% < 5s, 99% < 10s
    'http_req_failed{status:500}': ['rate<0.10'],  // Chỉ count 5xx là lỗi
    custom_response_time: ['p(95)<5000'],
  },
};

const BASE_URL = 'http://localhost:3000';

export function setup() {
  console.log('='.repeat(60));
  console.log('🚀 ADMIN API STRESS TEST - 1000 VUs');
  console.log('='.repeat(60));
  console.log('📊 Monitoring CPU & Memory via response metrics:');
  console.log('   - http_req_waiting: Server processing time (CPU indicator)');
  console.log('   - http_req_connecting: Connection time (Memory/Network)');
  console.log('   - http_req_duration: Total response time');
  console.log('='.repeat(60));
  
  const health = http.get(`${BASE_URL}/admin/stats/dashboard`);
  if (health.status >= 500) throw new Error('Admin API unhealthy');
  
  return { startTime: Date.now() };
}

export default function (data) {
  activeVUs.add(__VU);
  
  const endpoints = [
    '/admin/stats/dashboard',
    '/admin/stats/revenue',
  ];
  
  for (const endpoint of endpoints) {
    const start = Date.now();
    const res = http.get(`${BASE_URL}${endpoint}`);
    const duration = Date.now() - start;
    
    responseTime.add(duration);
    requestCount.add(1);
    
    const success = check(res, {
      [`${endpoint} status OK`]: (r) => [200, 401, 403].includes(r.status),
      [`${endpoint} response < 5s`]: (r) => r.timings.duration < 5000,
    });
    
    if (!success || res.status >= 500) {
      errorCount.add(1);
    }
    
    // Log thông tin CPU/Memory indicators mỗi 100 VUs
    if (__VU % 100 === 0 && __ITER === 0) {
      console.log(`[VU ${__VU}] ${endpoint}:`);
      console.log(`  - Waiting (CPU): ${res.timings.waiting.toFixed(2)}ms`);
      console.log(`  - Connecting (Mem): ${res.timings.connecting.toFixed(2)}ms`);
      console.log(`  - Duration: ${res.timings.duration.toFixed(2)}ms`);
    }
  }
  
  sleep(Math.random() * 2 + 0.5); // Random sleep 0.5-2.5s
}

// Calculate recommended K8s resources based on test results
function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = 1000;
  const avgResponseTime = metrics.http_req_duration?.values?.avg || 0;
  const p95ResponseTime = metrics.http_req_duration?.values['p(95)'] || 0;
  const p99ResponseTime = metrics.http_req_duration?.values['p(99)'] || 0;
  const errorRate = metrics.http_req_failed?.values?.rate || 0;
  const throughput = metrics.http_reqs?.values?.rate || 0;
  const waitingTime = metrics.http_req_waiting?.values?.avg || 0;
  const blockedTime = metrics.http_req_blocked?.values?.avg || 0;
  
  let cpuRequest = '100m';
  let cpuLimit = '500m';
  let memoryRequest = '128Mi';
  let memoryLimit = '512Mi';
  let replicas = 1;
  
  if (p95ResponseTime > 2000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
  } else if (p95ResponseTime > 1000) {
    cpuRequest = '250m'; cpuLimit = '1000m';
  } else if (p95ResponseTime > 500) {
    cpuRequest = '150m'; cpuLimit = '750m';
  }
  
  if (waitingTime > 1000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
  } else if (waitingTime > 500) {
    cpuRequest = '300m'; cpuLimit = '1500m';
  }
  
  if (blockedTime > 500 || throughput > 500) {
    memoryRequest = '512Mi'; memoryLimit = '1Gi';
  } else if (blockedTime > 200 || throughput > 200) {
    memoryRequest = '256Mi'; memoryLimit = '768Mi';
  }
  
  if (errorRate > 0.1 || p99ResponseTime > 5000) {
    replicas = Math.ceil(maxVUs / 150);
  } else if (errorRate > 0.05 || p99ResponseTime > 3000) {
    replicas = Math.ceil(maxVUs / 200);
  } else if (p95ResponseTime > 1000) {
    replicas = Math.ceil(maxVUs / 250);
  } else {
    replicas = Math.ceil(maxVUs / 300);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return { serviceName: 'admin-svc', replicas, resources: { requests: { cpu: cpuRequest, memory: memoryRequest }, limits: { cpu: cpuLimit, memory: memoryLimit } },
    metrics: { maxVUs, avgResponseTime: avgResponseTime.toFixed(2), p95ResponseTime: p95ResponseTime.toFixed(2), p99ResponseTime: p99ResponseTime.toFixed(2), errorRate: (errorRate * 100).toFixed(2), throughput: throughput.toFixed(2) }
  };
}

export function teardown(data) {
  const duration = ((Date.now() - data.startTime) / 1000).toFixed(2);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST COMPLETED - 1000 VUs STRESS TEST');
  console.log('='.repeat(60));
  console.log(`⏱️  Total Duration: ${duration}s`);
  console.log('');
  console.log('🔍 CPU & Memory Analysis (check k6 output above):');
  console.log('   - http_req_waiting (avg): Server CPU processing time');
  console.log('   - http_req_connecting (avg): Memory/connection overhead');
  console.log('   - http_req_blocked: Queue/resource contention');
  console.log('');
  console.log('⚠️  High values indicate:');
  console.log('   - waiting > 1000ms → CPU overload');
  console.log('   - connecting > 100ms → Memory pressure');
  console.log('   - blocked > 500ms → Connection pool exhausted');
  console.log('='.repeat(60));
}

export function handleSummary(data) {
  const recommendation = calculateResourceRecommendation(data);
  
  console.log('\n' + '='.repeat(60));
  console.log('🎯 K8S RESOURCE RECOMMENDATIONS');
  console.log('='.repeat(60));
  console.log(`Service: ${recommendation.serviceName}`);
  console.log(`Replicas: ${recommendation.replicas}`);
  console.log(`CPU Request: ${recommendation.resources.requests.cpu}`);
  console.log(`CPU Limit: ${recommendation.resources.limits.cpu}`);
  console.log(`Memory Request: ${recommendation.resources.requests.memory}`);
  console.log(`Memory Limit: ${recommendation.resources.limits.memory}`);
  console.log('\n📋 YAML Configuration:');
  console.log('```yaml');
  console.log(`replicas: ${recommendation.replicas}`);
  console.log('resources:');
  console.log('  requests:');
  console.log(`    cpu: "${recommendation.resources.requests.cpu}"`);
  console.log(`    memory: "${recommendation.resources.requests.memory}"`);
  console.log('  limits:');
  console.log(`    cpu: "${recommendation.resources.limits.cpu}"`);
  console.log(`    memory: "${recommendation.resources.limits.memory}"`);
  console.log('```');
  console.log('='.repeat(60) + '\n');
  
  return {
    'admin-1000vus-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
