import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// ============================================================================
// RETAIL FLOW STRESS TEST
// Luồng hoàn chỉnh: Thêm sản phẩm → Cập nhật kho hàng → Đặt hàng → Thanh toán
// ============================================================================

// Custom metrics cho từng bước trong flow
const flowCompleted = new Counter('retail_flow_completed');
const flowFailed = new Counter('retail_flow_failed');

// Step metrics
const productCreated = new Counter('step1_product_created');
const inventoryUpdated = new Counter('step2_inventory_updated');
const orderCreated = new Counter('step3_order_created');
const paymentCompleted = new Counter('step4_payment_completed');

// Latency metrics
const productLatency = new Trend('step1_product_latency');
const inventoryLatency = new Trend('step2_inventory_latency');
const orderLatency = new Trend('step3_order_latency');
const paymentLatency = new Trend('step4_payment_latency');
const totalFlowLatency = new Trend('total_flow_latency');

// Success rate
const flowSuccessRate = new Rate('flow_success_rate');

export const options = {
  stages: [
    // Stage 1: Warm up - 10 users
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    
    // Stage 2: Scale up - 50 users
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    
    // Stage 3: Peak load - 100 users
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    
    // Stage 4: Cool down
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // Overall thresholds
    http_req_duration: ['p(95)<8000'],   // 95% requests < 8s (adjusted for load)
    http_req_failed: ['rate<0.15'],       // Error rate < 15%
    
    // Flow success rate
    flow_success_rate: ['rate>0.80'],     // 80% flows complete successfully
    
    // Step latencies (p95) - adjusted based on actual performance
    step1_product_latency: ['p(95)<4000'],   // Product creation
    step2_inventory_latency: ['p(95)<5000'], // Inventory update
    step3_order_latency: ['p(95)<10000'],    // Order creation (slowest)
    step4_payment_latency: ['p(95)<8000'],   // Payment processing
    
    // Total flow latency
    total_flow_latency: ['p(95)<40000'],  // Entire flow < 40s under load
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Generate a random UUID for testing
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================================
// DATA GENERATORS
// ============================================================================

const CATEGORIES = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books', 'Toys'];
const PAYMENT_METHODS = ['vnpay', 'momo', 'zalopay', 'bank_transfer', 'card'];

// Counter for unique SKUs
let skuCounter = 0;
let invoiceCounter = 0;

/**
 * Generate product data for Catalogue service
 */
function generateProduct() {
  skuCounter++;
  const uniqueId = `${Date.now()}-${__VU || 1}-${skuCounter}`;
  const price = 50000 + Math.floor(Math.random() * 500000); // 50k - 550k VND
  
  return {
    name: `Retail Test Product ${uniqueId}`,
    description: `Product created during retail flow stress test at ${new Date().toISOString()}`,
    price: price,
    category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    sku: `RETAIL-FLOW-${uniqueId}`,
    imageUrl: 'https://example.com/product-image.jpg',
    isActive: true,
  };
}

/**
 * Generate inventory data for a product
 */
function generateInventory(productId) {
  const quantity = 50 + Math.floor(Math.random() * 200); // 50-250 items
  return {
    productId: productId,
    quantity: quantity,
    warehouseLocation: `Warehouse-${Math.floor(Math.random() * 5) + 1}`,
    reorderLevel: 10,
    maxStock: 1000,
  };
}

/**
 * Generate order data
 */
function generateOrder(productId, price, customerId) {
  const quantity = 1 + Math.floor(Math.random() * 3); // 1-3 items
  return {
    customerId: customerId,
    items: [{
      productId: productId,
      quantity: quantity,
      price: price,
    }],
    notes: `Retail flow stress test order - VU: ${__VU}, Iter: ${__ITER}`,
    shippingAddress: `${Math.floor(Math.random() * 999) + 1} Test Street, District ${Math.floor(Math.random() * 12) + 1}, Ho Chi Minh City`,
  };
}

/**
 * Generate invoice data for billing
 */
function generateInvoice(orderId, customerId, items, totalAmount) {
  invoiceCounter++;
  const uniqueId = Date.now() * 1000 + (__VU || 1) * 100 + (invoiceCounter % 100);
  const tax = Math.floor(totalAmount * 0.1);
  const shippingCost = 30000; // Fixed shipping
  
  return {
    orderId: orderId,
    customerId: customerId,
    orderNumber: `ORD-${uniqueId}`,
    items: items.map(item => ({
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
    totalAmount: totalAmount + tax + shippingCost,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    notes: `Invoice for retail flow test`,
    billingPeriod: 'onetime',
    businessModel: 'retail',
  };
}

/**
 * Generate payment data
 */
function generatePayment(invoiceId, customerId, amount) {
  return {
    invoiceId: invoiceId,
    invoiceNumber: `INV-RETAIL-${invoiceId}`,
    customerId: customerId,
    amount: amount,
    method: PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)],
  };
}

/**
 * Generate payment confirmation
 */
function generatePaymentConfirmation(paymentId) {
  const isSuccess = Math.random() > 0.05; // 95% success rate
  return {
    paymentId: paymentId,
    status: isSuccess ? 'success' : 'failed',
    transactionId: isSuccess ? `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}` : undefined,
    failureReason: isSuccess ? undefined : 'Insufficient funds',
  };
}

// ============================================================================
// MAIN TEST FLOW
// ============================================================================

export default function (data) {
  const headers = { 'Content-Type': 'application/json' };
  const flowStartTime = Date.now();
  let flowSuccess = true;
  
  // Use seeded customer ID if available, otherwise random UUID
  const customerIds = data?.customerIds || [];
  const customerId = customerIds.length > 0 
    ? customerIds[Math.floor(Math.random() * customerIds.length)]
    : randomUUID();
  
  let productId = null;
  let productPrice = null;
  let orderId = null;
  let invoiceId = null;
  let paymentId = null;
  let orderItems = null;
  let totalAmount = null;

  // =========================================================================
  // STEP 1: Thêm sản phẩm mới vào Catalogue
  // =========================================================================
  group('Step 1: Create Product', function () {
    const product = generateProduct();
    productPrice = product.price;
    
    const startTime = Date.now();
    const res = http.post(`${BASE_URL}/catalogue/products`, JSON.stringify(product), { headers });
    productLatency.add(Date.now() - startTime);
    
    const success = check(res, {
      'product created (201)': (r) => r.status === 201,
      'product has id': (r) => {
        try {
          const body = JSON.parse(r.body);
          productId = body?.product?.id;
          return productId !== undefined;
        } catch {
          return false;
        }
      },
    });
    
    if (success) {
      productCreated.add(1);
    } else {
      flowSuccess = false;
      console.log(`[STEP 1 FAILED] Create product: ${res.status} - ${res.body?.substring(0, 200)}`);
    }
  });

  // =========================================================================
  // STEP 2: Cập nhật kho hàng (Inventory)
  // =========================================================================
  if (productId) {
    group('Step 2: Update Inventory', function () {
      const inventory = generateInventory(productId);
      
      const startTime = Date.now();
      const res = http.post(`${BASE_URL}/inventory`, JSON.stringify(inventory), { headers });
      inventoryLatency.add(Date.now() - startTime);
      
      const success = check(res, {
        'inventory created (201/200)': (r) => r.status === 201 || r.status === 200,
      });
      
      if (success) {
        inventoryUpdated.add(1);
        
        // Verify inventory was created
        const verifyRes = http.get(`${BASE_URL}/inventory/product/${productId}`);
        check(verifyRes, {
          'inventory verified': (r) => r.status === 200,
        });
      } else {
        flowSuccess = false;
        console.log(`[STEP 2 FAILED] Create inventory for product ${productId}: ${res.status} - ${res.body?.substring(0, 200)}`);
      }
    });
  }

  // =========================================================================
  // STEP 3: Đặt hàng (Order)
  // =========================================================================
  if (productId && productPrice) {
    group('Step 3: Create Order', function () {
      const order = generateOrder(productId, productPrice, customerId);
      orderItems = order.items;
      totalAmount = order.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
      
      const startTime = Date.now();
      const res = http.post(`${BASE_URL}/orders`, JSON.stringify(order), { headers });
      orderLatency.add(Date.now() - startTime);
      
      const success = check(res, {
        'order created (201)': (r) => r.status === 201,
        'order has id': (r) => {
          try {
            const body = JSON.parse(res.body);
            orderId = body?.order?.id;
            return orderId !== undefined;
          } catch {
            return false;
          }
        },
      });
      
      if (success) {
        orderCreated.add(1);
        
        // Confirm order status
        const confirmRes = http.patch(
          `${BASE_URL}/orders/${orderId}/status`,
          JSON.stringify({ status: 'confirmed' }),
          { headers }
        );
        check(confirmRes, {
          'order confirmed': (r) => r.status === 200,
        });
      } else {
        flowSuccess = false;
        console.log(`[STEP 3 FAILED] Create order: ${res.status} - ${res.body?.substring(0, 200)}`);
      }
    });
  }

  // =========================================================================
  // STEP 4: Thanh toán (Payment)
  // =========================================================================
  if (orderId && totalAmount) {
    group('Step 4: Process Payment', function () {
      // 4.1: Create invoice first
      const invoice = generateInvoice(orderId, customerId, orderItems, totalAmount);
      
      const invoiceRes = http.post(`${BASE_URL}/invoices`, JSON.stringify(invoice), { headers });
      
      const invoiceSuccess = check(invoiceRes, {
        'invoice created (201)': (r) => r.status === 201,
        'invoice has id': (r) => {
          try {
            const body = JSON.parse(r.body);
            invoiceId = body?.invoice?.id || body?.id;
            return invoiceId !== undefined;
          } catch {
            return false;
          }
        },
      });
      
      if (!invoiceSuccess) {
        flowSuccess = false;
        console.log(`[STEP 4.1 FAILED] Create invoice: ${invoiceRes.status} - ${invoiceRes.body?.substring(0, 200)}`);
        return;
      }
      
      // 4.2: Initiate payment
      const payment = generatePayment(invoiceId, customerId, invoice.totalAmount);
      
      const startTime = Date.now();
      const paymentRes = http.post(`${BASE_URL}/payments/initiate`, JSON.stringify(payment), { headers });
      paymentLatency.add(Date.now() - startTime);
      
      const paymentSuccess = check(paymentRes, {
        'payment initiated (201)': (r) => r.status === 201,
        'payment has id': (r) => {
          try {
            const body = JSON.parse(r.body);
            paymentId = body?.id || body?.payment?.id;
            return paymentId !== undefined;
          } catch {
            return false;
          }
        },
      });
      
      if (!paymentSuccess) {
        flowSuccess = false;
        console.log(`[STEP 4.2 FAILED] Initiate payment: ${paymentRes.status} - ${paymentRes.body?.substring(0, 200)}`);
        return;
      }
      
      // 4.3: Confirm payment
      const confirmation = generatePaymentConfirmation(paymentId);
      const confirmRes = http.post(`${BASE_URL}/payments/confirm`, JSON.stringify(confirmation), { headers });
      
      const confirmSuccess = check(confirmRes, {
        'payment confirmed (200)': (r) => r.status === 200,
      });
      
      if (confirmSuccess) {
        paymentCompleted.add(1);
        
        // Update order status to processing/shipped after payment
        http.patch(
          `${BASE_URL}/orders/${orderId}/status`,
          JSON.stringify({ status: 'processing' }),
          { headers }
        );
      } else {
        flowSuccess = false;
        console.log(`[STEP 4.3 FAILED] Confirm payment: ${confirmRes.status} - ${confirmRes.body?.substring(0, 200)}`);
      }
    });
  }

  // =========================================================================
  // FLOW COMPLETION
  // =========================================================================
  const flowEndTime = Date.now();
  totalFlowLatency.add(flowEndTime - flowStartTime);
  
  if (flowSuccess && paymentId) {
    flowCompleted.add(1);
    flowSuccessRate.add(true);
  } else {
    flowFailed.add(1);
    flowSuccessRate.add(false);
  }
  
  // Sleep between iterations
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

// ============================================================================
// SETUP - Health checks and seed data
// ============================================================================

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
  console.log('   RETAIL FLOW STRESS TEST');
  console.log('   Luồng: Product → Inventory → Order → Payment');
  console.log('='.repeat(60));
  console.log(`Target API: ${BASE_URL}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');

  const headers = { 'Content-Type': 'application/json' };
  
  // Health checks for all services
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
  
  // Get existing customers for realistic testing
  let customerIds = [];
  try {
    const customersRes = http.get(`${BASE_URL}/customers?page=1&limit=100`);
    if (customersRes.status === 200) {
      const data = JSON.parse(customersRes.body);
      customerIds = (data.customers || []).map(c => c.id).filter(id => id);
      console.log(`✓ Found ${customerIds.length} existing customers`);
    }
  } catch (e) {
    console.log('⚠ Could not fetch customers');
  }
  
  // Seed customers if not enough exist
  if (customerIds.length < 20) {
    console.log('📝 Seeding test customers...');
    const seedCount = 20 - customerIds.length;
    for (let i = 0; i < seedCount; i++) {
      const timestamp = Date.now();
      const customerId = createCustomer(
        `Test Customer ${timestamp}-${i}`,
        `test.customer.${timestamp}.${i}@example.com`
      );
      if (customerId) {
        customerIds.push(customerId);
      }
    }
    console.log(`✓ Seeded ${seedCount} customers. Total: ${customerIds.length}`);
  }
  
  if (customerIds.length === 0) {
    console.log('⚠ WARNING: No customers available - orders will fail!');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('   STARTING TEST...');
  console.log('='.repeat(60) + '\n');

  return {
    startTime: Date.now(),
    customerIds: customerIds,
  };
}

// ============================================================================
// TEARDOWN - Summary
// ============================================================================

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  
  console.log('\n' + '='.repeat(60));
  console.log('   RETAIL FLOW STRESS TEST COMPLETED');
  console.log('='.repeat(60));
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Finished at: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  console.log('\nCheck the summary above for detailed metrics:');
  console.log('- retail_flow_completed: Số flow hoàn thành');
  console.log('- retail_flow_failed: Số flow thất bại');
  console.log('- flow_success_rate: Tỷ lệ thành công');
  console.log('- step1-4_*_latency: Latency từng bước');
  console.log('- total_flow_latency: Tổng thời gian flow');
  console.log('='.repeat(60) + '\n');
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
  
  // Retail flow involves multiple services, so recommendations are for the whole stack
  let cpuRequest = '150m';
  let cpuLimit = '750m';
  let memoryRequest = '256Mi';
  let memoryLimit = '768Mi';
  let replicas = 2;
  
  if (p95ResponseTime > 5000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
    memoryRequest = '512Mi'; memoryLimit = '1.5Gi';
  } else if (p95ResponseTime > 3000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '384Mi'; memoryLimit = '1Gi';
  } else if (p95ResponseTime > 1500) {
    cpuRequest = '200m'; cpuLimit = '1000m';
    memoryRequest = '256Mi'; memoryLimit = '768Mi';
  }
  
  if (waitingTime > 2000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
  } else if (waitingTime > 1000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
  }
  
  if (blockedTime > 1000 || throughput > 300) {
    memoryRequest = '512Mi'; memoryLimit = '1.5Gi';
  } else if (blockedTime > 500 || throughput > 150) {
    memoryRequest = '384Mi'; memoryLimit = '1Gi';
  }
  
  if (errorRate > 0.15 || p99ResponseTime > 10000) {
    replicas = Math.ceil(maxVUs / 12);
  } else if (errorRate > 0.1 || p99ResponseTime > 7000) {
    replicas = Math.ceil(maxVUs / 15);
  } else if (p95ResponseTime > 3000) {
    replicas = Math.ceil(maxVUs / 20);
  } else {
    replicas = Math.ceil(maxVUs / 25);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return {
    serviceName: 'retail-flow (all services)',
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
  console.log('🎯 K8S RESOURCE RECOMMENDATIONS (Per Service)');
  console.log('='.repeat(60));
  console.log(`Flow: ${recommendation.serviceName}`);
  console.log(`Replicas (each service): ${recommendation.replicas}`);
  console.log(`CPU Request: ${recommendation.resources.requests.cpu}`);
  console.log(`CPU Limit: ${recommendation.resources.limits.cpu}`);
  console.log(`Memory Request: ${recommendation.resources.requests.memory}`);
  console.log(`Memory Limit: ${recommendation.resources.limits.memory}`);
  console.log('\n📋 YAML Configuration (per service):');
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
    'retail-flow-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
