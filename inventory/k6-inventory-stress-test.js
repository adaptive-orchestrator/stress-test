import http from 'k6/http';
import { check, sleep } from 'k6';

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
    http_req_duration: ['p(95)<1000'], // Adjusted for 100 VUs load
    http_req_failed: ['rate<0.1'],
  },
};

const BASE_URL = 'http://localhost:3000';
const headers = { 'Content-Type': 'application/json' };

function randomProductId() { return 1 + Math.floor(Math.random()*1000); }

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

function createSeedProduct() {
  const res = http.post(`${BASE_URL}/catalogue/products`, JSON.stringify(buildProduct()), { headers });
  if (res.status === 201) {
    try { return JSON.parse(res.body)?.product?.id; } catch { return undefined; }
  }
  return undefined;
}

function createSeedInventory(productId) {
  const payload = { productId, quantity: 100, warehouseLocation: 'Seed', reorderLevel: 5, maxStock: 1000 };
  const res = http.post(`${BASE_URL}/inventory`, JSON.stringify(payload), { headers });
  return res.status === 201 || res.status === 200;
}

export default function (data) {
  const ids = data?.productIds || [];
  const pid = ids.length ? ids[Math.floor(Math.random()*ids.length)] : randomProductId();

  // Get all (with pagination)
  check(http.get(`${BASE_URL}/inventory?page=1&limit=20`), { 'list 200': (r) => r.status === 200 });

  // Get by product
  check(http.get(`${BASE_URL}/inventory/product/${pid}`), { 'get 200/404': (r) => r.status === 200 || r.status === 404 });

  // Adjust stock (AdjustStockDto expects quantity and optional reason)
  const adjust = { quantity: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random()*5)), reason: 'adjustment' };
  check(http.post(`${BASE_URL}/inventory/product/${pid}/adjust`, JSON.stringify(adjust), { headers }), { 'adjust 200/400': (r) => r.status === 200 || r.status === 400 });

  // Reserve (ReserveStockDto requires numeric orderId and customerId)
  const reserve = {
    productId: pid,
    quantity: 1 + Math.floor(Math.random()*3),
    orderId: 1000 + Math.floor(Math.random()*10000),
    customerId: 1 + Math.floor(Math.random()*1000),
  };
  const res = http.post(`${BASE_URL}/inventory/reserve`, JSON.stringify(reserve), { headers });
  check(res, { 'reserve 201/400': (r) => r.status === 201 || r.status === 400 });
  if (res.status === 201) {
    try {
      const parsed = JSON.parse(res.body);
      const reservationId = parsed.reservationId || parsed.reservation?.id || parsed.id;
      if (reservationId) {
        check(http.post(`${BASE_URL}/inventory/release/${reservationId}`), { 'release 200': (r) => r.status === 200 });
      }
    } catch {}
  }

  // Availability
  check(http.get(`${BASE_URL}/inventory/check-availability/${pid}?quantity=2`), { 'availability 200': (r) => r.status === 200 });

  // History
  check(http.get(`${BASE_URL}/inventory/product/${pid}/history`), { 'history 200': (r) => r.status === 200 || r.status === 404 });

  // Low stock
  check(http.get(`${BASE_URL}/inventory/low-stock?threshold=3`), { 'low 200': (r) => r.status === 200 });

  sleep(Math.random()*1.5 + 0.5);
}

export function setup() {
  // Quick health checks
  const invHealth = http.get(`${BASE_URL}/inventory`);
  if (invHealth.status >= 500) throw new Error('Inventory API unhealthy');
  const catHealth = http.get(`${BASE_URL}/catalogue/products?page=1&limit=1`);
  if (catHealth.status >= 500) throw new Error('Catalogue API unhealthy');

  // Seed a small pool of products + inventories to ensure availability tests pass
  const poolSize = 25;
  const productIds = [];
  for (let i = 0; i < poolSize; i++) {
    const id = createSeedProduct();
    if (id) {
      if (createSeedInventory(id)) productIds.push(id);
    }
  }

  if (productIds.length === 0) {
    console.log('⚠️ Seeding failed; test will use random product ids and may fail more often.');
  } else {
    console.log(`✅ Seeded ${productIds.length} products with inventory for test.`);
  }

  return { productIds, startTime: Date.now() };
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
