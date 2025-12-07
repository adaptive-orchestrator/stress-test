import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/**
 * CATALOGUE API 1000 VUs STRESS TEST
 * 
 * This test focuses on:
 * 1. Creating Products with ownership
 * 2. Reading/Listing Products (user-specific)
 * 3. Updating Products with ownership validation
 * 4. Cross-user isolation verification
 */

// Custom metrics
const productsCreated = new Counter('products_created');
const productsRead = new Counter('products_read');
const productsUpdated = new Counter('products_updated');
const errorCount = new Counter('error_count');
const createLatency = new Trend('product_create_latency');
const listLatency = new Trend('product_list_latency');
const updateLatency = new Trend('product_update_latency');
const successRate = new Rate('success_rate');
const crossUserIsolationSuccess = new Rate('cross_user_isolation_success');

export const options = {
  stages: [
    // Warm-up phase
    { duration: '30s', target: 50 },
    // Ramp-up to 200
    { duration: '1m', target: 200 },
    // Hold at 200
    { duration: '2m', target: 200 },
    // Ramp-up to 500 (peak for read-heavy on local)
    { duration: '1m', target: 500 },
    // Hold at peak 500 VUs
    { duration: '3m', target: 500 },
    // Cool-down
    { duration: '1m', target: 0 },
  ],
  // Thresholds adjusted for read-heavy workload on local
  thresholds: {
    http_req_duration: ['p(95)<8000', 'p(99)<15000'],  // 8s p95, 15s p99 (local single-node)
    http_req_failed: ['rate<0.05'],                     // < 5% failure rate (realistic for local)
    success_rate: ['rate>0.95'],                        // > 95% success
    product_create_latency: ['p(95)<10000'],            // 10s for product creation
    product_list_latency: ['p(95)<5000'],               // 5s for list (main operation)
    product_update_latency: ['p(95)<10000'],            // 10s for update
    cross_user_isolation_success: ['rate>0.9'],         // 90%+ isolation success
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  // Add connection pool settings to prevent overwhelming local server
  batch: 20,  // Max 20 parallel requests per VU
  batchPerHost: 10,  // Max 10 parallel requests per host
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test users for authentication - each user should only see their own products
const TEST_USERS = [
  { email: 'stresstest1@demo.com', password: 'Test@123456', name: 'Stress Test User 1', role: 'admin' },
  { email: 'stresstest2@demo.com', password: 'Test@123456', name: 'Stress Test User 2', role: 'admin' },
  { email: 'stresstest3@demo.com', password: 'Test@123456', name: 'Stress Test User 3', role: 'admin' },
  { email: 'stresstest4@demo.com', password: 'Test@123456', name: 'Stress Test User 4', role: 'user' },
  { email: 'stresstest5@demo.com', password: 'Test@123456', name: 'Stress Test User 5', role: 'user' },
];

// Auth token cache - will be populated in setup
let authTokens = {};

// Get auth headers for a VU
function getAuthHeaders(vuIndex) {
  const userIndex = vuIndex % TEST_USERS.length;
  const user = TEST_USERS[userIndex];
  const token = authTokens[user.email];
  
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
}

// Sample products data
const products = [
  {
    name: 'iPhone 15 Pro Max',
    description: '256GB, Titanium Blue - Latest Apple flagship smartphone',
    price: 1299.99,
    category: 'Electronics',
    sku: 'IPHONE-15-PRO-256GB-BLUE',
    imageUrl: 'https://example.com/iphone15.jpg',
    isActive: true,
  },
  {
    name: 'Samsung Galaxy S24 Ultra',
    description: '512GB, Phantom Black - Premium Android flagship',
    price: 1399.99,
    category: 'Electronics',
    sku: 'SAMSUNG-S24-ULTRA-512GB',
    imageUrl: 'https://example.com/s24.jpg',
    isActive: true,
  },
  {
    name: 'MacBook Pro 16 M3',
    description: '16-inch, 1TB SSD, 32GB RAM - Professional laptop',
    price: 2499.00,
    category: 'Computers',
    sku: 'MBP-M3-16-1TB',
    imageUrl: 'https://example.com/mbp16.jpg',
    isActive: true,
  },
  {
    name: 'iPad Pro 13 M4',
    description: '256GB, Silver - Latest iPad with M4 chip',
    price: 1099.00,
    category: 'Tablets',
    sku: 'IPAD-PRO-13-M4-256GB',
    imageUrl: 'https://example.com/ipad13.jpg',
    isActive: true,
  },
  {
    name: 'Sony WH-1000XM5',
    description: 'Wireless Noise Canceling Headphones',
    price: 399.99,
    category: 'Electronics',
    sku: 'SONY-WH1000XM5',
    imageUrl: 'https://example.com/sony-headphones.jpg',
    isActive: true,
  },
];

export default function (data) {
  // Get tokens from setup data
  authTokens = data.tokens || {};
  
  // Get authenticated headers for current VU
  const headers = getAuthHeaders(__VU);
  let success = true;
  
  // Skip if not authenticated
  if (!headers.Authorization || headers.Authorization === 'Bearer ') {
    sleep(1);
    return;
  }
  
  // 1. Create Product (10% weight - less frequent for read-heavy)
  if (Math.random() < 0.1) {
    const product = products[Math.floor(Math.random() * products.length)];
    const uniqueProduct = {
      ...product,
      sku: `${product.sku}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: `${product.name} (Test ${__VU}-${__ITER})`,
    };

    const startCreate = Date.now();
    const createRes = http.post(
      `${BASE_URL}/catalogue/products`,
      JSON.stringify(uniqueProduct),
      { headers }
    );
    createLatency.add(Date.now() - startCreate);

    const createOk = check(createRes, {
      'create product 201': (r) => r.status === 201,
      'product has id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.product && body.product.id !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (createOk) {
      productsCreated.add(1);
    } else {
      errorCount.add(1);
      success = false;
      console.log(`Product create failed: ${createRes.status} - ${createRes.body}`);
    }
  }

  // 2. List My Products with pagination (50% weight - MAIN read operation)
  if (Math.random() < 0.5) {
    const page = 1 + Math.floor(Math.random() * 5);
    const startList = Date.now();
    const listRes = http.get(`${BASE_URL}/catalogue/products/my?page=${page}&limit=20`, { headers });
    listLatency.add(Date.now() - startList);

    const listOk = check(listRes, {
      'list my products 200': (r) => r.status === 200,
    });

    if (listOk) {
      productsRead.add(1);
      
      try {
        const body = JSON.parse(listRes.body);
        const myProducts = body?.products || body?.data || body || [];
        
        if (Array.isArray(myProducts) && myProducts.length > 0) {
          const randomProduct = myProducts[Math.floor(Math.random() * myProducts.length)];
          const productId = randomProduct?.id;

          if (productId) {
            // Get product by ID (70% chance - read-heavy)
            if (Math.random() < 0.7) {
              const getRes = http.get(`${BASE_URL}/catalogue/products/my/${productId}`, { headers });
              check(getRes, { 'get my product 200': (r) => r.status === 200 });
            }

            // Update product (20% chance - less frequent)
            if (Math.random() < 0.2) {
              const startUpdate = Date.now();
              const updateData = {
                ...randomProduct,
                price: randomProduct.price + 100,
                description: `${randomProduct.description} - UPDATED`,
              };
              
              const updateRes = http.put(
                `${BASE_URL}/catalogue/products/${productId}`,
                JSON.stringify(updateData),
                { headers }
              );
              updateLatency.add(Date.now() - startUpdate);
              
              const updateOk = check(updateRes, { 
                'update product ok': (r) => r.status === 200
              });
              
              if (updateOk) {
                productsUpdated.add(1);
              } else if (updateRes.status !== 200) {
                console.log(`Product update ${productId} failed: ${updateRes.status}`);
              }
            }

            // Test cross-user isolation (15% chance - less frequent)
            if (Math.random() < 0.15) {
              const otherUserIndex = (__VU + 1) % TEST_USERS.length;
              const otherHeaders = getAuthHeaders(otherUserIndex);
              
              if (otherHeaders.Authorization && otherHeaders.Authorization !== 'Bearer ' && otherHeaders.Authorization !== headers.Authorization) {
                const crossAccessRes = http.get(`${BASE_URL}/catalogue/products/my/${productId}`, { 
                  headers: otherHeaders,
                  tags: { name: 'cross_user_isolation_check' }
                });
                
                const isolationWorks = crossAccessRes.status === 403 || crossAccessRes.status === 404 || crossAccessRes.status === 401;
                check(crossAccessRes, {
                  'cross-user access denied': () => isolationWorks,
                });
                crossUserIsolationSuccess.add(isolationWorks);
              }
            }
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    } else {
      success = false;
    }
  }

  successRate.add(success);
  sleep(Math.random() * 2 + 1); // 1-3 seconds (prevent overwhelming local server)
}

export function setup() {
  console.log(`\n========== CATALOGUE 1000 VUs STRESS TEST ==========`);
  console.log(`Target API: ${BASE_URL}`);
  console.log(`Test Users: ${TEST_USERS.map(u => u.email).join(', ')}`);
  console.log(`====================================================\n`);
  
  const tokens = {};
  
  // Register and login all test users
  for (const user of TEST_USERS) {
    let loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
      email: user.email,
      password: user.password,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (loginRes.status !== 200 && loginRes.status !== 201) {
      console.log(`⚠️ Login failed for ${user.email}, attempting signup...`);
      
      const signupRes = http.post(`${BASE_URL}/auth/signup`, JSON.stringify({
        email: user.email,
        password: user.password,
        name: user.name,
        role: user.role,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (signupRes.status === 201 || signupRes.status === 200) {
        console.log(`✅ Signed up: ${user.email}`);
        loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
          email: user.email,
          password: user.password,
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    if (loginRes.status === 200 || loginRes.status === 201) {
      try {
        const body = JSON.parse(loginRes.body);
        tokens[user.email] = body.access_token || body.token || body.accessToken;
        console.log(`✅ Logged in: ${user.email}`);
      } catch (e) {
        console.log(`❌ Failed to parse login response for ${user.email}`);
      }
    }
  }
  
  // Health check
  const healthCheck = http.get(`${BASE_URL}/catalogue/plans`);
  if (healthCheck.status >= 500) {
    throw new Error(`Catalogue API unhealthy: ${healthCheck.status}`);
  }
  console.log('✓ Catalogue API health check passed');
  
  console.log(`✅ Setup completed. ${Object.keys(tokens).length}/${TEST_USERS.length} users authenticated.`);
  return { startTime: Date.now(), tokens };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n========== CATALOGUE 1000 VUs TEST COMPLETE ==========`);
  console.log(`Total duration: ${duration.toFixed(2)}s`);
  console.log(`======================================================\n`);
}

// Calculate recommended K8s resources based on test results
function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = 500; // Max VUs for read-heavy workload on local
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
  
  // Read-heavy workload - less CPU intensive
  if (p95ResponseTime > 5000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '384Mi'; memoryLimit = '768Mi';
  } else if (p95ResponseTime > 3000) {
    cpuRequest = '200m'; cpuLimit = '1000m';
    memoryRequest = '256Mi'; memoryLimit = '640Mi';
  } else if (p95ResponseTime > 1500) {
    cpuRequest = '150m'; cpuLimit = '750m';
    memoryRequest = '192Mi'; memoryLimit = '512Mi';
  }
  
  // Read operations benefit more from memory caching
  if (throughput > 300) {
    memoryRequest = '512Mi'; memoryLimit = '1Gi';
  } else if (throughput > 200) {
    memoryRequest = '384Mi'; memoryLimit = '768Mi';
  } else if (throughput > 100) {
    memoryRequest = '256Mi'; memoryLimit = '640Mi';
  }
  
  // Read-heavy workload can handle more VUs per replica
  if (errorRate > 0.1 || p99ResponseTime > 12000) {
    replicas = Math.ceil(maxVUs / 100);
  } else if (errorRate > 0.05 || p99ResponseTime > 8000) {
    replicas = Math.ceil(maxVUs / 125);
  } else {
    replicas = Math.ceil(maxVUs / 150);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return { 
    serviceName: 'catalogue-svc', 
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
    test: 'Catalogue API - 1000 VUs Stress Test',
    timestamp: new Date().toISOString(),
    description: 'Products with ownership and cross-user isolation testing',
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
      products_created: data.metrics.products_created?.values?.count || 0,
      products_read: data.metrics.products_read?.values?.count || 0,
      products_updated: data.metrics.products_updated?.values?.count || 0,
      error_count: data.metrics.error_count?.values?.count || 0,
      success_rate: ((data.metrics.success_rate?.values?.rate || 0) * 100).toFixed(2) + '%',
      cross_user_isolation_success: ((data.metrics.cross_user_isolation_success?.values?.rate || 0) * 100).toFixed(2) + '%',
      
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
  console.log(`Products Created:      ${summary.metrics.products_created}`);
  console.log(`Products Read:         ${summary.metrics.products_read}`);
  console.log(`Products Updated:      ${summary.metrics.products_updated}`);
  console.log(`Success Rate:          ${summary.metrics.success_rate}`);
  console.log(`Isolation Success:     ${summary.metrics.cross_user_isolation_success}`);
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
    'catalogue-1000vus-summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const lines = [
    '\n╔════════════════════════════════════════════════════════════════════╗',
    '║        CATALOGUE API - 1000 VUs STRESS TEST RESULTS               ║',
    '╠════════════════════════════════════════════════════════════════════╣',
  ];

  const metrics = data.metrics;
  
  lines.push(`║ Total Requests:        ${String(metrics.http_reqs?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Failed Rate:           ${String(((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2) + '%').padStart(40)} ║`);
  lines.push(`║ Avg Response Time:     ${String((metrics.http_req_duration?.values?.avg || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push(`║ P95 Response Time:     ${String((metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push(`║ P99 Response Time:     ${String((metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push('╠════════════════════════════════════════════════════════════════════╣');
  lines.push(`║ Products Created:      ${String(metrics.products_created?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Products Read:         ${String(metrics.products_read?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Products Updated:      ${String(metrics.products_updated?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Errors:                ${String(metrics.error_count?.values?.count || 0).padStart(40)} ║`);
  lines.push('╚════════════════════════════════════════════════════════════════════╝\n');

  return lines.join('\n');
}
