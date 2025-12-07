import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration - Standardized stages
export const options = {
  stages: [
    // Stage 1: Warm up - 10 VUs
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    
    // Stage 2: Scale up - 50 VUs
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    
    // Stage 3: Peak load - 100 VUs
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    
    // Stage 4: Cool down
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.1'],
    errors: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Generate a random UUID for testing
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function setup() {
  console.log('\n' + '='.repeat(60));
  console.log('   ADDON SERVICE STRESS TEST');
  console.log('='.repeat(60));
  console.log(`Target API: ${BASE_URL}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');

  const headers = { 'Content-Type': 'application/json' };
  
  // Health check
  const health = http.get(`${BASE_URL}/addons`);
  if (health.status >= 500) throw new Error('Addon API unhealthy');

  // Get existing addons
  const addonsRes = http.get(`${BASE_URL}/addons`);
  let addons = [];
  if (addonsRes.status === 200) {
    try {
      addons = JSON.parse(addonsRes.body) || [];
    } catch (e) {
      addons = [];
    }
  }

  // If no addons exist, create some default ones
  if (addons.length === 0) {
    const defaultAddons = [
      { addonKey: 'extra_storage', name: 'Extra Storage 10GB', price: 49000, billingPeriod: 'monthly' },
      { addonKey: 'ai_assistant', name: 'AI Assistant', price: 99000, billingPeriod: 'monthly' },
      { addonKey: 'priority_support', name: 'Priority Support', price: 149000, billingPeriod: 'monthly' },
      { addonKey: 'advanced_analytics', name: 'Advanced Analytics', price: 79000, billingPeriod: 'monthly' },
      { addonKey: 'api_access', name: 'API Access', price: 199000, billingPeriod: 'monthly' },
    ];

    for (const addon of defaultAddons) {
      const res = http.post(`${BASE_URL}/addons`, JSON.stringify(addon), { headers });
      if (res.status === 201) {
        try {
          const created = JSON.parse(res.body);
          addons.push(created);
        } catch (e) {}
      }
    }

    // Re-fetch addons
    const refetch = http.get(`${BASE_URL}/addons`);
    if (refetch.status === 200) {
      try {
        addons = JSON.parse(refetch.body) || [];
      } catch (e) {}
    }
  }

  // Get user addons for subscriptionId (using UUID)
  const sampleSubscriptionId = randomUUID();
  const userAddonsRes = http.get(`${BASE_URL}/addons/user/${sampleSubscriptionId}`);
  let userAddons = [];
  if (userAddonsRes.status === 200) {
    try {
      userAddons = JSON.parse(userAddonsRes.body) || [];
    } catch (e) {}
  }

  console.log(`✅ Setup complete: ${addons.length} addons, ${userAddons.length} user addons`);

  return { addons, userAddons, startTime: Date.now() };
}

export default function (data) {
  const headers = { 'Content-Type': 'application/json' };
  const addons = data.addons || [];

  // Test 1: List addons with pagination
  const page = Math.floor(Math.random() * 3) + 1;
  const listRes = http.get(`${BASE_URL}/addons?page=${page}&limit=10`);
  const listOk = check(listRes, { 
    'list: status 200': (r) => r.status === 200 
  });
  errorRate.add(!listOk);

  // Parse current addons
  let currentAddons = [];
  if (listRes.status === 200) {
    try {
      const parsed = JSON.parse(listRes.body);
      currentAddons = parsed.addons || parsed || [];
    } catch (e) {}
  }

  // Test 2: Get addon by key
  if (currentAddons.length > 0) {
    const randomAddon = currentAddons[Math.floor(Math.random() * currentAddons.length)];
    const key = randomAddon.addonKey || randomAddon.addon_key || randomAddon.key;
    if (key) {
      const getRes = http.get(`${BASE_URL}/addons/${key}`);
      check(getRes, { 
        'get by key: status 200': (r) => r.status === 200 
      });
    }
  }

  // Test 3: Purchase addon
  if (currentAddons.length > 0) {
    const randomAddon = currentAddons[Math.floor(Math.random() * currentAddons.length)];
    const addonKey = randomAddon.addonKey || randomAddon.addon_key || randomAddon.key;
    const subscriptionId = randomUUID();
    const customerId = randomUUID();

    if (addonKey) {
      const purchaseRes = http.post(
        `${BASE_URL}/addons/purchase`,
        JSON.stringify({
          subscriptionId: subscriptionId,
          customerId: customerId,
          addonKeys: [addonKey],
        }),
        { headers }
      );
      check(purchaseRes, { 
        'purchase: status 200/400': (r) => r.status === 200 || r.status === 400 
      });
    }
  }

  // Test 4: Get user addons with pagination
  const subscriptionId = randomUUID();
  const userPage = Math.floor(Math.random() * 2) + 1;
  const userAddonsRes = http.get(`${BASE_URL}/addons/user/${subscriptionId}?page=${userPage}&limit=10`);
  check(userAddonsRes, { 
    'user addons: status 200': (r) => r.status === 200 
  });

  // Test 5: Cancel addon (only if user has addons)
  let userAddons = [];
  if (userAddonsRes.status === 200) {
    try {
      const parsed = JSON.parse(userAddonsRes.body);
      userAddons = parsed.userAddons || parsed || [];
    } catch (e) {}
  }

  if (userAddons.length > 0) {
    const activeAddons = userAddons.filter(ua => ua.status === 'active');
    if (activeAddons.length > 0) {
      const toCancel = activeAddons[Math.floor(Math.random() * activeAddons.length)];
      const cancelRes = http.del(`${BASE_URL}/addons/user/${toCancel.id}`);
      check(cancelRes, { 
        'cancel: status 200': (r) => r.status === 200 
      });
    }
  }

  sleep(Math.random() * 1.5 + 0.5);
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('\n' + '='.repeat(60));
  console.log('   TEST COMPLETED');
  console.log('='.repeat(60));
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Finished at: ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');
}

// Calculate recommended K8s resources based on test results
function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = 100;
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
  
  return {
    serviceName: 'subscription-svc (addon)',
    replicas,
    resources: {
      requests: { cpu: cpuRequest, memory: memoryRequest },
      limits: { cpu: cpuLimit, memory: memoryLimit }
    },
    metrics: {
      maxVUs,
      avgResponseTime: avgResponseTime.toFixed(2),
      p95ResponseTime: p95ResponseTime.toFixed(2),
      p99ResponseTime: p99ResponseTime.toFixed(2),
      errorRate: (errorRate * 100).toFixed(2),
      throughput: throughput.toFixed(2)
    }
  };
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
    'addon-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
