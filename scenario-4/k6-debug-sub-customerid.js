import http from 'k6/http';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';

// Debug: Test subscription with correct customerId
const BASE_URL = __ENV.BASE_URL || 'http://ae081c86deee14a10bdf2bc9a9c88fdb-726197963.ap-southeast-1.elb.amazonaws.com';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function() {
  const headers = { 'Content-Type': 'application/json' };
  
  // 1. Login with subscription test user
  console.log('--- Step 1: Login ---');
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'subtest1@demo.com', password: 'Test@123456' }),
    { headers }
  );
  
  console.log(`Login status: ${loginRes.status}`);
  
  const loginData = JSON.parse(loginRes.body);
  const token = loginData.accessToken || loginData.access_token;
  
  const parts = token.split('.');
  const payload = JSON.parse(encoding.b64decode(parts[1], 'rawstd', 's'));
  const userId = payload.sub || payload.userId;
  const email = payload.email;
  
  console.log(`Auth userId: ${userId}`);
  console.log(`Email: ${email}`);
  
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  
  // 2. Get customers to find matching customer.id
  console.log('\n--- Step 2: Find Customer ID ---');
  const customersRes = http.get(`${BASE_URL}/customers?page=1&limit=100`, { headers: authHeaders });
  console.log(`Customers status: ${customersRes.status}`);
  
  if (customersRes.status !== 200) {
    console.log(`Failed to get customers: ${customersRes.body}`);
    return;
  }
  
  const customersData = JSON.parse(customersRes.body);
  const customers = customersData.customers || [];
  
  // Find customer matching userId or email
  let customerId = null;
  for (const c of customers) {
    if (c.userId === userId || c.email === email) {
      customerId = c.id;
      console.log(`✓ Found customer: ${c.id} (userId: ${c.userId}, email: ${c.email})`);
      break;
    }
  }
  
  if (!customerId) {
    console.log(`✗ No customer found for userId: ${userId} or email: ${email}`);
    console.log('First 3 customers:');
    for (const c of customers.slice(0, 3)) {
      console.log(`  - ID: ${c.id}, userId: ${c.userId}, email: ${c.email}`);
    }
    return;
  }
  
  // 3. Get plans
  console.log('\n--- Step 3: Get Plans ---');
  const plansRes = http.get(`${BASE_URL}/catalogue/plans`, { headers: authHeaders });
  const plansData = JSON.parse(plansRes.body);
  const plans = plansData.plans || [];
  
  if (plans.length === 0) {
    console.log('No plans found');
    return;
  }
  
  const plan = plans[0];
  console.log(`Using plan: ${plan.id} - ${plan.name}`);
  
  // 4. Create subscription WITH CORRECT customerId
  console.log('\n--- Step 4: Create Subscription with CORRECT customerId ---');
  const subscription = {
    customerId: customerId,  // Use customer.id, NOT auth userId
    planId: plan.id,
    useTrial: false,
  };
  
  console.log(`Subscription payload: ${JSON.stringify(subscription)}`);
  
  const createSubRes = http.post(`${BASE_URL}/subscriptions`, JSON.stringify(subscription), { headers: authHeaders });
  console.log(`Create subscription status: ${createSubRes.status}`);
  console.log(`Response: ${createSubRes.body}`);
  
  if (createSubRes.status === 201 || createSubRes.status === 200) {
    console.log('\n✓✓✓ SUBSCRIPTION CREATED SUCCESSFULLY! ✓✓✓');
  } else {
    console.log('\n✗ Subscription creation failed');
  }
  
  // 5. Get my subscriptions
  console.log('\n--- Step 5: Get My Subscriptions ---');
  const mysubs = http.get(`${BASE_URL}/subscriptions/my`, { headers: authHeaders });
  console.log(`My subscriptions status: ${mysubs.status}`);
  console.log(`Response: ${mysubs.body}`);
  
  console.log('\n--- Debug Complete ---');
}
