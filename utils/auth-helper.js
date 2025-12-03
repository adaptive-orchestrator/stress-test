// stress-test/utils/auth-helper.js
// Helper functions for authenticated stress tests

/**
 * Login and get JWT token for stress testing
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} baseUrl - API base URL
 * @returns {object} - { token, userId, headers }
 */
export function login(http, email, password, baseUrl) {
  const loginRes = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (loginRes.status !== 200) {
    console.error(`Login failed for ${email}: ${loginRes.status}`);
    return null;
  }

  try {
    const body = JSON.parse(loginRes.body);
    return {
      token: body.token || body.access_token,
      userId: body.user?.id || body.userId,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${body.token || body.access_token}`,
      },
    };
  } catch (e) {
    console.error('Failed to parse login response:', e);
    return null;
  }
}

/**
 * Create authenticated headers from token
 * @param {string} token - JWT token
 * @returns {object} - Headers object
 */
export function getAuthHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Generate test users for stress testing
 * Each VU gets a unique user to ensure data isolation testing
 * @param {number} vuIndex - Virtual User index
 * @param {number} iteration - Test iteration
 * @returns {object} - { email, password }
 */
export function getTestUser(vuIndex, iteration) {
  // Use VU index to assign users
  // This ensures each VU operates with its own user account
  const userIndex = (vuIndex % 10) + 1; // 10 test users
  return {
    email: `testuser${userIndex}@example.com`,
    password: 'test123456',
  };
}

/**
 * Test user configuration for stress testing
 * These users should be created in the database before running tests
 */
export const TEST_USERS = [
  { email: 'testuser1@example.com', password: 'test123456' },
  { email: 'testuser2@example.com', password: 'test123456' },
  { email: 'testuser3@example.com', password: 'test123456' },
  { email: 'testuser4@example.com', password: 'test123456' },
  { email: 'testuser5@example.com', password: 'test123456' },
  { email: 'testuser6@example.com', password: 'test123456' },
  { email: 'testuser7@example.com', password: 'test123456' },
  { email: 'testuser8@example.com', password: 'test123456' },
  { email: 'testuser9@example.com', password: 'test123456' },
  { email: 'testuser10@example.com', password: 'test123456' },
];

/**
 * Admin user for testing admin-only endpoints
 */
export const ADMIN_USER = {
  email: 'admin@example.com',
  password: 'admin123456',
};
