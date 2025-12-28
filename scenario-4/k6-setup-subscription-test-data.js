import http from 'k6/http';
import { sleep } from 'k6';

// ============================================================================
// SETUP TEST DATA FOR SUBSCRIPTION MODEL STRESS TEST (ONLY)
// Creates: Test users, Customer profiles, Features, Subscription Plans
// NOT for Retail Model - Use k6-setup-retail-test-data.js for that
// ============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://ae081c86deee14a10bdf2bc9a9c88fdb-726197963.ap-southeast-1.elb.amazonaws.com';

// Subscription test users (same as in k6-stress-test-subscription-model.js)
const SUBSCRIPTION_USERS = [
  { email: 'subtest1@demo.com', password: 'Test@123456', name: 'Sub Test 1' },
  { email: 'subtest2@demo.com', password: 'Test@123456', name: 'Sub Test 2' },
  { email: 'subtest3@demo.com', password: 'Test@123456', name: 'Sub Test 3' },
  { email: 'subtest4@demo.com', password: 'Test@123456', name: 'Sub Test 4' },
  { email: 'subtest5@demo.com', password: 'Test@123456', name: 'Sub Test 5' },
  { email: 'subtest6@demo.com', password: 'Test@123456', name: 'Sub Test 6' },
  { email: 'subtest7@demo.com', password: 'Test@123456', name: 'Sub Test 7' },
  { email: 'subtest8@demo.com', password: 'Test@123456', name: 'Sub Test 8' },
  { email: 'subtest9@demo.com', password: 'Test@123456', name: 'Sub Test 9' },
  { email: 'subtest10@demo.com', password: 'Test@123456', name: 'Sub Test 10' },
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

// Subscription plans
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

export default function () {
  console.log('\n' + '='.repeat(70));
  console.log('SUBSCRIPTION MODEL - TEST DATA SETUP');
  console.log('='.repeat(70));
  console.log(`Target API: ${BASE_URL}`);
  console.log('='.repeat(70) + '\n');

  let stats = {
    usersCreated: 0,
    usersExisted: 0,
    customersCreated: 0,
    customersExisted: 0,
    featuresCreated: 0,
    plansCreated: 0,
  };

  const headers = { 'Content-Type': 'application/json' };

  // ========== STEP 1: Health Check ==========
  console.log('--- Health Check ---');
  const healthRes = http.get(`${BASE_URL}/catalogue/plans`);
  if (healthRes.status >= 500) {
    console.log(`✗ API unhealthy: ${healthRes.status}`);
    return;
  }
  console.log('✓ API is healthy\n');

  // ========== STEP 2: Register subscription test users ==========
  console.log('--- Registering Subscription Test Users ---');
  
  for (const user of SUBSCRIPTION_USERS) {
    // Try login first
    let loginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers }
    );
    
    if (loginRes.status === 200 || loginRes.status === 201) {
      console.log(`○ User exists: ${user.email}`);
      stats.usersExisted++;
      continue;
    }
    
    // If login failed, try signup
    const signupRes = http.post(
      `${BASE_URL}/auth/signup`,
      JSON.stringify({
        email: user.email,
        password: user.password,
        name: user.name,
        role: 'user',
      }),
      { headers }
    );
    
    if (signupRes.status === 201 || signupRes.status === 200) {
      console.log(`✓ User created: ${user.email}`);
      stats.usersCreated++;
    } else if (signupRes.status === 409) {
      console.log(`○ User exists: ${user.email}`);
      stats.usersExisted++;
    } else {
      console.log(`✗ Failed: ${user.email} - ${signupRes.status}`);
    }
    
    sleep(0.1);
  }

  // ========== STEP 3: Get admin token (use subtest1 or create an admin) ==========
  console.log('\n--- Getting Admin Token ---');
  
  // First try to get subtest1 token
  const adminLoginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'subtest1@demo.com', password: 'Test@123456' }),
    { headers }
  );
  
  let adminToken = null;
  if (adminLoginRes.status === 200 || adminLoginRes.status === 201) {
    try {
      const data = JSON.parse(adminLoginRes.body);
      adminToken = data.accessToken || data.access_token;
      console.log('✓ Got token for subtest1@demo.com');
    } catch (e) {
      console.log('✗ Failed to parse token');
      return;
    }
  } else {
    console.log('✗ Login failed');
    return;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
  };

  // ========== STEP 4: Create Customer Profiles ==========
  // CRITICAL: Subscription-svc requires customer.id
  console.log('\n--- Creating Customer Profiles ---');
  
  for (const user of SUBSCRIPTION_USERS) {
    // Login as user
    const userLoginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers }
    );
    
    if (userLoginRes.status !== 200 && userLoginRes.status !== 201) {
      console.log(`✗ Cannot login as ${user.email}`);
      continue;
    }
    
    let userToken;
    try {
      const data = JSON.parse(userLoginRes.body);
      userToken = data.accessToken || data.access_token;
    } catch (e) {
      continue;
    }
    
    const userHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    };
    
    // Check if customer exists
    const checkRes = http.get(`${BASE_URL}/customers/email/${encodeURIComponent(user.email)}`, { headers: userHeaders });
    
    if (checkRes.status === 200) {
      try {
        const customer = JSON.parse(checkRes.body);
        if (customer && customer.id) {
          console.log(`○ Customer exists: ${user.email} -> ${customer.id}`);
          stats.customersExisted++;
          continue;
        }
      } catch (e) {}
    }
    
    // Create customer profile
    const createRes = http.post(`${BASE_URL}/customers`, JSON.stringify({
      email: user.email,
      name: user.name,
      phone: `090${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      address: `${Math.floor(Math.random() * 999) + 1} Subscription Ave, District ${Math.floor(Math.random() * 12) + 1}, HCM`,
    }), { headers: userHeaders });
    
    if (createRes.status === 201 || createRes.status === 200) {
      try {
        const customer = JSON.parse(createRes.body);
        console.log(`✓ Customer created: ${user.email} -> ${customer.customer?.id || customer.id}`);
        stats.customersCreated++;
      } catch (e) {
        console.log(`✓ Customer created: ${user.email}`);
        stats.customersCreated++;
      }
    } else if (createRes.status === 409) {
      console.log(`○ Customer exists: ${user.email}`);
      stats.customersExisted++;
    } else {
      console.log(`✗ Failed: ${user.email} - ${createRes.status}`);
    }
    
    sleep(0.1);
  }

  // ========== STEP 5: Create Features ==========
  console.log('\n--- Creating Features ---');
  const featureIds = [];
  
  for (const feature of FEATURES) {
    const res = http.post(`${BASE_URL}/catalogue/features`, JSON.stringify(feature), { headers: authHeaders });
    
    if (res.status === 201) {
      try {
        const body = JSON.parse(res.body);
        const featureId = body?.feature?.id;
        if (featureId) {
          featureIds.push(featureId);
        }
        console.log(`✓ Feature created: ${feature.name} (ID: ${featureId})`);
        stats.featuresCreated++;
      } catch (e) {
        console.log(`✓ Feature created: ${feature.name}`);
        stats.featuresCreated++;
      }
    } else if (res.status === 409) {
      console.log(`○ Feature exists: ${feature.name}`);
    } else {
      console.log(`✗ Failed: ${feature.name} - ${res.status}`);
    }
    
    sleep(0.1);
  }

  // If no new features created, fetch existing ones
  if (featureIds.length === 0) {
    console.log('Fetching existing features...');
    const featuresRes = http.get(`${BASE_URL}/catalogue/features`, { headers: authHeaders });
    if (featuresRes.status === 200) {
      try {
        const body = JSON.parse(featuresRes.body);
        const existingFeatures = body.features || body || [];
        for (const f of existingFeatures) {
          if (f.id) featureIds.push(f.id);
        }
        console.log(`Found ${featureIds.length} existing features`);
      } catch (e) {}
    }
  }

  // ========== STEP 6: Create Subscription Plans ==========
  console.log('\n--- Creating Subscription Plans ---');
  
  for (const plan of SUBSCRIPTION_PLANS) {
    // Select features based on featureCount
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
    
    const res = http.post(`${BASE_URL}/catalogue/plans`, JSON.stringify(planData), { headers: authHeaders });
    
    if (res.status === 201) {
      console.log(`✓ Plan created: ${plan.name}`);
      stats.plansCreated++;
    } else if (res.status === 409) {
      console.log(`○ Plan exists: ${plan.name}`);
    } else {
      console.log(`✗ Failed: ${plan.name} - ${res.status}`);
    }
    
    sleep(0.1);
  }

  // ========== VERIFY: List customers and IDs ==========
  console.log('\n--- Verifying Customer IDs (needed for subscriptions) ---');
  const customersRes = http.get(`${BASE_URL}/customers?page=1&limit=50`, { headers: authHeaders });
  
  if (customersRes.status === 200) {
    try {
      const customersData = JSON.parse(customersRes.body);
      const customers = customersData.customers || [];
      
      for (const user of SUBSCRIPTION_USERS) {
        const customer = customers.find(c => c.email === user.email);
        if (customer) {
          console.log(`  ${user.email} -> customer.id: ${customer.id}`);
        } else {
          console.log(`  ${user.email} -> NO CUSTOMER (subscriptions will fail!)`);
        }
      }
    } catch (e) {}
  }

  // ========== VERIFY: List available plans ==========
  console.log('\n--- Verifying Available Plans ---');
  const plansRes = http.get(`${BASE_URL}/catalogue/plans`, { headers: authHeaders });
  
  if (plansRes.status === 200) {
    try {
      const plansData = JSON.parse(plansRes.body);
      const plans = plansData.plans || [];
      console.log(`Available plans: ${plans.length}`);
      for (const plan of plans) {
        console.log(`  ${plan.id}: ${plan.name} - ${plan.price}đ/${plan.billingCycle}`);
      }
    } catch (e) {}
  }

  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(70));
  console.log('SUBSCRIPTION MODEL SETUP COMPLETE');
  console.log('='.repeat(70));
  console.log(`Users Created: ${stats.usersCreated}`);
  console.log(`Users Existed: ${stats.usersExisted}`);
  console.log(`Customers Created: ${stats.customersCreated}`);
  console.log(`Customers Existed: ${stats.customersExisted}`);
  console.log(`Features Created: ${stats.featuresCreated}`);
  console.log(`Plans Created: ${stats.plansCreated}`);
  console.log('='.repeat(70));
  console.log('\nReady to run stress test:');
  console.log('  k6 run k6-stress-test-subscription-model.js');
  console.log('='.repeat(70) + '\n');
}
