import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const paymentsInitiated = new Counter('payments_initiated');
const paymentsConfirmed = new Counter('payments_confirmed');
const paymentErrors = new Counter('payment_errors');
const initiateLatency = new Trend('payment_initiate_latency');
const confirmLatency = new Trend('payment_confirm_latency');
const successRate = new Rate('success_rate');

export const options = {
  stages: [
    // Warm-up phase
    { duration: '30s', target: 100 },
    // Ramp-up to 500
    { duration: '1m', target: 500 },
    // Hold at 500
    { duration: '2m', target: 500 },
    // Ramp-up to 1000
    { duration: '1m', target: 1000 },
    // Hold at peak 1000 VUs
    { duration: '3m', target: 1000 },
    // Cool-down
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1200', 'p(99)<2500'],
    http_req_failed: ['rate<0.15'],
    success_rate: ['rate>0.85'],
    payment_initiate_latency: ['p(95)<1000'],
    payment_confirm_latency: ['p(95)<800'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Payment methods matching API
const PAYMENT_METHODS = ['vnpay', 'momo', 'zalopay', 'bank_transfer', 'card'];

// Counter to generate unique invoice IDs per VU
let invoiceCounter = 0;

/**
 * Generate InitiatePaymentDto
 * Required: invoiceId, amount, method
 * Optional: orderId, customerId
 */
function generatePaymentPayload() {
  // Generate unique invoiceId using VU id + counter + timestamp
  invoiceCounter++;
  const uniqueId = Date.now() * 1000 + (__VU || 1) * 100 + (invoiceCounter % 100);
  
  return {
    invoiceId: uniqueId,
    invoiceNumber: `INV-TEST-${uniqueId}`,
    orderId: Math.random() > 0.5 ? 1 + Math.floor(Math.random() * 1000) : undefined,
    customerId: 1 + Math.floor(Math.random() * 1000),
    amount: 50000 + Math.floor(Math.random() * 500000),
    method: PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)],
  };
}

/**
 * Generate ConfirmPaymentDto
 * Required: paymentId, status
 * Optional: transactionId, amount, failureReason
 */
function generateConfirmPayload(paymentId) {
  const isSuccess = Math.random() > 0.1; // 90% success rate
  return {
    paymentId: paymentId, // Keep as number
    status: isSuccess ? 'success' : 'failed',
    transactionId: isSuccess ? `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}` : undefined,
    amount: isSuccess ? 50000 + Math.floor(Math.random() * 500000) : undefined,
    failureReason: isSuccess ? undefined : 'Insufficient funds - stress test',
  };
}

export default function () {
  const headers = { 'Content-Type': 'application/json' };
  let success = true;

  // 1. Initiate Payment (35% weight)
  if (Math.random() < 0.35) {
    const payload = generatePaymentPayload();
    const startInit = Date.now();
    const initRes = http.post(`${BASE_URL}/payments/initiate`, JSON.stringify(payload), { headers });
    initiateLatency.add(Date.now() - startInit);

    const initOk = check(initRes, {
      'initiate payment 201': (r) => r.status === 201 || r.status === 200,
      'initiate has id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body?.payment?.id || body?.id || body?.paymentId;
        } catch {
          return false;
        }
      },
    });

    if (initOk) {
      paymentsInitiated.add(1);

      // Confirm payment (80% chance)
      if (Math.random() < 0.8) {
        try {
          const body = JSON.parse(initRes.body);
          const paymentId = body?.payment?.id || body?.id || body?.paymentId;

          if (paymentId) {
            const startConfirm = Date.now();
            // Use proper ConfirmPaymentDto with status enum
            const confirmPayload = generateConfirmPayload(paymentId);
            const confirmRes = http.post(
              `${BASE_URL}/payments/confirm`,
              JSON.stringify(confirmPayload),
              { headers }
            );
            confirmLatency.add(Date.now() - startConfirm);

            const confirmOk = check(confirmRes, {
              'confirm payment 200': (r) => r.status === 200,
            });

            if (confirmOk) {
              paymentsConfirmed.add(1);
            }
          }
        } catch (e) {
          paymentErrors.add(1);
          success = false;
        }
      }
    } else {
      paymentErrors.add(1);
      success = false;
    }
  }

  // 2. List Payments (25% weight)
  if (Math.random() < 0.25) {
    const page = 1 + Math.floor(Math.random() * 10);
    const listRes = http.get(`${BASE_URL}/payments?page=${page}&limit=20`);
    
    check(listRes, {
      'list payments 200': (r) => r.status === 200,
      'list has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body?.payments) || Array.isArray(body?.data) || Array.isArray(body);
        } catch {
          return false;
        }
      },
    });
  }

  // 3. Get Payment Stats (20% weight)
  if (Math.random() < 0.20) {
    const statsRes = http.get(`${BASE_URL}/payments/stats/summary`);
    check(statsRes, {
      'stats 200': (r) => r.status === 200,
    });
  }

  // 4. Get Payments by Invoice (20% weight)
  if (Math.random() < 0.20) {
    const invoiceId = 1 + Math.floor(Math.random() * 2000);
    const invoicePaymentsRes = http.get(`${BASE_URL}/payments/invoice/${invoiceId}`);
    check(invoicePaymentsRes, {
      'by invoice 200': (r) => r.status === 200 || r.status === 404,
    });
  }

  successRate.add(success);
  sleep(Math.random() * 1 + 0.3);
}

export function setup() {
  console.log(`Testing Payment API at: ${BASE_URL}`);
  const health = http.get(`${BASE_URL}/payments`);
  if (health.status >= 500) {
    throw new Error(`Payment API unhealthy: ${health.status}`);
  }
  console.log('Payment API health check passed');
  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n========== PAYMENT 1000 VUs TEST COMPLETE ==========`);
  console.log(`Total duration: ${duration.toFixed(2)}s`);
  console.log(`====================================================\n`);
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
  
  const summary = {
    test: 'Payment API - 1000 VUs Stress Test',
    timestamp: new Date().toISOString(),
    metrics: {
      total_requests: data.metrics.http_reqs?.values?.count || 0,
      failed_requests: data.metrics.http_req_failed?.values?.passes || 0,
      avg_response_time: data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 0,
      p95_response_time: data.metrics.http_req_duration?.values['p(95)']?.toFixed(2) || 0,
      p99_response_time: data.metrics.http_req_duration?.values['p(99)']?.toFixed(2) || 0,
      payments_initiated: data.metrics.payments_initiated?.values?.count || 0,
      payments_confirmed: data.metrics.payments_confirmed?.values?.count || 0,
      payment_errors: data.metrics.payment_errors?.values?.count || 0,
      success_rate: ((data.metrics.success_rate?.values?.rate || 0) * 100).toFixed(2) + '%',
    },
    k8sRecommendation: recommendation,
  };

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
    'payment-1000vus-summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const lines = [
    '\n╔══════════════════════════════════════════════════════════════╗',
    '║          PAYMENT API - 1000 VUs STRESS TEST RESULTS         ║',
    '╠══════════════════════════════════════════════════════════════╣',
  ];

  const metrics = data.metrics;
  
  lines.push(`║ Total Requests:      ${String(metrics.http_reqs?.values?.count || 0).padStart(35)} ║`);
  lines.push(`║ Failed Rate:         ${String(((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2) + '%').padStart(35)} ║`);
  lines.push(`║ Avg Response Time:   ${String((metrics.http_req_duration?.values?.avg || 0).toFixed(2) + 'ms').padStart(35)} ║`);
  lines.push(`║ P95 Response Time:   ${String((metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2) + 'ms').padStart(35)} ║`);
  lines.push(`║ P99 Response Time:   ${String((metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2) + 'ms').padStart(35)} ║`);
  lines.push(`║ Payments Initiated:  ${String(metrics.payments_initiated?.values?.count || 0).padStart(35)} ║`);
  lines.push(`║ Payments Confirmed:  ${String(metrics.payments_confirmed?.values?.count || 0).padStart(35)} ║`);
  lines.push(`║ Payment Errors:      ${String(metrics.payment_errors?.values?.count || 0).padStart(35)} ║`);
  lines.push('╚══════════════════════════════════════════════════════════════╝\n');

  return lines.join('\n');
}
