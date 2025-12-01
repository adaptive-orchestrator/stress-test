import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Simple test configuration - 10 VUs only
export const options = {
  vus: 10,                    // 10 virtual users
  duration: '1m',             // Chạy trong 1 phút
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% requests < 1s
    http_req_failed: ['rate<0.05'],    // Error rate < 5%
  },
};

const BASE_URL = 'http://localhost:3000';

// 10 sample products
const products = [
  {
    name: 'iPhone 15 Pro Max',
    description: '256GB, Titanium Blue - Latest Apple flagship smartphone',
    price: 1299.99,
    category: 'Electronics',
    sku: 'IPHONE-15-PRO-256GB-BLUE',
    imageUrl: 'https://example.com/iphone15.jpg',
    isActive: true,
  },
  {
    name: 'Samsung Galaxy S24 Ultra',
    description: '512GB, Phantom Black - Premium Android flagship',
    price: 1399.99,
    category: 'Electronics',
    sku: 'SAMSUNG-S24-ULTRA-512GB',
    imageUrl: 'https://example.com/s24.jpg',
    isActive: true,
  },
  {
    name: 'MacBook Pro 16 M3',
    description: '16-inch, 1TB SSD, 32GB RAM - Professional laptop',
    price: 2499.00,
    category: 'Computers',
    sku: 'MBP-M3-16-1TB',
    imageUrl: 'https://example.com/mbp16.jpg',
    isActive: true,
  },
  {
    name: 'iPad Pro 13 M4',
    description: '256GB, Silver - Latest iPad with M4 chip',
    price: 1099.00,
    category: 'Tablets',
    sku: 'IPAD-PRO-13-M4-256GB',
    imageUrl: 'https://example.com/ipad13.jpg',
    isActive: true,
  },
  {
    name: 'Sony WH-1000XM5',
    description: 'Wireless Noise Canceling Headphones',
    price: 399.99,
    category: 'Electronics',
    sku: 'SONY-WH1000XM5',
    imageUrl: 'https://example.com/sony-headphones.jpg',
    isActive: true,
  },
  {
    name: 'Apple Watch Series 9',
    description: 'GPS + Cellular, 45mm, Midnight Aluminum',
    price: 499.00,
    category: 'Electronics',
    sku: 'WATCH-S9-45MM',
    imageUrl: 'https://example.com/watch9.jpg',
    isActive: true,
  },
  {
    name: 'Dell XPS 15',
    description: '15.6-inch, Intel i9, 32GB RAM, 1TB SSD',
    price: 2299.00,
    category: 'Computers',
    sku: 'DELL-XPS15-I9',
    imageUrl: 'https://example.com/xps15.jpg',
    isActive: true,
  },
  {
    name: 'AirPods Pro 2nd Gen',
    description: 'Active Noise Cancellation, Wireless Charging',
    price: 249.00,
    category: 'Electronics',
    sku: 'AIRPODS-PRO-2',
    imageUrl: 'https://example.com/airpods-pro.jpg',
    isActive: true,
  },
  {
    name: 'Nintendo Switch OLED',
    description: 'Gaming Console with 7-inch OLED screen',
    price: 349.99,
    category: 'Electronics',
    sku: 'SWITCH-OLED',
    imageUrl: 'https://example.com/switch-oled.jpg',
    isActive: true,
  },
  {
    name: 'Logitech MX Master 3S',
    description: 'Wireless Performance Mouse',
    price: 99.99,
    category: 'Electronics',
    sku: 'LOGITECH-MX3S',
    imageUrl: 'https://example.com/mx-master.jpg',
    isActive: true,
  },
];

export default function () {
  const product = products[Math.floor(Math.random() * products.length)];
  
  // Tạo unique SKU
  const uniqueProduct = {
    ...product,
    sku: `${product.sku}-${Date.now()}-${__VU}-${__ITER}`,
    name: `${product.name} (VU${__VU}-${__ITER})`,
  };

  const headers = { 'Content-Type': 'application/json' };

  // CREATE Product
  const createRes = http.post(
    `${BASE_URL}/catalogue/products`,
    JSON.stringify(uniqueProduct),
    { headers, tags: { name: 'CreateProduct' } }
  );

  const success = check(createRes, {
    '✓ Create: status 201': (r) => r.status === 201,
    '✓ Create: has product': (r) => {
      const body = JSON.parse(r.body);
      return body.product && body.product.id !== undefined;
    },
  });

  errorRate.add(!success);

  if (success) {
    const responseBody = JSON.parse(createRes.body);
    const productId = responseBody.product.id;

    // GET Product by ID
    const getRes = http.get(
      `${BASE_URL}/catalogue/products/${productId}`,
      { tags: { name: 'GetProduct' } }
    );
    
    check(getRes, {
      '✓ Get: status 200': (r) => r.status === 200,
      '✓ Get: correct product': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.product && body.product.id === productId;
        } catch (e) {
          return false;
        }
      },
    });

    // LIST All Products (with pagination)
    const listRes = http.get(`${BASE_URL}/catalogue/products?page=1&limit=20`, { tags: { name: 'ListProducts' } });
    
    check(listRes, {
      '✓ List: status 200': (r) => r.status === 200,
      '✓ List: returns array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.products && Array.isArray(body.products) && body.products.length > 0;
        } catch (e) {
          return false;
        }
      },
      '✓ List: has pagination': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.total !== undefined && body.page !== undefined && body.limit !== undefined && body.totalPages !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    // UPDATE Product (PUT - requires full object)
    const updateData = {
      ...uniqueProduct,
      price: uniqueProduct.price + 50,
      description: `${uniqueProduct.description} [UPDATED]`,
    };

    const updateRes = http.put(
      `${BASE_URL}/catalogue/products/${productId}`,
      JSON.stringify(updateData),
      { headers, tags: { name: 'UpdateProduct' } }
    );

    check(updateRes, {
      '✓ Update: status 200': (r) => r.status === 200,
      '✓ Update: price changed': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.product && body.product.price === updateData.price;
        } catch (e) {
          return false;
        }
      },
    });
  }

  sleep(1);
}

export function setup() {
  console.log('🚀 Simple 10 VU Catalogue Test');
  
  const health = http.get(`${BASE_URL}/catalogue/products?page=1&limit=20`);
  if (health.status !== 200) {
    throw new Error('❌ API not responding!');
  }
  
  console.log('✅ API Ready - Starting test with 10 parallel users');
}
