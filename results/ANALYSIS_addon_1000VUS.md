# 📊 Phân Tích Stress Test 1000 VUs - Addon API

## 🎯 Tổng Quan Test

| Metric | Giá trị |
|--------|---------|
| **Max VUs** | 1000 |
| **Thời gian test** | 7 phút |
| **Total Requests** | 92,742 |
| **Failed Requests** | 0 (0%) |
| **Throughput** | 220.26 req/s |

---

## ⏱️ Response Time Analysis

| Metric | Giá trị | Đánh giá |
|--------|---------|----------|
| **Average** | 2,458.31 ms | ⚠️ Cao |
| **P95** | 5,978.85 ms | ❌ Rất cao |
| **P99** | 8,102.49 ms | ❌ Quá cao |
| **Max** | 16,332.81 ms | ❌ Không chấp nhận được |

---

## 📈 Chi Tiết Từng API

| API Endpoint | Avg (ms) | P95 (ms) | Đánh giá |
|--------------|----------|----------|----------|
| **List Addons** | 1,912.96 | 3,224.20 | ⚠️ Chậm |
| **Get Addon** | 1,895.13 | 3,192.00 | ⚠️ Chậm |
| **User Addons** | 1,932.15 | 3,336.20 | ⚠️ Chậm |
| **Purchase** | 4,800.78 | 8,655.00 | ❌ Rất chậm |
| **Cancel** | 3,629.28 | 6,099.70 | ❌ Chậm |

---

## 💻 Resource Usage (Ước tính từ Monitor)

### Node.js Processes

| Process | CPU (s) | Memory (MB) | Threads |
|---------|---------|-------------|---------|
| api-gateway | ~700 | ~53 | 12 |
| subscription-svc | ~360 | ~102 | 12 |
| Các services khác | ~10-300 | 35-103 | 12-13 |

**Nhận xét:**
- Memory khá ổn định (~50-100MB per process)
- CPU tích lũy cao trên api-gateway (~700s CPU time)
- subscription-svc cũng đang chịu load (~360s CPU time)

---

## 🔍 Phân Tích Vấn Đề

### 1. **Bottleneck ở Write Operations**
- **Purchase** (4.8s avg) và **Cancel** (3.6s avg) chậm hơn nhiều so với Read
- Nguyên nhân:
  - Database write operations với transactions
  - Kafka event publishing
  - Không có connection pooling tối ưu

### 2. **Read Operations cũng bị ảnh hưởng**
- List/Get/UserAddons (~1.9s avg) vẫn chậm
- Nguyên nhân có thể:
  - Connection pool bị exhaust
  - Database queries không có index
  - gRPC overhead

### 3. **Threshold Crossed**
```
http_req_duration P95 < 2000ms ❌ FAILED (actual: 5978.85ms)
```

---

## 🚀 Khuyến Nghị Cải Thiện

### Ngắn hạn (Quick Wins)

1. **Thêm Database Indexes**
```sql
CREATE INDEX idx_addon_key ON addons(addon_key);
CREATE INDEX idx_user_addon_sub_status ON user_addons(subscription_id, status);
CREATE INDEX idx_user_addon_customer ON user_addons(customer_id);
```

2. **Tăng Connection Pool Size**
```typescript
// TypeORM config
{
  extra: {
    connectionLimit: 50,  // Tăng từ default 10
    waitForConnections: true,
    queueLimit: 100,
  }
}
```

3. **Thêm Response Caching**
```typescript
// Cache list addons (ít thay đổi)
@Cacheable({ ttl: 60 }) // Cache 60s
async listAddons() { ... }
```

### Trung hạn

4. **Async Event Publishing**
- Sử dụng message queue background job
- Không block main thread khi publish Kafka events

5. **Read Replica cho Database**
- Tách read/write workload
- Read từ replica, write vào master

6. **Horizontal Scaling**
- Chạy multiple instances của subscription-svc
- Load balance với Round Robin

### Dài hạn

7. **CQRS Pattern**
- Tách command (write) và query (read)
- Optimize từng phần riêng biệt

8. **Redis Cache Layer**
- Cache hot data (addon list, user addons)
- TTL-based invalidation

---

## 📋 Kết Luận

| Tiêu chí | Kết quả | Đạt/Không |
|----------|---------|-----------|
| Xử lý 1000 VUs | ✅ Có | ✅ |
| 0% Error Rate | ✅ 0% | ✅ |
| P95 < 2s | ❌ 5.9s | ❌ |
| P99 < 5s | ❌ 8.1s | ❌ |
| Throughput > 500 req/s | ❌ 220 req/s | ❌ |

**Tổng kết:** 
- ✅ Hệ thống **ổn định** với 1000 VUs, không có lỗi
- ⚠️ **Performance chưa đạt** yêu cầu production
- 🔧 Cần tối ưu database và caching trước khi go-live

---

## 🔢 Capacity Planning

Dựa trên kết quả test:

| VUs | Estimated Throughput | P95 Response |
|-----|---------------------|--------------|
| 100 | ~150 req/s | < 500ms |
| 300 | ~180 req/s | < 1s |
| 500 | ~200 req/s | < 2s |
| 1000 | ~220 req/s | ~6s |

**Recommended Production Config:**
- Max concurrent users: **300-500** (để giữ P95 < 2s)
- Hoặc scale horizontal lên 3-5 instances để handle 1000 VUs

