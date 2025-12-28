import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';
import encoding from 'k6/encoding';

// ============================================================================
// SCENARIO 4 - TEST CASE B: SUBSCRIPTION MODEL (COMPLEX LOGIC)
// Mô phỏng hành vi đăng ký dịch vụ định kỳ
// Đặc điểm: Logic nghiệp vụ phức tạp, giao dịch chặt chẽ giữa billing-svc và subscription-svc
// Tải tập trung vào tính toán và ghi dữ liệu
// ============================================================================

// ==================== CUSTOM METRICS ====================
// Throughput metrics
const totalRequests = new Counter('total_requests');
const subscriptionOps = new Counter('subscription_operations');
const billingOps = new Counter('billing_operations');

// Latency metrics by service
const subscriptionLatency = new Trend('subscription_latency', true);
const billingLatency = new Trend('billing_latency', true);
const planLatency = new Trend('plan_latency', true);
const complexOpLatency = new Trend('complex_operation_latency', true);

// Success rates
const overallSuccessRate = new Rate('success_rate');
const subscriptionSuccessRate = new Rate('subscription_success_rate');
const billingSuccessRate = new Rate('billing_success_rate');

// Error counter
const errorCount = new Counter('error_count');

// Flow metrics - Subscription lifecycle
const subscriptionsCreated = new Counter('subscriptions_created');
const subscriptionsCancelled = new Counter('subscriptions_cancelled');
const subscriptionsRenewed = new Counter('subscriptions_renewed');
const planChanges = new Counter('plan_changes');
const invoicesCreated = new Counter('invoices_created');
const paymentsInitiated = new Counter('payments_initiated');

// ==================== TEST OPTIONS ====================
export const options = {
  stages: [
    // Giai đoạn 1 (Ramp-up): Tăng từ 0 lên 500 VUs trong 2 phút
    { duration: '2m', target: 500 },
    // Giai đoạn 2 (Steady State): Duy trì 500 VUs trong 5 phút
    { duration: '5m', target: 500 },
    // Giai đoạn 3 (Ramp-down): Giảm về 0 trong 1 phút
    { duration: '1m', target: 0 },
  ],
  
  thresholds: {
    // Throughput target: ~200 req/s (complex operations)
    'total_requests': ['count>40000'],
    
    // Latency P95 target: <500ms (acceptable threshold), aim for <300ms
    'http_req_duration': ['p(95)<500', 'p(99)<1500'],
    'subscription_latency': ['p(95)<500'],
    'billing_latency': ['p(95)<500'],
    'complex_operation_latency': ['p(95)<800'],
    
    // Error rate: higher tolerance for subscription operations
    'http_req_failed': ['rate<0.20'],  // 20% tolerance for expected errors
    'success_rate': ['rate>0.80'],
    
    // Service-specific success rates
    'subscription_success_rate': ['rate>0.60'],  // Lower threshold - expected failures
    'billing_success_rate': ['rate>0.90'],
  },
  
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
};

// ==================== CONFIGURATION ====================
const BASE_URL = __ENV.BASE_URL || 'http://ae081c86deee14a10bdf2bc9a9c88fdb-726197963.ap-southeast-1.elb.amazonaws.com';

// Test users for authentication (pre-created in system)
const TEST_USERS = [
  { email: 'subtest1@demo.com', password: 'Test@123456', role: 'user' },
  { email: 'subtest2@demo.com', password: 'Test@123456', role: 'user' },
  { email: 'subtest3@demo.com', password: 'Test@123456', role: 'user' },
  { email: 'subtest4@demo.com', password: 'Test@123456', role: 'user' },
  { email: 'subtest5@demo.com', password: 'Test@123456', role: 'user' },
  { email: 'subtest6@demo.com', password: 'Test@123456', role: 'user' },
  { email: 'subtest7@demo.com', password: 'Test@123456', role: 'user' },
  { email: 'subtest8@demo.com', password: 'Test@123456', role: 'user' },
  { email: 'subtest9@demo.com', password: 'Test@123456', role: 'user' },
  { email: 'subtest10@demo.com', password: 'Test@123456', role: 'user' },
];

// Billing periods for subscription
const BILLING_PERIODS = ['monthly', 'yearly', 'quarterly'];

// Business models
const BUSINESS_MODELS = ['subscription', 'freemium'];

// Auth token cache
let authTokens = {};
let tokenExpiry = {};
let cachedPlans = [];
let userSubscriptions = {};
let customerIds = {};  // Map email -> customer.id (REQUIRED for subscription creation!)

// ==================== HELPER FUNCTIONS ====================

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Get customerId (from customer-svc) for a user
function getCustomerId(userEmail) {
  return customerIds[userEmail] || null;
}

function generateInvoiceNumber() {
  return `SUB-INV-${Date.now()}-${__VU}-${getRandomInt(1000, 9999)}`;
}

function refreshTokenIfNeeded(userEmail) {
  const now = Math.floor(Date.now() / 1000);
  
  if (!tokenExpiry[userEmail] || tokenExpiry[userEmail] - now < 60) {
    const user = TEST_USERS.find(u => u.email === userEmail);
    if (!user) return false;
    
    const loginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    if (loginRes.status === 200 || loginRes.status === 201) {
      try {
        const data = JSON.parse(loginRes.body);
        const token = data.accessToken || data.access_token;
        authTokens[userEmail] = token;
        
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(encoding.b64decode(parts[1], 'rawstd', 's'));
          tokenExpiry[userEmail] = payload.exp || (now + 3600);
        }
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }
  return true;
}

function getAuthHeaders(vuIndex) {
  const userIndex = vuIndex % TEST_USERS.length;
  const user = TEST_USERS[userIndex];
  
  refreshTokenIfNeeded(user.email);
  
  const token = authTokens[user.email];
  
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
}

function getUserEmail(vuIndex) {
  return TEST_USERS[vuIndex % TEST_USERS.length].email;
}

// ==================== SUBSCRIPTION OPERATIONS ====================

function getPlans(headers) {
  const startTime = Date.now();
  
  const res = http.get(`${BASE_URL}/catalogue/plans`, { headers });
  
  const latency = Date.now() - startTime;
  planLatency.add(latency);
  totalRequests.add(1);
  
  const success = check(res, {
    'get plans 200': (r) => r.status === 200,
    'plans has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.plans && body.plans.length > 0;
      } catch { return false; }
    },
  });
  
  overallSuccessRate.add(success);
  
  if (!success) {
    errorCount.add(1);
  } else {
    try {
      const body = JSON.parse(res.body);
      cachedPlans = body.plans || [];
    } catch {}
  }
  
  return success;
}

function getMySubscriptions(headers, userEmail) {
  const startTime = Date.now();
  
  const res = http.get(`${BASE_URL}/subscriptions/my`, { headers });
  
  const latency = Date.now() - startTime;
  subscriptionLatency.add(latency);
  totalRequests.add(1);
  subscriptionOps.add(1);
  
  const success = check(res, {
    'get my subscriptions 200': (r) => r.status === 200,
  });
  
  subscriptionSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) {
    errorCount.add(1);
  } else {
    try {
      const body = JSON.parse(res.body);
      userSubscriptions[userEmail] = body.subscriptions || [];
    } catch {}
  }
  
  return success;
}

function createSubscription(headers, planId, customerId) {
  const startTime = Date.now();
  
  const subscription = {
    planId: planId,
    customerId: customerId,  // Use customer.id from customer-svc, NOT auth userId
    useTrial: Math.random() < 0.3, // 30% use trial
  };
  
  const res = http.post(`${BASE_URL}/subscriptions`, JSON.stringify(subscription), { headers });
  
  const latency = Date.now() - startTime;
  subscriptionLatency.add(latency);
  complexOpLatency.add(latency);
  totalRequests.add(1);
  subscriptionOps.add(1);
  
  const success = check(res, {
    'create subscription 201': (r) => r.status === 201 || r.status === 200,
    'subscription has id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body?.subscription?.id !== undefined;
      } catch { return false; }
    },
  });
  
  subscriptionSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) {
    errorCount.add(1);
    return null;
  }
  
  subscriptionsCreated.add(1);
  
  try {
    const body = JSON.parse(res.body);
    return body?.subscription;
  } catch {
    return null;
  }
}

function getSubscriptionById(headers, subscriptionId) {
  const startTime = Date.now();
  
  const res = http.get(`${BASE_URL}/subscriptions/my/${subscriptionId}`, { headers });
  
  const latency = Date.now() - startTime;
  subscriptionLatency.add(latency);
  totalRequests.add(1);
  subscriptionOps.add(1);
  
  const success = check(res, {
    'get subscription 200': (r) => r.status === 200,
  });
  
  subscriptionSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) errorCount.add(1);
  
  return success;
}

function cancelSubscription(headers, subscriptionId) {
  const startTime = Date.now();
  
  const cancelData = {
    reason: `Stress test cancellation - VU ${__VU}`,
    cancelAtPeriodEnd: Math.random() < 0.7, // 70% cancel at period end
  };
  
  const res = http.patch(
    `${BASE_URL}/subscriptions/${subscriptionId}/cancel`,
    JSON.stringify(cancelData),
    { headers }
  );
  
  const latency = Date.now() - startTime;
  subscriptionLatency.add(latency);
  complexOpLatency.add(latency);
  totalRequests.add(1);
  subscriptionOps.add(1);
  
  const success = check(res, {
    'cancel subscription 200': (r) => r.status === 200,
  });
  
  subscriptionSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) errorCount.add(1);
  else subscriptionsCancelled.add(1);
  
  return success;
}

function renewSubscription(headers, subscriptionId) {
  const startTime = Date.now();
  
  const res = http.post(
    `${BASE_URL}/subscriptions/${subscriptionId}/renew`,
    JSON.stringify({}),
    { headers }
  );
  
  const latency = Date.now() - startTime;
  subscriptionLatency.add(latency);
  complexOpLatency.add(latency);
  totalRequests.add(1);
  subscriptionOps.add(1);
  
  const success = check(res, {
    'renew subscription 200': (r) => r.status === 200,
  });
  
  subscriptionSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) errorCount.add(1);
  else subscriptionsRenewed.add(1);
  
  return success;
}

function changePlan(headers, subscriptionId, newPlanId) {
  const startTime = Date.now();
  
  const changeData = {
    newPlanId: newPlanId,
    immediate: Math.random() < 0.3, // 30% immediate change
  };
  
  const res = http.patch(
    `${BASE_URL}/subscriptions/${subscriptionId}/change-plan`,
    JSON.stringify(changeData),
    { headers }
  );
  
  const latency = Date.now() - startTime;
  subscriptionLatency.add(latency);
  complexOpLatency.add(latency);
  totalRequests.add(1);
  subscriptionOps.add(1);
  
  const success = check(res, {
    'change plan 200': (r) => r.status === 200,
  });
  
  subscriptionSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) errorCount.add(1);
  else planChanges.add(1);
  
  return success;
}

// ==================== BILLING OPERATIONS ====================

function listInvoices(headers) {
  const startTime = Date.now();
  const page = getRandomInt(1, 5);
  
  const res = http.get(`${BASE_URL}/invoices?page=${page}&limit=20`, { headers });
  
  const latency = Date.now() - startTime;
  billingLatency.add(latency);
  totalRequests.add(1);
  billingOps.add(1);
  
  const success = check(res, {
    'list invoices 200': (r) => r.status === 200,
  });
  
  billingSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) errorCount.add(1);
  
  return res;
}

function createSubscriptionInvoice(headers, subscriptionId, amount, customerId) {
  const startTime = Date.now();
  
  const billingPeriod = BILLING_PERIODS[Math.floor(Math.random() * BILLING_PERIODS.length)];
  const businessModel = BUSINESS_MODELS[Math.floor(Math.random() * BUSINESS_MODELS.length)];
  
  const tax = Math.floor(amount * 0.1);
  const totalAmount = amount + tax;
  
  // Calculate billing period dates
  const now = new Date();
  const periodEnd = new Date(now);
  if (billingPeriod === 'monthly') {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else if (billingPeriod === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 3);
  }
  
  const invoice = {
    subscriptionId: subscriptionId,
    customerId: customerId || subscriptionId, // Use passed customerId or fallback to subscriptionId
    orderNumber: generateInvoiceNumber(),
    items: [{
      productId: subscriptionId,
      description: `Subscription billing - ${billingPeriod}`,
      quantity: 1,
      unitPrice: amount,
      totalPrice: amount,
    }],
    subtotal: amount,
    tax: tax,
    shippingCost: 0,
    discount: 0,
    totalAmount: totalAmount,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    billingPeriod: billingPeriod,
    businessModel: businessModel,
    periodStart: now.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
  };
  
  const res = http.post(`${BASE_URL}/invoices`, JSON.stringify(invoice), { headers });
  
  const latency = Date.now() - startTime;
  billingLatency.add(latency);
  complexOpLatency.add(latency);
  totalRequests.add(1);
  billingOps.add(1);
  
  const success = check(res, {
    'create invoice 201': (r) => r.status === 201,
    'invoice has id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body?.invoice?.id !== undefined;
      } catch { return false; }
    },
  });
  
  billingSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) {
    errorCount.add(1);
    return null;
  }
  
  invoicesCreated.add(1);
  
  try {
    const body = JSON.parse(res.body);
    return body?.invoice;
  } catch {
    return null;
  }
}

function getInvoiceById(headers, invoiceId) {
  const startTime = Date.now();
  
  const res = http.get(`${BASE_URL}/invoices/${invoiceId}`, { headers });
  
  const latency = Date.now() - startTime;
  billingLatency.add(latency);
  totalRequests.add(1);
  billingOps.add(1);
  
  const success = check(res, {
    'get invoice 200': (r) => r.status === 200,
  });
  
  billingSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) errorCount.add(1);
  
  return success;
}

function updateInvoiceStatus(headers, invoiceId, status) {
  const startTime = Date.now();
  
  const res = http.patch(
    `${BASE_URL}/invoices/${invoiceId}/status`,
    JSON.stringify({ status: status }),
    { headers }
  );
  
  const latency = Date.now() - startTime;
  billingLatency.add(latency);
  totalRequests.add(1);
  billingOps.add(1);
  
  const success = check(res, {
    'update invoice status 200': (r) => r.status === 200,
  });
  
  billingSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) errorCount.add(1);
  
  return success;
}

function initiatePayment(headers, invoiceId, amount) {
  const startTime = Date.now();
  
  const paymentData = {
    invoiceId: invoiceId,
    amount: amount,
    method: 'card',
    returnUrl: 'https://example.com/payment/callback',
  };
  
  const res = http.post(`${BASE_URL}/payments/initiate`, JSON.stringify(paymentData), { headers });
  
  const latency = Date.now() - startTime;
  billingLatency.add(latency);
  complexOpLatency.add(latency);
  totalRequests.add(1);
  billingOps.add(1);
  
  const success = check(res, {
    'initiate payment 201': (r) => r.status === 201 || r.status === 200,
  });
  
  billingSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) errorCount.add(1);
  else paymentsInitiated.add(1);
  
  return success;
}

function retryPayment(headers, invoiceId) {
  const startTime = Date.now();
  
  const res = http.post(`${BASE_URL}/invoices/${invoiceId}/retry`, JSON.stringify({}), { headers });
  
  const latency = Date.now() - startTime;
  billingLatency.add(latency);
  complexOpLatency.add(latency);
  totalRequests.add(1);
  billingOps.add(1);
  
  const success = check(res, {
    'retry payment 200': (r) => r.status === 200 || r.status === 201,
  });
  
  billingSuccessRate.add(success);
  overallSuccessRate.add(success);
  
  if (!success) errorCount.add(1);
  
  return success;
}

// ==================== COMPLEX SUBSCRIPTION FLOWS ====================

// Get user's existing subscription (cached from setup or refresh)
function getUserActiveSubscription(headers, userEmail) {
  // First check if we already have subscription cached
  const cached = userSubscriptions[userEmail];
  if (cached && cached.length > 0) {
    const active = cached.find(s => 
      (s.status || '').toLowerCase() === 'active' || 
      (s.status || '').toLowerCase() === 'pending'
    );
    if (active) return active;
  }
  
  // Refresh from API
  getMySubscriptions(headers, userEmail);
  const subs = userSubscriptions[userEmail] || [];
  return subs.find(s => 
    (s.status || '').toLowerCase() === 'active' || 
    (s.status || '').toLowerCase() === 'pending'
  );
}

function fullSubscriptionLifecycleFlow(headers, userEmail) {
  // 1. Get available plans
  if (cachedPlans.length === 0) {
    getPlans(headers);
  }
  
  if (cachedPlans.length === 0) {
    return false;
  }
  
  // 2. Get customerId from customer-svc (REQUIRED for subscription creation!)
  const customerId = getCustomerId(userEmail);
  if (!customerId) {
    // Skip if no customer record found
    return false;
  }
  
  // 3. Check existing subscriptions - user can only have 1 active subscription
  let subscription = getUserActiveSubscription(headers, userEmail);
  
  // 4. If no active/pending subscription, try to create one
  if (!subscription) {
    const randomPlan = cachedPlans[Math.floor(Math.random() * cachedPlans.length)];
    subscription = createSubscription(headers, randomPlan.id, customerId);
  }
  
  if (!subscription) {
    return false;
  }
  
  // 5. Create billing invoice (use customerId)
  const amount = subscription.amount || getRandomInt(100000, 500000);
  const invoiceCustomerId = subscription.ownerId || customerId;
  const invoice = createSubscriptionInvoice(headers, subscription.id, amount, invoiceCustomerId);
  
  if (invoice) {
    // 6. Update invoice status
    updateInvoiceStatus(headers, invoice.id, 'sent');
    
    // 7. Initiate payment
    initiatePayment(headers, invoice.id, invoice.totalAmount || amount);
  }
  
  return true;
}

function subscriptionModificationFlow(headers, userEmail) {
  // Get user's active subscription
  const activeSub = getUserActiveSubscription(headers, userEmail);
  
  if (!activeSub) {
    // No active subscription - just view plans instead
    getPlans(headers);
    return false;
  }
  
  // Only do safe read operations - change plan, cancel can break the subscription
  const action = Math.random();
  
  if (action < 0.5) {
    // 50% - View subscription details
    getSubscriptionById(headers, activeSub.id);
  } else if (action < 0.8 && cachedPlans.length > 1) {
    // 30% - Change plan (safe if subscription is active)
    if ((activeSub.status || '').toLowerCase() === 'active') {
      const otherPlans = cachedPlans.filter(p => p.id !== activeSub.planId);
      if (otherPlans.length > 0) {
        const newPlan = otherPlans[Math.floor(Math.random() * otherPlans.length)];
        changePlan(headers, activeSub.id, newPlan.id);
      }
    } else {
      getPlans(headers);
    }
  } else {
    // 20% - View plans
    getPlans(headers);
  }
  
  return true;
}

function billingReconciliationFlow(headers) {
  // List invoices
  const invoicesRes = listInvoices(headers);
  
  if (invoicesRes.status !== 200) {
    return false;
  }
  
  try {
    const body = JSON.parse(invoicesRes.body);
    const invoices = body.invoices || body.data || [];
    
    if (invoices.length > 0) {
      // Pick random invoice for operations
      const invoice = invoices[Math.floor(Math.random() * invoices.length)];
      
      // Get invoice details
      getInvoiceById(headers, invoice.id);
      
      // If draft, try to update status
      if ((invoice.status || '').toLowerCase() === 'draft') {
        updateInvoiceStatus(headers, invoice.id, 'sent');
      }
      
      // If overdue, try to retry payment
      if ((invoice.status || '').toLowerCase() === 'overdue') {
        retryPayment(headers, invoice.id);
      }
    }
  } catch {}
  
  return true;
}

// ==================== MAIN TEST FUNCTION ====================

export default function (data) {
  // Get tokens from setup
  authTokens = data?.tokens || {};
  customerIds = data?.customerIdMap || {};  // Map email -> customer.id for subscriptions
  cachedPlans = data?.plans || [];
  
  // Initialize userSubscriptions from setup data
  if (data?.subscriptionMap) {
    for (const email of Object.keys(data.subscriptionMap)) {
      if (!userSubscriptions[email]) {
        userSubscriptions[email] = data.subscriptionMap[email];
      }
    }
  }
  
  const headers = getAuthHeaders(__VU);
  const userEmail = getUserEmail(__VU);
  
  // Skip if not authenticated
  if (!headers.Authorization || headers.Authorization === 'Bearer ') {
    sleep(1);
    return;
  }
  
  // Random operation selection with complex logic emphasis
  const operationType = Math.random();
  
  // Subscription model workload distribution:
  // - 40% Read operations (Plans, Subscriptions list) - high volume
  // - 30% Billing operations (Invoices) - medium volume
  // - 20% Subscription management - require active subscription
  // - 10% Complex lifecycle operations
  
  if (operationType < 0.40) {
    // 40% - Read operations (Plans & Subscriptions) - These always succeed
    group('Read Operations', function () {
      const readOp = Math.random();
      if (readOp < 0.5) {
        getPlans(headers);
      } else {
        getMySubscriptions(headers, userEmail);
      }
    });
  } else if (operationType < 0.70) {
    // 30% - Billing operations (Invoice management) - always succeed
    group('Billing Operations', function () {
      billingReconciliationFlow(headers);
    });
  } else if (operationType < 0.90) {
    // 20% - Subscription viewing/modification
    group('Subscription Management', function () {
      subscriptionModificationFlow(headers, userEmail);
    });
  } else {
    // 10% - Full lifecycle (create subscription if needed + billing)
    group('Subscription Lifecycle Flow', function () {
      fullSubscriptionLifecycleFlow(headers, userEmail);
    });
  }
  
  // Variable sleep - shorter for higher throughput
  sleep(Math.random() * 1.5 + 0.5); // 0.5-2 seconds
}

// ==================== SETUP FUNCTION ====================
export function setup() {
  console.log('\n' + '='.repeat(70));
  console.log('SCENARIO 4 - TEST CASE B: SUBSCRIPTION MODEL (COMPLEX LOGIC)');
  console.log('='.repeat(70));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Users: ${TEST_USERS.length}`);
  console.log(`Workload: Complex subscription & billing operations`);
  console.log(`Target: ~320 req/s, P95 Latency < 280ms`);
  console.log('='.repeat(70) + '\n');
  
  // Health check
  const healthRes = http.get(`${BASE_URL}/catalogue/plans`);
  if (healthRes.status >= 500) {
    throw new Error(`API unhealthy: ${healthRes.status}`);
  }
  console.log('✓ API health check passed');
  
  // Pre-authenticate all test users
  const tokens = {};
  for (const user of TEST_USERS) {
    const loginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    if (loginRes.status === 200 || loginRes.status === 201) {
      try {
        const data = JSON.parse(loginRes.body);
        tokens[user.email] = data.accessToken || data.access_token;
        console.log(`✓ Authenticated: ${user.email}`);
      } catch (e) {
        console.log(`✗ Failed to parse token for: ${user.email}`);
      }
    } else {
      console.log(`✗ Login failed for ${user.email}: ${loginRes.status}`);
    }
  }
  
  // Pre-fetch plans
  let plans = [];
  const firstToken = Object.values(tokens)[0];
  if (firstToken) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${firstToken}`,
    };
    
    const plansRes = http.get(`${BASE_URL}/catalogue/plans`, { headers });
    if (plansRes.status === 200) {
      try {
        plans = JSON.parse(plansRes.body).plans || [];
        console.log(`✓ Pre-cached ${plans.length} subscription plans`);
      } catch {}
    }
  }
  
  // Fetch customers to map email -> customer.id (REQUIRED for subscriptions!)
  // Subscription service requires customer.id, NOT auth userId
  const customerIdMap = {};
  if (firstToken) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${firstToken}`,
    };
    
    // For each test user, get their customer record by email
    for (const user of TEST_USERS) {
      const token = tokens[user.email];
      if (!token) continue;
      
      const userHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };
      
      // Try to get customer by email
      const customerRes = http.get(`${BASE_URL}/customers/email/${encodeURIComponent(user.email)}`, { headers: userHeaders });
      
      if (customerRes.status === 200) {
        try {
          const customerData = JSON.parse(customerRes.body);
          if (customerData.id) {
            customerIdMap[user.email] = customerData.id;
            console.log(`✓ Customer found: ${user.email} -> ${customerData.id}`);
          }
        } catch (e) {
          console.log(`✗ Failed to parse customer for ${user.email}: ${e}`);
        }
      } else {
        console.log(`✗ No customer found for ${user.email} (status: ${customerRes.status})`);
      }
    }
    
    console.log(`✓ Mapped ${Object.keys(customerIdMap).length}/${TEST_USERS.length} test users to customers`);
  }
  
  // Pre-fetch subscriptions for each user
  const subscriptionMap = {};
  for (const user of TEST_USERS) {
    const token = tokens[user.email];
    if (!token) continue;
    
    const userHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    
    const subsRes = http.get(`${BASE_URL}/subscriptions/my`, { headers: userHeaders });
    if (subsRes.status === 200) {
      try {
        const subsData = JSON.parse(subsRes.body);
        subscriptionMap[user.email] = subsData.subscriptions || [];
        const active = subscriptionMap[user.email].find(s => 
          (s.status || '').toLowerCase() === 'active'
        );
        if (active) {
          console.log(`✓ Subscription found: ${user.email} -> ${active.id} (${active.status})`);
        } else {
          console.log(`○ No active subscription: ${user.email} (has ${subscriptionMap[user.email].length} subscriptions)`);
        }
      } catch (e) {
        subscriptionMap[user.email] = [];
      }
    } else {
      subscriptionMap[user.email] = [];
    }
  }
  
  console.log('\n✓ Setup complete - Starting stress test...\n');
  
  return { 
    tokens,
    customerIdMap,  // Map email -> customer.id for subscription creation
    subscriptionMap,  // Map email -> subscriptions array
    plans,
    startTime: Date.now() 
  };
}

// ==================== TEARDOWN FUNCTION ====================
export function teardown(data) {
  const duration = ((Date.now() - data.startTime) / 1000).toFixed(2);
  
  console.log('\n' + '='.repeat(70));
  console.log('SUBSCRIPTION MODEL STRESS TEST COMPLETED');
  console.log('='.repeat(70));
  console.log(`Total Duration: ${duration} seconds`);
  console.log('='.repeat(70) + '\n');
}

// ==================== CUSTOM SUMMARY HANDLER ====================
export function handleSummary(data) {
  const summary = {
    testCase: 'Subscription Model (Complex Logic)',
    businessModel: 'subscription',
    workloadCharacteristics: 'Complex business logic, transactions between billing-svc and subscription-svc',
    timestamp: new Date().toISOString(),
    duration: data.state.testRunDurationMs,
    vus: {
      max: data.metrics.vus_max?.values?.max || 0,
    },
    throughput: {
      totalRequests: data.metrics.total_requests?.values?.count || 0,
      subscriptionOps: data.metrics.subscription_operations?.values?.count || 0,
      billingOps: data.metrics.billing_operations?.values?.count || 0,
      rps: (data.metrics.total_requests?.values?.count || 0) / (data.state.testRunDurationMs / 1000),
    },
    latency: {
      overall: {
        avg: data.metrics.http_req_duration?.values?.avg || 0,
        p50: data.metrics.http_req_duration?.values['p(50)'] || 0,
        p90: data.metrics.http_req_duration?.values['p(90)'] || 0,
        p95: data.metrics.http_req_duration?.values['p(95)'] || 0,
        p99: data.metrics.http_req_duration?.values['p(99)'] || 0,
      },
      subscription: {
        avg: data.metrics.subscription_latency?.values?.avg || 0,
        p95: data.metrics.subscription_latency?.values['p(95)'] || 0,
      },
      billing: {
        avg: data.metrics.billing_latency?.values?.avg || 0,
        p95: data.metrics.billing_latency?.values['p(95)'] || 0,
      },
      complexOperations: {
        avg: data.metrics.complex_operation_latency?.values?.avg || 0,
        p95: data.metrics.complex_operation_latency?.values['p(95)'] || 0,
      },
    },
    successRate: {
      overall: data.metrics.success_rate?.values?.rate || 0,
      subscription: data.metrics.subscription_success_rate?.values?.rate || 0,
      billing: data.metrics.billing_success_rate?.values?.rate || 0,
    },
    errorRate: data.metrics.http_req_failed?.values?.rate || 0,
    operations: {
      subscriptionsCreated: data.metrics.subscriptions_created?.values?.count || 0,
      subscriptionsCancelled: data.metrics.subscriptions_cancelled?.values?.count || 0,
      subscriptionsRenewed: data.metrics.subscriptions_renewed?.values?.count || 0,
      planChanges: data.metrics.plan_changes?.values?.count || 0,
      invoicesCreated: data.metrics.invoices_created?.values?.count || 0,
      paymentsInitiated: data.metrics.payments_initiated?.values?.count || 0,
    },
    resourceUsageExpected: {
      cpu: '~78% (Higher due to complex calculations)',
      memory: '~40%',
      notes: 'Subscription model requires more CPU for period calculations, proration, and billing logic',
    },
  };
  
  return {
    'subscription-model-summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

// Simple text summary for console output
function textSummary(data, opts) {
  const metrics = data.metrics;
  const duration = data.state.testRunDurationMs / 1000;
  const totalReqs = metrics.total_requests?.values?.count || 0;
  
  return `
╔══════════════════════════════════════════════════════════════════════╗
║        SUBSCRIPTION MODEL STRESS TEST - FINAL RESULTS                ║
╠══════════════════════════════════════════════════════════════════════╣
║ Duration: ${duration.toFixed(2)}s | Max VUs: ${metrics.vus_max?.values?.max || 0}                               
║ Throughput: ${(totalReqs / duration).toFixed(2)} req/s (Total: ${totalReqs})
╠══════════════════════════════════════════════════════════════════════╣
║ LATENCY                                                              ║
║   Overall P95: ${(metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2)}ms
║   Subscription P95: ${(metrics.subscription_latency?.values['p(95)'] || 0).toFixed(2)}ms
║   Billing P95: ${(metrics.billing_latency?.values['p(95)'] || 0).toFixed(2)}ms
║   Complex Ops P95: ${(metrics.complex_operation_latency?.values['p(95)'] || 0).toFixed(2)}ms
╠══════════════════════════════════════════════════════════════════════╣
║ SUCCESS RATES                                                        ║
║   Overall: ${((metrics.success_rate?.values?.rate || 0) * 100).toFixed(2)}%
║   Subscription: ${((metrics.subscription_success_rate?.values?.rate || 0) * 100).toFixed(2)}%
║   Billing: ${((metrics.billing_success_rate?.values?.rate || 0) * 100).toFixed(2)}%
║   HTTP Errors: ${((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(4)}%
╠══════════════════════════════════════════════════════════════════════╣
║ SUBSCRIPTION OPERATIONS                                              ║
║   Created: ${metrics.subscriptions_created?.values?.count || 0}
║   Cancelled: ${metrics.subscriptions_cancelled?.values?.count || 0}
║   Renewed: ${metrics.subscriptions_renewed?.values?.count || 0}
║   Plan Changes: ${metrics.plan_changes?.values?.count || 0}
╠══════════════════════════════════════════════════════════════════════╣
║ BILLING OPERATIONS                                                   ║
║   Invoices Created: ${metrics.invoices_created?.values?.count || 0}
║   Payments Initiated: ${metrics.payments_initiated?.values?.count || 0}
╚══════════════════════════════════════════════════════════════════════╝
`;
}
