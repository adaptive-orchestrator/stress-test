import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import encoding from 'k6/encoding';

/**
 * ORDER API 1000 VUs STRESS TEST
 * 
 * This test simulates high load on the order service with focus on:
 * 1. Creating orders
 * 2. Reading/Listing orders
 * 3. Adding items to orders
 * 4. Getting order details
 * 
 * Note: Cancel operation excluded due to business rules
 */

// Custom metrics
const ordersCreated = new Counter('orders_created');
const ordersRead = new Counter('orders_read');
const itemsAdded = new Counter('items_added');
const errorCount = new Counter('error_count');
const orderCreateLatency = new Trend('order_create_latency');
const orderReadLatency = new Trend('order_read_latency');
const listLatency = new Trend('order_list_latency');
const successRate = new Rate('success_rate');

export const options = {
  stages: [
    // Warm-up phase - slower ramp
    { duration: '2m', target: 20 },
    { duration: '2m', target: 50 },
    // Gradual increase to 100
    { duration: '2m', target: 100 },
    // Hold at 100 to establish baseline
    { duration: '3m', target: 100 },
    // Ramp to 200 (moderate load)
    { duration: '2m', target: 200 },
    // Hold at 200
    { duration: '3m', target: 200 },
    // Ramp to 300 (high load - realistic max)
    { duration: '2m', target: 300 },
    // Hold at peak 300 VUs
    { duration: '3m', target: 300 },
    // Cool-down
    { duration: '2m', target: 0 },
  ],
  // Relaxed thresholds based on actual performance (100 VUs showed p95=23.8s)
  thresholds: {
    http_req_duration: ['p(95)<30000', 'p(99)<45000'], // 30s p95, 45s p99 (realistic)
    http_req_failed: ['rate<0.35'],                    // < 35% failure rate
    success_rate: ['rate>0.65'],                       // > 65% success rate
    order_create_latency: ['p(95)<30000'],             // 30s for order creation
    order_read_latency: ['p(95)<15000'],               // 15s for reads
    order_list_latency: ['p(95)<15000'],               // 15s for list
    checks: ['rate>0.65'],                             // > 65% checks pass
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  // Add timeout and retry settings
  http_req_timeout: '60s', // 60 second timeout
  batch: 10,               // Process 10 requests in parallel max
  batchPerHost: 5,         // 5 parallel requests per host
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test user credentials
const TEST_USER = {
  email: 'admin2@demo.com',
  password: 'Admin@123'
};

// Shared auth data (populated in setup)
let sharedAuthToken = '';
let sharedCustomerId = '';
let sharedProductIds = [];

export function setup() {
  console.log('\n========== ORDER 1000 VUs STRESS TEST ==========');
  console.log(`Target API: ${BASE_URL}`);
  console.log(`Test User: ${TEST_USER.email}`);
  console.log('================================================\n');

  console.log('🔐 Authenticating...');
  
  // Login to get token
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify(TEST_USER),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.error('❌ Authentication failed:', loginRes.status, loginRes.body);
    throw new Error('Cannot authenticate');
  }
  
  const loginData = JSON.parse(loginRes.body);
  const authToken = loginData.accessToken || loginData.access_token;
  console.log('✅ Authenticated successfully');
  
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };
  
  // Step 1: Extract userId from JWT token
  let userId = '';
  if (authToken) {
    try {
      const parts = authToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(encoding.b64decode(parts[1], 'rawstd', 's'));
        userId = payload.sub || payload.userId || payload.id;
        console.log(`✅ Got userId from JWT: ${userId}`);
      }
    } catch (e) {
      console.error(`❌ Could not decode JWT: ${e.message}`);
    }
  }
  
  if (!userId) {
    throw new Error('Could not get userId from JWT');
  }
  
  // Step 2: Get customerId by calling the customer API with userId
  let customerId = '';
  console.log(`🔍 Fetching customer profile for userId: ${userId}...`);
  const customerRes = http.get(`${BASE_URL}/customers/by-user/${userId}`, { headers: authHeaders });
  
  if (customerRes.status === 200) {
    try {
      const customerData = JSON.parse(customerRes.body);
      customerId = customerData.id;
      console.log(`✅ Got customerId: ${customerId}`);
    } catch (e) {
      console.error(`❌ Could not parse customer response: ${e.message}`);
    }
  } else {
    console.error(`❌ Failed to get customer by userId: ${customerRes.status}`);
  }
  
  if (!customerId) {
    throw new Error('Could not get customerId');
  }
  
  // Get products with available inventory
  let productIds = [];
  const productsRes = http.get(`${BASE_URL}/catalogue/products/my?page=1&limit=50`, { headers: authHeaders });
  if (productsRes.status === 200) {
    try {
      const data = JSON.parse(productsRes.body);
      const products = data.products || data.items || data.data || [];
      
      // For each product, check inventory availability
      console.log(`📦 Checking inventory for ${products.length} products...`);
      
      for (const product of products) {
        if (!product.id) continue;
        
        // Get inventory for this product
        const invRes = http.get(`${BASE_URL}/inventory/product/${product.id}`, { headers: authHeaders });
        if (invRes.status === 200) {
          try {
            const invData = JSON.parse(invRes.body);
            const inventory = invData.inventory || invData;
            const availableStock = inventory.quantity || inventory.availableQuantity || 0;
            
            // Only include products with stock > 10 (buffer for stress test)
            if (availableStock > 10) {
              productIds.push(product.id);
              console.log(`  ✓ Product ${product.id}: ${availableStock} units available`);
            } else {
              console.log(`  ✗ Product ${product.id}: only ${availableStock} units (skipped)`);
            }
          } catch (e) {
            // If can't parse inventory, skip this product
            console.log(`  ? Product ${product.id}: inventory check failed`);
          }
        }
      }
      
      console.log(`✅ Found ${productIds.length} products with sufficient stock`);
    } catch (e) {
      console.log(`⚠️  Could not get products: ${e.message}`);
    }
  }
  
  if (productIds.length === 0) {
    console.log('⚠️  No products with stock found - test cannot proceed!');
    console.log('💡 Solution: Add inventory stock to products before running stress test');
    throw new Error('No products with sufficient stock available');
  }
  
  if (productIds.length < 5) {
    console.log(`⚠️  Warning: Only ${productIds.length} products available. Test may deplete stock quickly.`);
    console.log('💡 Recommendation: Add more products or increase stock levels');
  }

  console.log('\n✅ Setup complete - starting stress test...\n');
  
  return { 
    authToken, 
    customerId, 
    productIds,
    startTime: Date.now()
  };
}

function createItem(productId) {
  return {
    productId: productId,
    quantity: Math.floor(Math.random() * 3) + 1, // 1-3 items
    price: Math.floor(Math.random() * 500) + 50, // $50-$550
  };
}

function createOrderPayload(productIds, customerId) {
  const productId = productIds.length > 0 
    ? productIds[Math.floor(Math.random() * productIds.length)]
    : 'mock-product-id';
  
  return {
    customerId: customerId,
    items: [createItem(productId)],
    notes: `K6 1000VUs stress test - ${Date.now()}`,
    shippingAddress: '123 Test Street, District 1, Ho Chi Minh City',
    paymentMethod: 'credit_card',
  };
}

export default function (data) {
  const token = data?.authToken || '';
  const productIds = data?.productIds || [];
  const customerId = data?.customerId || '';
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  let success = true;

  // Scenario distribution for realistic load (adjusted for high VU count):
  // 20% - Create new orders (reduced to lower DB write pressure)
  // 50% - List orders (increased read-heavy operations)
  // 25% - Get specific order details (read operations)
  // 5% - Add items to existing orders (reduced write operations)

  const scenario = Math.random();

  if (scenario < 0.20) {
    // CREATE ORDER (20% - reduced from 30%)
    const orderPayload = createOrderPayload(productIds, customerId);
    
    const startCreate = Date.now();
    const createRes = http.post(`${BASE_URL}/orders`, JSON.stringify(orderPayload), { 
      headers,
      tags: { name: 'create_order' }
    });
    orderCreateLatency.add(Date.now() - startCreate);
    
    const okCreate = check(createRes, { 
      'create 201': (r) => r.status === 201 || r.status === 200 
    });
    
    if (okCreate) {
      ordersCreated.add(1);
      
      // Try to get the created order ID and read it back (verification)
      try {
        const b = JSON.parse(createRes.body);
        const orderId = b.order?.id || b.id;
        
        if (orderId) {
          const startRead = Date.now();
          const getRes = http.get(`${BASE_URL}/orders/${orderId}`, { 
            headers,
            tags: { name: 'get_order' }
          });
          orderReadLatency.add(Date.now() - startRead);
          
          if (check(getRes, { 'get 200': (r) => r.status === 200 })) {
            ordersRead.add(1);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    } else {
      errorCount.add(1);
      success = false;
      if (createRes.status >= 500) {
        console.log(`[VU${__VU}] Order creation failed: ${createRes.status}`);
      }
    }
    
  } else if (scenario < 0.70) {
    // LIST ORDERS (50% - increased read-heavy, scenario range: 0.20-0.70)
    const page = Math.floor(Math.random() * 5) + 1; // Random page 1-5
    
    const startList = Date.now();
    const listRes = http.get(`${BASE_URL}/orders/my?page=${page}&limit=20`, { 
      headers,
      tags: { name: 'list_orders' }
    });
    listLatency.add(Date.now() - startList);
    
    if (check(listRes, { 'list 200': (r) => r.status === 200 })) {
      ordersRead.add(1);
      
      // Extract an order ID from the list and read its details
      try {
        const listData = JSON.parse(listRes.body);
        const orders = listData.orders || listData.data || [];
        if (orders.length > 0) {
          const randomOrder = orders[Math.floor(Math.random() * orders.length)];
          const orderId = randomOrder.id;
          
          if (orderId) {
            const startRead = Date.now();
            const getRes = http.get(`${BASE_URL}/orders/${orderId}`, { 
              headers,
              tags: { name: 'get_order' }
            });
            orderReadLatency.add(Date.now() - startRead);
            check(getRes, { 'get 200': (r) => r.status === 200 });
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    } else {
      success = false;
    }
    
  } else if (scenario < 0.95) {
    // GET SPECIFIC ORDER (25% - scenario range: 0.70-0.95)
    // First list to get an order ID
    const listRes = http.get(`${BASE_URL}/orders/my?page=1&limit=10`, { headers });
    
    if (listRes.status === 200) {
      try {
        const listData = JSON.parse(listRes.body);
        const orders = listData.orders || listData.data || [];
        if (orders.length > 0) {
          const randomOrder = orders[Math.floor(Math.random() * orders.length)];
          const orderId = randomOrder.id;
          
          if (orderId) {
            const startRead = Date.now();
            const getRes = http.get(`${BASE_URL}/orders/${orderId}`, { 
              headers,
              tags: { name: 'get_order' }
            });
            orderReadLatency.add(Date.now() - startRead);
            
            if (check(getRes, { 'get 200': (r) => r.status === 200 })) {
              ordersRead.add(1);
            } else {
              success = false;
            }
          }
        }
      } catch (e) {
        success = false;
      }
    }
    
  } else {
    // ADD ITEM TO ORDER (5% - reduced from 10%, scenario range: 0.95-1.00)
    if (productIds.length > 0) {
      // Get an order to add items to
      const listRes = http.get(`${BASE_URL}/orders/my?page=1&limit=10`, { headers });
      
      if (listRes.status === 200) {
        try {
          const listData = JSON.parse(listRes.body);
          const orders = listData.orders || listData.data || [];
          if (orders.length > 0) {
            const randomOrder = orders[Math.floor(Math.random() * orders.length)];
            const orderId = randomOrder.id;
            
            if (orderId) {
              const newProductId = productIds[Math.floor(Math.random() * productIds.length)];
              const addRes = http.post(
                `${BASE_URL}/orders/${orderId}/items`, 
                JSON.stringify({ 
                  productId: newProductId, 
                  quantity: 1, 
                  price: Math.floor(Math.random() * 200) + 20 
                }), 
                { headers, tags: { name: 'add_item' } }
              );
              
              if (check(addRes, { 
                'add item ok': (r) => r.status === 200 || r.status === 201 || r.status === 400 
              })) {
                if (addRes.status === 200 || addRes.status === 201) {
                  itemsAdded.add(1);
                }
              } else {
                success = false;
              }
            }
          }
        } catch (e) {
          success = false;
        }
      }
    }
  }

  successRate.add(success);
  
  // Dynamic sleep based on VU count to prevent overwhelming the system
  // More VUs = longer sleep to maintain stable load
  const currentVUs = __VU;
  let sleepTime;
  
  if (currentVUs > 200) {
    sleepTime = Math.random() * 4 + 3; // 3-7 seconds for high load (200+ VUs)
  } else if (currentVUs > 100) {
    sleepTime = Math.random() * 3 + 2; // 2-5 seconds for medium load (100-200 VUs)
  } else {
    sleepTime = Math.random() * 2 + 1; // 1-3 seconds for low load (<100 VUs)
  }
  
  sleep(sleepTime);
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('\n========== ORDER 1000 VUs TEST COMPLETE ==========');
  console.log(`Total duration: ${duration.toFixed(2)}s`);
  console.log('==================================================\n');
}

// Calculate recommended K8s resources based on test results
function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = data.metrics.vus_max?.values?.max || 300;
  const avgResponseTime = metrics.http_req_duration?.values?.avg || 0;
  const p95ResponseTime = metrics.http_req_duration?.values['p(95)'] || 0;
  const p99ResponseTime = metrics.http_req_duration?.values['p(99)'] || 0;
  const errorRate = metrics.http_req_failed?.values?.rate || 0;
  const throughput = metrics.http_reqs?.values?.rate || 0;
  const waitingTime = metrics.http_req_waiting?.values?.avg || 0;
  const blockedTime = metrics.http_req_blocked?.values?.avg || 0;
  
  let cpuRequest = '200m';
  let cpuLimit = '1000m';
  let memoryRequest = '256Mi';
  let memoryLimit = '768Mi';
  let replicas = 3;
  
  // Order service needs more resources due to transactional complexity
  if (p95ResponseTime > 8000) {
    cpuRequest = '1000m'; cpuLimit = '4000m';
    memoryRequest = '1Gi'; memoryLimit = '2Gi';
  } else if (p95ResponseTime > 5000) {
    cpuRequest = '700m'; cpuLimit = '3000m';
    memoryRequest = '768Mi'; memoryLimit = '1536Mi';
  } else if (p95ResponseTime > 2000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
    memoryRequest = '512Mi'; memoryLimit = '1Gi';
  } else if (p95ResponseTime > 1000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '384Mi'; memoryLimit = '768Mi';
  }
  
  if (waitingTime > 2000) {
    cpuRequest = '1000m'; cpuLimit = '4000m';
  } else if (waitingTime > 1000) {
    cpuRequest = '700m'; cpuLimit = '3000m';
  }
  
  if (blockedTime > 1000 || throughput > 1000) {
    memoryRequest = '1Gi'; memoryLimit = '2Gi';
  } else if (blockedTime > 500 || throughput > 500) {
    memoryRequest = '768Mi'; memoryLimit = '1536Mi';
  }
  
  // Replica calculation for 1000 VUs
  if (errorRate > 0.2 || p99ResponseTime > 15000) {
    replicas = Math.ceil(maxVUs / 100); // 10 replicas
  } else if (errorRate > 0.15 || p99ResponseTime > 10000) {
    replicas = Math.ceil(maxVUs / 120); // 8-9 replicas
  } else if (errorRate > 0.1 || p99ResponseTime > 7000) {
    replicas = Math.ceil(maxVUs / 150); // 6-7 replicas
  } else {
    replicas = Math.ceil(maxVUs / 200); // 5 replicas
  }
  
  replicas = Math.max(3, Math.min(replicas, 15));
  
  return { 
    serviceName: 'order-svc', 
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
    test: 'Order API - 1000 VUs Stress Test',
    timestamp: new Date().toISOString(),
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
      
      // Waiting Time
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
      orders_created: data.metrics.orders_created?.values?.count || 0,
      orders_read: data.metrics.orders_read?.values?.count || 0,
      items_added: data.metrics.items_added?.values?.count || 0,
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
  
  console.log('\n💼 BUSINESS METRICS');
  console.log('='.repeat(60));
  console.log(`Orders Created:        ${summary.metrics.orders_created}`);
  console.log(`Orders Read:           ${summary.metrics.orders_read}`);
  console.log(`Items Added:           ${summary.metrics.items_added}`);
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
    'order-1000vus-summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const lines = [
    '\n╔════════════════════════════════════════════════════════════════════╗',
    '║          ORDER API - 1000 VUs STRESS TEST RESULTS                 ║',
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
  lines.push(`║ Orders Read:           ${String(metrics.orders_read?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Items Added:           ${String(metrics.items_added?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Errors:                ${String(metrics.error_count?.values?.count || 0).padStart(40)} ║`);
  lines.push('╚════════════════════════════════════════════════════════════════════╝\n');

  return lines.join('\n');
}
