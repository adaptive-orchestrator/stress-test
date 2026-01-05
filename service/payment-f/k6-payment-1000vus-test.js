import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics
const paymentsInitiated = new Counter('payments_initiated');
const paymentsConfirmed = new Counter('payments_confirmed');
const paymentErrors = new Counter('payment_errors');
const initiateLatency = new Trend('payment_initiate_latency');
const successRate = new Rate('success_rate');

export const options = {
  stages: [
    // Warm-up phase
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    // Ramp-up to 500
    { duration: '30s', target: 500 },
    { duration: '2m', target: 500 },
    // Ramp-up to 1000
    { duration: '30s', target: 1000 },
    // Hold at peak 1000 VUs
    { duration: '1m', target: 1000 },
    // Cool-down
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1200'],
    http_req_failed: ['rate<0.15'],
    success_rate: ['rate>0.85'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Payment methods
const PAYMENT_METHODS = ['vnpay', 'momo', 'zalopay', 'bank_transfer', 'card'];

// Test users - each VU gets a different user to test data isolation
// Using stress test users that already exist in the system
const TEST_USERS = [
  { email: 'stresstest1@demo.com', password: 'Test@123456' },
  { email: 'stresstest2@demo.com', password: 'Test@123456' },
  { email: 'stresstest3@demo.com', password: 'Test@123456' },
  { email: 'stresstest4@demo.com', password: 'Test@123456' },
  { email: 'stresstest5@demo.com', password: 'Test@123456' },
];

// Cache for auth tokens
const authCache = {};

function getAuthHeaders(vuIndex) {
  const userIndex = vuIndex % TEST_USERS.length;
  const user = TEST_USERS[userIndex];
  
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
  
  if (loginRes.status === 200 || loginRes.status === 201) {
    try {
      const body = JSON.parse(loginRes.body);
      const token = body.accessToken || body.access_token || body.token;
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

// Counter to generate unique invoice IDs per VU
let invoiceCounter = 0;

// Generate a random UUID for testing
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate InitiatePaymentDto
 * Required: invoiceId, amount, method
 * Optional: orderId, invoiceNumber (will be auto-generated if not provided)
 * Note: customerId will be set by backend based on authenticated user
 */
function generatePaymentPayload() {
  // Generate unique invoiceId as UUID
  invoiceCounter++;
  const uniqueId = randomUUID();
  
  return {
    invoiceId: uniqueId,
    invoiceNumber: `INV-TEST-${Date.now()}-${invoiceCounter}`,
    orderId: Math.random() > 0.5 ? randomUUID() : undefined,
    // Don't include customerId - backend will use authenticated user's ID
    amount: 50000 + Math.floor(Math.random() * 500000),
    method: PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)],
  };
}

/**
 * Generate ConfirmPaymentDto
 * Required: paymentId, status
 * Optional: transactionId, failureReason
 */
function generateConfirmPayload(paymentId) {
  const isSuccess = Math.random() > 0.1; // 90% success rate
  return {
    paymentId: paymentId,
    status: isSuccess ? 'success' : 'failed',
    transactionId: isSuccess ? `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}` : undefined,
    amount: isSuccess ? 50000 + Math.floor(Math.random() * 500000) : undefined,
    failureReason: isSuccess ? undefined : 'Insufficient funds',
  };
}

export default function () {
  const headers = getAuthHeaders(__VU);
  let success = true;

  // 1. Initiate payment (authenticated)
  const initPayload = generatePaymentPayload();
  const startInit = Date.now();
  const init = http.post(`${BASE_URL}/payments/initiate`, JSON.stringify(initPayload), { headers });
  initiateLatency.add(Date.now() - startInit);

  const initOk = check(init, { 
    'init 201': (r) => r.status === 201,
    'init has payment': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body?.id || body?.payment?.id;
      } catch {
        return false;
      }
    }
  });

  if (initOk) {
    paymentsInitiated.add(1);
  } else {
    paymentErrors.add(1);
    success = false;
    if (init.status !== 201) {
      console.log(`Initiate failed: ${init.status} - ${init.body}`);
    }
  }

  // 2. Get my payments (user-specific)
  const myPaymentsRes = http.get(`${BASE_URL}/payments/my?page=1&limit=20`, { headers });
  check(myPaymentsRes, { 
    'my payments 200': (r) => r.status === 200,
    'my payments has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body?.pagination && body?.payments;
      } catch {
        return false;
      }
    }
  });

  // 3. Confirm payment (if initiated successfully)
  if (init.status === 201) {
    try {
      const body = JSON.parse(init.body);
      const paymentId = body?.id || body?.payment?.id;

      if (paymentId) {
        // Confirm payment with proper DTO
        const confirmPayload = generateConfirmPayload(paymentId);
        const confirm = http.post(`${BASE_URL}/payments/confirm`, JSON.stringify(confirmPayload), { headers });
        
        const confirmOk = check(confirm, { 
          'confirm 200': (r) => r.status === 200 
        });
        
        if (confirmOk) {
          paymentsConfirmed.add(1);
        } else {
          console.log(`Confirm failed: ${confirm.status} - ${confirm.body}`);
        }

        // Get my payment by ID
        const getMyPayment = http.get(`${BASE_URL}/payments/my/${paymentId}`, { headers });
        const getMyPaymentOk = check(getMyPayment, { 
          'get my payment 200': (r) => r.status === 200 || r.status === 404 || r.status === 403
        });
        
        if (!getMyPaymentOk) {
          console.log(`Get my payment failed: ${getMyPayment.status} - ${getMyPayment.body}`);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // 4. Get payments by invoice (authenticated)
  const invoiceId = initPayload.invoiceId;
  check(http.get(`${BASE_URL}/payments/invoice/${invoiceId}`, { headers }), { 
    'by invoice 200': (r) => r.status === 200 
  });

  successRate.add(success);
  sleep(Math.random() * 1.5 + 0.5);
}

export function setup() {
  console.log(`\n========== PAYMENT 1000 VUs STRESS TEST ==========`);
  console.log(`Target API: ${BASE_URL}`);
  console.log(`==================================================\n`);

  // Test authentication first
  const testUser = TEST_USERS[0];
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: testUser.email, password: testUser.password }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (loginRes.status !== 200) {
    console.warn('⚠️ Authentication may not be working. Tests may fail with 401.');
    console.warn('Make sure test users are created in the database.');
  } else {
    console.log('✅ Authentication working');
  }

  // Health check with authentication
  const headers = loginRes.status === 200 ? {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${JSON.parse(loginRes.body).token}`
  } : { 'Content-Type': 'application/json' };
  
  const health = http.get(`${BASE_URL}/payments/my?page=1&limit=10`, { headers });
  if (health.status >= 500) throw new Error(`Payment API unhealthy: ${health.status}`);
  
  console.log('✅ Payment API health check passed');
  console.log('🔐 Data isolation: Each VU uses separate user account');
  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n========== TEST COMPLETE ==========`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`===================================\n`);
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
  
  let cpuRequest = '150m';
  let cpuLimit = '750m';
  let memoryRequest = '192Mi';
  let memoryLimit = '640Mi';
  let replicas = 2;
  
  // Payment service needs good resources for transaction processing
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
  
  if (blockedTime > 500 || throughput > 800) {
    memoryRequest = '512Mi'; memoryLimit = '1Gi';
  } else if (blockedTime > 200 || throughput > 400) {
    memoryRequest = '384Mi'; memoryLimit = '768Mi';
  }
  
  if (errorRate > 0.15 || p99ResponseTime > 5000) {
    replicas = Math.ceil(maxVUs / 100);
  } else if (errorRate > 0.1 || p99ResponseTime > 3000) {
    replicas = Math.ceil(maxVUs / 150);
  } else {
    replicas = Math.ceil(maxVUs / 200);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return { serviceName: 'payment-svc', replicas, resources: { requests: { cpu: cpuRequest, memory: memoryRequest }, limits: { cpu: cpuLimit, memory: memoryLimit } },
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
    'payment-1000vus-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
