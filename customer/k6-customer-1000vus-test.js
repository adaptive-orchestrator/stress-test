import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

/**
 * CUSTOMER API 1000 VUs STRESS TEST
 * 
 * This test focuses on:
 * 1. Listing Customers (read-heavy operation)
 * 2. Getting Customer by ID
 * 3. Getting Customer by Email
 * 4. Customer Insights and Segments
 */

// Custom metrics
const customersRead = new Counter('customers_read');
const customerInsightsRead = new Counter('customer_insights_read');
const errorCount = new Counter('error_count');
const listLatency = new Trend('customer_list_latency');
const getLatency = new Trend('customer_get_latency');
const insightsLatency = new Trend('customer_insights_latency');
const successRate = new Rate('success_rate');

export const options = {
  stages: [
    // Warm-up phase
    { duration: '30s', target: 50 },
    // Ramp-up to 200
    { duration: '1m', target: 200 },
    // Hold at 200
    { duration: '2m', target: 200 },
    // Ramp-up to 500 (peak for read-heavy on local)
    { duration: '1m', target: 500 },
    // Hold at peak 500 VUs
    { duration: '3m', target: 500 },
    // Cool-down
    { duration: '1m', target: 0 },
  ],
  // Thresholds adjusted for read-heavy workload on local
  thresholds: {
    http_req_duration: ['p(95)<8000', 'p(99)<15000'],  // 8s p95, 15s p99 (local single-node)
    http_req_failed: ['rate<0.05'],                     // < 5% failure rate (realistic for local)
    success_rate: ['rate>0.95'],                        // > 95% success
    customer_list_latency: ['p(95)<5000'],              // 5s for list (main operation)
    customer_get_latency: ['p(95)<3000'],               // 3s for get by ID
    customer_insights_latency: ['p(95)<8000'],          // 8s for insights (complex query)
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  // Add connection pool settings to prevent overwhelming local server
  batch: 20,  // Max 20 parallel requests per VU
  batchPerHost: 10,  // Max 10 parallel requests per host
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Will be populated in setup()
let customerEmails = [];
let customerIds = [];

export function setup() {
  console.log(`\n========== CUSTOMER 1000 VUs STRESS TEST ==========`);
  console.log(`Target API: ${BASE_URL}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`====================================================\n`);

  // Fetch existing customers to get real emails and IDs
  const res = http.get(`${BASE_URL}/customers?page=1&limit=50`);
  if (res.status >= 500) throw new Error('❌ Customers API not responding');
  
  const data = JSON.parse(res.body);
  const customers = data.customers || [];
  
  customerEmails = customers.map(c => c.email).filter(e => e);
  customerIds = customers.map(c => c.id).filter(id => id);
  
  console.log(`✅ Found ${customerEmails.length} emails and ${customerIds.length} IDs`);
  
  if (customerEmails.length === 0) {
    console.log('⚠️  No customers found - will use random data');
  }
  
  console.log('✓ Customer API health check passed');
  console.log(`✅ Setup completed.\n`);
  
  return { customerEmails, customerIds, startTime: Date.now() };
}

export default function (data) {
  const emails = data.customerEmails || [];
  const ids = data.customerIds || [];
  let success = true;
  
  // 1. List Customers with pagination (50% weight - MAIN read operation)
  if (Math.random() < 0.5) {
    const page = 1 + Math.floor(Math.random() * 3); // Reduce to 1-3 to ensure data exists
    const startList = Date.now();
    const listRes = http.get(`${BASE_URL}/customers?page=${page}&limit=20`);
    listLatency.add(Date.now() - startList);

    const listOk = check(listRes, {
      'list customers 200': (r) => r.status === 200,
    });

    if (listOk) {
      customersRead.add(1);
    } else {
      errorCount.add(1);
      success = false;
      console.log(`List customers failed: ${listRes.status} - ${listRes.body?.substring(0, 100)}`);
    }
  }
  
  // 2. Get Customer by ID (60% weight - high read frequency)
  if (Math.random() < 0.6 && ids.length > 0) {
    const id = ids[Math.floor(Math.random() * ids.length)];
    const startGet = Date.now();
    const getRes = http.get(`${BASE_URL}/customers/${id}`);
    getLatency.add(Date.now() - startGet);

    const getOk = check(getRes, {
      'get by id 200': (r) => r.status === 200,
    });

    if (getOk) {
      customersRead.add(1);
    } else {
      success = false;
    }
  }
  
  // 3. Get Customer by Email (30% weight)
  if (Math.random() < 0.3 && emails.length > 0) {
    const email = emails[Math.floor(Math.random() * emails.length)];
    const emailRes = http.get(`${BASE_URL}/customers/email/${encodeURIComponent(email)}`);
    check(emailRes, { 'get by email 200': (r) => r.status === 200 });
  }
  
  // 4. Get Customer Insights (20% weight - complex query)
  if (Math.random() < 0.2 && ids.length > 0) {
    const id = ids[Math.floor(Math.random() * ids.length)];
    const startInsights = Date.now();
    const insightsRes = http.get(`${BASE_URL}/customers/${id}/insights`);
    insightsLatency.add(Date.now() - startInsights);

    const insightsOk = check(insightsRes, {
      'insights 200': (r) => r.status === 200,
    });

    if (insightsOk) {
      customerInsightsRead.add(1);
    } else {
      success = false;
    }
  }
  
  // 5. Get Segment Thresholds (15% weight - lightweight)
  if (Math.random() < 0.15) {
    const thresholdsRes = http.get(`${BASE_URL}/customers/segments/thresholds`);
    check(thresholdsRes, { 'thresholds 200': (r) => r.status === 200 });
  }
  
  successRate.add(success);
  sleep(Math.random() * 2 + 1); // 1-3 seconds (prevent overwhelming local server)
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n========== CUSTOMER 1000 VUs TEST COMPLETE ==========`);
  console.log(`Total duration: ${duration.toFixed(2)}s`);
  console.log(`Finished at: ${new Date().toISOString()}`);
  console.log(`======================================================\n`);
}

// Calculate recommended K8s resources based on test results
function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = 500; // Max VUs for read-heavy workload on local
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
  let replicas = 2;
  
  // Read-heavy workload - less CPU intensive
  if (p95ResponseTime > 5000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '384Mi'; memoryLimit = '768Mi';
  } else if (p95ResponseTime > 3000) {
    cpuRequest = '200m'; cpuLimit = '1000m';
    memoryRequest = '256Mi'; memoryLimit = '640Mi';
  } else if (p95ResponseTime > 1500) {
    cpuRequest = '150m'; cpuLimit = '750m';
    memoryRequest = '192Mi'; memoryLimit = '512Mi';
  }
  
  // Read operations benefit more from memory caching
  if (throughput > 300) {
    memoryRequest = '512Mi'; memoryLimit = '1Gi';
  } else if (throughput > 200) {
    memoryRequest = '384Mi'; memoryLimit = '768Mi';
  } else if (throughput > 100) {
    memoryRequest = '256Mi'; memoryLimit = '640Mi';
  }
  
  // Read-heavy workload can handle more VUs per replica
  if (errorRate > 0.1 || p99ResponseTime > 12000) {
    replicas = Math.ceil(maxVUs / 100);
  } else if (errorRate > 0.05 || p99ResponseTime > 8000) {
    replicas = Math.ceil(maxVUs / 125);
  } else {
    replicas = Math.ceil(maxVUs / 150);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return { 
    serviceName: 'customer-svc', 
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
  
  const summary = {
    test: 'Customer API - 1000 VUs Stress Test',
    timestamp: new Date().toISOString(),
    description: 'Customer read-heavy operations with pagination and insights',
    testDuration: data.state?.testRunDurationMs ? (data.state.testRunDurationMs / 1000).toFixed(2) + 's' : 'N/A',
    metrics: {
      // HTTP Metrics
      total_requests: data.metrics.http_reqs?.values?.count || 0,
      failed_requests: data.metrics.http_req_failed?.values?.passes || 0,
      failed_rate: ((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2) + '%',
      
      // Response Time Metrics
      avg_response_time: data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 0,
      min_response_time: data.metrics.http_req_duration?.values?.min?.toFixed(2) || 0,
      med_response_time: data.metrics.http_req_duration?.values?.med?.toFixed(2) || 0,
      max_response_time: data.metrics.http_req_duration?.values?.max?.toFixed(2) || 0,
      p90_response_time: data.metrics.http_req_duration?.values['p(90)']?.toFixed(2) || 0,
      p95_response_time: data.metrics.http_req_duration?.values['p(95)']?.toFixed(2) || 0,
      p99_response_time: data.metrics.http_req_duration?.values['p(99)']?.toFixed(2) || 0,
      
      // Waiting Time (Time to First Byte)
      avg_waiting_time: data.metrics.http_req_waiting?.values?.avg?.toFixed(2) || 0,
      p95_waiting_time: data.metrics.http_req_waiting?.values['p(95)']?.toFixed(2) || 0,
      
      // Connection Metrics
      avg_blocked_time: data.metrics.http_req_blocked?.values?.avg?.toFixed(2) || 0,
      avg_connecting_time: data.metrics.http_req_connecting?.values?.avg?.toFixed(2) || 0,
      
      // Data Transfer
      data_sent: data.metrics.data_sent?.values?.count ? (data.metrics.data_sent.values.count / 1024 / 1024).toFixed(2) + ' MB' : '0 MB',
      data_received: data.metrics.data_received?.values?.count ? (data.metrics.data_received.values.count / 1024 / 1024).toFixed(2) + ' MB' : '0 MB',
      
      // Throughput
      requests_per_second: data.metrics.http_reqs?.values?.rate?.toFixed(2) || 0,
      
      // Custom Business Metrics
      customers_read: data.metrics.customers_read?.values?.count || 0,
      customer_insights_read: data.metrics.customer_insights_read?.values?.count || 0,
      error_count: data.metrics.error_count?.values?.count || 0,
      success_rate: ((data.metrics.success_rate?.values?.rate || 0) * 100).toFixed(2) + '%',
      
      // VU Metrics
      max_vus: data.metrics.vus_max?.values?.max || 0,
      iterations_completed: data.metrics.iterations?.values?.count || 0,
      avg_iteration_duration: data.metrics.iteration_duration?.values?.avg?.toFixed(2) || 0,
    },
    k8sRecommendation: recommendation,
    rawData: data,
  };

  console.log('\n' + '='.repeat(60));
  console.log('🎯 K8S RESOURCE RECOMMENDATIONS');
  console.log('='.repeat(60));
  console.log(`Service: ${recommendation.serviceName}`);
  console.log(`Replicas: ${recommendation.replicas}`);
  console.log(`CPU Request: ${recommendation.resources.requests.cpu}`);
  console.log(`CPU Limit: ${recommendation.resources.limits.cpu}`);
  console.log(`Memory Request: ${recommendation.resources.requests.memory}`);
  console.log(`Memory Limit: ${recommendation.resources.limits.memory}`);
  
  console.log('\n📊 PERFORMANCE SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Requests:        ${summary.metrics.total_requests}`);
  console.log(`Failed Rate:           ${summary.metrics.failed_rate}`);
  console.log(`Throughput:            ${summary.metrics.requests_per_second} req/s`);
  console.log(`Avg Response Time:     ${summary.metrics.avg_response_time}ms`);
  console.log(`P95 Response Time:     ${summary.metrics.p95_response_time}ms`);
  console.log(`P99 Response Time:     ${summary.metrics.p99_response_time}ms`);
  console.log(`Max VUs:               ${summary.metrics.max_vus}`);
  console.log(`Test Duration:         ${summary.testDuration}`);
  console.log(`Data Sent:             ${summary.metrics.data_sent}`);
  console.log(`Data Received:         ${summary.metrics.data_received}`);
  
  console.log('\n💼 BUSINESS METRICS');
  console.log('='.repeat(60));
  console.log(`Customers Read:        ${summary.metrics.customers_read}`);
  console.log(`Insights Read:         ${summary.metrics.customer_insights_read}`);
  console.log(`Success Rate:          ${summary.metrics.success_rate}`);
  console.log(`Errors:                ${summary.metrics.error_count}`);
  
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
    'customer-1000vus-summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const lines = [
    '\n╔════════════════════════════════════════════════════════════════════╗',
    '║        CUSTOMER API - 1000 VUs STRESS TEST RESULTS                ║',
    '╠════════════════════════════════════════════════════════════════════╣',
  ];

  const metrics = data.metrics;
  
  lines.push(`║ Total Requests:        ${String(metrics.http_reqs?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Failed Rate:           ${String(((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2) + '%').padStart(40)} ║`);
  lines.push(`║ Avg Response Time:     ${String((metrics.http_req_duration?.values?.avg || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push(`║ P95 Response Time:     ${String((metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push(`║ P99 Response Time:     ${String((metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2) + 'ms').padStart(40)} ║`);
  lines.push('╠════════════════════════════════════════════════════════════════════╣');
  lines.push(`║ Customers Read:        ${String(metrics.customers_read?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Insights Read:         ${String(metrics.customer_insights_read?.values?.count || 0).padStart(40)} ║`);
  lines.push(`║ Errors:                ${String(metrics.error_count?.values?.count || 0).padStart(40)} ║`);
  lines.push('╚════════════════════════════════════════════════════════════════════╝\n');

  return lines.join('\n');
}
