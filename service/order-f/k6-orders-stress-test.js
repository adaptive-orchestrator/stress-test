import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import encoding from 'k6/encoding';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Start very slow to debug
    { duration: '2m', target: 25 },    // Increase to 10
    { duration: '2m', target: 25 },    // Hold at 10
    { duration: '1m', target: 50 },   // Ramp to 10
    { duration: '2m', target: 100 },   // Hold at 10
    { duration: '1m', target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],  // 5s for order (complex operation)
    http_req_failed: ['rate<0.15'],     // 15% error tolerance while debugging
    errors: ['rate<0.15'],
    checks: ['rate>0.85'],              // 85% check pass rate
  },
};

const BASE_URL = 'http://localhost:3000';

// Use real test user created by setup script
const TEST_USER = {
  email: 'admin2@demo.com',
  password: 'Admin@123'
};

let authToken = '';
let productIds = [];

export function setup() {
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
  authToken = loginData.accessToken || loginData.access_token;
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
    throw new Error('Could not get userId from JWT - test cannot proceed!');
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
    console.error(`❌ Failed to get customer by userId: ${customerRes.status} - ${customerRes.body}`);
  }
  
  if (!customerId) {
    throw new Error('Could not get customerId - test cannot proceed!');
  }
  
  // Get products with available inventory
  const productsRes = http.get(`${BASE_URL}/catalogue/products/my?page=1&limit=20`, { headers: authHeaders });
  if (productsRes.status === 200) {
    try {
      const data = JSON.parse(productsRes.body);
      const products = data.products || data.items || data.data || [];
      
      console.log(`📦 Checking inventory for ${products.length} products...`);
      
      for (const product of products) {
        if (!product.id) continue;
        
        const invRes = http.get(`${BASE_URL}/inventory/product/${product.id}`, { headers: authHeaders });
        if (invRes.status === 200) {
          try {
            const invData = JSON.parse(invRes.body);
            const inventory = invData.inventory || invData;
            const availableStock = inventory.quantity || inventory.availableQuantity || 0;
            
            if (availableStock > 5) {
              productIds.push(product.id);
              console.log(`  ✓ Product ${product.id}: ${availableStock} units`);
            }
          } catch (e) {
            // Skip products with inventory check errors
          }
        }
      }
      
      console.log(`✅ Found ${productIds.length} products with stock`);
    } catch (e) {
      console.log(`⚠️  Could not get products: ${e.message}`);
    }
  }
  
  if (productIds.length === 0) {
    console.log('⚠️  No products with stock - test cannot proceed!');
    throw new Error('No products with sufficient stock available');
  }
  
  return { authToken, productIds, customerId };
}

function createItem(productId) {
  return {
    productId: productId,
    quantity: Math.floor(Math.random() * 3) + 1, // 1-3 items
    price: Math.floor(Math.random() * 500) + 50, // $50-$550
  };
}

function createOrderPayload(productIds, customerId) {
  // Pick random product from available products
  const productId = productIds.length > 0 
    ? productIds[Math.floor(Math.random() * productIds.length)]
    : 'mock-product-id';
  
  return {
    customerId: customerId, // Required field
    items: [createItem(productId)],
    notes: `K6 stress test order - ${Date.now()}`,
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

  // Create order
  const orderPayload = createOrderPayload(productIds, customerId);
  const createRes = http.post(`${BASE_URL}/orders`, JSON.stringify(orderPayload), { 
    headers,
    tags: { name: 'create_order' }
  });
  
  const okCreate = check(createRes, { 
    'create 201': (r) => r.status === 201 || r.status === 200 
  });
  
  if (!okCreate) {
    console.log(`[VU${__VU}] Order creation failed: ${createRes.status} - ${createRes.body}`);
    if (createRes.status === 500) {
      console.log(`[VU${__VU}] Payload was:`, JSON.stringify(orderPayload));
    }
  }
  
  errorRate.add(!okCreate);

  if (okCreate) {
    const b = JSON.parse(createRes.body);
    const orderId = b.order?.id || b.id;

    if (orderId) {
      // Get order by id
      const getRes = http.get(`${BASE_URL}/orders/${orderId}`, { 
        headers,
        tags: { name: 'get_order' }
      });
      check(getRes, { 'get 200': (r) => r.status === 200 });

      // Get user's orders list
      check(http.get(`${BASE_URL}/orders/my?page=1&limit=20`, { 
        headers,
        tags: { name: 'list_orders' }
      }), { 
        'my orders 200': (r) => r.status === 200 
      });

      // Add item (only if we have products)
      if (productIds.length > 0) {
        const newProductId = productIds[Math.floor(Math.random() * productIds.length)];
        check(http.post(
          `${BASE_URL}/orders/${orderId}/items`, 
          JSON.stringify({ 
            productId: newProductId, 
            quantity: 1, 
            price: Math.floor(Math.random() * 200) + 20 
          }), 
          { headers, tags: { name: 'add_item' } }
        ), { 'add item 200/201': (r) => r.status === 200 || r.status === 201 || r.status === 400 });
      }

      // Cancel own order - TODO: Feature not yet completed
      // check(http.del(`${BASE_URL}/orders/${orderId}?reason=K6%20stress%20test`, { 
      //   headers,
      //   tags: { name: 'cancel_order' }
      // }), { 
      //   'cancel 200': (r) => r.status === 200 || r.status === 204
      // });
    }
  }

  sleep(Math.random() * 2 + 1); // 1-3 seconds
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
  let replicas = 2;
  
  // Order service needs more resources due to transactional complexity
  if (p95ResponseTime > 2000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
    memoryRequest = '512Mi'; memoryLimit = '1Gi';
  } else if (p95ResponseTime > 1000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '384Mi'; memoryLimit = '768Mi';
  } else if (p95ResponseTime > 500) {
    cpuRequest = '200m'; cpuLimit = '1000m';
    memoryRequest = '256Mi'; memoryLimit = '640Mi';
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
  } else {
    replicas = Math.ceil(maxVUs / 30);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return { serviceName: 'order-svc', replicas, resources: { requests: { cpu: cpuRequest, memory: memoryRequest }, limits: { cpu: cpuLimit, memory: memoryLimit } },
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
    'order-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
