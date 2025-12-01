# 📊 Test Results Archive

Thư mục này chứa các kết quả test đã chạy trước đây.

## 📁 Danh sách file

### Kết quả Test Cơ bản (Markdown)

| File | Service | Mô tả |
|------|---------|-------|
| `TEST_RESULTS_addon.md` | Addon Service | Kết quả stress test cơ bản |
| `TEST_RESULTS_admin.md` | Admin Dashboard | Kết quả stress test cơ bản |
| `TEST_RESULTS_billing.md` | Billing Service | Kết quả stress test |
| `TEST_RESULTS_catalogue_1.md` | Catalogue Service | Kết quả test lần 1 |
| `TEST_RESULTS_catalogue_2.md` | Catalogue Service | Kết quả test lần 2 |
| `TEST_RESULTS_customer.md` | Customer Service | Kết quả stress test |
| `TEST_RESULTS_inventory.md` | Inventory Service | Kết quả stress test |
| `TEST_RESULTS_order.md` | Order Service | Kết quả stress test |
| `TEST_RESULTS_payment.md` | Payment Service | Kết quả stress test |
| `TEST_RESULTS_subscription.md` | Subscription Service | Kết quả stress test |

### Kết quả Test 1000 VUs (High Load)

| File | Service | Mô tả |
|------|---------|-------|
| `TEST_RESULTS_addon_1000vus.md` | Addon Service | Test 1000 VUs - Phân tích retry mechanism |
| `TEST_RESULTS_admin_1000vus.md` | Admin Dashboard | Test 1000 VUs - CPU/Memory analysis |
| `TEST_RESULTS_retail_flow_1000vus.md` | Retail Flow (E2E) | Test 1000 VUs - Full flow performance |
| `ANALYSIS_addon_1000VUS.md` | Addon Service | Phân tích chi tiết 1000 VUs |

### Summary Files (JSON)

| File | Service | Mô tả |
|------|---------|-------|
| `addon_1000vus_summary.json` | Addon Service | Summary test 1000 VUs |
| `billing_1000vus_summary.json` | Billing Service | Summary test 1000 VUs |
| `customer_breakpoint_summary.json` | Customer Service | Summary breakpoint test |
| `payment_1000vus_summary.json` | Payment Service | Summary test 1000 VUs |

## 📈 Highlights từ các test

### Admin Service (1000 VUs)
- ✅ P95: 556ms, P99: 803ms
- ✅ Throughput: 627 req/s
- ⚠️ CPU tăng dần từ 600 VUs (37ms → 740ms)

### Addon Service (1000 VUs)
- ✅ Error rate giảm từ 6.3% → 0.6% (sau cải tiến retry)
- ✅ Throughput: 459 req/s
- ⚠️ P95: 2223ms

### Retail Flow (1000 VUs)
- ✅ Flow success rate: 81.84%
- ✅ 4284 complete flows
- ⚠️ Order step latency cao nhất (avg 18s)

## 📝 Ghi chú

- Các file này được lưu lại để tham khảo và so sánh với các lần test sau
- Mỗi lần chạy test mới, file summary sẽ được tạo trong thư mục test tương ứng
- Có thể move vào đây để lưu trữ lâu dài
