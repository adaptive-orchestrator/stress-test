import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = 'http://localhost:3000';

// Generate a random UUID for testing
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Will be populated in setup()
let customerEmails = [];
let customerIds = [];

export function setup() {
  // Fetch existing customers to get real emails and IDs
  const res = http.get(`${BASE_URL}/customers?page=1&limit=50`);
  if (res.status >= 500) throw new Error('❌ Customers API not responding');
  
  const data = JSON.parse(res.body);
  const customers = data.customers || [];
  
  customerEmails = customers.map(c => c.email).filter(e => e);
  customerIds = customers.map(c => c.id).filter(id => id);
  
  console.log(`✅ Customers API Ready - Found ${customerEmails.length} emails and ${customerIds.length} IDs`);
  
  return { customerEmails, customerIds };
}

export default function (data) {
  const emails = data.customerEmails || [];
  const ids = data.customerIds || [];

  // List customers
  const listRes = http.get(`${BASE_URL}/customers?page=1&limit=10`);
  check(listRes, { '✓ List: 200': (r) => r.status === 200 });

  // Get by ID - use real ID if available
  const id = ids.length > 0 
    ? ids[Math.floor(Math.random() * ids.length)] 
    : randomUUID();
  const getRes = http.get(`${BASE_URL}/customers/${id}`);
  check(getRes, { '✓ Get: 200': (r) => r.status === 200 });

  // Get by Email - use real email if available
  const email = emails.length > 0 
    ? emails[Math.floor(Math.random() * emails.length)]
    : `user${Math.floor(Math.random() * 1000)}@example.com`;
  const byEmailRes = http.get(`${BASE_URL}/customers/email/${email}`);
  check(byEmailRes, { '✓ Email: 200': (r) => r.status === 200 });

  // Segment thresholds
  const segRes = http.get(`${BASE_URL}/customers/segments/thresholds`);
  check(segRes, { '✓ Segments: 200': (r) => r.status === 200 });

  sleep(1);
}
