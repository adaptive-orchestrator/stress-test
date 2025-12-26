import http from 'k6/http';
import { sleep } from 'k6';

// ============================================================================
// SETUP TEST DATA FOR SUBSCRIPTION MODEL STRESS TEST
// Creates test users and their customer profiles
// ============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://ae081c86deee14a10bdf2bc9a9c88fdb-726197963.ap-southeast-1.elb.amazonaws.com';

// Test users to create
const TEST_USERS = [
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

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  console.log('\n=== Setting up test data for Subscription Model ===\n');
  
  let createdUsers = 0;
  let createdCustomers = 0;
  let existingCustomers = 0;
  
  for (const user of TEST_USERS) {
    console.log(`\n--- Processing: ${user.email} ---`);
    
    // Step 1: Try to signup
    const signupRes = http.post(`${BASE_URL}/auth/signup`, JSON.stringify({
      email: user.email,
      password: user.password,
      name: user.name,
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (signupRes.status === 201 || signupRes.status === 200) {
      console.log(`✓ User created: ${user.email}`);
      createdUsers++;
    } else if (signupRes.status === 409 || signupRes.body?.includes('already exists')) {
      console.log(`○ User already exists: ${user.email}`);
    } else {
      console.log(`? Signup status ${signupRes.status}: ${signupRes.body?.substring(0, 100)}`);
    }
    
    // Step 2: Login to get token
    const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
      email: user.email,
      password: user.password,
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (loginRes.status !== 200 && loginRes.status !== 201) {
      console.log(`✗ Login failed for ${user.email}: ${loginRes.status}`);
      continue;
    }
    
    let token;
    try {
      const loginData = JSON.parse(loginRes.body);
      token = loginData.accessToken || loginData.access_token;
    } catch (e) {
      console.log(`✗ Failed to parse login response for ${user.email}`);
      continue;
    }
    
    console.log(`✓ Logged in: ${user.email}`);
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    
    // Step 3: Check if customer exists
    const customerCheckRes = http.get(`${BASE_URL}/customers/email/${encodeURIComponent(user.email)}`, { headers });
    
    if (customerCheckRes.status === 200) {
      try {
        const customerData = JSON.parse(customerCheckRes.body);
        console.log(`○ Customer already exists: ${customerData.id}`);
        existingCustomers++;
        continue;
      } catch (e) {}
    }
    
    // Step 4: Create customer profile
    const createCustomerRes = http.post(`${BASE_URL}/customers`, JSON.stringify({
      email: user.email,
      name: user.name,
      phone: `090${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      address: '123 Test Street, Ho Chi Minh City',
    }), { headers });
    
    if (createCustomerRes.status === 201 || createCustomerRes.status === 200) {
      try {
        const customerData = JSON.parse(createCustomerRes.body);
        console.log(`✓ Customer created: ${customerData.customer?.id || customerData.id}`);
        createdCustomers++;
      } catch (e) {
        console.log(`✓ Customer created (but parse failed)`);
        createdCustomers++;
      }
    } else if (createCustomerRes.status === 409) {
      console.log(`○ Customer already exists`);
      existingCustomers++;
    } else {
      console.log(`✗ Failed to create customer: ${createCustomerRes.status} - ${createCustomerRes.body?.substring(0, 100)}`);
    }
    
    sleep(0.2); // Small delay between operations
  }
  
  console.log('\n=== Summary ===');
  console.log(`Users created: ${createdUsers}`);
  console.log(`Customers created: ${createdCustomers}`);
  console.log(`Existing customers: ${existingCustomers}`);
  console.log(`Total test users: ${TEST_USERS.length}`);
  console.log('\n=== Setup complete ===\n');
}
