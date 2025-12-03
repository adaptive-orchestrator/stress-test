// stress-test/utils/seed-test-users.js
// Script to create test users for stress testing with data isolation
// Run this before running stress tests: node seed-test-users.js

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const TEST_USERS = [
  { email: 'testuser1@example.com', password: 'test123456', name: 'Test User 1' },
  { email: 'testuser2@example.com', password: 'test123456', name: 'Test User 2' },
  { email: 'testuser3@example.com', password: 'test123456', name: 'Test User 3' },
  { email: 'testuser4@example.com', password: 'test123456', name: 'Test User 4' },
  { email: 'testuser5@example.com', password: 'test123456', name: 'Test User 5' },
  { email: 'testuser6@example.com', password: 'test123456', name: 'Test User 6' },
  { email: 'testuser7@example.com', password: 'test123456', name: 'Test User 7' },
  { email: 'testuser8@example.com', password: 'test123456', name: 'Test User 8' },
  { email: 'testuser9@example.com', password: 'test123456', name: 'Test User 9' },
  { email: 'testuser10@example.com', password: 'test123456', name: 'Test User 10' },
];

const ADMIN_USER = {
  email: 'admin@example.com',
  password: 'admin123456',
  name: 'Admin User',
  role: 'admin',
};

async function createUser(user) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}/auth/signup`);
    const data = JSON.stringify(user);

    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 201 || res.statusCode === 200) {
          console.log(`✅ Created user: ${user.email}`);
          resolve({ success: true, user: user.email });
        } else if (res.statusCode === 409) {
          console.log(`⏭️  User exists: ${user.email}`);
          resolve({ success: true, user: user.email, existed: true });
        } else {
          console.error(`❌ Failed to create ${user.email}: ${res.statusCode} - ${body}`);
          resolve({ success: false, user: user.email, error: body });
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ Error creating ${user.email}: ${e.message}`);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('='.repeat(50));
  console.log('🔧 Seeding test users for stress testing');
  console.log(`API: ${BASE_URL}`);
  console.log('='.repeat(50));
  console.log('');

  // Create admin user first
  console.log('Creating admin user...');
  await createUser(ADMIN_USER);
  console.log('');

  // Create test users
  console.log('Creating test users...');
  for (const user of TEST_USERS) {
    await createUser(user);
  }

  console.log('');
  console.log('='.repeat(50));
  console.log('✅ User seeding complete!');
  console.log('You can now run the stress tests.');
  console.log('='.repeat(50));
}

main().catch(console.error);
