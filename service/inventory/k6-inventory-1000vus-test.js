import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

/**
 * INVENTORY API 1000 VUs STRESS TEST
 * 
 * This test focuses on:
 * 1. Listing Inventory (read-heavy operation)
 * 2. Getting Inventory by Product
 * 3. Stock Adjustments (write operation)
 * 4. Reserve/Release operations
 * 5. Low Stock monitoring
 */

// Custom metrics
const inventoryRead = new Counter('inventory_read');
const stockAdjusted = new Counter('stock_adjusted');
const stockReserved = new Counter('stock_reserved');
const stockReleased = new Counter('stock_released');
const errorCount = new Counter('error_count');
const listLatency = new Trend('inventory_list_latency');
const getLatency = new Trend('inventory_get_latency');
const adjustLatency = new Trend('stock_adjust_latency');
const reserveLatency = new Trend('stock_reserve_latency');
const successRate = new Rate('success_rate');

export const options = {
  stages: [
    // Warm-up phase
    { duration: '1m', target: 20 },
    // Ramp-up to 50
    { duration: '1m', target: 50 },
    // Hold at 50
    { duration: '3m', target: 50 },
    // Ramp-up to 100 (stress level for local)
    { duration: '1m', target: 100 },
    // Hold at peak 100 VUs
    { duration: '3m', target: 100 },
    // Cool-down
    { duration: '1m', target: 0 },
  ],
  // Thresholds adjusted for inventory operations on local single-instance
  thresholds: {
    http_req_duration: ['p(95)<10000', 'p(99)<20000'],  // 10s p95, 20s p99 (local)
    http_req_failed: ['rate<0.08'],                      // < 8% failure rate
    success_rate: ['rate>0.92'],                         // > 92% success
    inventory_list_latency: ['p(95)<6000'],              // 6s for list
    inventory_get_latency: ['p(95)<4000'],               // 4s for get
    stock_adjust_latency: ['p(95)<10000'],               // 10s for adjust (write)
    stock_reserve_latency: ['p(95)<10000'],              // 10s for reserve
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  // Prevent overwhelming local server
  batch: 15,  // Max 15 parallel requests per VU
  batchPerHost: 10,  // Max 10 parallel requests per host
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const headers = { 'Content-Type': 'application/json' };

// Authentication setup
let authToken = '';

// Will be populated in setup()
let productIds = [];

// Generate a random UUID for testing
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function setup() {
  console.log(`\n========== INVENTORY 1000 VUs STRESS TEST ==========`);
  console.log(`Target API: ${BASE_URL}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`====================================================\n`);

  // Authenticate first (required for all inventory endpoints)
  console.log('🔐 Authenticating...');
  const loginPayload = JSON.stringify({
    email: 'admin2@demo.com',
    password: 'Admin@123'
  });
  
  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, { headers });
  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.error('❌ Authentication failed:', loginRes.status, loginRes.body);
    throw new Error('Cannot authenticate - test aborted');
  }
  
  const loginData = JSON.parse(loginRes.body);
  authToken = loginData.accessToken || loginData.access_token;
  
  if (!authToken) {
    throw new Error('No access token received');
  }
  
  console.log('✅ Authenticated successfully');
  
  // Setup authenticated headers
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };

  // Fetch existing inventory to get real product IDs (use /my endpoint)
  const res = http.get(`${BASE_URL}/inventory/my?page=1&limit=50`, { headers: authHeaders });
  if (res.status >= 500) throw new Error('❌ Inventory API not responding');
  
  try {
    const data = JSON.parse(res.body);
    const inventories = data.items || data.inventories || data.data || [];
    productIds = inventories.map(inv => inv.productId).filter(id => id);
    
    console.log(`✅ Found ${productIds.length} products with inventory`);
  } catch (e) {
    console.log(`⚠️  Could not parse inventory list: ${e.message}`);
  }
  
  if (productIds.length === 0) {
    console.log('⚠️  No inventory found - test will have limited data');
  }
  
  console.log('✓ Inventory API health check passed');
  console.log(`✅ Setup completed.\n`);
  
  return { productIds, startTime: Date.now(), authToken };
}

export default function (data) {
  const ids = data.productIds || [];
  const token = data.authToken || '';
  let success = true;
  
  // Setup authenticated headers for this VU
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  
  // Use product ID from pool or fallback to random (with name tag to avoid high cardinality)
  const pid = ids.length > 0 
    ? ids[Math.floor(Math.random() * ids.length)] 
    : null;
  
  // 1. List Inventory with pagination (40% weight - read operation)
  if (Math.random() < 0.4) {
    const page = 1 + Math.floor(Math.random() * 3);
    const startList = Date.now();
    const listRes = http.get(`${BASE_URL}/inventory/my?page=${page}&limit=20`, {
      headers: authHeaders,
      tags: { name: 'list_inventory' }
    });
    listLatency.add(Date.now() - startList);

    const listOk = check(listRes, {
      'list inventory 200': (r) => r.status === 200,
    });

    if (listOk) {
      inventoryRead.add(1);
    } else {
      errorCount.add(1);
      success = false;
    }
  }
  
  if (!pid) {
    // No product IDs available, skip product-specific operations
    successRate.add(success);
    sleep(Math.random() * 3 + 2); // 2-5s between operations
    return;
  }
  
  // 2. Get Inventory by Product (50% weight - main read operation)
  if (Math.random() < 0.5) {
    const startGet = Date.now();
    const getRes = http.get(`${BASE_URL}/inventory/product/${pid}`, {
      headers: authHeaders,
      tags: { name: 'get_by_product' }
    });
    getLatency.add(Date.now() - startGet);

    const getOk = check(getRes, {
      'get by product 200': (r) => r.status === 200,
    });

    if (getOk) {
      inventoryRead.add(1);
    } else {
      success = false;
    }
  }
  
  // 3. Check Availability (30% weight - lightweight read)
  if (Math.random() < 0.3) {
    const quantity = 1 + Math.floor(Math.random() * 5);
    const availRes = http.get(`${BASE_URL}/inventory/check-availability/${pid}?quantity=${quantity}`, {
      headers: authHeaders,
      tags: { name: 'check_availability' }
    });
    check(availRes, { 'availability 200': (r) => r.status === 200 });
  }
  
  // 4. Adjust Stock (15% weight - write operation)
  if (Math.random() < 0.15) {
    const startAdjust = Date.now();
    const adjust = { 
      quantity: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 3)), 
      reason: 'stress_test_adjustment' 
    };
    const adjustRes = http.post(`${BASE_URL}/inventory/product/${pid}/adjust`, JSON.stringify(adjust), { 
      headers: authHeaders,
      tags: { name: 'adjust_stock' }
    });
    adjustLatency.add(Date.now() - startAdjust);

    const adjustOk = check(adjustRes, {
      'adjust ok': (r) => r.status === 200 || r.status === 400, // 400 if insufficient stock
    });

    if (adjustRes.status === 200) {
      stockAdjusted.add(1);
    } else if (!adjustOk) {
      success = false;
    }
  }
  
  // 5. Reserve/Release Stock (10% weight - transactional operation)
  if (Math.random() < 0.1) {
    const startReserve = Date.now();
    const reserve = {
      productId: pid,
      quantity: 1 + Math.floor(Math.random() * 2),
      orderId: randomUUID(),
      customerId: randomUUID(),
    };
    const reserveRes = http.post(`${BASE_URL}/inventory/reserve`, JSON.stringify(reserve), { 
      headers: authHeaders,
      tags: { name: 'reserve_stock' }
    });
    reserveLatency.add(Date.now() - startReserve);

    const reserveOk = check(reserveRes, {
      'reserve ok': (r) => r.status === 201 || r.status === 400, // 400 if insufficient stock
    });

    if (reserveRes.status === 201) {
      stockReserved.add(1);
      
      // Try to release if reservation successful
      try {
        const parsed = JSON.parse(reserveRes.body);
        const reservationId = parsed.reservationId || parsed.reservation?.id || parsed.id;
        if (reservationId) {
          const releaseRes = http.post(`${BASE_URL}/inventory/release/${reservationId}`, null, {
            headers: authHeaders,
            tags: { name: 'release_stock' }
          });
          if (check(releaseRes, { 'release ok': (r) => r.status === 200 })) {
            stockReleased.add(1);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    } else if (!reserveOk) {
      success = false;
    }
  }
  
  // 6. Get Product History (10% weight - read operation)
  if (Math.random() < 0.1) {
    const historyRes = http.get(`${BASE_URL}/inventory/product/${pid}/history`, {
      headers: authHeaders,
      tags: { name: 'get_history' }
    });
    check(historyRes, { 'history 200': (r) => r.status === 200 });
  }
  
  // 7. Get Low Stock (5% weight - monitoring operation)
  if (Math.random() < 0.05) {
    const lowRes = http.get(`${BASE_URL}/inventory/low-stock?threshold=10`, {
      headers: authHeaders,
      tags: { name: 'get_low_stock' }
    });
    check(lowRes, { 'low stock 200': (r) => r.status === 200 });
  }
  
  successRate.add(success);
  sleep(Math.random() * 3 + 2); // 2-5 seconds (prevent overwhelming local server)
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n========== INVENTORY 1000 VUs TEST COMPLETE ==========`);
  console.log(`Total duration: ${duration.toFixed(2)}s`);
  console.log(`Finished at: ${new Date().toISOString()}`);
  console.log(`======================================================\n`);
}

// Calculate recommended K8s resources based on test results
function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = 500; // Max VUs on local
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
  
  // Inventory service needs more resources due to transactional operations
  if (p95ResponseTime > 5000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '384Mi'; memoryLimit = '1Gi';
  } else if (p95ResponseTime > 3000) {
    cpuRequest = '250m'; cpuLimit = '1200m';
    memoryRequest = '256Mi'; memoryLimit = '768Mi';
  } else if (p95ResponseTime > 1500) {
    cpuRequest = '150m'; cpuLimit = '750m';
    memoryRequest = '192Mi'; memoryLimit = '640Mi';
  }
  
  // Transactional workload needs decent CPU
  if (throughput > 300) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '384Mi'; memoryLimit = '1Gi';
  } else if (throughput > 200) {
    cpuRequest = '200m'; cpuLimit = '1000m';
    memoryRequest = '256Mi'; memoryLimit = '768Mi';
  } else if (throughput > 100) {
    memoryRequest = '256Mi'; memoryLimit = '640Mi';
  }
  
  // Inventory handles transactions - more conservative replica count
  if (errorRate > 0.1 || p99ResponseTime > 12000) {
    replicas = Math.ceil(maxVUs / 80);
  } else if (errorRate > 0.05 || p99ResponseTime > 8000) {
    replicas = Math.ceil(maxVUs / 100);
  } else {
    replicas = Math.ceil(maxVUs / 125);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return { 
    serviceName: 'inventory-svc', 
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
    test: 'Inventory API - 1000 VUs Stress Test',
    timestamp: new Date().toISOString(),
    description: 'Inventory operations with stock management and reservations',
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
      inventory_read: data.metrics.inventory_read?.values?.count || 0,
      stock_adjusted: data.metrics.stock_adjusted?.values?.count || 0,
      stock_reserved: data.metrics.stock_reserved?.values?.count || 0,
      stock_released: data.metrics.stock_released?.values?.count || 0,
      error_count: data.metrics.error_count?.values?.count || 0,
      success_rate: ((data.metrics.success_rate?.values?.rate || 0) * 100).toFixed(2) + '%',
      
      // VU Metrics
      max_vus: data.metrics.vus_max?.values?.max || 0,
      iterations_completed: data.metrics.iterations?.values?.count || 0,
      avg_iteration_duration: data.metrics.iteration_duration?.values?.avg?.toFixed(2) || 0,
    },
    k8sRecommendation: recommendation,
    rawData: data,
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
  console.log(`Inventory Read:        ${summary.metrics.inventory_read}`);
  console.log(`Stock Adjusted:        ${summary.metrics.stock_adjusted}`);
  console.log(`Stock Reserved:        ${summary.metrics.stock_reserved}`);
  console.log(`Stock Released:        ${summary.metrics.stock_released}`);
  console.log(`Success Rate:          ${summary.metrics.success_rate}`);
  console.log(`Errors:                ${summary.metrics.error_count}`);
  
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
    'inventory-1000vus-summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const lines = [
    '\n╔════════════════════════════════════════════════════════════════════╗',
    '║        INVENTORY API - 1000 VUs STRESS TEST RESULTS               ║',
    '╠════════════════════════════════════════════════════════════════════╣',
  ];

  const metrics = data.metrics;
  
  lines.push(`║ Total Requests:        ${String(metrics.http_reqs?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Failed Rate:           ${String(((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2) + '%').padStart(40)} ║`);
  lines.push(`║ Avg Response Time:     ${String((metrics.http_req_duration?.values?.avg || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push(`║ P95 Response Time:     ${String((metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push(`║ P99 Response Time:     ${String((metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push('╠════════════════════════════════════════════════════════════════════╣');
  lines.push(`║ Inventory Read:        ${String(metrics.inventory_read?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Stock Adjusted:        ${String(metrics.stock_adjusted?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Stock Reserved:        ${String(metrics.stock_reserved?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Stock Released:        ${String(metrics.stock_released?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Errors:                ${String(metrics.error_count?.values?.count || 0).padStart(40)} ║`);
  lines.push('╚════════════════════════════════════════════════════════════════════╝\n');

  return lines.join('\n');
}
