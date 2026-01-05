import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<700'],
    http_req_failed: ['rate<0.1'],
  },
};

const BASE_URL = 'http://localhost:3000';

// Generate a random UUID for testing
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function createData() {
  return { code: `CODE${Math.floor(Math.random()*10000)}`, discountType: 'percentage', discountValue: 10 + Math.floor(Math.random()*30), status: 'active' };
}

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // Create
  const create = http.post(`${BASE_URL}/promotions`, JSON.stringify(createData()), { headers });
  check(create, { 'create 201/400/409': (r) => r.status === 201 || r.status === 400 || r.status === 409 });

  // List
  check(http.get(`${BASE_URL}/promotions?status=active&limit=50&offset=0`), { 'list 200': (r) => r.status === 200 });

  // Get by code
  const code = JSON.parse(create.body)?.promotion?.code || JSON.parse(create.body)?.code || 'CODE1';
  check(http.get(`${BASE_URL}/promotions/code/${code}`), { 'code 200/404': (r) => r.status === 200 || r.status === 404 });

  if (create.status === 201) {
    const id = JSON.parse(create.body)?.promotion?.id || JSON.parse(create.body)?.id;

    // Get by id
    check(http.get(`${BASE_URL}/promotions/${id}`), { 'get 200': (r) => r.status === 200 });

    // Update
    check(http.patch(`${BASE_URL}/promotions/${id}`, JSON.stringify({ status: 'inactive' }), { headers }), { 'update 200/404': (r) => r.status === 200 || r.status === 404 });

    // Validate
    check(http.post(`${BASE_URL}/promotions/validate`, JSON.stringify({ code, customerId: randomUUID(), planId: 'p0000001-0000-0000-0000-000000000001' }), { headers }), { 'validate 200/400': (r) => r.status === 200 || r.status === 400 });

    // Apply
    check(http.post(`${BASE_URL}/promotions/apply`, JSON.stringify({ code, subscriptionId: randomUUID() }), { headers }), { 'apply 200/400': (r) => r.status === 200 || r.status === 400 });

    // Usage
    check(http.get(`${BASE_URL}/promotions/usage/history?promotionId=${id}&limit=10&offset=0`), { 'usage 200': (r) => r.status === 200 });

    // Delete
    check(http.del(`${BASE_URL}/promotions/${id}`), { 'delete 200/404': (r) => r.status === 200 || r.status === 404 });
  }

  sleep(Math.random()*1.5 + 0.5);
}

export function setup() {
  const health = http.get(`${BASE_URL}/promotions`);
  if (health.status >= 500) throw new Error('Promotion API unhealthy');
  return { startTime: Date.now() };
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
  
  return { serviceName: 'promotion-svc (pricing-engine)', replicas, resources: { requests: { cpu: cpuRequest, memory: memoryRequest }, limits: { cpu: cpuLimit, memory: memoryLimit } },
    metrics: { maxVUs, avgResponseTime: avgResponseTime.toFixed(2), p95ResponseTime: p95ResponseTime.toFixed(2), p99ResponseTime: p99ResponseTime.toFixed(2), errorRate: (errorRate * 100).toFixed(2), throughput: throughput.toFixed(2) }
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
    'promotion-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
