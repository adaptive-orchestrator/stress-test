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
    success_rate: ['rate>0.9'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Payment methods
const PAYMENT_METHODS = ['vnpay', 'momo', 'zalopay', 'bank_transfer', 'card'];

// Counter to generate unique invoice IDs per VU
let invoiceCounter = 0;

/**
 * Generate InitiatePaymentDto
 * Required: invoiceId, amount, method, customerId
 * Optional: orderId, invoiceNumber (will be auto-generated if not provided)
 */
function initiatePaymentPayload() {
  // Generate unique invoiceId using VU id + counter + timestamp
  invoiceCounter++;
  const uniqueId = Date.now() * 1000 + (__VU || 1) * 100 + (invoiceCounter % 100);
  
  return {
    invoiceId: uniqueId,
    invoiceNumber: `INV-TEST-${uniqueId}`,
    orderId: Math.random() > 0.5 ? 1 + Math.floor(Math.random() * 500) : undefined,
    customerId: 1 + Math.floor(Math.random() * 1000),
    amount: 50000 + Math.floor(Math.random() * 500000),
    method: PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)],
  };
}

/**
 * Generate ConfirmPaymentDto
 * Required: paymentId, status
 * Optional: transactionId, failureReason
 */
function confirmPaymentPayload(paymentId) {
  const isSuccess = Math.random() > 0.1; // 90% success rate
  return {
    paymentId: paymentId, // Keep as number
    status: isSuccess ? 'success' : 'failed',
    transactionId: isSuccess ? `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}` : undefined,
    amount: isSuccess ? 50000 + Math.floor(Math.random() * 500000) : undefined,
    failureReason: isSuccess ? undefined : 'Insufficient funds',
  };
}

export default function () {
  const headers = { 'Content-Type': 'application/json' };
  let success = true;

  // 1. Initiate payment
  const initPayload = initiatePaymentPayload();
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

  // 2. Get payment stats
  check(http.get(`${BASE_URL}/payments/stats/summary`), { 'stats 200': (r) => r.status === 200 });

  // 3. List payments with pagination (limit to 20 items per request to avoid gRPC overload)
  const listRes = http.get(`${BASE_URL}/payments?page=1&limit=20`);
  check(listRes, { 
    'list 200': (r) => r.status === 200,
    'list has pagination': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body?.pagination && body?.payments;
      } catch {
        return false;
      }
    }
  });

  // 4. Confirm payment (if initiated successfully)
  if (init.status === 201) {
    try {
      const body = JSON.parse(init.body);
      const paymentId = body?.id || body?.payment?.id;

      if (paymentId) {
        // Confirm payment with proper DTO
        const confirmPayload = confirmPaymentPayload(paymentId);
        const confirm = http.post(`${BASE_URL}/payments/confirm`, JSON.stringify(confirmPayload), { headers });
        
        const confirmOk = check(confirm, { 
          'confirm 200': (r) => r.status === 200 
        });
        
        if (confirmOk) {
          paymentsConfirmed.add(1);
        } else {
          console.log(`Confirm failed: ${confirm.status} - ${confirm.body}`);
        }

        // Get payment by ID
        check(http.get(`${BASE_URL}/payments/${paymentId}`), { 
          'get payment 200': (r) => r.status === 200 || r.status === 404 
        });
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // 5. Get payments by invoice
  const invoiceId = initPayload.invoiceId;
  check(http.get(`${BASE_URL}/payments/invoice/${invoiceId}`), { 
    'by invoice 200': (r) => r.status === 200 
  });

  successRate.add(success);
  sleep(Math.random() * 1.5 + 0.5);
}

export function setup() {
  console.log(`\n========== PAYMENT STRESS TEST ==========`);
  console.log(`Target API: ${BASE_URL}`);
  console.log(`==========================================\n`);

  // Health check with pagination
  const health = http.get(`${BASE_URL}/payments?page=1&limit=10`);
  if (health.status >= 500) throw new Error(`Payment API unhealthy: ${health.status}`);
  console.log('✓ Payment API health check passed');
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
  
  // Payment service needs more resources due to transactional complexity
  if (p95ResponseTime > 2000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
    memoryRequest = '384Mi'; memoryLimit = '1Gi';
  } else if (p95ResponseTime > 1000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '256Mi'; memoryLimit = '768Mi';
  } else if (p95ResponseTime > 500) {
    cpuRequest = '200m'; cpuLimit = '1000m';
    memoryRequest = '192Mi'; memoryLimit = '640Mi';
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
    serviceName: 'payment-svc',
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
    'payment-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
