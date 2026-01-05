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
const headers = { 'Content-Type': 'application/json', 'x-user-id': '1' };

export default function () {
  // Create project
  const create = http.post(`${BASE_URL}/projects`, JSON.stringify({ name: `Proj ${Date.now()}`, description: 'k6' }), { headers });
  check(create, { 'create 201/401': (r) => r.status === 201 || r.status === 401 });

  // List projects
  check(http.get(`${BASE_URL}/projects`, { headers }), { 'list 200/401': (r) => r.status === 200 || r.status === 401 });

  if (create.status === 201) {
    let body;
    try {
      body = JSON.parse(create.body);
    } catch (e) {
      console.log('Failed to parse create response:', create.body);
      return;
    }
    const id = body?.project?.id || body?.id;
    if (!id) {
      console.log('No project id in response:', JSON.stringify(body));
      return;
    }

    // Get by id
    check(http.get(`${BASE_URL}/projects/${id}`, { headers }), { 'get 200/401/404': (r) => [200,401,404].includes(r.status) });

    // Update
    check(http.put(`${BASE_URL}/projects/${id}`, JSON.stringify({ description: 'updated' }), { headers }), { 'update 200/401': (r) => r.status === 200 || r.status === 401 });

    // Create task
    const task = http.post(`${BASE_URL}/projects/${id}/tasks`, JSON.stringify({ title: 'Task', status: 'OPEN' }), { headers });
    check(task, { 'task 201/401': (r) => r.status === 201 || r.status === 401 });
    
    let taskId = null;
    if (task.status === 201) {
      try {
        const taskBody = JSON.parse(task.body);
        taskId = taskBody?.task?.id || taskBody?.id;
      } catch (e) {
        console.log('Failed to parse task response:', task.body);
      }
    }

    // List tasks
    check(http.get(`${BASE_URL}/projects/${id}/tasks`, { headers }), { 'tasks 200/401': (r) => r.status === 200 || r.status === 401 });

    if (taskId) {
      // Update task
      check(http.put(`${BASE_URL}/projects/tasks/${taskId}`, JSON.stringify({ status: 'DONE' }), { headers }), { 'task update 200/401': (r) => r.status === 200 || r.status === 401 });
    }

    // Analytics
    check(http.get(`${BASE_URL}/projects/${id}/analytics`, { headers }), { 'analytics 200/401': (r) => r.status === 200 || r.status === 401 });

    if (taskId) {
      // Delete task
      check(http.del(`${BASE_URL}/projects/tasks/${taskId}`, { headers }), { 'task delete 200/401': (r) => r.status === 200 || r.status === 401 });
    }

    // Delete project
    check(http.del(`${BASE_URL}/projects/${id}`, { headers }), { 'delete 200/401': (r) => r.status === 200 || r.status === 401 });
  }

  sleep(1);
}

export function setup() {
  const health = http.get(`${BASE_URL}/projects`);
  if (health.status >= 500) throw new Error('Project API unhealthy');
  return { startTime: Date.now() };
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
  let replicas = 2;
  
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
  } else {
    replicas = Math.ceil(maxVUs / 30);
  }
  
  replicas = Math.max(2, Math.min(replicas, 10));
  
  return { serviceName: 'project-svc (crm-orchestrator)', replicas, resources: { requests: { cpu: cpuRequest, memory: memoryRequest }, limits: { cpu: cpuLimit, memory: memoryLimit } },
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
    'project-stress-summary.json': JSON.stringify({ ...data, k8sRecommendation: recommendation }, null, 2),
  };
}
