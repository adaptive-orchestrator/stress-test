import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// ============================================================================
// RETAIL FLOW - 1000 VUs STRESS TEST
// Test hiệu năng cao với 1000 VUs đồng thời
// ============================================================================

// Custom metrics
const flowCompleted = new Counter('retail_flow_completed');
const flowFailed = new Counter('retail_flow_failed');
const productCreated = new Counter('step1_product_created');
const inventoryUpdated = new Counter('step2_inventory_updated');
const orderCreated = new Counter('step3_order_created');
const paymentCompleted = new Counter('step4_payment_completed');

const productLatency = new Trend('step1_product_latency');
const inventoryLatency = new Trend('step2_inventory_latency');
const orderLatency = new Trend('step3_order_latency');
const paymentLatency = new Trend('step4_payment_latency');
const totalFlowLatency = new Trend('total_flow_latency');

const flowSuccessRate = new Rate('flow_success_rate');

export const options = {
  stages: [
    // Warm up
    { duration: '1m', target: 100 },
    { duration: '1m', target: 100 },
    
    // Ramp up to 500
    { duration: '1m', target: 500 },
    { duration: '2m', target: 500 },
    
    // Peak at 1000
    { duration: '1m', target: 1000 },
    { duration: '2m', target: 1000 },
    
    // Sustain at 800
    { duration: '2m', target: 800 },
    
    // Cool down
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],    // 95% < 2s (relaxed for high load)
    http_req_failed: ['rate<0.25'],        // Error rate < 25%
    flow_success_rate: ['rate>0.60'],      // 60% flows complete (realistic for 1000 VUs)
    total_flow_latency: ['p(95)<6000'],    // Total flow < 6s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const CATEGORIES = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books'];
const PAYMENT_METHODS = ['vnpay', 'momo', 'zalopay', 'bank_transfer', 'card'];

let skuCounter = 0;
let invoiceCounter = 0;

function generateProduct() {
  skuCounter++;
  const uniqueId = `${Date.now()}-${__VU || 1}-${skuCounter}`;
  return {
    name: `High Load Product ${uniqueId}`,
    description: `Product for 1000 VU stress test`,
    price: 50000 + Math.floor(Math.random() * 500000),
    category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    sku: `HL-${uniqueId}`,
    imageUrl: 'https://example.com/product.jpg',
    isActive: true,
  };
}

export default function (data) {
  const headers = { 'Content-Type': 'application/json' };
  const flowStartTime = Date.now();
  let flowSuccess = true;
  
  const customerIds = data?.customerIds || [];
  const customerId = customerIds.length > 0 
    ? customerIds[Math.floor(Math.random() * customerIds.length)]
    : 1 + Math.floor(Math.random() * 200);
  
  let productId = null;
  let productPrice = null;
  let orderId = null;
  let invoiceId = null;
  let paymentId = null;
  let orderItems = null;
  let totalAmount = null;

  // STEP 1: Create Product
  group('Step 1: Create Product', function () {
    const product = generateProduct();
    productPrice = product.price;
    
    const startTime = Date.now();
    const res = http.post(`${BASE_URL}/catalogue/products`, JSON.stringify(product), { headers });
    productLatency.add(Date.now() - startTime);
    
    if (check(res, { 'product created': (r) => r.status === 201 })) {
      try {
        productId = JSON.parse(res.body)?.product?.id;
        productCreated.add(1);
      } catch {}
    } else {
      flowSuccess = false;
    }
  });

  // STEP 2: Create Inventory
  if (productId) {
    group('Step 2: Create Inventory', function () {
      const inventory = {
        productId: productId,
        quantity: 100 + Math.floor(Math.random() * 200),
        warehouseLocation: `WH-${Math.floor(Math.random() * 10) + 1}`,
        reorderLevel: 10,
        maxStock: 1000,
      };
      
      const startTime = Date.now();
      const res = http.post(`${BASE_URL}/inventory`, JSON.stringify(inventory), { headers });
      inventoryLatency.add(Date.now() - startTime);
      
      if (check(res, { 'inventory created': (r) => r.status === 201 || r.status === 200 })) {
        inventoryUpdated.add(1);
      } else {
        flowSuccess = false;
      }
    });
  }

  // STEP 3: Create Order
  if (productId && productPrice) {
    group('Step 3: Create Order', function () {
      const quantity = 1 + Math.floor(Math.random() * 3);
      orderItems = [{ productId: productId, quantity: quantity, price: productPrice }];
      totalAmount = quantity * productPrice;
      
      const order = {
        customerId: customerId,
        items: orderItems,
        notes: `1000 VU stress test - VU: ${__VU}`,
        shippingAddress: `${Math.floor(Math.random() * 999) + 1} Stress Test St, District ${Math.floor(Math.random() * 12) + 1}`,
      };
      
      const startTime = Date.now();
      const res = http.post(`${BASE_URL}/orders`, JSON.stringify(order), { headers });
      orderLatency.add(Date.now() - startTime);
      
      if (check(res, { 'order created': (r) => r.status === 201 })) {
        try {
          orderId = JSON.parse(res.body)?.order?.id;
          orderCreated.add(1);
        } catch {}
        
        if (orderId) {
          http.patch(`${BASE_URL}/orders/${orderId}/status`, JSON.stringify({ status: 'confirmed' }), { headers });
        }
      } else {
        flowSuccess = false;
      }
    });
  }

  // STEP 4: Payment
  if (orderId && totalAmount) {
    group('Step 4: Process Payment', function () {
      invoiceCounter++;
      const uniqueInvoiceId = Date.now() * 1000 + (__VU || 1) * 100 + (invoiceCounter % 100);
      const tax = Math.floor(totalAmount * 0.1);
      const shippingCost = 30000;
      const finalAmount = totalAmount + tax + shippingCost;
      
      // Create invoice
      const invoice = {
        orderId: orderId,
        customerId: customerId,
        orderNumber: `HL-ORD-${uniqueInvoiceId}`,
        items: orderItems.map(item => ({
          productId: item.productId,
          description: `Product ${item.productId}`,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.quantity * item.price,
        })),
        subtotal: totalAmount,
        tax: tax,
        shippingCost: shippingCost,
        discount: 0,
        totalAmount: finalAmount,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        billingPeriod: 'onetime',
        businessModel: 'retail',
      };
      
      const invoiceRes = http.post(`${BASE_URL}/invoices`, JSON.stringify(invoice), { headers });
      
      if (!check(invoiceRes, { 'invoice created': (r) => r.status === 201 })) {
        flowSuccess = false;
        return;
      }
      
      try {
        invoiceId = JSON.parse(invoiceRes.body)?.invoice?.id || JSON.parse(invoiceRes.body)?.id;
      } catch {}
      
      if (!invoiceId) {
        flowSuccess = false;
        return;
      }
      
      // Initiate payment
      const payment = {
        invoiceId: invoiceId,
        invoiceNumber: `HL-INV-${invoiceId}`,
        customerId: customerId,
        amount: finalAmount,
        method: PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)],
      };
      
      const startTime = Date.now();
      const paymentRes = http.post(`${BASE_URL}/payments/initiate`, JSON.stringify(payment), { headers });
      paymentLatency.add(Date.now() - startTime);
      
      if (!check(paymentRes, { 'payment initiated': (r) => r.status === 201 })) {
        flowSuccess = false;
        return;
      }
      
      try {
        paymentId = JSON.parse(paymentRes.body)?.id || JSON.parse(paymentRes.body)?.payment?.id;
      } catch {}
      
      if (paymentId) {
        const confirmation = {
          paymentId: paymentId,
          status: Math.random() > 0.05 ? 'success' : 'failed',
          transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        };
        
        const confirmRes = http.post(`${BASE_URL}/payments/confirm`, JSON.stringify(confirmation), { headers });
        
        if (check(confirmRes, { 'payment confirmed': (r) => r.status === 200 })) {
          paymentCompleted.add(1);
          http.patch(`${BASE_URL}/orders/${orderId}/status`, JSON.stringify({ status: 'processing' }), { headers });
        } else {
          flowSuccess = false;
        }
      }
    });
  }

  // Track results
  totalFlowLatency.add(Date.now() - flowStartTime);
  
  if (flowSuccess && paymentId) {
    flowCompleted.add(1);
    flowSuccessRate.add(true);
  } else {
    flowFailed.add(1);
    flowSuccessRate.add(false);
  }
  
  sleep(Math.random() * 1 + 0.5); // Shorter sleep for higher load
}

function createCustomer(name, email) {
  const headers = { 'Content-Type': 'application/json' };
  const res = http.post(`${BASE_URL}/customers`, JSON.stringify({
    name: name,
    email: email,
    phone: `09${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
    address: '123 Test Street, HCM City',
  }), { headers });
  
  if (res.status === 201) {
    try {
      const body = JSON.parse(res.body);
      return body?.customer?.id || body?.id;
    } catch {}
  }
  return null;
}

export function setup() {
  console.log('\n' + '='.repeat(60));
  console.log('   RETAIL FLOW - 1000 VUs STRESS TEST');
  console.log('   HIGH LOAD PERFORMANCE TEST');
  console.log('='.repeat(60));
  console.log(`Target API: ${BASE_URL}`);
  console.log(`Max VUs: 1000`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');

  const headers = { 'Content-Type': 'application/json' };
  
  // Health checks
  const services = [
    { name: 'Catalogue', endpoint: '/catalogue/products?page=1&limit=1' },
    { name: 'Inventory', endpoint: '/inventory?page=1&limit=1' },
    { name: 'Order', endpoint: '/orders?page=1&limit=1' },
    { name: 'Billing', endpoint: '/invoices?page=1&limit=1' },
    { name: 'Payment', endpoint: '/payments' },
    { name: 'Customer', endpoint: '/customers?page=1&limit=1' },
  ];
  
  for (const svc of services) {
    const res = http.get(`${BASE_URL}${svc.endpoint}`);
    if (res.status >= 500) {
      throw new Error(`${svc.name} API unhealthy: ${res.status}`);
    }
    console.log(`✓ ${svc.name} API is healthy`);
  }
  
  // Get customers
  let customerIds = [];
  try {
    const customersRes = http.get(`${BASE_URL}/customers?page=1&limit=200`);
    if (customersRes.status === 200) {
      const data = JSON.parse(customersRes.body);
      customerIds = (data.customers || []).map(c => c.id).filter(id => id);
      console.log(`✓ Found ${customerIds.length} existing customers`);
    }
  } catch (e) {
    console.log('⚠ Could not fetch customers');
  }
  
  // Seed customers if not enough for high load
  if (customerIds.length < 50) {
    console.log('📝 Seeding customers for high load test...');
    const seedCount = 50 - customerIds.length;
    for (let i = 0; i < seedCount; i++) {
      const timestamp = Date.now();
      const id = createCustomer(
        `HighLoad Customer ${timestamp}-${i}`,
        `highload.${timestamp}.${i}@example.com`
      );
      if (id) customerIds.push(id);
    }
    console.log(`✓ Seeded customers. Total: ${customerIds.length}`);
  }
  
  console.log('\n⚠ WARNING: This is a HIGH LOAD test (1000 VUs)');
  console.log('⚠ Ensure your system has enough resources\n');
  console.log('='.repeat(60) + '\n');

  return { startTime: Date.now(), customerIds };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  
  console.log('\n' + '='.repeat(60));
  console.log('   1000 VUs STRESS TEST COMPLETED');
  console.log('='.repeat(60));
  console.log(`Duration: ${duration.toFixed(2)}s (${(duration / 60).toFixed(2)} minutes)`);
  console.log(`Finished at: ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');
}

// Calculate recommended K8s resources for each service based on test results
function calculateResourceRecommendations(data) {
  const metrics = data.metrics;
  const maxVUs = 1000;
  const avgResponseTime = metrics.http_req_duration?.values?.avg || 0;
  const p95ResponseTime = metrics.http_req_duration?.values['p(95)'] || 0;
  const p99ResponseTime = metrics.http_req_duration?.values['p(99)'] || 0;
  const errorRate = metrics.http_req_failed?.values?.rate || 0;
  const throughput = metrics.http_reqs?.values?.rate || 0;
  const waitingTime = metrics.http_req_waiting?.values?.avg || 0;
  const blockedTime = metrics.http_req_blocked?.values?.avg || 0;
  const flowSuccessRate = metrics.flow_success_rate?.values?.rate || 0;
  
  // Get step-specific latencies
  const productLatency = metrics.step1_product_latency?.values?.['p(95)'] || 0;
  const inventoryLatency = metrics.step2_inventory_latency?.values?.['p(95)'] || 0;
  const orderLatency = metrics.step3_order_latency?.values?.['p(95)'] || 0;
  const paymentLatency = metrics.step4_payment_latency?.values?.['p(95)'] || 0;
  
  // Helper function to calculate resources for a service
  function calcServiceResources(serviceName, stepLatency, baseWeight) {
    let cpuRequest = '100m';
    let cpuLimit = '500m';
    let memoryRequest = '128Mi';
    let memoryLimit = '512Mi';
    let replicas = 2;
    
    const effectiveLatency = stepLatency > 0 ? stepLatency : p95ResponseTime;
    
    if (effectiveLatency > 3000) {
      cpuRequest = '500m'; cpuLimit = '2000m';
      memoryRequest = '512Mi'; memoryLimit = '1Gi';
    } else if (effectiveLatency > 1500) {
      cpuRequest = '300m'; cpuLimit = '1500m';
      memoryRequest = '384Mi'; memoryLimit = '768Mi';
    } else if (effectiveLatency > 800) {
      cpuRequest = '200m'; cpuLimit = '1000m';
      memoryRequest = '256Mi'; memoryLimit = '640Mi';
    } else if (effectiveLatency > 400) {
      cpuRequest = '150m'; cpuLimit = '750m';
      memoryRequest = '192Mi'; memoryLimit = '512Mi';
    }
    
    if (waitingTime > 1500) {
      cpuRequest = '500m'; cpuLimit = '2000m';
    } else if (waitingTime > 800) {
      cpuRequest = '300m'; cpuLimit = '1500m';
    }
    
    if (blockedTime > 500 || throughput > 800) {
      memoryRequest = '512Mi'; memoryLimit = '1Gi';
    } else if (blockedTime > 200 || throughput > 400) {
      memoryRequest = '384Mi'; memoryLimit = '768Mi';
    }
    
    // Calculate replicas based on flow success rate and error rate
    if (flowSuccessRate < 0.6 || errorRate > 0.2) {
      replicas = Math.ceil(maxVUs / 100 * baseWeight);
    } else if (flowSuccessRate < 0.75 || errorRate > 0.1) {
      replicas = Math.ceil(maxVUs / 150 * baseWeight);
    } else if (flowSuccessRate < 0.85 || p99ResponseTime > 4000) {
      replicas = Math.ceil(maxVUs / 200 * baseWeight);
    } else {
      replicas = Math.ceil(maxVUs / 250 * baseWeight);
    }
    
    replicas = Math.max(2, Math.min(replicas, 10));
    
    return {
      serviceName,
      replicas,
      resources: {
        requests: { cpu: cpuRequest, memory: memoryRequest },
        limits: { cpu: cpuLimit, memory: memoryLimit },
      },
    };
  }
  
  // Calculate for each service involved in retail flow
  const services = [
    calcServiceResources('catalogue-svc', productLatency, 0.8),
    calcServiceResources('inventory-svc', inventoryLatency, 1.0),
    calcServiceResources('order-svc', orderLatency, 1.2),
    calcServiceResources('billing-svc', paymentLatency * 0.5, 0.9),
    calcServiceResources('payment-svc', paymentLatency, 1.0),
    calcServiceResources('customer-svc', 0, 0.6),
  ];
  
  return {
    services,
    testMetrics: {
      maxVUs,
      avgResponseTime: avgResponseTime.toFixed(2),
      p95ResponseTime: p95ResponseTime.toFixed(2),
      p99ResponseTime: p99ResponseTime.toFixed(2),
      errorRate: (errorRate * 100).toFixed(2),
      flowSuccessRate: (flowSuccessRate * 100).toFixed(2),
      throughput: throughput.toFixed(2),
      waitingTime: waitingTime.toFixed(2),
      blockedTime: blockedTime.toFixed(2),
    },
  };
}

export function handleSummary(data) {
  const recommendations = calculateResourceRecommendations(data);
  
  console.log('\n' + '='.repeat(70));
  console.log('🎯 K8S RESOURCE RECOMMENDATIONS FOR RETAIL FLOW');
  console.log('='.repeat(70));
  console.log(`Test Metrics:`);
  console.log(`  - Max VUs: ${recommendations.testMetrics.maxVUs}`);
  console.log(`  - Avg Response: ${recommendations.testMetrics.avgResponseTime}ms`);
  console.log(`  - P95 Response: ${recommendations.testMetrics.p95ResponseTime}ms`);
  console.log(`  - P99 Response: ${recommendations.testMetrics.p99ResponseTime}ms`);
  console.log(`  - Error Rate: ${recommendations.testMetrics.errorRate}%`);
  console.log(`  - Flow Success: ${recommendations.testMetrics.flowSuccessRate}%`);
  console.log(`  - Throughput: ${recommendations.testMetrics.throughput} req/s`);
  console.log('='.repeat(70));
  
  for (const svc of recommendations.services) {
    console.log(`\n📦 ${svc.serviceName}:`);
    console.log(`   Replicas: ${svc.replicas}`);
    console.log(`   CPU: ${svc.resources.requests.cpu} / ${svc.resources.limits.cpu}`);
    console.log(`   Memory: ${svc.resources.requests.memory} / ${svc.resources.limits.memory}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('📋 YAML Configuration for all services:');
  console.log('='.repeat(70));
  console.log('```yaml');
  for (const svc of recommendations.services) {
    console.log(`# ${svc.serviceName}`);
    console.log(`${svc.serviceName.replace('-svc', '')}:`);
    console.log(`  replicas: ${svc.replicas}`);
    console.log('  resources:');
    console.log('    requests:');
    console.log(`      cpu: "${svc.resources.requests.cpu}"`);
    console.log(`      memory: "${svc.resources.requests.memory}"`);
    console.log('    limits:');
    console.log(`      cpu: "${svc.resources.limits.cpu}"`);
    console.log(`      memory: "${svc.resources.limits.memory}"`);
    console.log('');
  }
  console.log('```');
  console.log('='.repeat(70) + '\n');
  
  // Save to JSON
  const fullSummary = {
    ...data,
    k8sRecommendations: recommendations,
  };
  
  return {
    'retail-flow-1000vus-summary.json': JSON.stringify(fullSummary, null, 2),
  };
}
