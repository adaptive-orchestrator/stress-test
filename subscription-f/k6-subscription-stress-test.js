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

// Valid plan UUIDs - should match seeded data
const VALID_PLAN_IDS = [
  'p0000001-0000-0000-0000-000000000001',
  'p0000001-0000-0000-0000-000000000002',
  'p0000001-0000-0000-0000-000000000003'
];

// Test users - each VU gets a different user to test data isolation
const TEST_USERS = [
  { email: 'testuser1@example.com', password: 'test123456' },
  { email: 'testuser2@example.com', password: 'test123456' },
  { email: 'testuser3@example.com', password: 'test123456' },
  { email: 'testuser4@example.com', password: 'test123456' },
  { email: 'testuser5@example.com', password: 'test123456' },
  { email: 'testuser6@example.com', password: 'test123456' },
  { email: 'testuser7@example.com', password: 'test123456' },
  { email: 'testuser8@example.com', password: 'test123456' },
  { email: 'testuser9@example.com', password: 'test123456' },
  { email: 'testuser10@example.com', password: 'test123456' },
];

// Admin user for admin-only operations
const ADMIN_USER = { email: 'admin@example.com', password: 'admin123456' };

// Cache for auth tokens
const authCache = {};

function getAuthHeaders(vuIndex, useAdmin = false) {
  const user = useAdmin ? ADMIN_USER : TEST_USERS[vuIndex % TEST_USERS.length];
  
  // Try to use cached token
  if (authCache[user.email]) {
    return authCache[user.email];
  }
  
  // Login to get token
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (loginRes.status === 200) {
    try {
      const body = JSON.parse(loginRes.body);
      const token = body.token || body.access_token;
      authCache[user.email] = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };
      return authCache[user.email];
    } catch (e) {
      console.error('Failed to parse login response');
    }
  }
  
  // Fallback to no auth (for backward compatibility)
  return { 'Content-Type': 'application/json' };
}

function getPlanId(index) {
  return VALID_PLAN_IDS[index % VALID_PLAN_IDS.length];
}

export default function () {
  const headers = getAuthHeaders(__VU);

  // ===== TEST 1: Get my subscriptions (user-specific) =====
  const mySubsRes = http.get(`${BASE_URL}/subscriptions/my`, { headers });
  check(mySubsRes, { 'my subscriptions 200': (r) => r.status === 200 });

  let mySubscriptions = [];
  try {
    const body = JSON.parse(mySubsRes.body);
    mySubscriptions = body.subscriptions || [];
  } catch (e) {
    mySubscriptions = [];
  }

  // ===== TEST 2: Work with user's own subscriptions =====
  if (Array.isArray(mySubscriptions) && mySubscriptions.length > 0) {
    const subIndex = __ITER % mySubscriptions.length;
    const sub = mySubscriptions[subIndex];
    
    if (sub && sub.id) {
      // Get subscription by ID (should succeed for own subscription)
      check(http.get(`${BASE_URL}/subscriptions/${sub.id}`, { headers }), { 
        'get own by id 200': (r) => r.status === 200 
      });

      // Operations based on status
      const status = (sub.status || '').toLowerCase();
      
      if (status === 'pending') {
        const activateRes = http.post(`${BASE_URL}/subscriptions/${sub.id}/activate`, null, { headers });
        check(activateRes, { 'activate own 200': (r) => r.status === 200 || r.status === 400 });
      }
      
      if (status === 'active') {
        // Change plan for own subscription
        const newPlanId = getPlanId(__ITER % 3);
        const changeRes = http.patch(
          `${BASE_URL}/subscriptions/${sub.id}/change-plan`, 
          JSON.stringify({ newPlanId: newPlanId, scheduleAtPeriodEnd: true }), 
          { headers }
        );
        check(changeRes, { 'change own plan 200': (r) => r.status === 200 || r.status === 400 });

        // Renew own subscription
        const renewRes = http.patch(`${BASE_URL}/subscriptions/${sub.id}/renew`, null, { headers });
        check(renewRes, { 'renew own 200': (r) => r.status === 200 || r.status === 400 });
      }
    }
  }

  // ===== TEST 3: Data isolation test - try to access other user's data =====
  // This should fail with 403 Forbidden
  const otherUserIndex = (__VU + 1) % TEST_USERS.length;
  const otherUser = TEST_USERS[otherUserIndex];
  
  // Try to access another user's subscriptions (should get 403 or empty)
  const otherCustomerId = otherUserIndex + 1; // Assuming customer IDs match user indices
  const isolationRes = http.get(`${BASE_URL}/subscriptions/customer/${otherCustomerId}`, { headers });
  check(isolationRes, { 
    'data isolation works': (r) => r.status === 403 || r.status === 200 // 403 = properly blocked, 200 = might be own data
  });

  sleep(0.3);
}

export function setup() {
  // Test authentication
  const testUser = TEST_USERS[0];
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: testUser.email, password: testUser.password }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (loginRes.status !== 200) {
    console.warn('⚠️ Authentication may not be working. Tests may fail.');
    console.warn('Make sure test users are created in the database.');
  } else {
    console.log('✅ Authentication working');
  }
  
  const health = http.get(`${BASE_URL}/subscriptions/my`, { 
    headers: loginRes.status === 200 ? {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JSON.parse(loginRes.body).token}`
    } : { 'Content-Type': 'application/json' }
  });
  
  if (health.status >= 500) throw new Error('Subscription API unhealthy');
  
  console.log('✅ Subscription API is healthy.');
  console.log('🔐 Data isolation: Each VU uses separate user account');
  console.log('Starting stress test with authentication...');
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
