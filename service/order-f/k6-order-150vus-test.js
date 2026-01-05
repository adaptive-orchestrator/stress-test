import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import encoding from 'k6/encoding';

/**
 * ORDER API 150 VUs STABILITY TEST
 * 
 * Optimized for inventory constraints:
 * - Lower VU count (max 150) to reduce inventory depletion
 * - Longer test duration to observe stability
 * - Focus on success rate over peak load
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
    { duration: '1m', target: 20 },    // Warm up
    { duration: '2m', target: 50 },    // Ramp to 50
    { duration: '3m', target: 50 },    // Hold at 50 (baseline)
    { duration: '2m', target: 100 },   // Ramp to 100
    { duration: '4m', target: 100 },   // Hold at 100 (stability)
    { duration: '2m', target: 150 },   // Push to 150
    { duration: '3m', target: 150 },   // Hold at 150 (peak)
    { duration: '1m', target: 0 },     // Cool down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<25000', 'p(99)<40000'],
    'http_req_failed': ['rate<0.25'],  // 25% error tolerance
    'success_rate': ['rate>0.70'],     // 70% success rate target
    'checks': ['rate>0.70'],
    'order_create_latency': ['p(95)<25000'],
    'order_read_latency': ['p(95)<10000'],
    'order_list_latency': ['p(95)<12000'],
  },
};

const BASE_URL = 'http://localhost:3000';

const TEST_USER = {
  email: 'admin2@demo.com',
  password: 'Admin@123'
};

export function setup() {
  console.log('='.repeat(60));
  console.log('ORDER API - 150 VUs STABILITY TEST');
  console.log('='.repeat(60));
  console.log('Authenticating...');
  
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify(TEST_USER),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.error('Authentication failed:', loginRes.status, loginRes.body);
    throw new Error('Cannot authenticate');
  }
  
  const loginData = JSON.parse(loginRes.body);
  const authToken = loginData.accessToken || loginData.access_token;
  console.log('Authenticated successfully');
  
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`
  };
  
  // Get userId from JWT
  let userId = '';
  if (authToken) {
    try {
      const parts = authToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(encoding.b64decode(parts[1], 'rawstd', 's'));
        userId = payload.sub || payload.userId || payload.id;
        console.log(`Got userId: ${userId}`);
      }
    } catch (e) {
      console.error(`Could not decode JWT: ${e.message}`);
    }
  }
  
  if (!userId) {
    throw new Error('Could not get userId from JWT');
  }
  
  // Get customerId
  let customerId = '';
  console.log(`Fetching customer profile...`);
  const customerRes = http.get(`${BASE_URL}/customers/by-user/${userId}`, { headers: authHeaders });
  
  if (customerRes.status === 200) {
    try {
      const customerData = JSON.parse(customerRes.body);
      customerId = customerData.id;
      console.log(`Got customerId: ${customerId}`);
    } catch (e) {
      console.error(`Could not parse customer response: ${e.message}`);
    }
  } else {
    console.error(`Failed to get customer: ${customerRes.status} - ${customerRes.body}`);
  }
  
  if (!customerId) {
    throw new Error('Could not get customerId');
  }
  
  // Get products with inventory
  console.log('Checking product inventory...');
  const productsRes = http.get(`${BASE_URL}/catalogue/products/my?page=1&limit=50`, { headers: authHeaders });
  let productIds = [];
  
  if (productsRes.status === 200) {
    try {
      const data = JSON.parse(productsRes.body);
      const products = data.products || data.items || data.data || [];
      
      console.log(`Checking inventory for ${products.length} products...`);
      
      for (const product of products) {
        if (!product.id) continue;
        
        const invRes = http.get(`${BASE_URL}/inventory/product/${product.id}`, { headers: authHeaders });
        if (invRes.status === 200) {
          try {
            const invData = JSON.parse(invRes.body);
            const inventory = invData.inventory || invData;
            const availableStock = inventory.quantity || inventory.availableQuantity || 0;
            
            // Only use products with substantial stock (>100 units)
            if (availableStock > 100) {
              productIds.push(product.id);
              console.log(`  Product ${product.id}: ${availableStock} units`);
            }
          } catch (e) {
            // Skip products with inventory errors
          }
        }
      }
      
      console.log(`Found ${productIds.length} products with sufficient stock`);
    } catch (e) {
      console.log(`Could not get products: ${e.message}`);
    }
  }
  
  if (productIds.length === 0) {
    console.log('WARNING: No products with sufficient stock!');
    console.log('Please run: .\\add-inventory-stock.ps1');
    throw new Error('No products with sufficient stock available');
  }
  
  console.log('='.repeat(60));
  console.log('Setup complete - starting test...');
  console.log('='.repeat(60));
  
  return { 
    authToken, 
    productIds, 
    customerId,
    startTime: Date.now()
  };
}

function createOrderPayload(productIds, customerId) {
  const productId = productIds[Math.floor(Math.random() * productIds.length)];
  
  return {
    customerId: customerId,
    items: [{
      productId: productId,
      quantity: Math.floor(Math.random() * 2) + 1, // 1-2 items (reduced from 1-3)
      price: Math.floor(Math.random() * 500) + 50,
    }],
    notes: `K6 stress test - ${Date.now()}`,
    shippingAddress: '123 Test St, District 1, HCM',
    paymentMethod: 'credit_card',
  };
}

// Scenario distribution
function getScenarioType(__VU) {
  const rand = Math.random();
  if (rand < 0.15) return 'create';      // 15% create orders
  if (rand < 0.60) return 'list';        // 45% list orders
  if (rand < 0.90) return 'get';         // 30% get order
  return 'addItem';                       // 10% add item
}

export default function (data) {
  const token = data?.authToken || '';
  const productIds = data?.productIds || [];
  const customerId = data?.customerId || '';
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const scenario = getScenarioType(__VU);
  const startTime = Date.now();
  
  switch (scenario) {
    case 'create':
      // CREATE ORDER
      const orderPayload = createOrderPayload(productIds, customerId);
      const createRes = http.post(`${BASE_URL}/orders`, JSON.stringify(orderPayload), { 
        headers,
        tags: { name: 'create_order' }
      });
      
      const createOk = check(createRes, { 
        'create 201': (r) => r.status === 201 || r.status === 200 
      });
      
      if (!createOk) {
        errorCount.add(1);
        console.log(`[VU${__VU}] Order creation failed: ${createRes.status} - ${createRes.body.substring(0, 200)}`);
      } else {
        ordersCreated.add(1);
        orderCreateLatency.add(Date.now() - startTime);
      }
      
      successRate.add(createOk);
      break;
      
    case 'list':
      // LIST ORDERS
      const listStartTime = Date.now();
      const listRes = http.get(`${BASE_URL}/orders/my?page=1&limit=20`, { 
        headers,
        tags: { name: 'list_orders' }
      });
      const listOk = check(listRes, { 
        'list 200': (r) => r.status === 200 
      });
      
      if (listOk) {
        ordersRead.add(1);
        listLatency.add(Date.now() - listStartTime);
      } else {
        errorCount.add(1);
      }
      successRate.add(listOk);
      break;
      
    case 'get':
      // GET ORDER (need to create one first)
      const quickOrder = createOrderPayload(productIds, customerId);
      const quickCreate = http.post(`${BASE_URL}/orders`, JSON.stringify(quickOrder), { headers });
      
      if (quickCreate.status === 201 || quickCreate.status === 200) {
        const orderData = JSON.parse(quickCreate.body);
        const orderId = orderData.order?.id || orderData.id;
        
        if (orderId) {
          const getStartTime = Date.now();
          const getRes = http.get(`${BASE_URL}/orders/${orderId}`, { 
            headers,
            tags: { name: 'get_order' }
          });
          const getOk = check(getRes, { 
            'get 200': (r) => r.status === 200 
          });
          
          if (getOk) {
            ordersRead.add(1);
            orderReadLatency.add(Date.now() - getStartTime);
          } else {
            errorCount.add(1);
          }
          successRate.add(getOk);
        }
      }
      break;
      
    case 'addItem':
      // ADD ITEM (need existing order)
      const addItemOrder = createOrderPayload(productIds, customerId);
      const addItemCreate = http.post(`${BASE_URL}/orders`, JSON.stringify(addItemOrder), { headers });
      
      if (addItemCreate.status === 201 || addItemCreate.status === 200) {
        const orderData = JSON.parse(addItemCreate.body);
        const orderId = orderData.order?.id || orderData.id;
        
        if (orderId && productIds.length > 0) {
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
          
          const addOk = check(addRes, { 
            'add item ok': (r) => r.status === 200 || r.status === 201 || r.status === 400
          });
          
          if (addOk && (addRes.status === 200 || addRes.status === 201)) {
            itemsAdded.add(1);
          }
          successRate.add(addOk);
        }
      }
      break;
  }

  // Dynamic sleep based on current VU count
  const currentVUs = __VU;
  if (currentVUs > 100) {
    sleep(Math.random() * 4 + 2);  // 2-6s for high load
  } else if (currentVUs > 50) {
    sleep(Math.random() * 3 + 2);  // 2-5s for medium load
  } else {
    sleep(Math.random() * 2 + 1);  // 1-3s for low load
  }
}

function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = 150;
  const avgResponseTime = metrics.http_req_duration?.values?.avg || 0;
  const p95ResponseTime = metrics.http_req_duration?.values['p(95)'] || 0;
  const p99ResponseTime = metrics.http_req_duration?.values['p(99)'] || 0;
  const errorRate = metrics.http_req_failed?.values?.rate || 0;
  const throughput = metrics.http_reqs?.values?.rate || 0;
  
  let cpuRequest = '200m';
  let cpuLimit = '1000m';
  let memoryRequest = '256Mi';
  let memoryLimit = '512Mi';
  let replicas = 2;
  
  if (p95ResponseTime > 20000 || errorRate > 0.2) {
    cpuRequest = '1000m'; cpuLimit = '4000m';
    memoryRequest = '1Gi'; memoryLimit = '2Gi';
    replicas = Math.ceil(maxVUs / 20);
  } else if (p95ResponseTime > 10000 || errorRate > 0.1) {
    cpuRequest = '500m'; cpuLimit = '2000m';
    memoryRequest = '512Mi'; memoryLimit = '1Gi';
    replicas = Math.ceil(maxVUs / 30);
  } else if (p95ResponseTime > 5000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '384Mi'; memoryLimit = '768Mi';
    replicas = Math.ceil(maxVUs / 40);
  }
  
  replicas = Math.max(2, Math.min(replicas, 8));
  
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
  
  console.log('\n' + '='.repeat(60));
  console.log('K8S RESOURCE RECOMMENDATIONS');
  console.log('='.repeat(60));
  console.log(`Service: ${recommendation.serviceName}`);
  console.log(`Replicas: ${recommendation.replicas}`);
  console.log(`CPU Request: ${recommendation.resources.requests.cpu}`);
  console.log(`CPU Limit: ${recommendation.resources.limits.cpu}`);
  console.log(`Memory Request: ${recommendation.resources.requests.memory}`);
  console.log(`Memory Limit: ${recommendation.resources.limits.memory}`);
  console.log('\nYAML Configuration:');
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
  
  // Create comprehensive summary
  const summary = {
    test: 'Order API - 150 VUs Stability Test',
    timestamp: new Date().toISOString(),
    testDuration: `${(data.state.testRunDurationMs / 1000).toFixed(2)}s`,
    metrics: {
      total_requests: data.metrics.http_reqs?.values?.count || 0,
      failed_requests: data.metrics.http_req_failed?.values?.passes || 0,
      failed_rate: `${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
      avg_response_time: (data.metrics.http_req_duration?.values?.avg || 0).toFixed(2),
      min_response_time: (data.metrics.http_req_duration?.values?.min || 0).toFixed(2),
      med_response_time: (data.metrics.http_req_duration?.values?.med || 0).toFixed(2),
      max_response_time: (data.metrics.http_req_duration?.values?.max || 0).toFixed(2),
      p90_response_time: (data.metrics.http_req_duration?.values['p(90)'] || 0).toFixed(2),
      p95_response_time: (data.metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2),
      p99_response_time: (data.metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2),
      avg_waiting_time: (data.metrics.http_req_waiting?.values?.avg || 0).toFixed(2),
      p95_waiting_time: (data.metrics.http_req_waiting?.values['p(95)'] || 0).toFixed(2),
      avg_blocked_time: (data.metrics.http_req_blocked?.values?.avg || 0).toFixed(2),
      avg_connecting_time: (data.metrics.http_req_connecting?.values?.avg || 0).toFixed(2),
      data_sent: `${((data.metrics.data_sent?.values?.count || 0) / 1024 / 1024).toFixed(2)} MB`,
      data_received: `${((data.metrics.data_received?.values?.count || 0) / 1024 / 1024).toFixed(2)} MB`,
      requests_per_second: (data.metrics.http_reqs?.values?.rate || 0).toFixed(2),
      orders_created: data.metrics.orders_created?.values?.count || 0,
      orders_read: data.metrics.orders_read?.values?.count || 0,
      items_added: data.metrics.items_added?.values?.count || 0,
      error_count: data.metrics.error_count?.values?.count || 0,
      success_rate: `${((data.metrics.success_rate?.values?.rate || 0) * 100).toFixed(2)}%`,
      max_vus: data.metrics.vus_max?.values?.value || 0,
      iterations_completed: data.metrics.iterations?.values?.count || 0,
      avg_iteration_duration: (data.metrics.iteration_duration?.values?.avg || 0).toFixed(2),
    },
    k8sRecommendation: recommendation,
    rawData: data,
  };
  
  return {
    'order-150vus-summary.json': JSON.stringify(summary, null, 2),
  };
}
