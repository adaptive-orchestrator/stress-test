import http from 'k6/http';
import { sleep } from 'k6';

// ============================================================================
// SETUP TEST DATA FOR RETAIL MODEL STRESS TEST (ONLY)
// Creates: Test users, Customer profiles, Products, Inventory
// NOT for Subscription Model - Use k6-setup-subscription-test-data.js for that
// ============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://ae081c86deee14a10bdf2bc9a9c88fdb-726197963.ap-southeast-1.elb.amazonaws.com';

// Retail test users (same as in k6-stress-test-retail-model.js)
const RETAIL_USERS = [
  { email: 'stresstest1@demo.com', password: 'Test@123456', name: 'Stress Test User 1', role: 'admin' },
  { email: 'stresstest2@demo.com', password: 'Test@123456', name: 'Stress Test User 2', role: 'admin' },
  { email: 'stresstest3@demo.com', password: 'Test@123456', name: 'Stress Test User 3', role: 'admin' },
  { email: 'stresstest4@demo.com', password: 'Test@123456', name: 'Stress Test User 4', role: 'user' },
  { email: 'stresstest5@demo.com', password: 'Test@123456', name: 'Stress Test User 5', role: 'user' },
  { email: 'retailtest1@demo.com', password: 'Test@123456', name: 'Retail Test User 1', role: 'user' },
  { email: 'retailtest2@demo.com', password: 'Test@123456', name: 'Retail Test User 2', role: 'user' },
  { email: 'retailtest3@demo.com', password: 'Test@123456', name: 'Retail Test User 3', role: 'user' },
  { email: 'retailtest4@demo.com', password: 'Test@123456', name: 'Retail Test User 4', role: 'user' },
  { email: 'retailtest5@demo.com', password: 'Test@123456', name: 'Retail Test User 5', role: 'user' },
];

// Sample products for retail catalogue
const SAMPLE_PRODUCTS = [
  { name: 'iPhone 15 Pro Max', description: '256GB, Titanium Blue', price: 32990000, category: 'Electronics', sku: 'IPHONE-15-PRO' },
  { name: 'Samsung Galaxy S24 Ultra', description: '512GB, Phantom Black', price: 31990000, category: 'Electronics', sku: 'SAMSUNG-S24' },
  { name: 'MacBook Pro 16 M3', description: '1TB SSD, 32GB RAM', price: 62990000, category: 'Computers', sku: 'MBP-M3-16' },
  { name: 'iPad Pro 13 M4', description: '256GB, Silver', price: 28990000, category: 'Tablets', sku: 'IPAD-PRO-13' },
  { name: 'Sony WH-1000XM5', description: 'Wireless Noise Canceling', price: 8990000, category: 'Electronics', sku: 'SONY-XM5' },
  { name: 'Apple Watch Ultra 2', description: 'Titanium, 49mm', price: 21990000, category: 'Wearables', sku: 'WATCH-ULTRA-2' },
  { name: 'Dell XPS 15', description: '4K OLED, Core i9', price: 45990000, category: 'Computers', sku: 'DELL-XPS-15' },
  { name: 'Nike Air Max 90', description: 'Classic White', price: 3990000, category: 'Sports', sku: 'NIKE-AM90' },
  { name: 'Adidas Ultraboost 23', description: 'Running Shoes', price: 4590000, category: 'Sports', sku: 'ADIDAS-UB23' },
  { name: 'Canon EOS R6 II', description: 'Full-frame Mirrorless', price: 59990000, category: 'Electronics', sku: 'CANON-R6-II' },
  { name: 'Sony PlayStation 5', description: 'Digital Edition', price: 13990000, category: 'Electronics', sku: 'PS5-DIGITAL' },
  { name: 'Nintendo Switch OLED', description: 'White Edition', price: 8990000, category: 'Electronics', sku: 'SWITCH-OLED' },
  { name: 'LG OLED TV 65"', description: 'C3 Series 4K', price: 39990000, category: 'Electronics', sku: 'LG-C3-65' },
  { name: 'Dyson V15 Detect', description: 'Cordless Vacuum', price: 17990000, category: 'Home', sku: 'DYSON-V15' },
  { name: 'Samsung Galaxy Buds3', description: 'ANC Wireless Earbuds', price: 4490000, category: 'Electronics', sku: 'BUDS3-PRO' },
];

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  console.log('\n' + '='.repeat(70));
  console.log('RETAIL MODEL - TEST DATA SETUP');
  console.log('='.repeat(70));
  console.log(`Target API: ${BASE_URL}`);
  console.log('='.repeat(70) + '\n');

  let stats = {
    usersCreated: 0,
    usersExisted: 0,
    customersCreated: 0,
    customersExisted: 0,
    productsCreated: 0,
    inventoryCreated: 0,
  };

  // ========== STEP 1: Health Check ==========
  console.log('--- Health Check ---');
  const healthRes = http.get(`${BASE_URL}/catalogue/products/my?page=1&limit=1`);
  if (healthRes.status >= 500) {
    console.log(`✗ API unhealthy: ${healthRes.status}`);
    return;
  }
  console.log('✓ API is healthy\n');

  // ========== STEP 2: Register all retail test users ==========
  console.log('--- Registering Retail Test Users ---');
  const headers = { 'Content-Type': 'application/json' };
  
  for (const user of RETAIL_USERS) {
    // Try login first
    let loginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers }
    );
    
    if (loginRes.status === 200 || loginRes.status === 201) {
      console.log(`○ User exists: ${user.email}`);
      stats.usersExisted++;
      continue;
    }
    
    // If login failed, try signup
    const signupRes = http.post(
      `${BASE_URL}/auth/signup`,
      JSON.stringify({
        email: user.email,
        password: user.password,
        name: user.name,
        role: user.role,
      }),
      { headers }
    );
    
    if (signupRes.status === 201 || signupRes.status === 200) {
      console.log(`✓ User created: ${user.email}`);
      stats.usersCreated++;
    } else if (signupRes.status === 409) {
      console.log(`○ User exists: ${user.email}`);
      stats.usersExisted++;
    } else {
      console.log(`✗ Failed: ${user.email} - ${signupRes.status}`);
    }
    
    sleep(0.1);
  }

  // ========== STEP 3: Get admin token ==========
  console.log('\n--- Getting Admin Token ---');
  const adminLoginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'stresstest1@demo.com', password: 'Test@123456' }),
    { headers }
  );
  
  let adminToken = null;
  if (adminLoginRes.status === 200 || adminLoginRes.status === 201) {
    try {
      const data = JSON.parse(adminLoginRes.body);
      adminToken = data.accessToken || data.access_token;
      console.log('✓ Got admin token');
    } catch (e) {
      console.log('✗ Failed to parse admin token');
      return;
    }
  } else {
    console.log('✗ Admin login failed');
    return;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
  };

  // ========== STEP 4: Create Customer Profiles for all users ==========
  // CRITICAL: Order creation requires customer.id, NOT auth userId!
  console.log('\n--- Creating Customer Profiles ---');
  
  for (const user of RETAIL_USERS) {
    // Login as user to get their token
    const userLoginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers }
    );
    
    if (userLoginRes.status !== 200 && userLoginRes.status !== 201) {
      console.log(`✗ Cannot login as ${user.email}`);
      continue;
    }
    
    let userToken;
    try {
      const data = JSON.parse(userLoginRes.body);
      userToken = data.accessToken || data.access_token;
    } catch (e) {
      console.log(`✗ Cannot parse token for ${user.email}`);
      continue;
    }
    
    const userHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    };
    
    // Check if customer already exists
    const checkRes = http.get(`${BASE_URL}/customers/email/${encodeURIComponent(user.email)}`, { headers: userHeaders });
    
    if (checkRes.status === 200) {
      try {
        const customer = JSON.parse(checkRes.body);
        if (customer && customer.id) {
          console.log(`○ Customer exists: ${user.email} -> ${customer.id}`);
          stats.customersExisted++;
          continue;
        }
      } catch (e) {}
    }
    
    // Create customer profile
    const createRes = http.post(`${BASE_URL}/customers`, JSON.stringify({
      email: user.email,
      name: user.name,
      phone: `090${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
      address: `${Math.floor(Math.random() * 999) + 1} Retail Street, District ${Math.floor(Math.random() * 12) + 1}, HCM`,
    }), { headers: userHeaders });
    
    if (createRes.status === 201 || createRes.status === 200) {
      try {
        const customer = JSON.parse(createRes.body);
        console.log(`✓ Customer created: ${user.email} -> ${customer.customer?.id || customer.id}`);
        stats.customersCreated++;
      } catch (e) {
        console.log(`✓ Customer created: ${user.email}`);
        stats.customersCreated++;
      }
    } else if (createRes.status === 409) {
      console.log(`○ Customer exists: ${user.email}`);
      stats.customersExisted++;
    } else {
      console.log(`✗ Failed to create customer: ${user.email} - ${createRes.status}`);
    }
    
    sleep(0.1);
  }

  // ========== STEP 5: Create Sample Products ==========
  console.log('\n--- Creating Sample Products ---');
  
  // First, fetch existing products to check by SKU
  const existingProductsRes = http.get(`${BASE_URL}/catalogue/products/my?page=1&limit=100`, { headers: authHeaders });
  let existingProducts = [];
  let existingSkuMap = {};
  
  if (existingProductsRes.status === 200) {
    try {
      existingProducts = JSON.parse(existingProductsRes.body).products || [];
      // Build SKU -> product map
      for (const p of existingProducts) {
        if (p.sku) {
          existingSkuMap[p.sku] = p;
        }
      }
      console.log(`Found ${existingProducts.length} existing products`);
    } catch (e) {
      console.log('✗ Failed to parse existing products');
    }
  }
  
  for (const product of SAMPLE_PRODUCTS) {
    // Use fixed SKU (no timestamp) for idempotent setup
    const fixedSku = product.sku;
    
    // Check if product with this SKU already exists
    const existingProduct = existingSkuMap[fixedSku];
    
    if (existingProduct) {
      console.log(`○ Product exists: ${product.name} (SKU: ${fixedSku})`);
      stats.productsCreated++; // Count as success
      continue;
    }
    
    const productData = {
      ...product,
      sku: fixedSku,
      imageUrl: 'https://example.com/product.jpg',
      isActive: true,
    };
    
    const res = http.post(`${BASE_URL}/catalogue/products`, JSON.stringify(productData), { headers: authHeaders });
    
    if (res.status === 201) {
      console.log(`✓ Product created: ${product.name}`);
      stats.productsCreated++;
      // Add to existing map for inventory creation
      try {
        const newProduct = JSON.parse(res.body);
        if (newProduct.product) {
          existingSkuMap[fixedSku] = newProduct.product;
        }
      } catch (e) {}
    } else if (res.status === 409 || res.status === 400) {
      console.log(`○ Product exists (conflict): ${product.name}`);
    } else {
      console.log(`✗ Failed: ${product.name} - ${res.status}`);
    }
    
    sleep(0.1);
  }

  // ========== STEP 6: Create/Update Inventory for Products ==========
  console.log('\n--- Creating/Updating Inventory (Large Stock for Stress Test) ---');
  
  // Get ALL products (multiple pages)
  let products = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore && page <= 10) {
    const productsRes = http.get(`${BASE_URL}/catalogue/products/my?page=${page}&limit=100`, { headers: authHeaders });
    
    if (productsRes.status === 200) {
      try {
        const pageProducts = JSON.parse(productsRes.body).products || [];
        if (pageProducts.length > 0) {
          products = products.concat(pageProducts);
          page++;
        } else {
          hasMore = false;
        }
      } catch (e) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }
  console.log(`Found ${products.length} total products to check inventory`);
  
  // Get ALL existing inventory (multiple pages)
  let existingInventoryMap = {};
  page = 1;
  hasMore = true;
  
  while (hasMore && page <= 10) {
    const existingInvRes = http.get(`${BASE_URL}/inventory/my?page=${page}&limit=100`, { headers: authHeaders });
    
    if (existingInvRes.status === 200) {
      try {
        const invData = JSON.parse(existingInvRes.body);
        const items = invData.items || [];
        if (items.length > 0) {
          for (const inv of items) {
            existingInventoryMap[inv.productId] = inv;
          }
          page++;
        } else {
          hasMore = false;
        }
      } catch (e) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }
  console.log(`Found ${Object.keys(existingInventoryMap).length} existing inventory records`);
  
  // CRITICAL: Minimum stock required for stress test with 1000 VUs
  // Increased to 20000 to achieve 70-85% Write success rate
  const MIN_STOCK_FOR_STRESS_TEST = 20000;
  
  // Create/Update inventory for ALL products with HIGH stock
  for (const product of products) {
    const existing = existingInventoryMap[product.id];
    
    // If inventory exists but stock is low, restock it
    if (existing) {
      if (existing.quantity >= MIN_STOCK_FOR_STRESS_TEST) {
        console.log(`○ Inventory OK: ${product.name} (${existing.quantity} units)`);
        stats.inventoryCreated++;
        continue;
      }
      
      // Need to restock - quantity is too low for stress test
      // Use correct DTO: { quantity, reason } not { adjustment }
      const restockAmount = MIN_STOCK_FOR_STRESS_TEST - existing.quantity + 1000;
      const restockRes = http.post(`${BASE_URL}/inventory/product/${product.id}/adjust`, JSON.stringify({
        quantity: restockAmount,  // FIXED: use 'quantity' not 'adjustment'
        reason: 'restock',
      }), { headers: authHeaders });
      
      if (restockRes.status === 200 || restockRes.status === 201) {
        console.log(`✓ Restocked: ${product.name} (+${restockAmount} -> ${existing.quantity + restockAmount} units)`);
        stats.inventoryCreated++;
      } else {
        console.log(`? Restock failed: ${product.name} - ${restockRes.status}`);
      }
      continue;
    }
    
    // Create new inventory with HIGH stock for stress test
    const inventory = {
      productId: product.id,
      quantity: MIN_STOCK_FOR_STRESS_TEST + Math.floor(Math.random() * 5000), // 20000-25000 units
      reorderLevel: 100,
      warehouseLocation: `WH-${Math.floor(Math.random() * 5) + 1}`,
      maxStock: 50000,
    };
    
    const res = http.post(`${BASE_URL}/inventory/my`, JSON.stringify(inventory), { headers: authHeaders });
    
    if (res.status === 201 || res.status === 200) {
      console.log(`✓ Inventory created: ${product.name} (${inventory.quantity} units)`);
      stats.inventoryCreated++;
    } else if (res.status === 409) {
      // If already exists, try to restock it
      const restockRes = http.post(`${BASE_URL}/inventory/product/${product.id}/adjust`, JSON.stringify({
        quantity: MIN_STOCK_FOR_STRESS_TEST,
        reason: 'restock',
      }), { headers: authHeaders });
      
      if (restockRes.status === 200 || restockRes.status === 201) {
        console.log(`✓ Restocked (was 409): ${product.name} (+${MIN_STOCK_FOR_STRESS_TEST} units)`);
        stats.inventoryCreated++;
      } else {
        console.log(`○ Inventory exists but restock failed: ${product.name}`);
      }
    } else {
      console.log(`? Inventory: ${product.name} - ${res.status}`);
    }
    
    sleep(0.05);
  }

  // ========== VERIFY: List customers and their IDs ==========
  console.log('\n--- Verifying Customer IDs (needed for orders) ---');
  const customersRes = http.get(`${BASE_URL}/customers?page=1&limit=50`, { headers: authHeaders });
  
  if (customersRes.status === 200) {
    try {
      const customersData = JSON.parse(customersRes.body);
      const customers = customersData.customers || [];
      
      console.log(`Total customers in system: ${customers.length}`);
      
      // Map to our test users
      for (const user of RETAIL_USERS) {
        const customer = customers.find(c => c.email === user.email);
        if (customer) {
          console.log(`  ${user.email} -> customer.id: ${customer.id}`);
        } else {
          console.log(`  ${user.email} -> NO CUSTOMER (orders will fail!)`);
        }
      }
    } catch (e) {
      console.log('✗ Failed to verify customers');
    }
  }

  // ========== VERIFY: Products with stock ==========
  console.log('\n--- Verifying Products with Stock ---');
  
  // Re-fetch ALL inventory to verify
  let stockedProducts = 0;
  let totalStock = 0;
  page = 1;
  hasMore = true;
  
  while (hasMore && page <= 10) {
    const inventoryRes = http.get(`${BASE_URL}/inventory/my?page=${page}&limit=100`, { headers: authHeaders });
    
    if (inventoryRes.status === 200) {
      try {
        const invData = JSON.parse(inventoryRes.body);
        const items = invData.items || [];
        if (items.length > 0) {
          for (const item of items) {
            if (item.quantity > 0) {
              stockedProducts++;
              totalStock += item.quantity;
            }
          }
          page++;
        } else {
          hasMore = false;
        }
      } catch (e) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }
  
  console.log(`Products with stock > 0: ${stockedProducts}`);
  console.log(`Total stock units: ${totalStock}`);
  
  // Warn if stock is too low for stress test
  if (totalStock < 50000) {
    console.log(`⚠ WARNING: Total stock (${totalStock}) may be too low for 1000 VU stress test!`);
  } else {
    console.log(`✓ Stock level OK for stress test`);
  }

  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(70));
  console.log('RETAIL MODEL SETUP COMPLETE');
  console.log('='.repeat(70));
  console.log(`Users Created: ${stats.usersCreated}`);
  console.log(`Users Existed: ${stats.usersExisted}`);
  console.log(`Customers Created: ${stats.customersCreated}`);
  console.log(`Customers Existed: ${stats.customersExisted}`);
  console.log(`Products Created: ${stats.productsCreated}`);
  console.log(`Inventory Created: ${stats.inventoryCreated}`);
  console.log(`Products with Stock: ${stockedProducts}`);
  console.log('='.repeat(70));
  console.log('\nReady to run stress test:');
  console.log('  k6 run k6-stress-test-retail-model.js');
  console.log('='.repeat(70) + '\n');
}
