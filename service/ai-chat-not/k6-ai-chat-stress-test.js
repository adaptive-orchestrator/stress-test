import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
};

const BASE_URL = 'http://localhost:3000';

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // Send message (requires JWT; expect 200 or 401)
  const msg = http.post(`${BASE_URL}/ai/chat`, JSON.stringify({ message: 'Hello AI', context: {} }), { headers });
  check(msg, { 'send 200/401': (r) => r.status === 200 || r.status === 401 });

  // History endpoints
  check(http.get(`${BASE_URL}/ai/chat/history`), { 'history 200/401': (r) => r.status === 200 || r.status === 401 });
  check(http.get(`${BASE_URL}/ai/chat/history/1`), { 'conv 200/401/404': (r) => [200,401,404].includes(r.status) });

  sleep(1);
}

export function setup() {
  const health = http.get(`${BASE_URL}/ai/chat/history`);
  if (health.status >= 500) throw new Error('AI Chat API unhealthy');
  return { startTime: Date.now() };
}

// Calculate recommended K8s resources based on test results
function calculateResourceRecommendation(data) {
  const metrics = data.metrics;
  const maxVUs = 100; // Max VUs from stages
  const avgResponseTime = metrics.http_req_duration?.values?.avg || 0;
  const p95ResponseTime = metrics.http_req_duration?.values['p(95)'] || 0;
  const p99ResponseTime = metrics.http_req_duration?.values['p(99)'] || 0;
  const errorRate = metrics.http_req_failed?.values?.rate || 0;
  const throughput = metrics.http_reqs?.values?.rate || 0;
  const waitingTime = metrics.http_req_waiting?.values?.avg || 0;
  const blockedTime = metrics.http_req_blocked?.values?.avg || 0;
  
  // AI Chat service typically needs more resources due to LLM calls
  let cpuRequest = '200m';
  let cpuLimit = '1000m';
  let memoryRequest = '256Mi';
  let memoryLimit = '1Gi';
  let replicas = 2;
  
  if (p95ResponseTime > 5000) {
    cpuRequest = '1000m'; cpuLimit = '4000m';
    memoryRequest = '1Gi'; memoryLimit = '4Gi';
  } else if (p95ResponseTime > 2000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
    memoryRequest = '512Mi'; memoryLimit = '2Gi';
  } else if (p95ResponseTime > 1000) {
    cpuRequest = '300m'; cpuLimit = '1500m';
    memoryRequest = '384Mi'; memoryLimit = '1536Mi';
  }
  
  if (waitingTime > 2000) {
    cpuRequest = '1000m'; cpuLimit = '4000m';
  } else if (waitingTime > 1000) {
    cpuRequest = '500m'; cpuLimit = '2000m';
  }
  
  if (blockedTime > 500 || throughput > 200) {
    memoryRequest = '1Gi'; memoryLimit = '2Gi';
  } else if (blockedTime > 200 || throughput > 100) {
    memoryRequest = '512Mi'; memoryLimit = '1Gi';
  }
  
  // AI chat usually needs fewer replicas but more resources per pod
  if (errorRate > 0.1 || p99ResponseTime > 10000) {
    replicas = Math.ceil(maxVUs / 20);
  } else if (errorRate > 0.05 || p99ResponseTime > 5000) {
    replicas = Math.ceil(maxVUs / 30);
  } else {
    replicas = Math.ceil(maxVUs / 40);
  }
  
  replicas = Math.max(2, Math.min(replicas, 8));
  
  return { serviceName: 'ai-chat-svc (llm-orchestrator)', replicas, resources: { requests: { cpu: cpuRequest, memory: memoryRequest }, limits: { cpu: cpuLimit, memory: memoryLimit } },
    metrics: { maxVUs, avgResponseTime: avgResponseTime.toFixed(2), p95ResponseTime: p95ResponseTime.toFixed(2), p99ResponseTime: p99ResponseTime.toFixed(2), errorRate: (errorRate * 100).toFixed(2), throughput: throughput.toFixed(2) }
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
    'ai-chat-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
