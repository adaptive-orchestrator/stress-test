import http from 'k6/http';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';

// Debug subscription operations
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
  
  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.log(`Login failed: ${loginRes.body}`);
    return;
  }
  
  const loginData = JSON.parse(loginRes.body);
  const token = loginData.accessToken || loginData.access_token;
  
  const parts = token.split('.');
  const payload = JSON.parse(encoding.b64decode(parts[1], 'rawstd', 's'));
  console.log(`JWT payload: ${JSON.stringify(payload)}`);
  
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  
  // 2. Get available plans
  console.log('\n--- Step 2: Get Plans ---');
  const plansRes = http.get(`${BASE_URL}/catalogue/plans`, { headers: authHeaders });
  console.log(`Plans status: ${plansRes.status}`);
  
  if (plansRes.status !== 200) {
    console.log(`Plans failed: ${plansRes.body}`);
    return;
  }
  
  const plansData = JSON.parse(plansRes.body);
  const plans = plansData.plans || [];
  console.log(`Found ${plans.length} plans`);
  
  if (plans.length === 0) {
    console.log('No plans found!');
    return;
  }
  
  const plan = plans[0];
  console.log(`Using plan: ${plan.id} - ${plan.name} - ${plan.price}`);
  
  // 3. Get my subscriptions
  console.log('\n--- Step 3: Get My Subscriptions ---');
  const mysubs = http.get(`${BASE_URL}/subscriptions/my`, { headers: authHeaders });
  console.log(`My subscriptions status: ${mysubs.status}`);
  console.log(`Response: ${mysubs.body}`);
  
  // 4. Try to create a subscription
  console.log('\n--- Step 4: Create Subscription ---');
  const subscription = {
    planId: plan.id,
    useTrial: false,
  };
  
  console.log(`Subscription payload: ${JSON.stringify(subscription)}`);
  
  const createSubRes = http.post(`${BASE_URL}/subscriptions`, JSON.stringify(subscription), { headers: authHeaders });
  console.log(`Create subscription status: ${createSubRes.status}`);
  console.log(`Response: ${createSubRes.body}`);
  
  if (createSubRes.status === 201 || createSubRes.status === 200) {
    console.log('\n✓ Subscription created successfully!');
    
    const subData = JSON.parse(createSubRes.body);
    const subId = subData?.subscription?.id;
    
    if (subId) {
      // 5. Try to get subscription by ID
      console.log('\n--- Step 5: Get Subscription by ID ---');
      const getSubRes = http.get(`${BASE_URL}/subscriptions/${subId}`, { headers: authHeaders });
      console.log(`Get subscription status: ${getSubRes.status}`);
      console.log(`Response: ${getSubRes.body}`);
      
      // 6. Try to cancel subscription
      console.log('\n--- Step 6: Cancel Subscription ---');
      const cancelRes = http.patch(`${BASE_URL}/subscriptions/${subId}/cancel`, JSON.stringify({}), { headers: authHeaders });
      console.log(`Cancel subscription status: ${cancelRes.status}`);
      console.log(`Response: ${cancelRes.body}`);
    }
  } else {
    console.log('\n✗ Subscription creation failed');
    
    // Try different endpoints
    console.log('\n--- Trying alternative endpoints ---');
    
    const endpoints = [
      { method: 'POST', url: '/subscriptions/create' },
      { method: 'POST', url: '/subscription' },
      { method: 'POST', url: '/subscriptions/my' },
    ];
    
    for (const ep of endpoints) {
      const res = http.post(`${BASE_URL}${ep.url}`, JSON.stringify(subscription), { headers: authHeaders });
      console.log(`${ep.method} ${ep.url}: ${res.status}`);
      if (res.status === 201 || res.status === 200) {
        console.log(`✓ Found working endpoint: ${ep.url}`);
        console.log(`Response: ${res.body}`);
        break;
      }
    }
  }
  
  console.log('\n--- Debug Complete ---');
}
