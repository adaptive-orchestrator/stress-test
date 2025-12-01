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
const VALID_PLAN_IDS = [1, 2, 3];

function getPlanId(index) {
  return VALID_PLAN_IDS[index % VALID_PLAN_IDS.length];
}

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // ===== TEST 1: List all subscriptions =====
  const listRes = http.get(`${BASE_URL}/subscriptions`);
  check(listRes, { 'list 200': (r) => r.status === 200 });

  let subscriptions = [];
  try {
    subscriptions = JSON.parse(listRes.body) || [];
  } catch (e) {
    subscriptions = [];
  }

  // ===== TEST 2: Làm việc với subscriptions đã có =====
  if (Array.isArray(subscriptions) && subscriptions.length > 0) {
    // Chọn một subscription để test (dựa vào VU để phân tán load)
    const subIndex = __VU % subscriptions.length;
    const sub = subscriptions[subIndex];
    
    if (sub && sub.id) {
      // TEST: Get subscription by ID
      check(http.get(`${BASE_URL}/subscriptions/${sub.id}`), { 
        'get by id 200': (r) => r.status === 200 
      });

      // TEST: Get by customer
      if (sub.customerId) {
        check(http.get(`${BASE_URL}/subscriptions/customer/${sub.customerId}`), { 
          'get by customer 200': (r) => r.status === 200 
        });
      }

      // TEST: Operations dựa trên status hiện tại
      const status = (sub.status || '').toLowerCase();
      
      if (status === 'pending') {
        // Activate subscription
        const activateRes = http.post(`${BASE_URL}/subscriptions/${sub.id}/activate`);
        check(activateRes, { 'activate 200': (r) => r.status === 200 || r.status === 400 });
      }
      
      if (status === 'active') {
        // Change plan (chỉ với active subscriptions)
        const newPlanId = getPlanId(__ITER % 3);
        const changeRes = http.patch(
          `${BASE_URL}/subscriptions/${sub.id}/change-plan`, 
          JSON.stringify({ newPlanId: newPlanId, scheduleAtPeriodEnd: true }), 
          { headers }
        );
        check(changeRes, { 'change plan 200': (r) => r.status === 200 || r.status === 400 });

        // Renew (chỉ với active subscriptions)
        const renewRes = http.patch(`${BASE_URL}/subscriptions/${sub.id}/renew`);
        check(renewRes, { 'renew 200': (r) => r.status === 200 || r.status === 400 });
      }
    }
  }

  // ===== TEST 3: Read operations với nhiều subscriptions =====
  for (let i = 0; i < Math.min(3, subscriptions.length); i++) {
    const sub = subscriptions[i];
    if (sub && sub.id) {
      check(http.get(`${BASE_URL}/subscriptions/${sub.id}`), { 
        'batch get 200': (r) => r.status === 200 
      });
    }
  }

  sleep(0.3);
}

export function setup() {
  const health = http.get(`${BASE_URL}/subscriptions`);
  if (health.status >= 500) throw new Error('Subscription API unhealthy');
  
  let subs = [];
  try {
    subs = JSON.parse(health.body) || [];
  } catch (e) {
    subs = [];
  }
  
  console.log(`Subscription API is healthy. Found ${subs.length} existing subscriptions.`);
  console.log('Starting stress test on READ and UPDATE operations...');
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
  } else {
    replicas = Math.ceil(maxVUs / 30);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return { serviceName: 'subscription-svc', replicas, resources: { requests: { cpu: cpuRequest, memory: memoryRequest }, limits: { cpu: cpuLimit, memory: memoryLimit } },
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
    'subscription-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
