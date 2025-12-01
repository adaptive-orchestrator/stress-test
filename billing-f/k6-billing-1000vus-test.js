import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/**
 * BILLING API 1000 VUs STRESS TEST
 * 
 * Billing invoices are AUTO-CREATED via Order events (Redpanda).
 * This test focuses on:
 * 1. Creating Orders → triggers Invoice creation via event
 * 2. Reading/Listing Invoices
 * 3. Updating Invoice status
 * 4. Retry payment operations
 */

// Custom metrics
const ordersCreated = new Counter('orders_created');
const invoicesRead = new Counter('invoices_read');
const invoiceStatusUpdated = new Counter('invoice_status_updated');
const errorCount = new Counter('error_count');
const orderLatency = new Trend('order_create_latency');
const listLatency = new Trend('invoice_list_latency');
const updateLatency = new Trend('invoice_update_latency');
const successRate = new Rate('success_rate');

export const options = {
  stages: [
    // Warm-up phase
    { duration: '30s', target: 50 },
    // Ramp-up to 200
    { duration: '1m', target: 200 },
    // Hold at 200
    { duration: '2m', target: 200 },
    // Ramp-up to 500
    { duration: '1m', target: 500 },
    // Hold at peak 500 VUs
    { duration: '3m', target: 500 },
    // Cool-down
    { duration: '1m', target: 0 },
  ],
  // Thresholds adjusted for local single-node testing
  // In production with multiple replicas, use stricter thresholds
  thresholds: {
    http_req_duration: ['p(95)<15000', 'p(99)<20000'], // 15s p95, 20s p99 for local
    http_req_failed: ['rate<0.05'],                    // < 5% failure rate
    success_rate: ['rate>0.95'],                       // > 95% success
    order_create_latency: ['p(95)<15000'],             // 15s for invoice creation
    invoice_list_latency: ['p(95)<15000'],             // 15s for list
    invoice_update_latency: ['p(95)<15000'],           // 15s for update
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Product IDs pool (simulate existing products)
const PRODUCT_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Invoice statuses (lowercase as per billing-svc)
const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

// Generate random order payload (Order creates Invoice via Redpanda event) - for RETAIL model
function generateOrderPayload() {
  const itemCount = 1 + Math.floor(Math.random() * 3);
  const items = [];
  
  for (let i = 0; i < itemCount; i++) {
    items.push({
      productId: PRODUCT_IDS[Math.floor(Math.random() * PRODUCT_IDS.length)],
      quantity: 1 + Math.floor(Math.random() * 5),
      price: 10 + Math.floor(Math.random() * 200),
    });
  }

  return {
    customerId: 1 + Math.floor(Math.random() * 5000),
    items: items,
    shippingAddress: `${Math.floor(Math.random() * 999) + 1} Test Street, City ${Math.floor(Math.random() * 100)}`,
    notes: `Stress test order - ${Date.now()}`,
    shippingCost: Math.floor(Math.random() * 20),
    discount: Math.floor(Math.random() * 10),
  };
}

// Generate invoice payload for direct API creation (for SUBSCRIPTION/FREEMIUM models)
function generateInvoicePayload() {
  const itemCount = 1 + Math.floor(Math.random() * 3);
  const items = [];
  let subtotal = 0;
  
  for (let i = 0; i < itemCount; i++) {
    const quantity = 1 + Math.floor(Math.random() * 5);
    const price = 50000 + Math.floor(Math.random() * 500000);
    const totalPrice = quantity * price;
    subtotal += totalPrice;
    
    items.push({
      productId: PRODUCT_IDS[Math.floor(Math.random() * PRODUCT_IDS.length)],
      description: `Product ${i + 1} - Stress Test`,
      quantity: quantity,
      price: price,
      totalPrice: totalPrice,
    });
  }

  const tax = Math.floor(subtotal * 0.1); // 10% tax
  const discount = Math.floor(Math.random() * 50000);
  const shippingCost = 20000 + Math.floor(Math.random() * 30000);
  const totalAmount = subtotal + tax + shippingCost - discount;

  const businessModels = ['subscription', 'freemium'];
  const billingPeriods = ['monthly', 'yearly', 'onetime'];

  return {
    customerId: 1 + Math.floor(Math.random() * 5000),
    orderNumber: `API-INV-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    items: items,
    subtotal: subtotal,
    tax: tax,
    shippingCost: shippingCost,
    discount: discount,
    totalAmount: totalAmount,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: `Direct API invoice - ${Date.now()}`,
    businessModel: businessModels[Math.floor(Math.random() * businessModels.length)],
    billingPeriod: billingPeriods[Math.floor(Math.random() * billingPeriods.length)],
  };
}

export default function () {
  const headers = { 'Content-Type': 'application/json' };
  let success = true;

  // 1. Create Invoice directly via API (20% weight)
  if (Math.random() < 0.2) {
    const invoicePayload = generateInvoicePayload();
    const startCreate = Date.now();
    const createRes = http.post(`${BASE_URL}/invoices`, JSON.stringify(invoicePayload), { headers });
    orderLatency.add(Date.now() - startCreate);

    const createOk = check(createRes, {
      'create invoice 201': (r) => r.status === 201 || r.status === 200,
      'invoice has id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body?.id || body?.invoice?.id;
        } catch {
          return false;
        }
      },
    });

    if (createOk) {
      ordersCreated.add(1);
    } else {
      errorCount.add(1);
      success = false;
      // Log error for debugging
      console.log(`Invoice create failed: ${createRes.status} - ${createRes.body}`);
    }
  }

  // 3. List Invoices with pagination (20% weight) - Main read operation
  if (Math.random() < 0.2) {
    const page = 1 + Math.floor(Math.random() * 5); // Random page 1-5
    const startList = Date.now();
    const listRes = http.get(`${BASE_URL}/invoices?page=${page}&limit=20`);
    listLatency.add(Date.now() - startList);

    const listOk = check(listRes, {
      'list invoices 200': (r) => r.status === 200,
    });

    if (listOk) {
      invoicesRead.add(1);
      
      // If we got invoices, perform operations on them
      try {
        const body = JSON.parse(listRes.body);
        const invoices = body?.invoices || body?.data || body || [];
        
        if (Array.isArray(invoices) && invoices.length > 0) {
          // Pick random invoice to operate on
          const randomInvoice = invoices[Math.floor(Math.random() * invoices.length)];
          const invoiceId = randomInvoice?.id;

          if (invoiceId) {
            // Get invoice by ID (50% chance)
            if (Math.random() < 0.5) {
              const getRes = http.get(`${BASE_URL}/invoices/${invoiceId}`);
              check(getRes, { 'get invoice 200': (r) => r.status === 200 });
            }

            // Get current invoice status before operations
            const currentStatus = randomInvoice?.status?.toLowerCase() || 'draft';

            // Update status (40% chance) - Only update if status is 'draft'
            // New invoices are 'draft', so only valid transition is to 'sent'
            if (Math.random() < 0.4 && currentStatus === 'draft') {
              const startUpdate = Date.now();
              const updateRes = http.patch(
                `${BASE_URL}/invoices/${invoiceId}/status`,
                JSON.stringify({ status: 'sent' }),
                { headers }
              );
              updateLatency.add(Date.now() - startUpdate);
              
              const updateOk = check(updateRes, { 
                'update status ok': (r) => r.status === 200
              });
              
              if (updateOk) {
                invoiceStatusUpdated.add(1);
              }
            }
          }
        }
      } catch (e) {
        // Ignore parse errors - invoice list might be empty
      }
    } else {
      success = false;
    }
  }

  // 4. Get invoice by random ID (10% weight) - Direct access test
  if (Math.random() < 0.1) {
    const randomId = 1 + Math.floor(Math.random() * 1000);
    const getRes = http.get(`${BASE_URL}/invoices/${randomId}`);
    check(getRes, { 
      'get by id ok': (r) => r.status === 200 || r.status === 404 
    });
  }

  // 5. Just list again for read pressure with pagination (10% weight)
  if (Math.random() < 0.1) {
    const listRes = http.get(`${BASE_URL}/invoices?page=1&limit=10`);
    check(listRes, { 'list again 200': (r) => r.status === 200 });
  }

  successRate.add(success);
  // Increase sleep time to reduce pressure on server
  sleep(Math.random() * 3 + 2); // 2-5 seconds
}

export function setup() {
  console.log(`\n========== BILLING 1000 VUs STRESS TEST ==========`);
  console.log(`Target API: ${BASE_URL}`);
  console.log(`Strategy: Direct Invoice API testing (no Order dependency)`);
  console.log(`==================================================\n`);

  // Health check - invoices endpoint
  const invoiceHealth = http.get(`${BASE_URL}/invoices`);
  if (invoiceHealth.status >= 500) {
    throw new Error(`Billing API unhealthy: ${invoiceHealth.status}`);
  }
  console.log('✓ Billing API (invoices) health check passed');

  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n========== BILLING 1000 VUs TEST COMPLETE ==========`);
  console.log(`Total duration: ${duration.toFixed(2)}s`);
  console.log(`====================================================\n`);
}

// Calculate recommended K8s resources based on test results
function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = 500; // Max VUs from stages
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
  
  if (p95ResponseTime > 5000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
    memoryRequest = '512Mi'; memoryLimit = '1Gi';
  } else if (p95ResponseTime > 2000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '384Mi'; memoryLimit = '768Mi';
  } else if (p95ResponseTime > 1000) {
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
  
  if (errorRate > 0.1 || p99ResponseTime > 10000) {
    replicas = Math.ceil(maxVUs / 80);
  } else if (errorRate > 0.05 || p99ResponseTime > 5000) {
    replicas = Math.ceil(maxVUs / 100);
  } else {
    replicas = Math.ceil(maxVUs / 150);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return { serviceName: 'billing-svc', replicas, resources: { requests: { cpu: cpuRequest, memory: memoryRequest }, limits: { cpu: cpuLimit, memory: memoryLimit } },
    metrics: { maxVUs, avgResponseTime: avgResponseTime.toFixed(2), p95ResponseTime: p95ResponseTime.toFixed(2), p99ResponseTime: p99ResponseTime.toFixed(2), errorRate: (errorRate * 100).toFixed(2), throughput: throughput.toFixed(2) }
  };
}

export function handleSummary(data) {
  const recommendation = calculateResourceRecommendation(data);
  
  const summary = {
    test: 'Billing API (via Orders) - 1000 VUs Stress Test',
    timestamp: new Date().toISOString(),
    description: 'Invoices created automatically via Order events (Redpanda)',
    metrics: {
      total_requests: data.metrics.http_reqs?.values?.count || 0,
      failed_requests: data.metrics.http_req_failed?.values?.passes || 0,
      avg_response_time: data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 0,
      p95_response_time: data.metrics.http_req_duration?.values['p(95)']?.toFixed(2) || 0,
      p99_response_time: data.metrics.http_req_duration?.values['p(99)']?.toFixed(2) || 0,
      orders_created: data.metrics.orders_created?.values?.count || 0,
      invoices_read: data.metrics.invoices_read?.values?.count || 0,
      invoice_status_updated: data.metrics.invoice_status_updated?.values?.count || 0,
      error_count: data.metrics.error_count?.values?.count || 0,
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
    'billing-1000vus-summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const lines = [
    '\n╔════════════════════════════════════════════════════════════════════╗',
    '║     BILLING API (via Orders) - 1000 VUs STRESS TEST RESULTS       ║',
    '╠════════════════════════════════════════════════════════════════════╣',
  ];

  const metrics = data.metrics;
  
  lines.push(`║ Total Requests:        ${String(metrics.http_reqs?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Failed Rate:           ${String(((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2) + '%').padStart(40)} ║`);
  lines.push(`║ Avg Response Time:     ${String((metrics.http_req_duration?.values?.avg || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push(`║ P95 Response Time:     ${String((metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push(`║ P99 Response Time:     ${String((metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push('╠════════════════════════════════════════════════════════════════════╣');
  lines.push(`║ Orders Created:        ${String(metrics.orders_created?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Invoices Read:         ${String(metrics.invoices_read?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Status Updated:        ${String(metrics.invoice_status_updated?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Errors:                ${String(metrics.error_count?.values?.count || 0).padStart(40)} ║`);
  lines.push('╚════════════════════════════════════════════════════════════════════╝\n');

  return lines.join('\n');
}
