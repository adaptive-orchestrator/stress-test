import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// ============================================================================
// RETAIL FLOW SIMPLE TEST - 10 VUs
// Dùng để test nhanh luồng retail trước khi chạy stress test lớn
// ============================================================================

// Custom metrics
const flowCompleted = new Counter('retail_flow_completed');
const flowFailed = new Counter('retail_flow_failed');
const flowSuccessRate = new Rate('flow_success_rate');
const totalFlowLatency = new Trend('total_flow_latency');

export const options = {
  vus: 10,
  duration: '2m',
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.2'],
    flow_success_rate: ['rate>0.7'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const CATEGORIES = ['Electronics', 'Clothing', 'Home', 'Sports'];
const PAYMENT_METHODS = ['vnpay', 'momo', 'zalopay'];

let skuCounter = 0;
let invoiceCounter = 0;

// Generate a random UUID for testing
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateProduct() {
  skuCounter++;
  const uniqueId = `${Date.now()}-${__VU || 1}-${skuCounter}`;
  return {
    name: `Quick Test Product ${uniqueId}`,
    description: `Quick test product`,
    price: 100000 + Math.floor(Math.random() * 200000),
    category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)],
    sku: `QT-${uniqueId}`,
    imageUrl: 'https://example.com/img.jpg',
    isActive: true,
  };
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

export default function (data) {
  const headers = { 'Content-Type': 'application/json' };
  const flowStartTime = Date.now();
  let flowSuccess = true;
  
  // Use seeded customer IDs
  const customerIds = data?.customerIds || [];
  const customerId = customerIds.length > 0 
    ? customerIds[Math.floor(Math.random() * customerIds.length)]
    : randomUUID();
    
  let productId = null;
  let productPrice = null;
  let orderId = null;
  let invoiceId = null;
  let paymentId = null;

  // STEP 1: Create Product
  group('Step 1: Create Product', function () {
    const product = generateProduct();
    productPrice = product.price;
    
    const res = http.post(`${BASE_URL}/catalogue/products`, JSON.stringify(product), { headers });
    
    if (check(res, { 'product created': (r) => r.status === 201 })) {
      try {
        productId = JSON.parse(res.body)?.product?.id;
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
        quantity: 100,
        warehouseLocation: 'WH-1',
        reorderLevel: 10,
        maxStock: 500,
      };
      
      const res = http.post(`${BASE_URL}/inventory`, JSON.stringify(inventory), { headers });
      
      if (!check(res, { 'inventory created': (r) => r.status === 201 || r.status === 200 })) {
        flowSuccess = false;
      }
    });
  }

  // STEP 3: Create Order
  if (productId && productPrice) {
    group('Step 3: Create Order', function () {
      const order = {
        customerId: customerId,
        items: [{ productId: productId, quantity: 2, price: productPrice }],
        notes: 'Quick test order',
        shippingAddress: '123 Test St, HCM City',
      };
      
      const res = http.post(`${BASE_URL}/orders`, JSON.stringify(order), { headers });
      
      if (check(res, { 'order created': (r) => r.status === 201 })) {
        try {
          orderId = JSON.parse(res.body)?.order?.id;
        } catch {}
        
        // Confirm order
        if (orderId) {
          http.patch(`${BASE_URL}/orders/${orderId}/status`, JSON.stringify({ status: 'confirmed' }), { headers });
        }
      } else {
        flowSuccess = false;
      }
    });
  }

  // STEP 4: Payment
  if (orderId && productPrice) {
    group('Step 4: Process Payment', function () {
      const totalAmount = productPrice * 2;
      invoiceCounter++;
      const uniqueInvoiceId = Date.now() * 1000 + (__VU || 1) * 100 + (invoiceCounter % 100);
      
      // Create invoice
      const invoice = {
        orderId: orderId,
        customerId: customerId,
        orderNumber: `QT-ORD-${uniqueInvoiceId}`,
        items: [{ productId: productId, description: 'Test Product', quantity: 2, unitPrice: productPrice, totalPrice: totalAmount }],
        subtotal: totalAmount,
        tax: Math.floor(totalAmount * 0.1),
        shippingCost: 30000,
        discount: 0,
        totalAmount: totalAmount + Math.floor(totalAmount * 0.1) + 30000,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        billingPeriod: 'onetime',
        businessModel: 'retail',
      };
      
      const invoiceRes = http.post(`${BASE_URL}/invoices`, JSON.stringify(invoice), { headers });
      
      if (check(invoiceRes, { 'invoice created': (r) => r.status === 201 })) {
        try {
          invoiceId = JSON.parse(invoiceRes.body)?.invoice?.id || JSON.parse(invoiceRes.body)?.id;
        } catch {}
      } else {
        flowSuccess = false;
        return;
      }
      
      // Initiate payment
      if (invoiceId) {
        const payment = {
          invoiceId: invoiceId,
          invoiceNumber: `QT-INV-${invoiceId}`,
          customerId: customerId,
          amount: invoice.totalAmount,
          method: PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)],
        };
        
        const paymentRes = http.post(`${BASE_URL}/payments/initiate`, JSON.stringify(payment), { headers });
        
        if (check(paymentRes, { 'payment initiated': (r) => r.status === 201 })) {
          try {
            paymentId = JSON.parse(paymentRes.body)?.id || JSON.parse(paymentRes.body)?.payment?.id;
          } catch {}
          
          // Confirm payment
          if (paymentId) {
            const confirmation = {
              paymentId: paymentId,
              status: 'success',
              transactionId: `TXN-${Date.now()}`,
            };
            http.post(`${BASE_URL}/payments/confirm`, JSON.stringify(confirmation), { headers });
          }
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
  
  sleep(Math.random() * 1.5 + 0.5);
}

export function setup() {
  console.log('\n========== RETAIL FLOW QUICK TEST (10 VUs) ==========');
  console.log(`Target API: ${BASE_URL}`);
  console.log('======================================================\n');

  // Quick health checks
  const endpoints = ['/catalogue/products', '/inventory', '/orders', '/invoices', '/payments', '/customers'];
  for (const ep of endpoints) {
    const res = http.get(`${BASE_URL}${ep}?page=1&limit=1`);
    if (res.status >= 500) throw new Error(`API ${ep} unhealthy`);
  }
  console.log('✓ All APIs are healthy');
  
  // Get or seed customers
  let customerIds = [];
  try {
    const customersRes = http.get(`${BASE_URL}/customers?page=1&limit=50`);
    if (customersRes.status === 200) {
      const data = JSON.parse(customersRes.body);
      customerIds = (data.customers || []).map(c => c.id).filter(id => id);
    }
  } catch (e) {}
  
  // Seed if needed
  if (customerIds.length < 10) {
    console.log('📝 Seeding test customers...');
    for (let i = 0; i < 10; i++) {
      const timestamp = Date.now();
      const id = createCustomer(
        `Quick Test Customer ${timestamp}-${i}`,
        `quick.test.${timestamp}.${i}@example.com`
      );
      if (id) customerIds.push(id);
    }
  }
  console.log(`✓ Using ${customerIds.length} customers\n`);
  
  return { startTime: Date.now(), customerIds };
}

export function teardown(data) {
  console.log('\n========== TEST COMPLETE ==========');
  console.log(`Duration: ${((Date.now() - data.startTime) / 1000).toFixed(2)}s`);
  console.log('====================================\n');
}
