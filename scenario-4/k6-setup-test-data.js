import http from 'k6/http';
import { check, sleep } from 'k6';

// ============================================================================
// SCENARIO 4 - SETUP SCRIPT
// Chuẩn bị dữ liệu test: Tạo users, products, plans trước khi chạy stress test
// ============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://ae081c86deee14a10bdf2bc9a9c88fdb-726197963.ap-southeast-1.elb.amazonaws.com';

// Test users for Retail Model
const RETAIL_USERS = [
  { email: 'stresstest1@demo.com', password: 'Test@123456', name: 'Stress Test User 1', role: 'admin' },
  { email: 'stresstest2@demo.com', password: 'Test@123456', name: 'Stress Test User 2', role: 'admin' },
  { email: 'stresstest3@demo.com', password: 'Test@123456', name: 'Stress Test User 3', role: 'admin' },
  { email: 'stresstest4@demo.com', password: 'Test@123456', name: 'Stress Test User 4', role: 'user' },
  { email: 'stresstest5@demo.com', password: 'Test@123456', name: 'Stress Test User 5', role: 'user' },
  { email: 'retailtest1@demo.com', password: 'Test@123456', name: 'Retail Test User 1', role: 'user' },
  { email: 'retailtest2@demo.com', password: 'Test@123456', name: 'Retail Test User 2', role: 'user' },
  { email: 'retailtest3@demo.com', password: 'Test@123456', name: 'Retail Test User 3', role: 'user' },
  { email: 'retailtest4@demo.com', password: 'Test@123456', name: 'Retail Test User 4', role: 'user' },
  { email: 'retailtest5@demo.com', password: 'Test@123456', name: 'Retail Test User 5', role: 'user' },
];

// Test users for Subscription Model
const SUBSCRIPTION_USERS = [
  { email: 'subtest1@demo.com', password: 'Test@123456', name: 'Subscription Test User 1', role: 'user' },
  { email: 'subtest2@demo.com', password: 'Test@123456', name: 'Subscription Test User 2', role: 'user' },
  { email: 'subtest3@demo.com', password: 'Test@123456', name: 'Subscription Test User 3', role: 'user' },
  { email: 'subtest4@demo.com', password: 'Test@123456', name: 'Subscription Test User 4', role: 'user' },
  { email: 'subtest5@demo.com', password: 'Test@123456', name: 'Subscription Test User 5', role: 'user' },
  { email: 'subtest6@demo.com', password: 'Test@123456', name: 'Subscription Test User 6', role: 'user' },
  { email: 'subtest7@demo.com', password: 'Test@123456', name: 'Subscription Test User 7', role: 'user' },
  { email: 'subtest8@demo.com', password: 'Test@123456', name: 'Subscription Test User 8', role: 'user' },
  { email: 'subtest9@demo.com', password: 'Test@123456', name: 'Subscription Test User 9', role: 'user' },
  { email: 'subtest10@demo.com', password: 'Test@123456', name: 'Subscription Test User 10', role: 'user' },
];

// Sample products for catalogue
const SAMPLE_PRODUCTS = [
  { name: 'iPhone 15 Pro Max', description: '256GB, Titanium Blue', price: 32990000, category: 'Electronics', sku: 'IPHONE-15-PRO' },
  { name: 'Samsung Galaxy S24 Ultra', description: '512GB, Phantom Black', price: 31990000, category: 'Electronics', sku: 'SAMSUNG-S24' },
  { name: 'MacBook Pro 16 M3', description: '1TB SSD, 32GB RAM', price: 62990000, category: 'Computers', sku: 'MBP-M3-16' },
  { name: 'iPad Pro 13 M4', description: '256GB, Silver', price: 28990000, category: 'Tablets', sku: 'IPAD-PRO-13' },
  { name: 'Sony WH-1000XM5', description: 'Wireless Noise Canceling', price: 8990000, category: 'Electronics', sku: 'SONY-XM5' },
  { name: 'Apple Watch Ultra 2', description: 'Titanium, 49mm', price: 21990000, category: 'Wearables', sku: 'WATCH-ULTRA-2' },
  { name: 'Dell XPS 15', description: '4K OLED, Core i9', price: 45990000, category: 'Computers', sku: 'DELL-XPS-15' },
  { name: 'Nike Air Max 90', description: 'Classic White', price: 3990000, category: 'Sports', sku: 'NIKE-AM90' },
  { name: 'Adidas Ultraboost 23', description: 'Running Shoes', price: 4590000, category: 'Sports', sku: 'ADIDAS-UB23' },
  { name: 'Canon EOS R6 II', description: 'Full-frame Mirrorless', price: 59990000, category: 'Electronics', sku: 'CANON-R6-II' },
];

// Features for subscription plans
const FEATURES = [
  { name: 'Basic Storage', description: '10GB cloud storage', code: 'STORAGE_BASIC' },
  { name: 'Email Support', description: '24/7 email support', code: 'SUPPORT_EMAIL' },
  { name: 'API Access', description: 'REST API access', code: 'API_ACCESS' },
  { name: 'Advanced Analytics', description: 'Advanced analytics dashboard', code: 'ANALYTICS_PRO' },
  { name: 'Priority Support', description: 'Priority phone & chat support', code: 'SUPPORT_PRIORITY' },
  { name: 'Unlimited Storage', description: 'Unlimited cloud storage', code: 'STORAGE_UNLIMITED' },
  { name: 'Custom Integrations', description: 'Custom third-party integrations', code: 'INTEGRATIONS' },
  { name: 'White Label', description: 'White label branding', code: 'WHITE_LABEL' },
];

// Subscription plans (features will be filled with IDs after creating features)
const SUBSCRIPTION_PLANS = [
  { name: 'Basic Plan', description: 'Basic features for individuals', price: 99000, billingCycle: 'monthly', featureCount: 2, trialEnabled: true, trialDays: 7 },
  { name: 'Pro Plan', description: 'Professional features for teams', price: 299000, billingCycle: 'monthly', featureCount: 4, trialEnabled: true, trialDays: 14 },
  { name: 'Enterprise Plan', description: 'Full features for enterprises', price: 999000, billingCycle: 'monthly', featureCount: 8, trialEnabled: true, trialDays: 30 },
  { name: 'Annual Basic', description: 'Basic plan - yearly billing', price: 999000, billingCycle: 'yearly', featureCount: 2, trialEnabled: true, trialDays: 7 },
  { name: 'Annual Pro', description: 'Pro plan - yearly billing', price: 2990000, billingCycle: 'yearly', featureCount: 4, trialEnabled: true, trialDays: 14 },
];

export const options = {
  vus: 1,
  iterations: 1,
};

function registerUser(user) {
  const headers = { 'Content-Type': 'application/json' };
  
  // Try to login first
  let loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    { headers }
  );
  
  if (loginRes.status === 200 || loginRes.status === 201) {
    console.log(`✓ Already exists, logged in: ${user.email}`);
    return true;
  }
  
  // If login failed, try to signup
  const signupRes = http.post(
    `${BASE_URL}/auth/signup`,
    JSON.stringify({
      email: user.email,
      password: user.password,
      name: user.name,
      role: user.role,
    }),
    { headers }
  );
  
  if (signupRes.status === 201 || signupRes.status === 200) {
    console.log(`✓ Signed up: ${user.email}`);
    return true;
  } else if (signupRes.status === 409) {
    // User already exists, try to login again
    loginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers }
    );
    
    if (loginRes.status === 200 || loginRes.status === 201) {
      console.log(`✓ Already exists, logged in: ${user.email}`);
      return true;
    }
  }
  
  console.log(`✗ Failed to signup/login: ${user.email} - signup: ${signupRes.status}`);
  return false;
}

function createProduct(token, product) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  
  const productData = {
    ...product,
    sku: `${product.sku}-${Date.now()}`,
    imageUrl: 'https://example.com/product.jpg',
    isActive: true,
  };
  
  const res = http.post(`${BASE_URL}/catalogue/products`, JSON.stringify(productData), { headers });
  
  if (res.status === 201) {
    console.log(`✓ Created product: ${product.name}`);
    return true;
  }
  
  console.log(`✗ Failed to create product: ${product.name} - ${res.status}`);
  return false;
}

function createPlan(token, plan, featureIds) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  
  // Select feature IDs based on featureCount
  const selectedFeatures = featureIds.slice(0, plan.featureCount);
  
  const planData = {
    name: plan.name,
    description: plan.description,
    price: plan.price,
    billingCycle: plan.billingCycle,
    features: selectedFeatures,
    trialEnabled: plan.trialEnabled,
    trialDays: plan.trialDays,
  };
  
  const res = http.post(`${BASE_URL}/catalogue/plans`, JSON.stringify(planData), { headers });
  
  if (res.status === 201) {
    console.log(`✓ Created plan: ${plan.name}`);
    return true;
  } else if (res.status === 409) {
    console.log(`⚠ Plan already exists: ${plan.name}`);
    return true;
  }
  
  console.log(`✗ Failed to create plan: ${plan.name} - ${res.status} - ${res.body}`);
  return false;
}

function createFeature(token, feature) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  
  const res = http.post(`${BASE_URL}/catalogue/features`, JSON.stringify(feature), { headers });
  
  if (res.status === 201) {
    try {
      const body = JSON.parse(res.body);
      const featureId = body?.feature?.id;
      console.log(`✓ Created feature: ${feature.name} (ID: ${featureId})`);
      return featureId;
    } catch {
      console.log(`✓ Created feature: ${feature.name}`);
      return null;
    }
  } else if (res.status === 409) {
    console.log(`⚠ Feature already exists: ${feature.name}`);
    return null;
  }
  
  console.log(`✗ Failed to create feature: ${feature.name} - ${res.status}`);
  return null;
}

function getToken(email, password) {
  const headers = { 'Content-Type': 'application/json' };
  
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers }
  );
  
  if (loginRes.status === 200 || loginRes.status === 201) {
    try {
      const data = JSON.parse(loginRes.body);
      return data.accessToken || data.access_token;
    } catch {}
  }
  
  return null;
}

export default function () {
  console.log('\n' + '='.repeat(70));
  console.log('SCENARIO 4 - TEST DATA SETUP');
  console.log('='.repeat(70));
  console.log(`Target API: ${BASE_URL}`);
  console.log('='.repeat(70) + '\n');
  
  // Health check
  const healthRes = http.get(`${BASE_URL}/catalogue/plans`);
  if (healthRes.status >= 500) {
    console.log(`✗ API unhealthy: ${healthRes.status}`);
    return;
  }
  console.log('✓ API health check passed\n');
  
  // ========== STEP 1: Register all users ==========
  console.log('--- Registering Retail Test Users ---');
  for (const user of RETAIL_USERS) {
    registerUser(user);
    sleep(0.2);
  }
  
  console.log('\n--- Registering Subscription Test Users ---');
  for (const user of SUBSCRIPTION_USERS) {
    registerUser(user);
    sleep(0.2);
  }
  
  // ========== STEP 2: Get admin token ==========
  console.log('\n--- Getting admin token ---');
  const adminToken = getToken('stresstest1@demo.com', 'Test@123456');
  
  if (!adminToken) {
    console.log('✗ Failed to get admin token. Cannot create products/plans.');
    return;
  }
  console.log('✓ Got admin token');
  
  // ========== STEP 3: Create sample products ==========
  console.log('\n--- Creating Sample Products ---');
  for (const product of SAMPLE_PRODUCTS) {
    createProduct(adminToken, product);
    sleep(0.3);
  }
  
  // ========== STEP 4: Create features first ==========
  console.log('\n--- Creating Features ---');
  const featureIds = [];
  for (const feature of FEATURES) {
    const featureId = createFeature(adminToken, feature);
    if (featureId) {
      featureIds.push(featureId);
    }
    sleep(0.2);
  }
  
  // If no features were created, try to get existing features
  if (featureIds.length === 0) {
    console.log('Fetching existing features...');
    const featuresRes = http.get(`${BASE_URL}/catalogue/features`, { headers });
    if (featuresRes.status === 200) {
      try {
        const body = JSON.parse(featuresRes.body);
        const existingFeatures = body.features || body || [];
        for (const f of existingFeatures) {
          if (f.id) featureIds.push(f.id);
        }
        console.log(`Found ${featureIds.length} existing features`);
      } catch {}
    }
  }
  
  // ========== STEP 5: Create subscription plans ==========
  console.log('\n--- Creating Subscription Plans ---');
  if (featureIds.length > 0) {
    for (const plan of SUBSCRIPTION_PLANS) {
      createPlan(adminToken, plan, featureIds);
      sleep(0.3);
    }
  } else {
    console.log('⚠ No features available. Creating plans without features...');
    for (const plan of SUBSCRIPTION_PLANS) {
      createPlan(adminToken, plan, []);
      sleep(0.3);
    }
  }
  
  // ========== STEP 6: Create some inventory ==========
  console.log('\n--- Creating Inventory for Products ---');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
  };
  
  // Get created products
  const productsRes = http.get(`${BASE_URL}/catalogue/products/my?page=1&limit=50`, { headers });
  if (productsRes.status === 200) {
    try {
      const products = JSON.parse(productsRes.body).products || [];
      for (const product of products.slice(0, 10)) {
        const inventory = {
          productId: product.id,
          quantity: 100 + Math.floor(Math.random() * 400),
          reorderLevel: 20,
          warehouseLocation: `WH-${Math.floor(Math.random() * 5) + 1}`,
          maxStock: 1000,
        };
        
        const invRes = http.post(`${BASE_URL}/inventory/my`, JSON.stringify(inventory), { headers });
        if (invRes.status === 201 || invRes.status === 200) {
          console.log(`✓ Created inventory for: ${product.name}`);
        }
        sleep(0.2);
      }
    } catch (e) {
      console.log('✗ Failed to parse products response');
    }
  }
  
  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(70));
  console.log('SETUP COMPLETE');
  console.log('='.repeat(70));
  console.log(`Retail Users: ${RETAIL_USERS.length}`);
  console.log(`Subscription Users: ${SUBSCRIPTION_USERS.length}`);
  console.log(`Sample Products: ${SAMPLE_PRODUCTS.length}`);
  console.log(`Subscription Plans: ${SUBSCRIPTION_PLANS.length}`);
  console.log('='.repeat(70));
  console.log('\nYou can now run the stress tests:');
  console.log('  k6 run k6-stress-test-retail-model.js');
  console.log('  k6 run k6-stress-test-subscription-model.js');
  console.log('='.repeat(70) + '\n');
}
