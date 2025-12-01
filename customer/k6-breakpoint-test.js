import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * BREAKPOINT TEST - Tìm giới hạn hệ thống
 * 
 * Mục tiêu: Tăng VUs liên tục cho đến khi hệ thống không đáp ứng được
 * - Bắt đầu: 50 VUs
 * - Tăng dần: 100 → 200 → 300 → 500 → 750 → 1000
 * - Mỗi stage giữ 1 phút để đo ổn định
 * 
 * Dấu hiệu đạt giới hạn:
 * - Response time p95 > 2000ms
 * - Error rate > 10%
 * - Timeout errors xuất hiện
 */

export const options = {
  stages: [
    // Warm up
    { duration: '30s', target: 50 },
    { duration: '1m', target: 50 },
    
    // Ramp up gradually
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    
    { duration: '30s', target: 200 },
    { duration: '1m', target: 200 },
    
    { duration: '30s', target: 300 },
    { duration: '1m', target: 300 },
    
    { duration: '30s', target: 500 },
    { duration: '1m', target: 500 },
    
    { duration: '30s', target: 750 },
    { duration: '1m', target: 750 },
    
    { duration: '30s', target: 1000 },
    { duration: '1m', target: 1000 },
    
    // Cool down
    { duration: '30s', target: 0 },
  ],
  
  // Không đặt threshold cứng - mục đích là tìm giới hạn
  thresholds: {
    http_req_duration: [
      { threshold: 'p(95)<500', abortOnFail: false },   // Lý tưởng
      { threshold: 'p(95)<1000', abortOnFail: false },  // Chấp nhận được
      { threshold: 'p(95)<2000', abortOnFail: false },  // Cảnh báo
      { threshold: 'p(95)<5000', abortOnFail: true },   // Dừng nếu quá chậm
    ],
    http_req_failed: [
      { threshold: 'rate<0.05', abortOnFail: false },   // Lý tưởng
      { threshold: 'rate<0.10', abortOnFail: false },   // Chấp nhận được
      { threshold: 'rate<0.30', abortOnFail: true },    // Dừng nếu lỗi quá nhiều
    ],
  },
  
  // Tăng timeout cho high load
  httpTimeout: '30s',
};

const BASE_URL = 'http://localhost:3000';

let customerEmails = [];
let customerIds = [];

export function setup() {
  console.log('🚀 BREAKPOINT TEST - Tìm giới hạn hệ thống');
  console.log('📊 VUs: 50 → 100 → 200 → 300 → 500 → 750 → 1000');
  console.log('⏱️  Tổng thời gian: ~12 phút');
  console.log('');
  
  const res = http.get(`${BASE_URL}/customers?page=1&limit=50`);
  if (res.status >= 500) throw new Error('❌ Customers API not responding');
  
  const data = JSON.parse(res.body);
  const customers = data.customers || [];
  
  customerEmails = customers.map(c => c.email).filter(e => e);
  customerIds = customers.map(c => c.id).filter(id => id);
  
  console.log(`✅ Found ${customerEmails.length} emails and ${customerIds.length} IDs`);
  console.log('');
  
  return { customerEmails, customerIds };
}

export default function (data) {
  const emails = data.customerEmails || [];
  const ids = data.customerIds || [];

  // List customers (heaviest operation)
  const listRes = http.get(`${BASE_URL}/customers?page=1&limit=20`);
  check(listRes, { 'List: 200': (r) => r.status === 200 });

  // Get by ID
  const id = ids.length > 0 
    ? ids[Math.floor(Math.random() * ids.length)] 
    : 1;
  const getRes = http.get(`${BASE_URL}/customers/${id}`);
  check(getRes, { 'Get: 200': (r) => r.status === 200 });

  // Get by Email
  const email = emails.length > 0 
    ? emails[Math.floor(Math.random() * emails.length)]
    : 'test@example.com';
  const emailRes = http.get(`${BASE_URL}/customers/email/${email}`);
  check(emailRes, { 'Email: 200': (r) => r.status === 200 });

  // Get insights
  const insightsRes = http.get(`${BASE_URL}/customers/${id}/insights`);
  check(insightsRes, { 'Insights: 200': (r) => r.status === 200 });

  // Segment thresholds (lightweight)
  const segRes = http.get(`${BASE_URL}/customers/segments/thresholds`);
  check(segRes, { 'Segments: 200': (r) => r.status === 200 });

  // Shorter sleep for higher throughput
  sleep(Math.random() * 0.5 + 0.2);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] || 0;
  const errorRate = data.metrics.http_req_failed?.values?.rate || 0;
  const totalReqs = data.metrics.http_reqs?.values?.count || 0;
  const rps = data.metrics.http_reqs?.values?.rate || 0;
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('                  🎯 BREAKPOINT RESULTS                  ');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  📊 Total Requests:  ${totalReqs.toLocaleString()}`);
  console.log(`  ⚡ Requests/sec:    ${rps.toFixed(2)}`);
  console.log(`  ⏱️  p95 Latency:     ${p95.toFixed(2)}ms`);
  console.log(`  ❌ Error Rate:      ${(errorRate * 100).toFixed(2)}%`);
  console.log('');
  
  // Phân tích kết quả
  let recommendation = '';
  if (p95 < 500 && errorRate < 0.05) {
    recommendation = '✅ EXCELLENT - Hệ thống xử lý tốt ở 1000 VUs!';
  } else if (p95 < 1000 && errorRate < 0.10) {
    recommendation = '✅ GOOD - Hệ thống ổn định, có thể scale thêm';
  } else if (p95 < 2000 && errorRate < 0.20) {
    recommendation = '⚠️  WARNING - Đang gần giới hạn, cần tối ưu';
  } else {
    recommendation = '❌ LIMIT REACHED - Đã đạt giới hạn hệ thống!';
  }
  
  console.log(`  💡 ${recommendation}`);
  console.log('═══════════════════════════════════════════════════════');
  
  return {
    'breakpoint-summary.json': JSON.stringify({
      totalRequests: totalReqs,
      requestsPerSecond: rps,
      p95Latency: p95,
      errorRate: errorRate,
      recommendation: recommendation,
      timestamp: new Date().toISOString(),
    }, null, 2),
  };
}
