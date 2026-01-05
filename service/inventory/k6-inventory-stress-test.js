import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 5 },    // Warm up slowly to 5 users
    { duration: '3m', target: 5 },    // Stay at 5 (baseline)
    { duration: '2m', target: 15 },   // Ramp to 15 users
    { duration: '4m', target: 15 },   // Hold at 15 (normal load)
    { duration: '1m', target: 25 },   // Spike to 25 users
    { duration: '2m', target: 25 },   // Hold spike
    { duration: '1m', target: 0 },    // Cool down
  ],
  thresholds: {
    // Very conservative thresholds for local single-instance services
    http_req_duration: ['p(95)<8000'],                      // 8s for p95
    http_req_failed: ['rate<0.10'],                         // 10% error tolerance
    'http_req_duration{name:list_inventory}': ['p(95)<5000'],
    'http_req_duration{name:adjust_stock}': ['p(95)<6000'],
    checks: ['rate>0.90'],                                  // 90% check pass rate
  },
  // Add timeouts and limits
  noConnectionReuse: false,
  userAgent: 'K6-InventoryStressTest/1.0',
  insecureSkipTLSVerify: true,
  batch: 10,  // Limit parallel requests per VU
};

const BASE_URL = 'http://localhost:3000';
const headers = { 'Content-Type': 'application/json' };

// Authentication
let authToken = '';

// Generate a random UUID for testing
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function randomProductId() { return randomUUID(); }

function buildProduct() {
  const n = Math.floor(Math.random()*100000);
  return {
    name: `K6 Seed Product ${n}`,
    description: 'Seeded by k6 inventory test',
    price: 99 + Math.floor(Math.random()*300),
    category: 'Test',
    sku: `K6-SEED-${Date.now()}-${n}`,
    imageUrl: 'https://example.com/image.jpg',
    isActive: true,
  };
}

export function setup() {
  console.log('🔐 Authenticating...');
  const loginPayload = JSON.stringify({
    email: 'admin2@demo.com',
    password: 'Admin@123'
  });
  
  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, { headers });
  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.error('❌ Authentication failed');
    throw new Error('Cannot authenticate');
  }
  
  const loginData = JSON.parse(loginRes.body);
  authToken = loginData.accessToken || loginData.access_token;
  console.log('✅ Authenticated successfully');
  
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };
  
  // Fetch existing inventory
  const res = http.get(`${BASE_URL}/inventory/my?page=1&limit=50`, { headers: authHeaders });
  let productIds = [];
  
  if (res.status === 200) {
    try {
      const data = JSON.parse(res.body);
      const inventories = data.items || data.inventories || data.data || [];
      productIds = inventories.map(inv => inv.productId).filter(id => id);
      console.log(`✅ Found ${productIds.length} products with inventory`);
    } catch (e) {
      console.log(`⚠️  Could not parse inventory: ${e.message}`);
    }
  }
  
  return { productIds, authToken };
}

export default function (data) {
  const ids = data?.productIds || [];
  const token = data?.authToken || '';
  const pid = ids.length ? ids[Math.floor(Math.random()*ids.length)] : null;

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Get my inventory (with pagination) - use name tag to avoid high cardinality
  const listRes = http.get(`${BASE_URL}/inventory/my?page=1&limit=20`, { headers: authHeaders, tags: { name: 'list_inventory' } });
  if (!check(listRes, { 'list 2xx/4xx': (r) => [200,201,400,404].includes(r.status) })) {
    if (__ITER < 3) console.log(`List failed: ${listRes.status} - ${listRes.body.substring(0, 200)}`);
  }
  if (![200,201,400,404].includes(listRes.status)) {
    console.log(`[LIST] Unexpected status: ${listRes.status} - ${listRes.body.substring(0, 200)}`);
  }

  // Skip product-specific operations if no product IDs
  if (!pid) {
    sleep(Math.random()*1.5 + 0.5);
    return;
  }

  // Get my inventory by product - use name tag to group by operation
  const getRes = http.get(`${BASE_URL}/inventory/my/product/${pid}`, { headers: authHeaders, tags: { name: 'get_by_product' } });
  check(getRes, { 'get 2xx/4xx': (r) => [200,201,400,404].includes(r.status) });
  if (![200,201,400,404].includes(getRes.status)) {
    console.log(`[GET] Unexpected status: ${getRes.status} - ${getRes.body.substring(0, 200)}`);
  }

  // Adjust stock (AdjustStockDto expects quantity and optional reason)
  const adjust = { quantity: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random()*5)), reason: 'adjustment' };
  const adjustRes = http.post(`${BASE_URL}/inventory/product/${pid}/adjust`, JSON.stringify(adjust), { headers: authHeaders, tags: { name: 'adjust_stock' } });
  check(adjustRes, { 'adjust 2xx/4xx': (r) => [200,201,400,404].includes(r.status) });
  if (![200,201,400,404].includes(adjustRes.status)) {
    console.log(`[ADJUST] Unexpected status: ${adjustRes.status} - ${adjustRes.body.substring(0, 200)}`);
  }

  // Reserve (ReserveStockDto requires UUID orderId and customerId)
  const reserve = {
    productId: pid,
    quantity: 1 + Math.floor(Math.random()*3),
    orderId: randomUUID(),
    customerId: randomUUID(),
  };
  const reserveRes = http.post(`${BASE_URL}/inventory/reserve`, JSON.stringify(reserve), { headers: authHeaders, tags: { name: 'reserve_stock' } });
  check(reserveRes, { 'reserve 2xx/4xx': (r) => [200,201,400,404].includes(r.status) });
  if (![200,201,400,404].includes(reserveRes.status)) {
    console.log(`[RESERVE] Unexpected status: ${reserveRes.status} - ${reserveRes.body.substring(0, 200)}`);
  }
  if (reserveRes.status === 201) {
    try {
      const parsed = JSON.parse(reserveRes.body);
      const reservationId = parsed.reservationId || parsed.reservation?.id || parsed.id;
      if (reservationId) {
        const releaseRes = http.post(`${BASE_URL}/inventory/release/${reservationId}`, null, { headers: authHeaders, tags: { name: 'release_stock' } });
        check(releaseRes, { 'release 200': (r) => r.status === 200 });
        if (releaseRes.status !== 200) {
          console.log(`[RELEASE] Unexpected status: ${releaseRes.status} - ${releaseRes.body.substring(0, 200)}`);
        }
      }
    } catch {}
  }

  // Availability
  const availRes = http.get(`${BASE_URL}/inventory/check-availability/${pid}?quantity=2`, { headers: authHeaders, tags: { name: 'check_availability' } });
  check(availRes, { 'availability 2xx/4xx': (r) => [200,201,400,404].includes(r.status) });
  if (![200,201,400,404].includes(availRes.status)) {
    console.log(`[AVAILABILITY] Unexpected status: ${availRes.status} - ${availRes.body.substring(0, 200)}`);
  }

  // History
  const historyRes = http.get(`${BASE_URL}/inventory/product/${pid}/history`, { headers: authHeaders, tags: { name: 'get_history' } });
  check(historyRes, { 'history 2xx/4xx': (r) => [200,201,400,404].includes(r.status) });
  if (![200,201,400,404].includes(historyRes.status)) {
    console.log(`[HISTORY] Unexpected status: ${historyRes.status} - ${historyRes.body.substring(0, 200)}`);
  }

  // Low stock
  const lowRes = http.get(`${BASE_URL}/inventory/low-stock?threshold=3`, { headers: authHeaders, tags: { name: 'get_low_stock' } });
  check(lowRes, { 'low 2xx/4xx': (r) => [200,201,400,404].includes(r.status) });
  if (![200,201,400,404].includes(lowRes.status)) {
    console.log(`[LOW] Unexpected status: ${lowRes.status} - ${lowRes.body.substring(0, 200)}`);
  }

  // Add realistic think time to reduce pressure on database connections
  sleep(2 + Math.random() * 3); // 2-5 seconds between iterations
}

// Sample products for seeding
const sampleProducts = [
  { name: 'iPhone 15 Pro', description: '256GB Titanium', price: 1299.99, category: 'Electronics', sku: 'IPHONE-15-PRO', imageUrl: 'https://example.com/iphone.jpg', isActive: true },
  { name: 'Samsung Galaxy S24', description: '512GB Phantom Black', price: 1199.99, category: 'Electronics', sku: 'SAMSUNG-S24', imageUrl: 'https://example.com/samsung.jpg', isActive: true },
  { name: 'MacBook Pro M3', description: '16-inch 1TB', price: 2499.00, category: 'Computers', sku: 'MBP-M3-16', imageUrl: 'https://example.com/mbp.jpg', isActive: true },
  { name: 'iPad Pro', description: '13-inch M4 256GB', price: 1099.00, category: 'Tablets', sku: 'IPAD-PRO-13', imageUrl: 'https://example.com/ipad.jpg', isActive: true },
  { name: 'Sony WH-1000XM5', description: 'Wireless Headphones', price: 399.99, category: 'Audio', sku: 'SONY-WH1000XM5', imageUrl: 'https://example.com/sony.jpg', isActive: true },
  { name: 'Apple Watch Series 9', description: '45mm GPS', price: 429.00, category: 'Wearables', sku: 'WATCH-S9-45', imageUrl: 'https://example.com/watch.jpg', isActive: true },
  { name: 'Dell XPS 15', description: 'Intel i9 32GB', price: 2299.00, category: 'Computers', sku: 'DELL-XPS15', imageUrl: 'https://example.com/xps.jpg', isActive: true },
  { name: 'AirPods Pro 2', description: 'Active Noise Cancellation', price: 249.00, category: 'Audio', sku: 'AIRPODS-PRO2', imageUrl: 'https://example.com/airpods.jpg', isActive: true },
  { name: 'Nintendo Switch OLED', description: '7-inch OLED', price: 349.99, category: 'Gaming', sku: 'SWITCH-OLED', imageUrl: 'https://example.com/switch.jpg', isActive: true },
  { name: 'Logitech MX Master 3S', description: 'Wireless Mouse', price: 99.99, category: 'Accessories', sku: 'LOGITECH-MX3S', imageUrl: 'https://example.com/mouse.jpg', isActive: true },
];

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
  
  // Inventory service needs more resources due to transactional operations
  if (p95ResponseTime > 2000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
    memoryRequest = '384Mi'; memoryLimit = '1Gi';
  } else if (p95ResponseTime > 1000) {
    cpuRequest = '250m'; cpuLimit = '1000m';
    memoryRequest = '256Mi'; memoryLimit = '768Mi';
  } else if (p95ResponseTime > 500) {
    cpuRequest = '150m'; cpuLimit = '750m';
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
  
  return { serviceName: 'inventory-svc', replicas, resources: { requests: { cpu: cpuRequest, memory: memoryRequest }, limits: { cpu: cpuLimit, memory: memoryLimit } },
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
    'inventory-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
