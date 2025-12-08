# ADD INVENTORY STOCK BEFORE STRESS TEST
# Purpose: Add sufficient stock to products before running order stress tests
# Usage: .\add-inventory-stock.ps1

$BASE_URL = "http://localhost:3000"
$EMAIL = "admin2@demo.com"
$PASSWORD = "Admin@123"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ADD INVENTORY STOCK FOR STRESS TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login
Write-Host "Authenticating..." -ForegroundColor Yellow
$loginBody = @{
    email = $EMAIL
    password = $PASSWORD
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.accessToken
    Write-Host "Authentication successful" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "Authentication failed: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Step 2: Get all products
Write-Host "Fetching products..." -ForegroundColor Yellow
try {
    $productsResponse = Invoke-RestMethod -Uri "$BASE_URL/catalogue/products/my?page=1&limit=100" -Method Get -Headers $headers
    $products = $productsResponse.products
    
    if (-not $products) {
        $products = $productsResponse.items
    }
    if (-not $products) {
        $products = $productsResponse.data
    }
    
    Write-Host "Found $($products.Count) products" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "Failed to fetch products: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Add stock to each product
$stockToAdd = 10000  # Increased to 10k for high-load testing (300 VUs x 21 min)
$successCount = 0
$failCount = 0

Write-Host "Adding $stockToAdd units to each product..." -ForegroundColor Yellow
Write-Host ""

foreach ($product in $products) {
    $productId = $product.id
    $productName = $product.name
    
    if (-not $productId) {
        continue
    }
    
    Write-Host "  Processing: $productName ($productId)" -ForegroundColor Cyan
    
    try {
        # Check current inventory
        $invResponse = Invoke-RestMethod -Uri "$BASE_URL/inventory/product/$productId" -Method Get -Headers $headers -ErrorAction SilentlyContinue
        $currentStock = 0
        
        if ($invResponse.inventory) {
            $currentStock = $invResponse.inventory.quantity
        } elseif ($invResponse.quantity) {
            $currentStock = $invResponse.quantity
        } elseif ($invResponse.availableQuantity) {
            $currentStock = $invResponse.availableQuantity
        }
        
        Write-Host "    Current stock: $currentStock units" -ForegroundColor Gray
        
        # Add stock using adjust endpoint
        $adjustBody = @{
            quantity = $stockToAdd
            reason = "restock"
            notes = "Added for stress test - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        } | ConvertTo-Json
        
        $adjustResponse = Invoke-RestMethod -Uri "$BASE_URL/inventory/product/$productId/adjust" -Method Post -Body $adjustBody -Headers $headers
        
        $newStock = $currentStock + $stockToAdd
        Write-Host "    Stock updated: $currentStock to $newStock units" -ForegroundColor Green
        $successCount++
        
    } catch {
        Write-Host "    Failed to update stock: $_" -ForegroundColor Red
        $failCount++
    }
    
    Start-Sleep -Milliseconds 100
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Success: $successCount products" -ForegroundColor Green
Write-Host "Failed:  $failCount products" -ForegroundColor Red
Write-Host ""
Write-Host "You can now run the stress test!" -ForegroundColor Yellow
Write-Host "Command: k6 run k6-order-1000vus-test.js" -ForegroundColor Yellow
Write-Host ""
