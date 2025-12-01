import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

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
    http_req_duration: ['p(95)<600'],
    http_req_failed: ['rate<0.1'],
    errors: ['rate<0.1'],
  },
};

const BASE_URL = 'http://localhost:3000';

function createItem() {
  return {
    productId: 1,
    quantity: 2,
    price: 99.99,
  };
}

function createOrderPayload() {
  return {
    customerId: 1,
    items: [createItem()],
    notes: 'Stress test order',
    shippingAddress: '123 Test Street, District 1, Ho Chi Minh City',
  };
}

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // Create
  const createRes = http.post(`${BASE_URL}/orders`, JSON.stringify(createOrderPayload()), { headers });
  const okCreate = check(createRes, { 'create 201': (r) => r.status === 201 });
  errorRate.add(!okCreate);

  if (okCreate) {
    const b = JSON.parse(createRes.body);
    const orderId = b.order.id;
    const customerId = b.order.customerId;

    // Get by id
    const getRes = http.get(`${BASE_URL}/orders/${orderId}`);
    check(getRes, { 'get 200': (r) => r.status === 200 });

    // List
    check(http.get(`${BASE_URL}/orders?page=1&limit=20`), { 'list 200': (r) => r.status === 200 });

    // By customer
    check(http.get(`${BASE_URL}/orders/customer/${customerId}?page=1&limit=10`), { 'by customer 200': (r) => r.status === 200 });

    // Add item first (only allowed when order is 'pending')
    check(http.post(`${BASE_URL}/orders/${orderId}/items`, JSON.stringify({ productId: 2, quantity: 1, price: 49.99 }), { headers }), { 'add item 200/201': (r) => r.status === 200 || r.status === 201 });

    // Update status: pending -> confirmed (valid transition)
    check(http.patch(`${BASE_URL}/orders/${orderId}/status`, JSON.stringify({ status: 'confirmed' }), { headers }), { 'status 200': (r) => r.status === 200 });

    // Cancel
    check(http.del(`${BASE_URL}/orders/${orderId}?reason=Stress%20test`), { 'cancel 200': (r) => r.status === 200 });
  }

  sleep(Math.random() * 1.5 + 0.5);
}

export function setup() {
  const health = http.get(`${BASE_URL}/orders?page=1&limit=1`);
  if (health.status >= 500) {
    throw new Error('Orders API unhealthy');
  }
  console.log('✅ Orders API reachable');
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
  let replicas = 2;
  
  // Order service needs more resources due to transactional complexity
  if (p95ResponseTime > 2000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
    memoryRequest = '512Mi'; memoryLimit = '1Gi';
  } else if (p95ResponseTime > 1000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '384Mi'; memoryLimit = '768Mi';
  } else if (p95ResponseTime > 500) {
    cpuRequest = '200m'; cpuLimit = '1000m';
    memoryRequest = '256Mi'; memoryLimit = '640Mi';
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
  } else {
    replicas = Math.ceil(maxVUs / 30);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return { serviceName: 'order-svc', replicas, resources: { requests: { cpu: cpuRequest, memory: memoryRequest }, limits: { cpu: cpuLimit, memory: memoryLimit } },
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
    'order-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
