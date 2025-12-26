import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import encoding from 'k6/encoding';

// ============================================================================
// QUICK VALIDATION TEST - Retail Model
// Reduced VUs to validate fix before full stress test
// ============================================================================

const totalRequests = new Counter('total_requests');
const readRequests = new Counter('read_requests');
const writeRequests = new Counter('write_requests');
const readLatency = new Trend('read_latency', true);
const writeLatency = new Trend('write_latency', true);
const overallSuccessRate = new Rate('success_rate');
const readSuccessRate = new Rate('read_success_rate');
const writeSuccessRate = new Rate('write_success_rate');
const ordersCompleted = new Counter('orders_completed');

// Reduced load for validation
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // 10 VUs for 30s
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'success_rate': ['rate>0.8'],
    'orders_completed': ['count>=1'],  // At least 1 order should succeed
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://ae081c86deee14a10bdf2bc9a9c88fdb-726197963.ap-southeast-1.elb.amazonaws.com';

const TEST_USERS = [
  { email: 'stresstest1@demo.com', password: 'Test@123456' },
  { email: 'stresstest2@demo.com', password: 'Test@123456' },
  { email: 'retailtest1@demo.com', password: 'Test@123456' },
  { email: 'retailtest2@demo.com', password: 'Test@123456' },
  { email: 'retailtest3@demo.com', password: 'Test@123456' },
];

let authTokens = {};
let customerIds = {};
let productsWithStock = [];

export function setup() {
  console.log('=== VALIDATION TEST SETUP ===');
  
  const tokens = {};
  const customerIdMap = {};
  
  // Login users
  for (const user of TEST_USERS) {
    const loginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    if (loginRes.status === 200 || loginRes.status === 201) {
      const data = JSON.parse(loginRes.body);
      tokens[user.email] = data.accessToken || data.access_token;
      console.log(`✓ Login: ${user.email}`);
    }
  }
  
  const firstToken = Object.values(tokens)[0];
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firstToken}` };
  
  // Fetch customers
  const customersRes = http.get(`${BASE_URL}/customers?page=1&limit=100`, { headers });
  if (customersRes.status === 200) {
    const customers = JSON.parse(customersRes.body).customers || [];
    for (const c of customers) {
      if (c.email) customerIdMap[c.email] = c.id;
    }
    console.log(`✓ Mapped ${Object.keys(customerIdMap).length} customers`);
  }
  
  // Fetch products with stock
  let stockedProducts = [];
  const inventoryRes = http.get(`${BASE_URL}/inventory/my?page=1&limit=100`, { headers });
  if (inventoryRes.status === 200) {
    const items = JSON.parse(inventoryRes.body).items || [];
    for (const inv of items) {
      if (inv.quantity > 0) {
        const productRes = http.get(`${BASE_URL}/catalogue/products/my/${inv.productId}`, { headers });
        let price = 100000;
        if (productRes.status === 200) {
          const p = JSON.parse(productRes.body);
          price = p?.product?.price || p?.price || 100000;
        }
        stockedProducts.push({ productId: inv.productId, quantity: inv.quantity, price });
      }
    }
    console.log(`✓ Found ${stockedProducts.length} products with stock`);
  }
  
  console.log('=== STARTING VALIDATION TEST ===');
  return { tokens, customerIdMap, stockedProducts };
}

export default function(data) {
  authTokens = data?.tokens || {};
  customerIds = data?.customerIdMap || {};
  productsWithStock = data?.stockedProducts || [];
  
  const userIndex = __VU % TEST_USERS.length;
  const user = TEST_USERS[userIndex];
  const token = authTokens[user.email];
  
  if (!token) {
    sleep(1);
    return;
  }
  
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  
  // 80% Read, 20% Write for faster validation
  const op = Math.random();
  
  if (op < 0.80) {
    // READ
    group('Read', function() {
      const startTime = Date.now();
      const res = http.get(`${BASE_URL}/catalogue/products/my?page=1&limit=10`, { headers });
      readLatency.add(Date.now() - startTime);
      totalRequests.add(1);
      readRequests.add(1);
      
      const success = check(res, { 'products 200': r => r.status === 200 });
      readSuccessRate.add(success);
      overallSuccessRate.add(success);
    });
  } else {
    // WRITE - Create Order
    group('Write Order', function() {
      const customerId = customerIds[user.email];
      const product = productsWithStock.length > 0 
        ? productsWithStock[Math.floor(Math.random() * productsWithStock.length)]
        : null;
      
      if (!customerId || !product) {
        console.log(`Skip order: customerId=${customerId}, product=${product?.productId}`);
        return;
      }
      
      const order = {
        customerId: customerId,
        items: [{
          productId: product.productId,
          quantity: 1,
          price: product.price,
        }],
        shippingAddress: `${__VU} Test Street`,
        notes: `Validation test VU ${__VU}`,
      };
      
      const startTime = Date.now();
      const res = http.post(`${BASE_URL}/orders`, JSON.stringify(order), { headers });
      writeLatency.add(Date.now() - startTime);
      totalRequests.add(1);
      writeRequests.add(1);
      
      const success = check(res, { 
        'order created': r => r.status === 201,
      });
      
      writeSuccessRate.add(success);
      overallSuccessRate.add(success);
      
      if (success) {
        ordersCompleted.add(1);
        console.log(`✓ Order created for VU ${__VU}`);
      }
    });
  }
  
  sleep(Math.random() + 0.5);
}

export function handleSummary(data) {
  console.log('\n=== VALIDATION RESULTS ===');
  console.log(`Total Requests: ${data.metrics.total_requests?.values?.count || 0}`);
  console.log(`Read Requests: ${data.metrics.read_requests?.values?.count || 0}`);
  console.log(`Write Requests: ${data.metrics.write_requests?.values?.count || 0}`);
  console.log(`Orders Completed: ${data.metrics.orders_completed?.values?.count || 0}`);
  console.log(`Success Rate: ${((data.metrics.success_rate?.values?.rate || 0) * 100).toFixed(2)}%`);
  console.log(`Write Success Rate: ${((data.metrics.write_success_rate?.values?.rate || 0) * 100).toFixed(2)}%`);
  return {};
}
