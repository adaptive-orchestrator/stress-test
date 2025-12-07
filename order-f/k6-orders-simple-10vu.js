import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
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

function createOrderPayload() {
  return {
    customerId: randomUUID(),
    items: [
      { 
        productId: 'p0000001-0000-0000-0000-000000000001',
        quantity: 2, 
        price: 99.99
      },
    ],
    notes: 'K6 test order',
    shippingAddress: '123 Test Street, District 1, Ho Chi Minh City',
  };
}

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // Create order
  const createRes = http.post(
    `${BASE_URL}/orders`,
    JSON.stringify(createOrderPayload()),
    { headers, tags: { name: 'CreateOrder' } }
  );

  const createOk = check(createRes, {
    '✓ Create: 201': (r) => r.status === 201,
    '✓ Create: has id': (r) => {
      try { const b = JSON.parse(r.body); return b.order && b.order.id !== undefined; } catch { return false; }
    },
  });

  errorRate.add(!createOk);

  if (createOk) {
    const body = JSON.parse(createRes.body);
    const orderId = body.order.id;
    const customerId = body.order.customerId;

    // Get order by id
    const getRes = http.get(`${BASE_URL}/orders/${orderId}`, { tags: { name: 'GetOrder' } });
    check(getRes, {
      '✓ Get: 200': (r) => r.status === 200,
      '✓ Get: correct id': (r) => { try { const b = JSON.parse(r.body); return b.order && b.order.id === orderId; } catch { return false; } },
    });

    // List orders
    const listRes = http.get(`${BASE_URL}/orders?page=1&limit=10`, { tags: { name: 'ListOrders' } });
    check(listRes, {
      '✓ List: 200': (r) => r.status === 200,
    });

    // Get orders by customer
    const custRes = http.get(`${BASE_URL}/orders/customer/${customerId}?page=1&limit=10`, { tags: { name: 'OrdersByCustomer' } });
    check(custRes, {
      '✓ Cust: 200': (r) => r.status === 200,
    });

    // Add item first (only allowed when order is 'pending')
    const addItemRes = http.post(
      `${BASE_URL}/orders/${orderId}/items`,
      JSON.stringify({ productId: 'p0000001-0000-0000-0000-000000000002', quantity: 1, price: 49.99 }),
      { headers, tags: { name: 'AddItem' } }
    );
    const addItemOk = check(addItemRes, { '✓ AddItem: 200/201': (r) => r.status === 200 || r.status === 201 });
    if (!addItemOk) {
      console.log(`❌ AddItem failed for order ${orderId}: status=${addItemRes.status}, body=${addItemRes.body}`);
    }

    // Update status: pending -> confirmed (valid transition)
    const patchRes = http.patch(
      `${BASE_URL}/orders/${orderId}/status`,
      JSON.stringify({ status: 'confirmed' }),
      { headers, tags: { name: 'UpdateStatus' } }
    );
    check(patchRes, {
      '✓ Status: 200': (r) => r.status === 200,
    });

    // Cancel order
    const cancelRes = http.del(`${BASE_URL}/orders/${orderId}?reason=K6%20test`, null, { tags: { name: 'CancelOrder' } });
    check(cancelRes, { '✓ Cancel: 200': (r) => r.status === 200 });
  }

  sleep(1);
}

export function setup() {
  const health = http.get(`${BASE_URL}/orders?page=1&limit=1`);
  if (health.status >= 500) {
    throw new Error('❌ Orders API not responding');
  }
  console.log('✅ Orders API Ready');
}
