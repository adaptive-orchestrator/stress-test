#!/usr/bin/env pwsh
# Setup script to pre-seed inventory data before running k6 tests
# This ensures Kafka events have time to process before the load test starts

$BASE_URL = "http://localhost:3000"
$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Inventory Test Data Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test user credentials
$email = "admin2@demo.com"
$password = "Admin@123"

Write-Host "1. Authenticating..." -ForegroundColor Yellow

# Signup (ignore error if user exists)
$userExists = $false
try {
    $signupBody = @{
        email = $email
        password = $password
        role = "admin"
    } | ConvertTo-Json

    $signupResult = Invoke-RestMethod -Uri "$BASE_URL/auth/signup" `
        -Method Post `
        -ContentType "application/json" `
        -Body $signupBody `
        -ErrorAction Stop
    
    Write-Host "[OK] User created successfully" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409 -or $_.Exception.Message -like "*already exists*") {
        Write-Host "[INFO] User already exists, proceeding with login..." -ForegroundColor Cyan
        $userExists = $true
    } else {
        Write-Host "[WARNING] Signup error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Login
$loginBody = @{
    email = $email
    password = $password
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$BASE_URL/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginBody
} catch {
    Write-Host "[ERROR] Login failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please check if auth service is running or credentials are correct." -ForegroundColor Yellow
    exit 1
}

$token = $loginResponse.accessToken
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "[OK] Authenticated successfully" -ForegroundColor Green
Write-Host ""

# Check existing inventory
Write-Host "2. Checking existing inventory..." -ForegroundColor Yellow
$inventoryUrl = "$BASE_URL/inventory/my?page=1`&limit=50"
$inventoryResponse = Invoke-RestMethod -Uri $inventoryUrl `
    -Method Get `
    -Headers $headers

$existingCount = 0
if ($inventoryResponse.items) {
    $existingCount = $inventoryResponse.items.Count
} elseif ($inventoryResponse.inventories) {
    $existingCount = $inventoryResponse.inventories.Count
} elseif ($inventoryResponse.data) {
    $existingCount = $inventoryResponse.data.Count
}

Write-Host "Found $existingCount existing inventory records" -ForegroundColor Cyan

if ($existingCount -ge 10) {
    Write-Host "[OK] Sufficient inventory data already exists. Skipping setup." -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now run: k6 run k6-inventory-stress-test.js" -ForegroundColor Cyan
    exit 0
}

# Create sample products
Write-Host ""
Write-Host "3. Creating sample products in catalogue..." -ForegroundColor Yellow

$products = @(
    @{ name = "iPhone 15 Pro"; sku = "IPH15P-001"; description = "Apple flagship phone"; price = 999.99; stock = 50; category = "Smartphones" },
    @{ name = "Samsung Galaxy S24"; sku = "SAMS24-001"; description = "Samsung flagship"; price = 899.99; stock = 40; category = "Smartphones" },
    @{ name = "MacBook Pro M3"; sku = "MBPM3-001"; description = "Professional laptop"; price = 2499.99; stock = 30; category = "Laptops" },
    @{ name = "iPad Pro"; sku = "IPADP-001"; description = "Tablet for professionals"; price = 1099.99; stock = 35; category = "Tablets" },
    @{ name = "Sony WH-1000XM5"; sku = "SONYWH-001"; description = "Noise cancelling headphones"; price = 399.99; stock = 60; category = "Audio" },
    @{ name = "Apple Watch Series 9"; sku = "AWS9-001"; description = "Smartwatch"; price = 429.99; stock = 45; category = "Wearables" },
    @{ name = "Dell XPS 15"; sku = "DXPS15-001"; description = "High-performance laptop"; price = 1799.99; stock = 25; category = "Laptops" },
    @{ name = "AirPods Pro 2"; sku = "AIRP2-001"; description = "Wireless earbuds"; price = 249.99; stock = 70; category = "Audio" },
    @{ name = "Nintendo Switch OLED"; sku = "NSW-OLED-001"; description = "Gaming console"; price = 349.99; stock = 55; category = "Gaming" },
    @{ name = "Logitech MX Master 3S"; sku = "LOGMX3S-001"; description = "Wireless mouse"; price = 99.99; stock = 80; category = "Accessories" }
)

$createdProducts = @()

foreach ($product in $products) {
    try {
        # Add unique suffix to SKU to avoid duplicates
        $uniqueProduct = $product.Clone()
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $uniqueProduct.sku = "$($product.sku)-$timestamp"
        
        $productBody = $uniqueProduct | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$BASE_URL/catalogue/products" `
            -Method Post `
            -Headers $headers `
            -Body $productBody
        
        $createdProducts += $response
        Write-Host "  [+] Created: $($product.name)" -ForegroundColor Gray
    } catch {
        $errorMsg = $_.Exception.Message
        if ($_.ErrorDetails.Message) {
            $errorMsg = $_.ErrorDetails.Message
        }
        Write-Host "  [!] Failed to create $($product.name): $errorMsg" -ForegroundColor Yellow
    }
}

Write-Host "[OK] Created $($createdProducts.Count) products" -ForegroundColor Green

if ($createdProducts.Count -eq 0) {
    Write-Host "[ERROR] No products were created. Cannot proceed with inventory setup." -ForegroundColor Red
    Write-Host "Please check catalogue service logs for details." -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Create inventory records directly via API instead of waiting for Kafka
Write-Host "4. Creating inventory records for products..." -ForegroundColor Yellow

# Create a simple stock mapping based on index
$stockLevels = @(50, 40, 30, 35, 60, 45, 25, 70, 55, 80)

$inventoryCreated = 0
$inventoryFailed = 0
$index = 0

foreach ($product in $createdProducts) {
    try {
        $productId = $product.product.id
        $productName = $product.product.name
        
        # Use stock from array by index, default to 50 if out of range
        $initialStock = if ($index -lt $stockLevels.Count) { $stockLevels[$index] } else { 50 }
        
        # Use adjust API which auto-creates inventory if not exists
        $adjustBody = @{
            quantity = $initialStock
            reason = "restock"
        } | ConvertTo-Json

        $invResponse = Invoke-RestMethod -Uri "$BASE_URL/inventory/product/$productId/adjust" `
            -Method Post `
            -Headers $headers `
            -Body $adjustBody
        
        $inventoryCreated++
        Write-Host "  [+] Created inventory for: $productName (Stock: $initialStock)" -ForegroundColor Gray
        $index++
    } catch {
        $inventoryFailed++
        $errorMsg = $_.Exception.Message
        if ($_.ErrorDetails.Message) {
            $errorMsg = $_.ErrorDetails.Message
        }
        Write-Host "  [!] Failed to create inventory for $productName`: $errorMsg" -ForegroundColor Yellow
        $index++
    }
}

Write-Host "[OK] Created $inventoryCreated inventory records ($inventoryFailed failed)" -ForegroundColor Green
Write-Host ""

if ($inventoryCreated -eq 0) {
    Write-Host "[ERROR] No inventory records were created. Cannot proceed with stress test." -ForegroundColor Red
    Write-Host "Please check inventory service logs for details." -ForegroundColor Yellow
    exit 1
}

# Verify inventory is accessible
Write-Host "5. Verifying inventory data..." -ForegroundColor Yellow
$checkUrl = "$BASE_URL/inventory/my?page=1`&limit=50"
$checkResponse = Invoke-RestMethod -Uri $checkUrl `
    -Method Get `
    -Headers $headers

$finalCount = 0
if ($checkResponse.items) {
    $finalCount = $checkResponse.items.Count
} elseif ($checkResponse.inventories) {
    $finalCount = $checkResponse.inventories.Count
} elseif ($checkResponse.data) {
    $finalCount = $checkResponse.data.Count
}

Write-Host "[OK] Found $finalCount accessible inventory records" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  - Products created: $($createdProducts.Count)" -ForegroundColor White
Write-Host "  - Inventory records: $inventoryCreated" -ForegroundColor White
Write-Host "  - Accessible inventory: $finalCount" -ForegroundColor White
Write-Host ""
Write-Host "You can now run:" -ForegroundColor Cyan
Write-Host "  k6 run k6-inventory-stress-test.js" -ForegroundColor White
Write-Host "  k6 run k6-inventory-1000vus-test.js" -ForegroundColor White
Write-Host ""
