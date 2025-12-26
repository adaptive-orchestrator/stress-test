import http from 'k6/http';
import encoding from 'k6/encoding';

const BASE_URL = 'http://ae081c86deee14a10bdf2bc9a9c88fdb-726197963.ap-southeast-1.elb.amazonaws.com';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  // Step 1: Login
  console.log('--- Step 1: Login ---');
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: 'debugtest123@test.com',
    password: 'Test123!'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (loginRes.status !== 200) {
    console.log('Login failed:', loginRes.body);
    return;
  }
  
  const loginData = JSON.parse(loginRes.body);
  const token = loginData.accessToken;
  console.log('Login OK');
  
  // Decode JWT to get userId
  const decoded = decodeJWT(token);
  console.log('JWT sub (userId):', decoded.sub);
  console.log('JWT email:', decoded.email);
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  
  // Step 2: Check customer by email
  console.log('\n--- Step 2: Check Customer by Email ---');
  const customerEmailRes = http.get(`${BASE_URL}/customers/email/${decoded.email}`, { headers });
  console.log('Customer by email status:', customerEmailRes.status);
  if (customerEmailRes.status === 200) {
    const customerData = JSON.parse(customerEmailRes.body);
    console.log('Customer ID:', customerData.id);
    console.log('Customer userId:', customerData.userId);
    console.log('Match JWT sub?', customerData.userId === decoded.sub);
  } else {
    console.log('Response:', customerEmailRes.body);
  }
  
  // Step 3: Get a plan
  console.log('\n--- Step 3: Get Plan ---');
  const plansRes = http.get(`${BASE_URL}/catalogue/plans?limit=1`, { headers });
  if (plansRes.status !== 200) {
    console.log('Get plans failed');
    return;
  }
  const plans = JSON.parse(plansRes.body).plans;
  const planId = plans[0].id;
  console.log('Using planId:', planId);
  
  // Step 4: Create subscription (NO customerId - let server set it)
  console.log('\n--- Step 4: Create Subscription (without customerId) ---');
  const subPayload1 = {
    planId: planId,
    useTrial: false
  };
  console.log('Payload:', JSON.stringify(subPayload1));
  
  const subRes1 = http.post(`${BASE_URL}/subscriptions`, JSON.stringify(subPayload1), { headers });
  console.log('Status:', subRes1.status);
  console.log('Response:', subRes1.body);
  
  // Step 5: Try with customerId = JWT sub (userId)
  console.log('\n--- Step 5: Create Subscription (with customerId = userId) ---');
  const subPayload2 = {
    customerId: decoded.sub,
    planId: planId,
    useTrial: false
  };
  console.log('Payload:', JSON.stringify(subPayload2));
  
  const subRes2 = http.post(`${BASE_URL}/subscriptions`, JSON.stringify(subPayload2), { headers });
  console.log('Status:', subRes2.status);
  console.log('Response:', subRes2.body);
  
  console.log('\n--- Debug Complete ---');
}

function decodeJWT(token) {
  const payload = token.split('.')[1];
  // Add padding if needed
  let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const decoded = encoding.b64decode(base64, 'std', 's');
  return JSON.parse(decoded);
}
