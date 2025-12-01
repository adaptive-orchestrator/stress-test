# Retail Flow Stress Test

## Mô tả

Stress test cho luồng retail hoàn chỉnh, bao gồm 4 bước:

1. **Thêm sản phẩm (Catalogue)** - Tạo sản phẩm mới
2. **Cập nhật kho hàng (Inventory)** - Thêm tồn kho cho sản phẩm
3. **Đặt hàng (Order)** - Tạo và xác nhận đơn hàng
4. **Thanh toán (Payment)** - Tạo hóa đơn và xử lý thanh toán

## Các file test

| File | Mô tả | VUs | Duration |
|------|-------|-----|----------|
| `k6-retail-flow-simple-10vu.js` | Test nhanh để kiểm tra flow | 10 | 2 phút |
| `k6-retail-flow-stress-test.js` | Stress test chuẩn | 10 → 100 | ~6.5 phút |
| `k6-retail-flow-1000vus-test.js` | High load test | 100 → 1000 | ~11 phút |

## Cách chạy

### 1. Test nhanh (10 VUs)
```powershell
k6 run k6-retail-flow-simple-10vu.js
```

### 2. Stress test chuẩn (10-100 VUs)
```powershell
k6 run k6-retail-flow-stress-test.js
```

### 3. High load test (1000 VUs)
```powershell
k6 run k6-retail-flow-1000vus-test.js
```

### Tùy chỉnh URL
```powershell
k6 run -e BASE_URL=http://your-api:3000 k6-retail-flow-stress-test.js
```

### Xuất kết quả JSON
```powershell
k6 run --out json=results.json k6-retail-flow-stress-test.js
```

### Xuất summary JSON
```powershell
k6 run --summary-export=summary.json k6-retail-flow-stress-test.js
```

## Metrics quan trọng

### Flow Metrics
- `retail_flow_completed` - Số flow hoàn thành thành công
- `retail_flow_failed` - Số flow thất bại
- `flow_success_rate` - Tỷ lệ thành công của flow

### Step Metrics
- `step1_product_created` - Số sản phẩm tạo thành công
- `step2_inventory_updated` - Số inventory tạo thành công
- `step3_order_created` - Số order tạo thành công
- `step4_payment_completed` - Số payment hoàn thành

### Latency Metrics
- `step1_product_latency` - Thời gian tạo sản phẩm
- `step2_inventory_latency` - Thời gian cập nhật kho
- `step3_order_latency` - Thời gian tạo đơn hàng
- `step4_payment_latency` - Thời gian thanh toán
- `total_flow_latency` - Tổng thời gian toàn bộ flow

## Thresholds

### Stress Test Chuẩn (100 VUs)
| Metric | Threshold |
|--------|-----------|
| `http_req_duration (p95)` | < 1000ms |
| `http_req_failed` | < 15% |
| `flow_success_rate` | > 80% |
| `total_flow_latency (p95)` | < 3500ms |

### High Load Test (1000 VUs)
| Metric | Threshold |
|--------|-----------|
| `http_req_duration (p95)` | < 2000ms |
| `http_req_failed` | < 25% |
| `flow_success_rate` | > 60% |
| `total_flow_latency (p95)` | < 6000ms |

## Yêu cầu

1. Tất cả các service phải đang chạy:
   - Catalogue Service (port 3000 qua API Gateway)
   - Inventory Service
   - Order Service
   - Billing Service (invoices)
   - Payment Service

2. API Gateway đang chạy tại `http://localhost:3000`

3. k6 đã được cài đặt:
   ```powershell
   winget install k6
   # hoặc
   choco install k6
   ```

## Kết quả mẫu

```
     ✓ product created (201)
     ✓ inventory created (201/200)
     ✓ order created (201)
     ✓ payment initiated (201)
     ✓ payment confirmed (200)

     checks.........................: 95.23% ✓ 4521  ✗ 227
     data_received..................: 12 MB  185 kB/s
     data_sent......................: 8.5 MB 131 kB/s
     
     retail_flow_completed..........: 892
     retail_flow_failed.............: 108
     flow_success_rate..............: 89.20%
     
     step1_product_latency..........: avg=45ms  p(95)=120ms
     step2_inventory_latency........: avg=35ms  p(95)=95ms
     step3_order_latency............: avg=55ms  p(95)=150ms
     step4_payment_latency..........: avg=65ms  p(95)=180ms
     total_flow_latency.............: avg=350ms p(95)=850ms
     
     http_req_duration..............: avg=52ms  p(95)=145ms
     http_req_failed................: 4.77%  ✓ 227   ✗ 4521
     http_reqs......................: 5892   90.6/s
     iteration_duration.............: avg=2.1s  min=800ms max=5.2s
     iterations.....................: 1000   15.38/s
     vus............................: 100    min=10   max=100
```

## Troubleshooting

### Flow fail ở Step 1 (Product)
- Kiểm tra Catalogue Service đang chạy
- Kiểm tra SKU có bị duplicate không

### Flow fail ở Step 2 (Inventory)
- Kiểm tra Inventory Service
- Kiểm tra productId có tồn tại không

### Flow fail ở Step 3 (Order)
- Kiểm tra Order Service
- Kiểm tra customerId có hợp lệ không

### Flow fail ở Step 4 (Payment)
- Kiểm tra Billing và Payment Service
- Kiểm tra invoiceId có unique không

### High error rate
- Giảm số VUs
- Tăng sleep time giữa các iteration
- Kiểm tra database connection pool
- Kiểm tra memory/CPU của services
