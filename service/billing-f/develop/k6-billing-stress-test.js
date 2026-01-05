import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics
const invoicesCreated = new Counter('invoices_created');
const invoiceErrors = new Counter('invoice_errors');
const createLatency = new Trend('invoice_create_latency');
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
  // Thresholds adjusted for realistic load testing
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'], // 3s p95, 5s p99
    http_req_failed: ['rate<0.05'],                   // < 5% failure rate
    success_rate: ['rate>0.95'],                      // > 95% success
    invoice_create_latency: ['p(95)<3000'],           // 3s for invoice creation
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const BASE_URL = __ENV.BASE_URL || 'http://a750437cded034d9784ada6e7f9db76e-79475208.ap-southeast-1.elb.amazonaws.com';

// Generate a random UUID for testing
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Product UUIDs pool (simulate existing products)
// Use proper UUID v4 format with correct version/variant bits
const PRODUCT_IDS = [
  '550e8400-e29b-41d4-a716-446655440000',
  '6ba7b810-9dad-41d4-80b4-00c04fd430c8',
  '6ba7b811-9dad-41d4-80b4-00c04fd430c9',
  '6ba7b812-9dad-41d4-80b4-00c04fd430ca',
  '6ba7b813-9dad-41d4-80b4-00c04fd430cb',
  '6ba7b814-9dad-41d4-80b4-00c04fd430cc',
  '6ba7b815-9dad-41d4-80b4-00c04fd430cd',
  '6ba7b816-9dad-41d4-80b4-00c04fd430ce',
  '6ba7b817-9dad-41d4-80b4-00c04fd430cf',
  '6ba7b818-9dad-41d4-80b4-00c04fd430d0'
];

/**
 * Generate invoice payload matching CreateInvoiceDto
 * Required fields: customerId, items, subtotal, totalAmount
 * Optional: orderId, orderNumber, tax, shippingCost, discount, dueDate, notes, billingPeriod, businessModel
 */
function invoicePayload() {
  const itemCount = 1 + Math.floor(Math.random() * 3);
  const items = [];
  let subtotal = 0;
  
  for (let i = 0; i < itemCount; i++) {
    const quantity = 1 + Math.floor(Math.random() * 5);
    const unitPrice = parseFloat((50000 + Math.random() * 200000).toFixed(2));
    const totalPrice = parseFloat((quantity * unitPrice).toFixed(2));
    subtotal += totalPrice;
    
    items.push({
      productId: PRODUCT_IDS[Math.floor(Math.random() * PRODUCT_IDS.length)],
      description: `Product ${i + 1} - Stress Test`,
      quantity: quantity,
      unitPrice: unitPrice,
      totalPrice: totalPrice,
    });
  }

  const tax = Math.floor(subtotal * 0.1);
  const shippingCost = Math.floor(Math.random() * 50000);
  const discount = Math.floor(Math.random() * 20000);
  const totalAmount = subtotal + tax + shippingCost - discount;

  // Due date 30 days from now
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return {
    customerId: randomUUID(),
    orderNumber: `INV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    items: items,
    subtotal: subtotal,
    tax: tax,
    shippingCost: shippingCost,
    discount: discount,
    totalAmount: totalAmount,
    dueDate: dueDate,
    notes: `Stress test invoice created at ${new Date().toISOString()}`,
    billingPeriod: ['monthly', 'yearly', 'onetime'][Math.floor(Math.random() * 3)],
    businessModel: ['subscription', 'freemium'][Math.floor(Math.random() * 2)],
  };
}

export default function () {
  const headers = { 'Content-Type': 'application/json' };
  let success = true;

  // Create invoice
  const payload = invoicePayload();
  const startCreate = Date.now();
  const create = http.post(`${BASE_URL}/invoices`, JSON.stringify(payload), { headers });
  createLatency.add(Date.now() - startCreate);
  
  const createOk = check(create, { 
    'create 201': (r) => r.status === 201,
    'create has invoice': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body?.invoice?.id || body?.id;
      } catch {
        return false;
      }
    }
  });

  if (createOk) {
    invoicesCreated.add(1);
  } else {
    invoiceErrors.add(1);
    success = false;
    // Log error for debugging
    if (create.status !== 201) {
      console.log(`Create failed: ${create.status} - ${create.body}`);
    }
  }

  // List invoices with pagination (exclude cancelled by default)
  const listRes = http.get(`${BASE_URL}/invoices?page=1&limit=20`);
  const listOk = check(listRes, { 'list 200': (r) => r.status === 200 });
  if (!listOk) {
    console.log(`List failed: ${listRes.status} - ${listRes.body?.substring(0, 200)}`);
  }

  if (create.status === 201) {
    try {
      const body = JSON.parse(create.body);
      const id = body?.invoice?.id || body?.id;

      if (id) {
        // Get by id
        const getRes = http.get(`${BASE_URL}/invoices/${id}`);
        const getOk = check(getRes, { 'get 200': (r) => r.status === 200 });
        if (!getOk) {
          console.log(`Get ${id} failed: ${getRes.status}`);
        }

        // Update status - new invoices are 'draft', so only valid transition is to 'sent'
        // This avoids 400 errors from invalid status transitions
        const updateRes = http.patch(
          `${BASE_URL}/invoices/${id}/status`, 
          JSON.stringify({ status: 'sent' }), 
          { headers }
        );
        check(updateRes, { 
          'status update ok': (r) => r.status === 200
        });

      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  successRate.add(success);
  sleep(Math.random() * 1.5 + 0.5);
}

export function setup() {
  console.log(`\n========== BILLING STRESS TEST ==========`);
  console.log(`Target API: ${BASE_URL}`);
  console.log(`==========================================\n`);

  const health = http.get(`${BASE_URL}/invoices`);
  if (health.status >= 500) throw new Error(`Billing API unhealthy: ${health.status}`);
  console.log('✓ Billing API health check passed');
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
    serviceName: 'billing-svc',
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
  
  const summary = {
    test: 'Billing API - Stress Test (100 VUs)',
    timestamp: new Date().toISOString(),
    description: 'Direct Invoice API testing with full CRUD operations',
    testDuration: data.state?.testRunDurationMs ? (data.state.testRunDurationMs / 1000).toFixed(2) + 's' : 'N/A',
    metrics: {
      // HTTP Metrics
      total_requests: data.metrics.http_reqs?.values?.count || 0,
      failed_requests: data.metrics.http_req_failed?.values?.passes || 0,
      failed_rate: ((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2) + '%',
      
      // Response Time Metrics
      avg_response_time: data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 0,
      min_response_time: data.metrics.http_req_duration?.values?.min?.toFixed(2) || 0,
      med_response_time: data.metrics.http_req_duration?.values?.med?.toFixed(2) || 0,
      max_response_time: data.metrics.http_req_duration?.values?.max?.toFixed(2) || 0,
      p90_response_time: data.metrics.http_req_duration?.values['p(90)']?.toFixed(2) || 0,
      p95_response_time: data.metrics.http_req_duration?.values['p(95)']?.toFixed(2) || 0,
      p99_response_time: data.metrics.http_req_duration?.values['p(99)']?.toFixed(2) || 0,
      
      // Waiting Time (Time to First Byte)
      avg_waiting_time: data.metrics.http_req_waiting?.values?.avg?.toFixed(2) || 0,
      p95_waiting_time: data.metrics.http_req_waiting?.values['p(95)']?.toFixed(2) || 0,
      
      // Connection Metrics
      avg_blocked_time: data.metrics.http_req_blocked?.values?.avg?.toFixed(2) || 0,
      avg_connecting_time: data.metrics.http_req_connecting?.values?.avg?.toFixed(2) || 0,
      
      // Data Transfer
      data_sent: data.metrics.data_sent?.values?.count ? (data.metrics.data_sent.values.count / 1024 / 1024).toFixed(2) + ' MB' : '0 MB',
      data_received: data.metrics.data_received?.values?.count ? (data.metrics.data_received.values.count / 1024 / 1024).toFixed(2) + ' MB' : '0 MB',
      
      // Throughput
      requests_per_second: data.metrics.http_reqs?.values?.rate?.toFixed(2) || 0,
      
      // Custom Business Metrics
      invoices_created: data.metrics.invoices_created?.values?.count || 0,
      invoice_errors: data.metrics.invoice_errors?.values?.count || 0,
      invoice_create_latency: data.metrics.invoice_create_latency?.values?.avg?.toFixed(2) || 0,
      success_rate: ((data.metrics.success_rate?.values?.rate || 0) * 100).toFixed(2) + '%',
      
      // VU Metrics
      max_vus: data.metrics.vus_max?.values?.max || 0,
      iterations_completed: data.metrics.iterations?.values?.count || 0,
      avg_iteration_duration: data.metrics.iteration_duration?.values?.avg?.toFixed(2) || 0,
      
      // Check Results
      checks_passed: data.metrics.checks?.values?.passes || 0,
      checks_failed: data.metrics.checks?.values?.fails || 0,
      checks_pass_rate: ((data.metrics.checks?.values?.rate || 0) * 100).toFixed(2) + '%',
    },
    k8sRecommendation: recommendation,
    rawData: data, // Include full k6 data for detailed analysis
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
  
  console.log('\n📊 PERFORMANCE SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Requests:        ${summary.metrics.total_requests}`);
  console.log(`Failed Rate:           ${summary.metrics.failed_rate}`);
  console.log(`Throughput:            ${summary.metrics.requests_per_second} req/s`);
  console.log(`Avg Response Time:     ${summary.metrics.avg_response_time}ms`);
  console.log(`P95 Response Time:     ${summary.metrics.p95_response_time}ms`);
  console.log(`P99 Response Time:     ${summary.metrics.p99_response_time}ms`);
  console.log(`Max VUs:               ${summary.metrics.max_vus}`);
  console.log(`Test Duration:         ${summary.testDuration}`);
  console.log(`Data Sent:             ${summary.metrics.data_sent}`);
  console.log(`Data Received:         ${summary.metrics.data_received}`);
  
  console.log('\n💼 BUSINESS METRICS');
  console.log('='.repeat(60));
  console.log(`Invoices Created:      ${summary.metrics.invoices_created}`);
  console.log(`Invoice Errors:        ${summary.metrics.invoice_errors}`);
  console.log(`Avg Create Latency:    ${summary.metrics.invoice_create_latency}ms`);
  console.log(`Success Rate:          ${summary.metrics.success_rate}`);
  console.log(`Checks Pass Rate:      ${summary.metrics.checks_pass_rate}`);
  
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
    'billing-stress-summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const lines = [
    '\n╔════════════════════════════════════════════════════════════════════╗',
    '║         BILLING API - STRESS TEST (100 VUs) RESULTS               ║',
    '╠════════════════════════════════════════════════════════════════════╣',
  ];

  const metrics = data.metrics;
  
  lines.push(`║ Total Requests:        ${String(metrics.http_reqs?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Failed Rate:           ${String(((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2) + '%').padStart(40)} ║`);
  lines.push(`║ Avg Response Time:     ${String((metrics.http_req_duration?.values?.avg || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push(`║ P95 Response Time:     ${String((metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push(`║ P99 Response Time:     ${String((metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push('╠════════════════════════════════════════════════════════════════════╣');
  lines.push(`║ Invoices Created:      ${String(metrics.invoices_created?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Invoice Errors:        ${String(metrics.invoice_errors?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Success Rate:          ${String(((metrics.success_rate?.values?.rate || 0) * 100).toFixed(2) + '%').padStart(40)} ║`);
  lines.push('╚════════════════════════════════════════════════════════════════════╝\n');

  return lines.join('\n');
}
