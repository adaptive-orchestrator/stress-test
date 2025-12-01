# 🚀 Stress Test Suite - BMMS Microservices

Bộ công cụ kiểm tra hiệu năng (stress test) cho hệ thống BMMS Microservices sử dụng [K6](https://k6.io/).

## 📋 Mục lục

- [Tổng quan](#tổng-quan)
- [Cài đặt](#cài-đặt)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Chạy test](#chạy-test)
- [Kết quả & Khuyến nghị K8s](#kết-quả--khuyến-nghị-k8s)
- [Các service được test](#các-service-được-test)

## 🎯 Tổng quan

Bộ test này được thiết kế để:
- Đo lường hiệu năng của từng microservice
- Xác định bottleneck và giới hạn tải
- **Tự động tính toán và khuyến nghị cấu hình K8s** (replicas, CPU, Memory)

### ✨ Tính năng nổi bật

Sau khi chạy test, K6 sẽ tự động hiển thị:

```
🎯 K8S RESOURCE RECOMMENDATIONS
============================================================
Service: catalogue-svc
Replicas: 4
CPU Request: 250m
CPU Limit: 1000m
Memory Request: 256Mi
Memory Limit: 768Mi

📋 YAML Configuration:
```yaml
replicas: 4
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "1000m"
    memory: "768Mi"
```

## 🛠 Cài đặt

### 1. Cài đặt K6

**Windows (Chocolatey):**
```powershell
choco install k6
```

**Windows (Scoop):**
```powershell
scoop install k6
```

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### 2. Khởi động services

Đảm bảo các microservices đang chạy trên `http://localhost:3000` (qua API Gateway).

## 📁 Cấu trúc thư mục

```
Stress_Test/
├── README.md                    # File này
├── addon/                       # Addon Service tests
│   ├── k6-addon-1000vus-test.js
│   └── k6-addon-stress-test.js
├── admin/                       # Admin Dashboard tests
│   ├── k6-admin-1000vus-test.js
│   └── k6-admin-stress-test.js
├── ai-chat/                     # AI Chat (LLM Orchestrator) tests
│   └── k6-ai-chat-stress-test.js
├── billing-f/                   # Billing Service tests
│   ├── k6-billing-1000vus-test.js
│   └── k6-billing-stress-test.js
├── Catalogue/                   # Catalogue Service tests
│   ├── k6-catalogue-stress-test.js
│   └── k6-simple-10vu.js
├── customer/                    # Customer Service tests
│   ├── k6-customer-stress-test.js
│   └── k6-breakpoint-test.js
├── inventory/                   # Inventory Service tests
│   └── k6-inventory-stress-test.js
├── order-f/                     # Order Service tests
│   ├── k6-orders-stress-test.js
│   └── k6-orders-simple-10vu.js
├── payment-f/                   # Payment Service tests
│   ├── k6-payment-1000vus-test.js
│   └── k6-payment-stress-test.js
├── project-sf/                  # Project/CRM Service tests
│   └── k6-project-stress-test.js
├── promotion-not/               # Promotion (Pricing Engine) tests
│   └── k6-promotion-stress-test.js
├── retail-flow/                 # End-to-End Retail Flow tests
│   ├── k6-retail-flow-1000vus-test.js
│   └── k6-retail-flow-stress-test.js
└── subscription-f/              # Subscription Service tests
    └── k6-subscription-stress-test.js
```

## 🚀 Chạy test

### Chạy test cơ bản (100 VUs)

```powershell
# Catalogue Service
k6 run Stress_Test/Catalogue/k6-catalogue-stress-test.js

# Customer Service  
k6 run Stress_Test/customer/k6-customer-stress-test.js

# Inventory Service
k6 run Stress_Test/inventory/k6-inventory-stress-test.js

# Order Service
k6 run Stress_Test/order-f/k6-orders-stress-test.js

# Payment Service
k6 run Stress_Test/payment-f/k6-payment-stress-test.js

# Billing Service
k6 run Stress_Test/billing-f/k6-billing-stress-test.js

# Subscription Service
k6 run Stress_Test/subscription-f/k6-subscription-stress-test.js

# Addon Service
k6 run Stress_Test/addon/k6-addon-stress-test.js

# Promotion Service
k6 run Stress_Test/promotion-not/k6-promotion-stress-test.js
```

### Chạy test tải cao (1000 VUs)

```powershell
# Addon - 1000 VUs
k6 run Stress_Test/addon/k6-addon-1000vus-test.js

# Admin - 1000 VUs
k6 run Stress_Test/admin/k6-admin-1000vus-test.js

# Billing - 500 VUs
k6 run Stress_Test/billing-f/k6-billing-1000vus-test.js

# Payment - 1000 VUs
k6 run Stress_Test/payment-f/k6-payment-1000vus-test.js

# Retail Flow - 1000 VUs (End-to-End)
k6 run Stress_Test/retail-flow/k6-retail-flow-1000vus-test.js
```

### Chạy với custom BASE_URL

```powershell
k6 run -e BASE_URL=http://your-server:3000 Stress_Test/Catalogue/k6-catalogue-stress-test.js
```

## 📊 Kết quả & Khuyến nghị K8s

### Output mẫu sau khi test:

```
============================================================
🎯 K8S RESOURCE RECOMMENDATIONS
============================================================
Service: catalogue-svc
Replicas: 4
CPU Request: 250m
CPU Limit: 1000m
Memory Request: 256Mi
Memory Limit: 768Mi

📋 YAML Configuration:
```yaml
replicas: 4
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "1000m"
    memory: "768Mi"
```
============================================================
```

### Cách tính toán khuyến nghị

| Metric | Điều kiện | Hành động |
|--------|-----------|-----------|
| P95 Response Time | > 2000ms | Tăng CPU lên 500m/2000m |
| P95 Response Time | > 1000ms | Tăng CPU lên 250m/1000m |
| HTTP Wait Time | > 1000ms | Tăng CPU (server processing) |
| HTTP Blocked Time | > 500ms | Tăng Memory (connection pool) |
| Throughput | > 500 req/s | Tăng Memory |
| Error Rate | > 10% | Tăng replicas |
| P99 Response Time | > 5000ms | Tăng replicas |

### Retail Flow - Khuyến nghị cho nhiều services

Test `retail-flow` sẽ tự động khuyến nghị cho TẤT CẢ các services:

```
📦 catalogue-svc:
   Replicas: 4
   CPU: 250m / 1000m
   Memory: 256Mi / 768Mi

📦 inventory-svc:
   Replicas: 5
   CPU: 300m / 1500m
   Memory: 384Mi / 768Mi

📦 order-svc:
   Replicas: 6
   CPU: 500m / 2000m
   Memory: 512Mi / 1Gi

📦 billing-svc:
   Replicas: 4
   CPU: 200m / 1000m
   Memory: 256Mi / 640Mi

📦 payment-svc:
   Replicas: 5
   CPU: 300m / 1500m
   Memory: 384Mi / 768Mi

📦 customer-svc:
   Replicas: 3
   CPU: 150m / 750m
   Memory: 192Mi / 512Mi
```

## 🎮 Các service được test

| Service | Thư mục | Max VUs | Mô tả |
|---------|---------|---------|-------|
| Catalogue | `Catalogue/` | 100 | CRUD sản phẩm |
| Customer | `customer/` | 100 | Quản lý khách hàng |
| Inventory | `inventory/` | 100 | Quản lý kho |
| Order | `order-f/` | 100 | Đơn hàng |
| Payment | `payment-f/` | 1000 | Thanh toán |
| Billing | `billing-f/` | 500 | Hóa đơn |
| Subscription | `subscription-f/` | 100 | Gói đăng ký |
| Addon | `addon/` | 1000 | Addon/tiện ích |
| Promotion | `promotion-not/` | 100 | Khuyến mãi |
| Admin | `admin/` | 1000 | Dashboard admin |
| AI Chat | `ai-chat/` | 100 | LLM Orchestrator |
| Project | `project-sf/` | 100 | CRM/Project |
| **Retail Flow** | `retail-flow/` | 1000 | **E2E Flow** |

## 📝 Ghi chú

1. **Retail Flow** là test end-to-end quan trọng nhất, mô phỏng luồng bán hàng hoàn chỉnh
2. Kết quả test được lưu trong file `*-summary.json` tại mỗi thư mục
3. Khuyến nghị K8s được tính toán dựa trên điều kiện thực tế của test
4. Nên chạy test trên môi trường staging trước khi áp dụng vào production

## 🔧 Troubleshooting

### API không phản hồi
```powershell
# Kiểm tra services đang chạy
curl http://localhost:3000/health
```

### Lỗi connection refused
- Đảm bảo API Gateway đang chạy trên port 3000
- Kiểm tra firewall không block port

### Test fail với error rate cao
- Giảm số VUs xuống
- Kiểm tra resources của server (CPU, Memory)
- Xem logs của services
