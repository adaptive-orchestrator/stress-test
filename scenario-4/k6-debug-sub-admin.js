import http from 'k6/http';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';

// Debug: Test subscription with admin user (bypasses customerId check)
const BASE_URL = __ENV.BASE_URL || 'http://ae081c86deee14a10bdf2bc9a9c88fdb-726197963.ap-southeast-1.elb.amazonaws.com';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function() {
  const headers = { 'Content-Type': 'application/json' };
  
  // 1. Login with ADMIN user (admin bypasses customerId check)
  console.log('--- Step 1: Login with ADMIN ---');
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'stresstest1@demo.com', password: 'Test@123456' }),
    { headers }
  );
  
  console.log(`Login status: ${loginRes.status}`);
  
  const loginData = JSON.parse(loginRes.body);
  const token = loginData.accessToken || loginData.access_token;
  
  const parts = token.split('.');
  const payload = JSON.parse(encoding.b64decode(parts[1], 'rawstd', 's'));
  console.log(`Role: ${payload.role}`);
  console.log(`userId: ${payload.sub}`);
  
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  
  // 2. Get subtest1 customer ID
  console.log('\n--- Step 2: Find Customer ID for subtest1 ---');
  const customersRes = http.get(`${BASE_URL}/customers?page=1&limit=100`, { headers: authHeaders });
  const customersData = JSON.parse(customersRes.body);
  const customers = customersData.customers || [];
  
  let customerId = null;
  for (const c of customers) {
    if (c.email === 'subtest1@demo.com') {
      customerId = c.id;
      console.log(`✓ Found customer: ${c.id} (email: ${c.email})`);
      break;
    }
  }
  
  if (!customerId) {
    console.log('Customer not found');
    return;
  }
  
  // 3. Get plans
  console.log('\n--- Step 3: Get Plans ---');
  const plansRes = http.get(`${BASE_URL}/catalogue/plans`, { headers: authHeaders });
  const plansData = JSON.parse(plansRes.body);
  const plans = plansData.plans || [];
  
  const plan = plans[0];
  console.log(`Using plan: ${plan.id} - ${plan.name}`);
  
  // 4. Create subscription AS ADMIN for customer
  console.log('\n--- Step 4: Create Subscription (Admin creating for customer) ---');
  const subscription = {
    customerId: customerId,
    planId: plan.id,
    useTrial: false,
  };
  
  console.log(`Payload: ${JSON.stringify(subscription)}`);
  
  const createSubRes = http.post(`${BASE_URL}/subscriptions`, JSON.stringify(subscription), { headers: authHeaders });
  console.log(`Create subscription status: ${createSubRes.status}`);
  console.log(`Response: ${createSubRes.body}`);
  
  if (createSubRes.status === 201 || createSubRes.status === 200) {
    console.log('\n✓✓✓ SUBSCRIPTION CREATED SUCCESSFULLY! ✓✓✓');
    
    // Parse subscription details
    const subData = JSON.parse(createSubRes.body);
    console.log(`Subscription ID: ${subData?.subscription?.id}`);
    console.log(`Status: ${subData?.subscription?.status}`);
  }
  
  console.log('\n--- Debug Complete ---');
}
