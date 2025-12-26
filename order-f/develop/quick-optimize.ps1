# =============================================
# Quick Optimization for Order Stress Test
# =============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  QUICK ORDER SERVICE OPTIMIZATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "This script will:" -ForegroundColor Yellow
Write-Host "  1. Add 10,000 units of inventory stock to all products" -ForegroundColor White
Write-Host "  2. Verify API Gateway is running" -ForegroundColor White
Write-Host ""
Write-Host "Note: Database indexes should be added manually via MySQL" -ForegroundColor Gray
Write-Host "See: nexora-core-services/bmms/migrations/order/004_add_performance_indexes.sql" -ForegroundColor Gray
Write-Host ""

$ErrorActionPreference = "Continue"

# =============================================
# Add Inventory Stock
# =============================================

Write-Host "[1/2] Adding Inventory Stock..." -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path "add-inventory-stock.ps1")) {
    Write-Host "Error: add-inventory-stock.ps1 not found!" -ForegroundColor Red
    Write-Host "Please run this from: stress-test/order-f/" -ForegroundColor Yellow
    exit 1
}

& .\add-inventory-stock.ps1

Write-Host ""

# =============================================
# Verify Services
# =============================================

Write-Host "[2/2] Verifying Services..." -ForegroundColor Yellow
Write-Host ""

# Check API Gateway
try {
    $response = Invoke-RestMethod -Uri "http://a750437cded034d9784ada6e7f9db76e-79475208.ap-southeast-1.elb.amazonaws.com/orders/my?page=1&limit=1" -Method Get -Headers @{
        "Authorization" = "Bearer test"
    } -TimeoutSec 5 -ErrorAction SilentlyContinue
    Write-Host "API Gateway: Running" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "API Gateway: Running (401 Unauthorized is expected)" -ForegroundColor Green
    } else {
        Write-Host "API Gateway: Not responding" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OPTIMIZATION COMPLETE" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Applied:" -ForegroundColor Green
Write-Host "  Inventory stock: 10,000 units per product" -ForegroundColor White
Write-Host "  Run stress test:" -ForegroundColor White
Write-Host "     k6 run k6-order-150vus-test.js" -ForegroundColor Gray
Write-Host ""
