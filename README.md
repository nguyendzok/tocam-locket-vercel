# 🍊 TỔ CAM LOCKET GOLD GATEWAY (VERCEL SERVERLESS EDITION)

Hệ thống nâng cấp **Locket Gold** chính chủ, bảo tồn trọn vẹn giao diện luxury 3D của **Tổ Cam**, tích hợp **2 phương án khắc phục triệt để vấn đề rụng Gold & giới hạn DNS**, hỗ trợ hẹn giờ rụng Gold chính xác và sẵn sàng deploy cả Web + DNS Serverless lên **Vercel**.

---

## ⚡ 2 Phương Án Khắc Phục Triệt Để

### 1. Phương án 1: Vercel Serverless DoH Gateway (Khuyên Dùng)
- **Công nghệ**: Chạy trực tiếp trên Vercel Serverless Functions theo chuẩn **RFC 8484 (DNS-over-HTTPS)**.
- **Ưu điểm**:
  - **100% Miễn phí & Vô hạn truy vấn**: Khắc phục hoàn toàn mốc giới hạn 300.000 query của NextDNS Free.
  - **Tải file cấu hình iOS 1-chạm**: Cung cấp file `.mobileconfig` tải về trực tiếp từ Safari để kích hoạt DNS DoH mà không cần cấu hình thủ công.
  - **Cơ chế rụng Gold tự động**: Khi còn hạn, server DoH chặn domain `revenuecat.com` (trả về `0.0.0.0`). Khi hết hạn, server DoH tự động phân giải IP thật qua Cloudflare (`1.1.1.1`) $\rightarrow$ App Locket nhận phản hồi thật từ RevenueCat và **tự động rụng Gold** ngay lập tức mà không làm gián đoạn kết nối mạng của máy khách.

### 2. Phương án 2: NextDNS API Dedicated Engine
- **Công nghệ**: Sử dụng NextDNS API (`4dbc66ac83443dfce88e0160a3117f2763cee70d`) để tự động tạo Profile riêng biệt cho từng người dùng.
- **Ưu điểm**:
  - Hỗ trợ hoàn hảo cho **Android Private DNS (DoT Hostname)**: `<profileId>.dns.nextdns.io`.
  - Hẹn giờ rụng Gold: Bộ quét tự động gọi API `DELETE` gỡ chặn `revenuecat.com` khỏi Denylist khi hết hạn.

---

## 🕒 Các Gói Thời Hạn Rụng Gold Được Hỗ Trợ
- **Test 5 Phút (0đ)**: Dùng thử siêu nhanh, kiểm chứng cơ chế tự động rụng Gold sau đúng 5 phút.
- **Gói 1 Ngày (9.000đ)**: Thời hạn 24 giờ.
- **Gói 6 Tháng (39.000đ)**: Thời hạn 180 ngày.
- **Gói 1 Năm (69.000đ)**: Thời hạn 365 ngày.
- **Gói Vĩnh Viễn (99.000đ)**: Tường lửa bảo vệ vĩnh viễn không rụng.

---

## 🚀 Hướng Dẫn Chạy Local

```bash
cd /Users/hoangngocnguyen/Desktop/tocam-locket-vercel
npm install
npm start
```

- **Web Portal**: [http://localhost:3000/gold](http://localhost:3000/gold)
- **DoH Gateway**: [http://localhost:3000/api/dns-query](http://localhost:3000/api/dns-query)
- **Tải iOS Profile**: [http://localhost:3000/api/profile/download?u=mhhiep](http://localhost:3000/api/profile/download?u=mhhiep)

---

## ☁️ Hướng Dẫn Deploy Lên Vercel (1 Lệnh)

### Cách 1: Sử dụng Vercel CLI
```bash
npm install -g vercel
cd /Users/hoangngocnguyen/Desktop/tocam-locket-vercel
vercel --prod
```
*Lưu ý*: Nếu có hỏi, chọn cài đặt mặc định (`Yes`), Vercel sẽ tự động đọc file `vercel.json` và build cả Web lẫn Serverless Function.

### Cách 2: Deploy qua GitHub
1. Khởi tạo Git repo và push lên GitHub cá nhân:
```bash
cd /Users/hoangngocnguyen/Desktop/tocam-locket-vercel
git init
git add .
git commit -m "feat: Tổ Cam Locket Gold Serverless Gateway"
git branch -M main
git remote add origin <URL_REPO_GITHUB_CUA_BAN>
git push -u origin main
```
2. Vào [vercel.com](https://vercel.com) &rarr; **Add New Project** &rarr; Chọn repo vừa push.
3. Không cần chỉnh cấu hình Build, bấm **Deploy** là xong!

---

## 📡 Danh Sách API Endpoints

| Method | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `GET / POST` | `/api/resolve` | Tự động phân giải username hoặc link Locket sang UID 28 ký tự và avatar CDN |
| `GET` | `/api/locket/uid/check` | Endpoint tương thích ngược cho frontend Tổ Cam |
| `POST` | `/api/activate` | Nạp biên lai StoreKit của Apple & tạo profile DNS theo thời hạn |
| `GET / POST` | `/api/profile/download` | Xuất file cấu hình iOS `.mobileconfig` 1-chạm tải qua Safari |
| `ALL` | `/api/dns-query` | Serverless DoH Gateway (RFC 8484) chặn/mở RevenueCat |
| `GET` | `/api/users` | Danh sách người dùng và thời hạn |
| `POST` | `/api/revoke` | Thu hồi Gold thủ công ngay lập tức để test rụng Gold |
