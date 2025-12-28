# Kịch bản 4: Kiểm tra Giới hạn chịu tải và Khả năng Mở rộng

## Mục tiêu

Kịch bản này nhằm kiểm chứng **Mục tiêu 5**: Xác định giới hạn chịu tải (Breaking Point) của kiến trúc Microservices và đánh giá sự thay đổi về đặc tính hiệu năng khi hệ thống chuyển đổi giữa các mô hình kinh doanh khác nhau.

## Thiết lập thực nghiệm tải (Load Testing Setup)

| Thông số | Giá trị |
|----------|---------|
| **Công cụ tạo tải** | Grafana k6 |
| **Base URL** | `http://ae081c86deee14a10bdf2bc9a9c88fdb-726197963.ap-southeast-1.elb.amazonaws.com` |
| **Mô hình tải** | Step Load (Tải bậc thang) |

### Các giai đoạn tải (Stages)

| Giai đoạn | Thời gian | Target VUs | Mô tả |
|-----------|-----------|------------|-------|
| **Ramp-up** | 2 phút | 0 → 1000 | Tăng dần số VUs |
| **Steady State** | 5 phút | 1000 | Duy trì tải đỉnh |
| **Ramp-down** | 1 phút | 1000 → 0 | Giảm dần về 0 |

## Cấu trúc thư mục

```
stress-test/scenario-4/
├── README.md                              # File này
├── k6-setup-retail-test-data.js           # Script setup data CHỈ cho Retail Model
├── k6-setup-subscription-test-data.js     # Script setup data CHỈ cho Subscription Model
├── k6-stress-test-retail-model.js         # Test Case A - Retail Model
├── k6-stress-test-subscription-model.js   # Test Case B - Subscription Model
├── k6-setup-test-data.js                  # [DEPRECATED] Không sử dụng
├── retail-model-summary.json              # Kết quả Test Case A (sau khi chạy)
└── subscription-model-summary.json        # Kết quả Test Case B (sau khi chạy)
```

**⚠️ LƯU Ý QUAN TRỌNG**: Hệ thống KHÔNG chạy đồng thời cả Retail và Subscription Model. 
Chọn MỘT trong hai model và sử dụng setup script tương ứng.

## Yêu cầu hệ thống

- [k6](https://k6.io/docs/getting-started/installation/) đã được cài đặt
- Network access đến API endpoint
- Đủ RAM và CPU cho 1000 VUs (khuyến nghị: 8GB RAM, 4 CPU cores)

## Hướng dẫn chạy test

### ⚠️ Chọn MỘT model để test (không chạy song song)

---

### Test Case A: Retail Model

#### Bước 1: Chuẩn bị dữ liệu test

```bash
cd stress-test/scenario-4
k6 run k6-setup-retail-test-data.js
```

Script này sẽ:
- Tạo 10 Retail Test Users (stresstest1-5@demo.com, retailtest1-5@demo.com)
- Tạo Customer Profiles cho mỗi user (QUAN TRỌNG: cần để tạo orders)
- Tạo 15 Sample Products trong catalogue
- Tạo Inventory cho các products

#### Bước 2: Chạy Retail Model Stress Test

```bash
# Chạy với BASE_URL mặc định
k6 run k6-stress-test-retail-model.js

# Hoặc chỉ định BASE_URL custom
k6 run -e BASE_URL=http://your-api-url k6-stress-test-retail-model.js

# Chạy với output JSON chi tiết
k6 run --out json=retail-results.json k6-stress-test-retail-model.js
```

---

### Test Case B: Subscription Model

#### Bước 1: Chuẩn bị dữ liệu test

```bash
cd stress-test/scenario-4
k6 run k6-setup-subscription-test-data.js
```

Script này sẽ:
- Tạo 10 Subscription Test Users (subtest1-10@demo.com)
- Tạo Customer Profiles cho mỗi user (QUAN TRỌNG: cần để tạo subscriptions)
- Tạo 8 Features
- Tạo 5 Subscription Plans

#### Bước 2: Chạy Subscription Model Stress Test

```bash
# Chạy với BASE_URL mặc định
k6 run k6-stress-test-subscription-model.js

# Hoặc chỉ định BASE_URL custom
k6 run -e BASE_URL=http://your-api-url k6-stress-test-subscription-model.js

# Chạy với output JSON chi tiết
k6 run --out json=subscription-results.json k6-stress-test-subscription-model.js
```

## Các Test Cases

### Test Case A: Retail Model (Read-Heavy)

**Mô tả**: Mô phỏng hành vi người dùng thương mại điện tử truyền thống.

**Đặc điểm**:
- Tỷ lệ: **90% Read** / **10% Write**
- Tải tập trung vào: `catalogue-svc`

**Phân bổ Read Operations (90%)**:
| Operation | Tỷ lệ | Endpoint |
|-----------|-------|----------|
| Browse Products | 35% | `GET /catalogue/products/my` |
| View Product Detail | 20% | `GET /catalogue/products/my/:id` |
| Browse Plans | 15% | `GET /catalogue/plans` |
| Browse Features | 10% | `GET /catalogue/features` |
| View My Orders | 10% | `GET /orders/my` |
| View Inventory | 5% | `GET /inventory/my` |
| View Invoices | 5% | `GET /invoices` |

**Write Operations (10%)** - Full Order Flow:
1. Create Product → `POST /catalogue/products`
2. Create Inventory → `POST /inventory/my`
3. Create Order → `POST /orders`
4. Create Invoice → `POST /invoices`

**Metrics mục tiêu**:
| Metric | Target |
|--------|--------|
| Throughput | ~450 req/s |
| Latency P95 | <120 ms |
| Error Rate | <0.1% |
| Success Rate | >99% |

---

### Test Case B: Subscription Model (Complex Logic)

**Mô tả**: Mô phỏng hành vi đăng ký dịch vụ định kỳ.

**Đặc điểm**:
- Logic nghiệp vụ phức tạp
- Giao dịch chặt chẽ giữa `billing-svc` và `subscription-svc`
- Tải tập trung vào tính toán và ghi dữ liệu

**Phân bổ Operations**:
| Operation Flow | Tỷ lệ | Mô tả |
|----------------|-------|-------|
| Subscription Lifecycle | 35% | Create subscription + billing |
| Subscription Modification | 25% | Change plan, renew, cancel |
| Billing Reconciliation | 20% | Invoice management |
| View Subscriptions | 10% | Get user subscriptions |
| Invoice Operations | 10% | List/view invoices |

**Subscription Lifecycle Flow**:
1. Get Plans → `GET /catalogue/plans`
2. Get My Subscriptions → `GET /subscriptions/my`
3. Create Subscription → `POST /subscriptions`
4. Create Invoice → `POST /invoices`
5. Update Invoice Status → `PATCH /invoices/:id/status`
6. Initiate Payment → `POST /payments/initiate`

**Metrics mục tiêu**:
| Metric | Target |
|--------|--------|
| Throughput | ~320 req/s |
| Latency P95 | <280 ms |
| Error Rate | <0.5% |
| Success Rate | >98% |
| CPU Usage | ~78% |

## Giải thích kết quả

### Output Summary

Sau khi chạy test, bạn sẽ thấy output tương tự:

```
╔══════════════════════════════════════════════════════════════════════╗
║           RETAIL MODEL STRESS TEST - FINAL RESULTS                   ║
╠══════════════════════════════════════════════════════════════════════╣
║ Duration: 480.00s | Max VUs: 1000                               
║ Throughput: 456.25 req/s (Total: 219000)
╠══════════════════════════════════════════════════════════════════════╣
║ LATENCY                                                              ║
║   Overall P95: 118.45ms
║   Read P95: 95.32ms
║   Write P95: 245.67ms
║   Catalogue P95: 85.21ms
╠══════════════════════════════════════════════════════════════════════╣
║ SUCCESS RATES                                                        ║
║   Overall: 99.85%
║   Read: 99.92%
║   Write: 98.45%
║   HTTP Errors: 0.02%
╚══════════════════════════════════════════════════════════════════════╝
```

### JSON Summary Files

Sau khi test hoàn thành, file JSON summary sẽ được tạo:

- `retail-model-summary.json` - Kết quả Test Case A
- `subscription-model-summary.json` - Kết quả Test Case B

### Các metrics quan trọng

| Metric | Mô tả | Ngưỡng chấp nhận |
|--------|-------|------------------|
| `http_req_duration` | Thời gian response | P95 < 500ms |
| `http_req_failed` | Tỷ lệ request thất bại | < 1% |
| `success_rate` | Tỷ lệ thành công | > 95% |
| `throughput` | Số request/giây | Tùy model |

## So sánh kết quả mong đợi

| Chỉ số (Metric) | Retail Model | Subscription Model | Đánh giá |
|-----------------|--------------|---------------------|----------|
| **Throughput (RPS)** | ~450 req/s | ~320 req/s | Logic phức tạp làm giảm RPS |
| **Latency P95** | ~120 ms | ~280 ms | Nằm trong ngưỡng (<500ms) |
| **Error Rate** | ~0.0% | ~0.2% | Hệ thống ổn định |
| **CPU Usage (Avg)** | ~45% | ~78% | Subscription tốn nhiều CPU hơn |
| **Memory Usage (Avg)** | ~30% | ~40% | Chênh lệch không đáng kể |

## Tips và Troubleshooting

### 1. Authentication failed

Nếu users không thể đăng nhập:
```bash
# Chạy lại setup script
k6 run k6-setup-test-data.js
```

### 2. Giảm số VUs để test local

Sửa trong file test:
```javascript
export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Giảm xuống 100 VUs
    { duration: '3m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  // ...
};
```

### 3. Tăng timeout cho network chậm

```bash
k6 run --http-debug k6-stress-test-retail-model.js
```

### 4. Xuất kết quả ra InfluxDB + Grafana

```bash
k6 run --out influxdb=http://localhost:8086/k6 k6-stress-test-retail-model.js
```

### 5. Chạy với Cloud k6

```bash
k6 cloud k6-stress-test-retail-model.js
```

## Kết luận

Qua kịch bản stress test này, chúng ta có thể:

1. **Xác định giới hạn chịu tải** (Breaking Point) của hệ thống microservices
2. **So sánh đặc tính hiệu năng** giữa Retail Model và Subscription Model
3. **Đánh giá khả năng mở rộng** (Scalability) khi logic nghiệp vụ thay đổi
4. **Thu thập dữ liệu** cho việc tối ưu hóa hạ tầng và resource allocation
