import http from 'k6/http';
import { sleep } from 'k6';

const BASE_URL = 'http://ae081c86deee14a10bdf2bc9a9c88fdb-726197963.ap-southeast-1.elb.amazonaws.com';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const uniqueId = `debug${Date.now()}`;
  const email = `${uniqueId}@test.com`;
  const password = 'Test123!';
  
  // Step 1: Register a new user
  console.log('--- Step 1: Register New User ---');
  const registerRes = http.post(`${BASE_URL}/auth/register`, JSON.stringify({
    email: email,
    password: password,
    firstName: 'Debug',
    lastName: 'User'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('Register status:', registerRes.status);
  
  if (registerRes.status !== 200 && registerRes.status !== 201) {
    console.log('Register failed:', registerRes.body);
    return;
  }
  
  const registerData = JSON.parse(registerRes.body);
  const token = registerData.accessToken;
  const userId = registerData.user?.id || registerData.id;
  const role = registerData.user?.role || registerData.role;
  console.log('Registered userId:', userId, 'role:', role);
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  
  // Skip login since we already have token from register
  
  // Step 2: Get customer for this user
  console.log('\n--- Step 2: Get Customer ID for admin user ---');
  const customersRes = http.get(`${BASE_URL}/customers?limit=10`, { headers });
  console.log('Customers status:', customersRes.status);
  
  let customerId = null;
  if (customersRes.status === 200) {
    const cusData = JSON.parse(customersRes.body);
    // Find customer by email matching admin
    const customers = cusData.customers || cusData.data || [];
    const adminCustomer = customers.find(c => c.email === 'stresstest1@demo.com');
    if (adminCustomer) {
      customerId = adminCustomer.id;
      console.log('Found admin customer.id:', customerId);
    } else if (customers.length > 0) {
      customerId = customers[0].id;
      console.log('Using first customer.id:', customerId);
    }
  }
  
  if (!customerId) {
    console.log('No customer found!');
    return;
  }
  
  // Step 3: Get plans
  console.log('\n--- Step 3: Get Plans ---');
  const plansRes = http.get(`${BASE_URL}/catalogue/plans?limit=5`, { headers });
  console.log('Plans status:', plansRes.status);
  
  let planId = null;
  if (plansRes.status === 200) {
    const plansData = JSON.parse(plansRes.body);
    const plans = plansData.plans || plansData.data || [];
    if (plans.length > 0) {
      planId = plans[0].id;
      console.log('Using planId:', planId, '- name:', plans[0].name);
    }
  }
  
  if (!planId) {
    console.log('No plan found!');
    return;
  }
  
  // Step 4: Try creating subscription WITHOUT customerId (let server default)
  console.log('\n--- Step 4: Create Subscription WITHOUT customerId (default to userId) ---');
  const payload1 = {
    planId: planId,
    useTrial: false
  };
  console.log('Payload:', JSON.stringify(payload1));
  
  const sub1Res = http.post(`${BASE_URL}/subscriptions`, JSON.stringify(payload1), { headers });
  console.log('Status:', sub1Res.status);
  console.log('Response:', sub1Res.body);
  
  // Step 5: Try with customerId = userId (should fail customer lookup)
  console.log('\n--- Step 5: Create Subscription with customerId = userId ---');
  const payload2 = {
    customerId: userId,
    planId: planId,
    useTrial: false
  };
  console.log('Payload:', JSON.stringify(payload2));
  
  const sub2Res = http.post(`${BASE_URL}/subscriptions`, JSON.stringify(payload2), { headers });
  console.log('Status:', sub2Res.status);
  console.log('Response:', sub2Res.body);
  
  // Step 6: Try with customerId = customer.id (should work for admin)
  console.log('\n--- Step 6: Create Subscription with customerId = customer.id ---');
  const payload3 = {
    customerId: customerId,
    planId: planId,
    useTrial: false
  };
  console.log('Payload:', JSON.stringify(payload3));
  
  const sub3Res = http.post(`${BASE_URL}/subscriptions`, JSON.stringify(payload3), { headers });
  console.log('Status:', sub3Res.status);
  console.log('Response:', sub3Res.body);
  
  console.log('\n--- Debug Complete ---');
}
