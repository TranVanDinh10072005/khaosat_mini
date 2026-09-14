# VKU Facility Check

> **PWA khảo sát và kiểm tra cơ sở vật chất trong khuôn viên VKU**

---

**Demo:** [URL]  
**GitHub:** [URL]

---

## 1. Giới thiệu

**VKU Facility Check** là một Progressive Web App (PWA) được xây dựng để phục vụ việc khảo sát thực địa tại Trường Đại học Công nghệ Thông tin và Truyền thông Việt – Hàn (VKU).

Ứng dụng cho phép người khảo sát kiểm tra tình trạng cơ sở vật chất của từng phòng/khu vực trong trường, **hoạt động hoàn toàn offline**.

---

## 2. Mục tiêu

- ✅ Khảo sát tình trạng cơ sở vật chất từng phòng học
- ✅ Lưu dữ liệu offline (không cần Internet)
- ✅ Đồng bộ tự động khi có Internet trở lại
- ✅ Dễ sử dụng trên điện thoại khi đi khảo sát thực tế

---

## 3. Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| 📋 Tạo phiếu khảo sát | Form nhập thông tin phòng + đánh giá 10 thiết bị |
| 📂 Lịch sử | Danh sách phiếu với filter, sửa, xóa, sync |
| 📊 Thống kê | Biểu đồ tình trạng thiết bị, phòng cần chú ý |
| ⚙️ Cài đặt | Thông tin PWA, dung lượng, đồng bộ |
| 🔴 Offline | Hoạt động không cần Internet |
| 🔄 Sync | Tự động đồng bộ khi có mạng |
| 📷 Chụp ảnh | Chụp/chọn ảnh hiện trạng |
| 📱 PWA | Cài lên màn hình chính như app thật |

---

## 4. Công nghệ sử dụng

- **HTML5** – Semantic markup, PWA shell
- **CSS3** – Design system, CSS variables, conic-gradient
- **JavaScript ES6+** – Modules, async/await, classes
- **PWA** – Web App Manifest, installable
- **Service Worker** – Cache First strategy, offline support
- **IndexedDB** – Persistent local storage
- **Google Fonts** – Inter (cached sau lần đầu)

---

## 5. Kiến trúc hệ thống

```
┌─────────────────────────────────────────┐
│           PWA Frontend (SPA)            │
│  index.html – Hash Router               │
├─────────────────────────────────────────┤
│           JavaScript Modules            │
│  app.js       → Router, Dashboard       │
│  db.js        → IndexedDB abstraction   │
│  network.js   → Online/offline detect   │
│  sync.js      → Sync service (mock)     │
│  survey.js    → Form tạo/sửa phiếu     │
│  history.js   → Lịch sử, filter        │
│  statistics.js → Thống kê, chart       │
├─────────────────────────────────────────┤
│           Service Worker                │
│  Cache First cho tất cả static assets  │
│  Offline fallback → index.html          │
├─────────────────────────────────────────┤
│           IndexedDB Storage             │
│  VKUFacilityDB > surveys                │
└─────────────────────────────────────────┘
```

---

## 6. Offline-First

Luồng dữ liệu:

```
Người dùng nhập khảo sát
        ↓
    IndexedDB
   (synced: false)
        ↓
   Có Internet?
   ↙         ↘
 Có          Không
  ↓             ↓
Sync ngay    Lưu local
  ↓             ↓
Server       Chờ sync
  ↓
synced: true
```

Khi **mất mạng**:
- Banner đỏ: `🔴 OFFLINE – Dữ liệu đang được lưu trên thiết bị`
- App vẫn mở và sử dụng được bình thường

Khi **có mạng trở lại**:
- Banner xanh: `🟢 ONLINE – Đang kiểm tra dữ liệu cần đồng bộ`
- Tự động đồng bộ các phiếu pending

---

## 7. IndexedDB Schema

**Database:** `VKUFacilityDB`  
**Object Store:** `surveys`

```javascript
{
  id: "vku_1694123456789_abc123",
  facility: "Cơ sở 1 – Đà Nẵng",
  building: "Tòa A",
  floor: "Tầng 1",
  room: "A101",
  inspector: "Nguyễn Văn A",
  date: "2026-09-14",
  time: "08:30",

  facilities: {
    lighting: "good",       // good | check | broken
    airConditioner: "check",
    projector: "broken",
    computer: "good",
    tables: "good",
    electricity: "check",
    wifi: "good",
    fan: "good",
    door: "good",
    safety: "good"
  },

  note: "Máy chiếu không hoạt động",
  images: [],             // Array of data URLs

  hasIssues: true,
  status: "pending",      // pending | completed
  synced: false,          // false = chưa sync

  createdAt: "2026-09-14T08:35:00.000Z",
  updatedAt: "2026-09-14T08:35:00.000Z",
}
```

---

## 8. Service Worker

File: `service-worker.js`

**Chiến lược:** Cache First

```
Request → Cache? → Có → Trả về từ cache (nhanh)
                → Không → Fetch network → Lưu cache → Trả về
                → Network lỗi + không có cache → Offline page
```

**Cache version:** `VKU-CACHE-v1`

Files được cache:
- `index.html`
- `css/style.css`, `css/responsive.css`
- `js/*.js` (tất cả)
- `assets/icons/*.png`
- `manifest.json`

---

## 9. Cách chạy project

### Cách 1: VS Code Live Server (Khuyến nghị)

```bash
# Cài extension Live Server trong VS Code
# Chuột phải vào index.html → Open with Live Server
# URL: http://127.0.0.1:5500/vku-facility-check/
```

### Cách 2: Python HTTP Server

```bash
cd vku-facility-check
python -m http.server 8000
# Mở: http://localhost:8000
```

### Cách 3: Node.js HTTP Server

```bash
npx -y serve vku-facility-check
# Hoặc:
npm install -g http-server
http-server vku-facility-check -p 8000
```

> ⚠️ **Lưu ý:** Service Worker chỉ hoạt động trên HTTPS hoặc localhost.  
> Không mở file trực tiếp qua `file://`.

---

## 10. Cách deploy lên Vercel

```bash
# Cài Vercel CLI
npm install -g vercel

# Deploy
cd vku-facility-check
vercel

# Hoặc kéo thả thư mục vào vercel.com
```

Cấu hình `vercel.json` (tạo trong thư mục gốc):
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 11. Cách deploy lên Cloudflare Pages

1. Đẩy code lên GitHub
2. Vào [pages.cloudflare.com](https://pages.cloudflare.com)
3. Connect repository
4. Build settings:
   - **Build command:** *(để trống)*
   - **Build output directory:** `/` (root)
5. Deploy!

---

## 12. Cách kiểm tra PWA

Dùng Chrome DevTools:

1. Mở DevTools (`F12`)
2. Tab **Application**
3. Kiểm tra:
   - **Manifest** → Xem thông tin PWA
   - **Service Workers** → Trạng thái SW
   - **Cache Storage** → Files đã cache
   - **IndexedDB** → `VKUFacilityDB > surveys`
4. Tab **Lighthouse** → Run audit → PWA score

---

## 13. Cách kiểm tra Offline Mode

```
1. Mở app trên localhost (phải qua HTTP server)
2. Tạo ít nhất 1 phiếu khảo sát để có dữ liệu
3. Mở DevTools → Tab Network
4. Chọn "Offline" trong dropdown Throttling
5. Reload trang → App vẫn load
6. Tạo phiếu mới → Lưu thành công
7. Xem lịch sử → Dữ liệu vẫn có
8. Bỏ Offline → App tự động sync
```

---

## 14. Hướng phát triển

- [ ] Tích hợp REST API backend thật (thay `mockApiCall` trong `sync.js`)
- [ ] Thêm Authentication (JWT)
- [ ] Push Notifications khi đồng bộ xong
- [ ] Export báo cáo PDF
- [ ] QR Code để scan phòng nhanh
- [ ] Multi-user với phân quyền
- [ ] Lịch khảo sát định kỳ

---

## Android APK

Project có thể được đóng gói bằng Capacitor:

```
PWA (HTML/CSS/JS)
       ↓
   Capacitor
       ↓
   Android
       ↓
     APK
```

### Các bước:

```bash
# 1. Cài Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. Khởi tạo
npx cap init "VKU Facility Check" "edu.vku.facilitycheck" --web-dir="."

# 3. Thêm Android platform
npx cap add android

# 4. Copy web files
npx cap copy android

# 5. Mở Android Studio
npx cap open android

# 6. Build APK trong Android Studio:
#    Build → Build Bundle(s) / APK(s) → Build APK(s)
```

### Yêu cầu:
- Node.js 16+
- Android Studio
- Android SDK (API level 22+)
- JDK 11+

---

## Cấu trúc thư mục

```
vku-facility-check/
├── index.html           ← SPA shell
├── manifest.json        ← PWA manifest
├── service-worker.js    ← SW Cache First
├── css/
│   ├── style.css        ← Design system
│   └── responsive.css   ← Mobile-first
├── js/
│   ├── app.js           ← Router + Dashboard
│   ├── db.js            ← IndexedDB wrapper
│   ├── network.js       ← Network detection
│   ├── sync.js          ← Sync service
│   ├── survey.js        ← Form logic
│   ├── history.js       ← History view
│   └── statistics.js    ← Stats view
├── assets/
│   └── icons/           ← PWA icons
├── README.md
└── .gitignore
```

---

## License

MIT License – Dự án học tập VKU
