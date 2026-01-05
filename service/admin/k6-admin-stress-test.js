import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration - Standardized stages
export const options = {
  stages: [
    // Stage 1: Warm up - 10 VUs
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    
    // Stage 2: Scale up - 50 VUs
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    
    // Stage 3: Peak load - 100 VUs
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    
    // Stage 4: Cool down
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.1'],
    errors: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  console.log('\n' + '='.repeat(60));
  console.log('   ADMIN SERVICE STRESS TEST');
  console.log('='.repeat(60));
  console.log(`Target API: ${BASE_URL}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');

  const health = http.get(`${BASE_URL}/admin/stats/dashboard`);
  if (health.status >= 500) throw new Error('Admin API unhealthy');
  console.log('✅ Admin API is healthy');
  
  return { startTime: Date.now() };
}

// Note: Admin endpoints require JWT + Admin role; this test checks reachability
export default function () {
  // Test 1: Dashboard stats
  const dashboardRes = http.get(`${BASE_URL}/admin/stats/dashboard`);
  const dashboardOk = check(dashboardRes, { 
    'dashboard: status 200/401/403': (r) => [200, 401, 403].includes(r.status) 
  });
  errorRate.add(!dashboardOk);
  
  // Test 2: Revenue stats
  const revenueRes = http.get(`${BASE_URL}/admin/stats/revenue`);
  check(revenueRes, { 
    'revenue: status 200/401/403': (r) => [200, 401, 403].includes(r.status) 
  });
  
  // Test 3: User stats
  const userStatsRes = http.get(`${BASE_URL}/admin/stats/users`);
  check(userStatsRes, { 
    'user stats: status 200/401/403': (r) => [200, 401, 403].includes(r.status) 
  });
  
  // Test 4: Order stats
  const orderStatsRes = http.get(`${BASE_URL}/admin/stats/orders`);
  check(orderStatsRes, { 
    'order stats: status 200/401/403': (r) => [200, 401, 403].includes(r.status) 
  });
  
  sleep(Math.random() * 1.5 + 0.5);
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('\n' + '='.repeat(60));
  console.log('   TEST COMPLETED');
  console.log('='.repeat(60));
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Finished at: ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');
}

// Calculate recommended K8s resources based on test results
function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = 100;
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
    replicas = Math.ceil(maxVUs / 15);
  } else if (errorRate > 0.05 || p99ResponseTime > 3000) {
    replicas = Math.ceil(maxVUs / 20);
  } else if (p95ResponseTime > 1000) {
    replicas = Math.ceil(maxVUs / 25);
  } else {
    replicas = Math.ceil(maxVUs / 30);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return {
    serviceName: 'admin-svc (api-gateway)',
    replicas,
    resources: {
      requests: { cpu: cpuRequest, memory: memoryRequest },
      limits: { cpu: cpuLimit, memory: memoryLimit }
    },
    metrics: {
      maxVUs,
      avgResponseTime: avgResponseTime.toFixed(2),
      p95ResponseTime: p95ResponseTime.toFixed(2),
      p99ResponseTime: p99ResponseTime.toFixed(2),
      errorRate: (errorRate * 100).toFixed(2),
      throughput: throughput.toFixed(2)
    }
  };
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
    'admin-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
