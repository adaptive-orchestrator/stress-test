import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const addonListDuration = new Trend('addon_list_duration', true);
const addonGetDuration = new Trend('addon_get_duration', true);
const addonPurchaseDuration = new Trend('addon_purchase_duration', true);
const addonUserDuration = new Trend('addon_user_duration', true);
const addonCancelDuration = new Trend('addon_cancel_duration', true);
const errorRate = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '30s', target: 100 },    // Ramp up to 100 VUs
    { duration: '30s', target: 300 },    // Ramp up to 300 VUs
    { duration: '30s', target: 500 },    // Ramp up to 500 VUs
    { duration: '30s', target: 800 },    // Ramp up to 800 VUs
    { duration: '1m', target: 1000 },    // Ramp up to 1000 VUs
    { duration: '3m', target: 1000 },    // Stay at 1000 VUs for 3 minutes
    { duration: '30s', target: 500 },    // Ramp down to 500 VUs
    { duration: '30s', target: 0 },      // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],  // Relaxed for 1000 VUs
    http_req_failed: ['rate<0.15'],                   // Allow 15% error rate
    error_rate: ['rate<0.15'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const BASE_URL = 'http://localhost:3000';

export function setup() {
  const headers = { 'Content-Type': 'application/json' };
  
  // Health check
  const health = http.get(`${BASE_URL}/addons?page=1&limit=5`);
  if (health.status >= 500) throw new Error('Addon API unhealthy');

  // Get existing addons
  const addonsRes = http.get(`${BASE_URL}/addons?page=1&limit=100`);
  let addons = [];
  if (addonsRes.status === 200) {
    try {
      const parsed = JSON.parse(addonsRes.body);
      addons = parsed.addons || [];
    } catch (e) {}
  }

  // If no addons exist, create some
  if (addons.length === 0) {
    const defaultAddons = [
      { addonKey: 'extra_storage', name: 'Extra Storage 10GB', price: 49000, billingPeriod: 'monthly' },
      { addonKey: 'ai_assistant', name: 'AI Assistant', price: 99000, billingPeriod: 'monthly' },
      { addonKey: 'priority_support', name: 'Priority Support', price: 149000, billingPeriod: 'monthly' },
      { addonKey: 'advanced_analytics', name: 'Advanced Analytics', price: 79000, billingPeriod: 'monthly' },
      { addonKey: 'api_access', name: 'API Access', price: 199000, billingPeriod: 'monthly' },
      { addonKey: 'custom_branding', name: 'Custom Branding', price: 299000, billingPeriod: 'monthly' },
      { addonKey: 'data_export', name: 'Data Export Pro', price: 59000, billingPeriod: 'monthly' },
      { addonKey: 'multi_user', name: 'Multi User Access', price: 129000, billingPeriod: 'monthly' },
    ];

    for (const addon of defaultAddons) {
      http.post(`${BASE_URL}/addons`, JSON.stringify(addon), { headers });
    }

    // Re-fetch
    const refetch = http.get(`${BASE_URL}/addons?page=1&limit=100`);
    if (refetch.status === 200) {
      try {
        const parsed = JSON.parse(refetch.body);
        addons = parsed.addons || [];
      } catch (e) {}
    }
  }

  console.log(`✅ Setup complete: ${addons.length} addons available`);
  console.log(`🚀 Starting 1000 VUs stress test...`);

  return { addons };
}

export default function (data) {
  const headers = { 'Content-Type': 'application/json' };
  const addons = data.addons || [];
  
  // Randomize operations to simulate real traffic
  const operation = Math.random();

  if (operation < 0.35) {
    // 35% - List addons (most common read operation)
    const page = Math.floor(Math.random() * 3) + 1;
    const start = Date.now();
    const res = http.get(`${BASE_URL}/addons?page=${page}&limit=10`);
    addonListDuration.add(Date.now() - start);
    
    const success = check(res, { 'list 200': (r) => r.status === 200 });
    errorRate.add(!success);
    
  } else if (operation < 0.55) {
    // 20% - Get addon by key
    if (addons.length > 0) {
      const randomAddon = addons[Math.floor(Math.random() * addons.length)];
      const key = randomAddon.addonKey || randomAddon.addon_key || 'extra_storage';
      
      const start = Date.now();
      const res = http.get(`${BASE_URL}/addons/${key}`);
      addonGetDuration.add(Date.now() - start);
      
      const success = check(res, { 'get 200': (r) => r.status === 200 });
      errorRate.add(!success);
    }
    
  } else if (operation < 0.75) {
    // 20% - Get user addons
    const subscriptionId = Math.floor(Math.random() * 100) + 1;
    const page = Math.floor(Math.random() * 2) + 1;
    
    const start = Date.now();
    const res = http.get(`${BASE_URL}/addons/user/${subscriptionId}?page=${page}&limit=10`);
    addonUserDuration.add(Date.now() - start);
    
    const success = check(res, { 'user 200': (r) => r.status === 200 });
    errorRate.add(!success);
    
  } else if (operation < 0.90) {
    // 15% - Purchase addon
    if (addons.length > 0) {
      const randomAddon = addons[Math.floor(Math.random() * addons.length)];
      const addonKey = randomAddon.addonKey || randomAddon.addon_key || 'extra_storage';
      const subscriptionId = Math.floor(Math.random() * 100) + 1;
      const customerId = Math.floor(Math.random() * 1000) + 1;
      
      const start = Date.now();
      const res = http.post(
        `${BASE_URL}/addons/purchase`,
        JSON.stringify({
          subscriptionId,
          customerId,
          addonKeys: [addonKey],
        }),
        { headers }
      );
      addonPurchaseDuration.add(Date.now() - start);
      
      // 200 = success, 400 = already purchased
      const success = check(res, { 'purchase 200/400': (r) => r.status === 200 || r.status === 400 });
      errorRate.add(!success);
    }
    
  } else {
    // 10% - Cancel addon
    const subscriptionId = Math.floor(Math.random() * 100) + 1;
    const userAddonsRes = http.get(`${BASE_URL}/addons/user/${subscriptionId}?page=1&limit=5`);
    
    let userAddons = [];
    if (userAddonsRes.status === 200) {
      try {
        const parsed = JSON.parse(userAddonsRes.body);
        userAddons = (parsed.userAddons || []).filter(ua => ua.status === 'active');
      } catch (e) {}
    }
    
    if (userAddons.length > 0) {
      const toCancel = userAddons[Math.floor(Math.random() * userAddons.length)];
      
      const start = Date.now();
      const res = http.del(`${BASE_URL}/addons/user/${toCancel.id}`);
      addonCancelDuration.add(Date.now() - start);
      
      const success = check(res, { 'cancel 200': (r) => r.status === 200 });
      errorRate.add(!success);
    }
  }

  // Random sleep between 0.3s to 1.5s
  sleep(Math.random() * 1.2 + 0.3);
}

// Calculate recommended K8s resources based on test results
function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = 1000;
  const avgResponseTime = metrics.http_req_duration?.values?.avg || 0;
  const p95ResponseTime = metrics.http_req_duration?.values['p(95)'] || 0;
  const p99ResponseTime = metrics.http_req_duration?.values['p(99)'] || 0;
  const errorRate = metrics.http_req_failed?.values?.rate || 0;
  const throughput = metrics.http_reqs?.values?.rate || 0;
  const waitingTime = metrics.http_req_waiting?.values?.avg || 0; // CPU indicator
  const blockedTime = metrics.http_req_blocked?.values?.avg || 0; // Connection pool indicator
  
  // Base calculations
  let cpuRequest = '100m';
  let cpuLimit = '500m';
  let memoryRequest = '128Mi';
  let memoryLimit = '512Mi';
  let replicas = 1;
  
  // Adjust based on response times (higher = need more CPU)
  if (p95ResponseTime > 2000) {
    cpuRequest = '500m';
    cpuLimit = '2000m';
  } else if (p95ResponseTime > 1000) {
    cpuRequest = '250m';
    cpuLimit = '1000m';
  } else if (p95ResponseTime > 500) {
    cpuRequest = '150m';
    cpuLimit = '750m';
  }
  
  // Adjust based on waiting time (server processing = CPU)
  if (waitingTime > 1000) {
    cpuRequest = '500m';
    cpuLimit = '2000m';
  } else if (waitingTime > 500) {
    cpuRequest = '300m';
    cpuLimit = '1500m';
  }
  
  // Adjust memory based on blocked time and throughput
  if (blockedTime > 500 || throughput > 500) {
    memoryRequest = '512Mi';
    memoryLimit = '1Gi';
  } else if (blockedTime > 200 || throughput > 200) {
    memoryRequest = '256Mi';
    memoryLimit = '768Mi';
  }
  
  // Calculate replicas based on VUs and error rate
  // Rule of thumb: 1 replica per 200-300 VUs with good performance
  if (errorRate > 0.1 || p99ResponseTime > 5000) {
    replicas = Math.ceil(maxVUs / 150); // More replicas if struggling
  } else if (errorRate > 0.05 || p99ResponseTime > 3000) {
    replicas = Math.ceil(maxVUs / 200);
  } else if (p95ResponseTime > 1000) {
    replicas = Math.ceil(maxVUs / 250);
  } else {
    replicas = Math.ceil(maxVUs / 300); // Good performance
  }
  
  // Ensure minimum 2 replicas for HA
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return {
    serviceName: 'addon-svc',
    replicas,
    resources: {
      requests: { cpu: cpuRequest, memory: memoryRequest },
      limits: { cpu: cpuLimit, memory: memoryLimit },
    },
    metrics: {
      maxVUs,
      avgResponseTime: avgResponseTime.toFixed(2),
      p95ResponseTime: p95ResponseTime.toFixed(2),
      p99ResponseTime: p99ResponseTime.toFixed(2),
      errorRate: (errorRate * 100).toFixed(2),
      throughput: throughput.toFixed(2),
      waitingTime: waitingTime.toFixed(2),
      blockedTime: blockedTime.toFixed(2),
    },
  };
}

export function handleSummary(data) {
  const summary = {
    'Total Requests': data.metrics.http_reqs.values.count,
    'Failed Requests': data.metrics.http_req_failed.values.passes,
    'Avg Response Time': `${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`,
    'P95 Response Time': `${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`,
    'P99 Response Time': `${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`,
    'Max Response Time': `${data.metrics.http_req_duration.values.max.toFixed(2)}ms`,
    'Throughput': `${(data.metrics.http_reqs.values.rate).toFixed(2)} req/s`,
  };
  
  // Calculate resource recommendations
  const recommendation = calculateResourceRecommendation(data);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 1000 VUs STRESS TEST SUMMARY');
  console.log('='.repeat(60));
  
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${value}`);
  }
  
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
  
  // Add recommendation to saved summary
  const fullSummary = {
    ...data,
    k8sRecommendation: recommendation,
  };
  
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'addon-1000vus-summary.json': JSON.stringify(fullSummary, null, 2),
  };
}

function textSummary(data, options) {
  // Simple text summary
  let output = '\n📈 DETAILED METRICS:\n\n';
  
  if (data.metrics.addon_list_duration) {
    output += `List Addons:     avg=${data.metrics.addon_list_duration.values.avg.toFixed(2)}ms, p95=${data.metrics.addon_list_duration.values['p(95)'].toFixed(2)}ms\n`;
  }
  if (data.metrics.addon_get_duration) {
    output += `Get Addon:       avg=${data.metrics.addon_get_duration.values.avg.toFixed(2)}ms, p95=${data.metrics.addon_get_duration.values['p(95)'].toFixed(2)}ms\n`;
  }
  if (data.metrics.addon_user_duration) {
    output += `User Addons:     avg=${data.metrics.addon_user_duration.values.avg.toFixed(2)}ms, p95=${data.metrics.addon_user_duration.values['p(95)'].toFixed(2)}ms\n`;
  }
  if (data.metrics.addon_purchase_duration) {
    output += `Purchase:        avg=${data.metrics.addon_purchase_duration.values.avg.toFixed(2)}ms, p95=${data.metrics.addon_purchase_duration.values['p(95)'].toFixed(2)}ms\n`;
  }
  if (data.metrics.addon_cancel_duration) {
    output += `Cancel:          avg=${data.metrics.addon_cancel_duration.values.avg.toFixed(2)}ms, p95=${data.metrics.addon_cancel_duration.values['p(95)'].toFixed(2)}ms\n`;
  }
  
  return output;
}
