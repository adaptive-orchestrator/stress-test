import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const crossUserIsolationSuccess = new Rate('cross_user_isolation_success');
const productsCreated = new Counter('products_created');

// Test configuration
export const options = {
  stages: [
    // Stage 1: Warm up - 10 products
    { duration: '30s', target: 10 },  // Ramp up to 10 VUs trong 30s
    { duration: '1m', target: 10 },   // Giữ ở 10 VUs trong 1 phút
    
    // Stage 2: Scale up - Test tải cao hơn
    { duration: '30s', target: 50 },  // Tăng lên 50 VUs
    { duration: '2m', target: 50 },   // Giữ ở 50 VUs trong 2 phút
    
    // Stage 3: Peak load
    { duration: '30s', target: 100 }, // Tăng lên 100 VUs
    { duration: '1m', target: 100 },  // Giữ ở 100 VUs trong 1 phút
    
    // Stage 4: Cool down
    { duration: '30s', target: 0 },   // Giảm xuống 0
  ],
  thresholds: {
    'http_req_duration{name:!cross_user_isolation_check}': ['p(95)<500'], // 95% requests phải < 500ms (exclude isolation checks)
    'http_req_failed{name:!cross_user_isolation_check}': ['rate<0.1'],    // Error rate phải < 10% (exclude isolation checks)
    'errors': ['rate<0.1'],
    'cross_user_isolation_success': ['rate>0.9'], // Cross-user isolation should work 90%+ of the time
  },
};

const BASE_URL = 'http://localhost:3000';

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
  {
    name: 'Apple Watch Series 9',
    description: 'GPS + Cellular, 45mm, Midnight Aluminum',
    price: 499.00,
    category: 'Electronics',
    sku: 'WATCH-S9-45MM',
    imageUrl: 'https://example.com/watch9.jpg',
    isActive: true,
  },
  {
    name: 'Dell XPS 15',
    description: '15.6-inch, Intel i9, 32GB RAM, 1TB SSD',
    price: 2299.00,
    category: 'Computers',
    sku: 'DELL-XPS15-I9',
    imageUrl: 'https://example.com/xps15.jpg',
    isActive: true,
  },
  {
    name: 'AirPods Pro 2nd Gen',
    description: 'Active Noise Cancellation, Wireless Charging',
    price: 249.00,
    category: 'Electronics',
    sku: 'AIRPODS-PRO-2',
    imageUrl: 'https://example.com/airpods-pro.jpg',
    isActive: true,
  },
  {
    name: 'Nintendo Switch OLED',
    description: 'Gaming Console with 7-inch OLED screen',
    price: 349.99,
    category: 'Electronics',
    sku: 'SWITCH-OLED',
    imageUrl: 'https://example.com/switch-oled.jpg',
    isActive: true,
  },
  {
    name: 'Logitech MX Master 3S',
    description: 'Wireless Performance Mouse',
    price: 99.99,
    category: 'Electronics',
    sku: 'LOGITECH-MX3S',
    imageUrl: 'https://example.com/mx-master.jpg',
    isActive: true,
  },
];

export default function (data) {
  // Get tokens from setup data
  authTokens = data.tokens || {};
  
  // Get authenticated headers for current VU
  const headers = getAuthHeaders(__VU);
  
  // Skip if not authenticated
  if (!headers.Authorization || headers.Authorization === 'Bearer ') {
    console.log(`⚠️ VU ${__VU}: No auth token, skipping...`);
    sleep(1);
    return;
  }
  
  // Chọn random một product từ danh sách
  const product = products[Math.floor(Math.random() * products.length)];
  
  // Tạo SKU unique bằng cách thêm timestamp và random number
  const uniqueProduct = {
    ...product,
    sku: `${product.sku}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: `${product.name} (Test ${__VU}-${__ITER})`,
  };

  // Test 1: CREATE Product (with authentication - ownerId set from JWT)
  const createResponse = http.post(
    `${BASE_URL}/catalogue/products`,
    JSON.stringify(uniqueProduct),
    { headers }
  );

  const createSuccess = check(createResponse, {
    'create status is 201': (r) => r.status === 201,
    'create response has product': (r) => {
      const body = JSON.parse(r.body);
      return body.product && body.product.id !== undefined;
    },
  });

  errorRate.add(!createSuccess);

  if (createSuccess) {
    const responseBody = JSON.parse(createResponse.body);
    const createdProduct = responseBody.product;
    const productId = createdProduct.id;

    // Test 2: GET My Products (user-specific endpoint)
    const myProductsResponse = http.get(`${BASE_URL}/catalogue/products/my?page=1&limit=20`, { headers });
    
    check(myProductsResponse, {
      'my products status is 200': (r) => r.status === 200,
      'my products returns array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.products && Array.isArray(body.products);
        } catch (e) {
          return false;
        }
      },
      'my products contains created product': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.products.some(p => p.id === productId);
        } catch (e) {
          return false;
        }
      },
    });

    // Test 3: GET My Product by ID
    const getMyResponse = http.get(`${BASE_URL}/catalogue/products/my/${productId}`, { headers });
    
    const getSuccess = check(getMyResponse, {
      'get my product status is 200': (r) => r.status === 200,
      'get returns correct product': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.product && body.product.id === productId;
        } catch (e) {
          return false;
        }
      },
    });

    errorRate.add(!getSuccess);

    // Test 4: UPDATE Product (with ownership check)
    const updateData = {
      ...uniqueProduct,
      price: uniqueProduct.price + 100,
      description: `${uniqueProduct.description} - UPDATED`,
    };

    const updateResponse = http.put(
      `${BASE_URL}/catalogue/products/${productId}`,
      JSON.stringify(updateData),
      { headers }
    );

    check(updateResponse, {
      'update status is 200': (r) => r.status === 200,
      'update reflects changes': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.product && body.product.price === updateData.price;
        } catch (e) {
          return false;
        }
      },
    });

    // Test 5: Cross-user isolation - try to access another user's product should fail
    // Switch to different user and try to access this product
    const otherUserIndex = (__VU + 1) % TEST_USERS.length;
    const otherHeaders = getAuthHeaders(otherUserIndex);
    
    if (otherHeaders.Authorization && otherHeaders.Authorization !== 'Bearer ' && otherHeaders.Authorization !== headers.Authorization) {
      // Use tags to identify this request type - expected to return 403/404/401
      const crossAccessResponse = http.get(`${BASE_URL}/catalogue/products/my/${productId}`, { 
        headers: otherHeaders,
        tags: { name: 'cross_user_isolation_check' }
      });
      
      // This check expects the request to be denied (403, 404, or 401)
      const isolationWorks = crossAccessResponse.status === 403 || crossAccessResponse.status === 404 || crossAccessResponse.status === 401;
      
      check(crossAccessResponse, {
        'cross-user access denied (403 or 404)': () => isolationWorks,
      });
      
      // Track isolation success rate separately
      crossUserIsolationSuccess.add(isolationWorks);
    }
  }

  // Track successful product creation
  if (createSuccess) {
    productsCreated.add(1);
  }

  // Sleep ngắn giữa các iterations (0.5 - 2 giây)
  sleep(Math.random() * 1.5 + 0.5);
}

// Setup function - chạy một lần trước test
export function setup() {
  console.log('🚀 Starting Catalogue API Stress Test with User Isolation...');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`👥 Test Users: ${TEST_USERS.map(u => u.email).join(', ')}`);
  
  const tokens = {};
  
  // Register and login all test users
  for (const user of TEST_USERS) {
    // Try to login first
    let loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
      email: user.email,
      password: user.password,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
    // If login fails (401/404), try to signup
    if (loginRes.status !== 200 && loginRes.status !== 201) {
      console.log(`⚠️ Login failed for ${user.email} (${loginRes.status}), attempting signup...`);
      
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
        // Try login again after signup
        loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
          email: user.email,
          password: user.password,
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        console.log(`❌ Signup failed for ${user.email}: ${signupRes.status} - ${signupRes.body}`);
      }
    }
    
    if (loginRes.status === 200 || loginRes.status === 201) {
      try {
        const body = JSON.parse(loginRes.body);
        tokens[user.email] = body.access_token || body.token || body.accessToken;
        console.log(`✅ Logged in: ${user.email}`);
      } catch (e) {
        console.log(`❌ Failed to parse login response for ${user.email}: ${e.message}`);
      }
    } else {
      console.log(`❌ Final login failed for ${user.email}: ${loginRes.status}`);
    }
  }
  
  // Check if API is reachable
  const healthCheck = http.get(`${BASE_URL}/catalogue/plans`);
  if (healthCheck.status !== 200) {
    console.log(`⚠️ API health check failed: ${healthCheck.status}. Some tests might fail.`);
  } else {
    console.log('✅ API health check passed');
  }
  
  console.log(`✅ Setup completed. ${Object.keys(tokens).length}/${TEST_USERS.length} users authenticated.`);
  return { timestamp: new Date().toISOString(), tokens };
}

// Calculate recommended K8s resources based on test results
function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = 100; // Max VUs from stages
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
  
  if (p95ResponseTime > 2000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
  } else if (p95ResponseTime > 1000) {
    cpuRequest = '250m'; cpuLimit = '1000m';
  } else if (p95ResponseTime > 500) {
    cpuRequest = '150m'; cpuLimit = '750m';
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
  
  return { serviceName: 'catalogue-svc', replicas, resources: { requests: { cpu: cpuRequest, memory: memoryRequest }, limits: { cpu: cpuLimit, memory: memoryLimit } },
    metrics: { maxVUs, avgResponseTime: avgResponseTime.toFixed(2), p95ResponseTime: p95ResponseTime.toFixed(2), p99ResponseTime: p99ResponseTime.toFixed(2), errorRate: (errorRate * 100).toFixed(2), throughput: throughput.toFixed(2) }
  };
}

// Teardown function - chạy sau khi test kết thúc
export function teardown(data) {
  console.log('✅ Test completed at:', new Date().toISOString());
  console.log('📊 Check the summary above for detailed metrics');
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
    'catalogue-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
