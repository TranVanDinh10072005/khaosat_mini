# HƯỚNG DẪN KẾT NỐI TỰ ĐỘNG LƯU KHẢO SÁT VÀO GOOGLE SHEETS

Chỉ mất **2 phút** để thiết lập. Khi có người làm khảo sát hoặc bấm vào link, dữ liệu sẽ tự động nhảy vào file Google Sheets của bạn!

---

## BƯỚC 1: Tạo Google Sheet mới
1. Mở trình duyệt, truy cập: **[https://sheets.new](https://sheets.new)** để tạo một bảng tính Google mới.
2. Đặt tên file là: **VKU Facility Check - Kết Quả Khảo Sát**.

---

## BƯỚC 2: Dán mã Google Apps Script
1. Trên thanh menu của Google Sheets, chọn **Tiện ích mở rộng (Extensions)** ➔ chọn **Apps Script**.
2. Xóa toàn bộ code mặc định trong ô soạn thảo, và dán đoạn mã sau vào:

```javascript
/**
 * Google Apps Script - VKU Facility Check Webhook
 * Tự động ghi nhận thông tin khảo sát và lượt truy cập vào Google Sheets
 */

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet();
    var contents = e.postData.contents;
    var data = JSON.parse(contents);

    if (data.action === 'visitor_access') {
      // ── Ghi nhận người bấm link ──
      var visitSheet = sheet.getSheetByName('NguoiTruyCap');
      if (!visitSheet) {
        visitSheet = sheet.insertSheet('NguoiTruyCap');
        visitSheet.appendRow([
          'Thời gian',
          'Tên / Ghi chú',
          'Thiết bị (User-Agent)',
          'Độ phân giải màn hình',
          'Ngôn ngữ',
          'Nguồn giới thiệu'
        ]);
        visitSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#E2E8F0');
      }

      visitSheet.appendRow([
        data.timestamp || new Date().toLocaleString('vi-VN'),
        data.name || data.note || 'Khách truy cập link',
        data.userAgent || '',
        data.screen || '',
        data.language || '',
        data.referrer || ''
      ]);

      return ContentService.createTextOutput(JSON.stringify({ status: 'success', type: 'visit' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Ghi nhận phiếu khảo sát ──
    var surveySheet = sheet.getSheetByName('KhaoSat');
    if (!surveySheet) {
      surveySheet = sheet.insertSheet('KhaoSat');
      surveySheet.appendRow([
        'Thời gian ghi nhận',
        'Người khảo sát',
        'Cơ sở',
        'Tòa nhà',
        'Tầng',
        'Phòng',
        'Ngày khảo sát',
        'Giờ',
        'Tình trạng tổng quan',
        'Chi tiết thiết bị',
        'Ghi chú',
        'Số ảnh',
        'Thiết bị khảo sát'
      ]);
      surveySheet.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#DBEAFE');
    }

    // Format chi tiết tình trạng thiết bị
    var facSummary = [];
    if (data.facilities) {
      for (var key in data.facilities) {
        var item = data.facilities[key];
        var statusText = item.status === 'good' ? 'Tốt' : (item.status === 'damaged' ? 'Hỏng' : 'Chưa có');
        var countText = (item.quantity !== undefined ? item.quantity : 1);
        facSummary.push(key + ': ' + statusText + ' (' + countText + ')');
      }
    }

    surveySheet.appendRow([
      data.timestamp || new Date().toLocaleString('vi-VN'),
      data.inspector || 'Ẩn danh',
      data.facility || '',
      data.building || '',
      data.floor || '',
      data.room || '',
      data.date || '',
      data.time || '',
      data.hasIssues || '',
      facSummary.join(' | '),
      data.note || '',
      data.imageCount || 0,
      data.device || ''
    ]);

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', type: 'survey' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("VKU Facility Check Webhook is active!");
}
```

3. Bấm biểu tượng **💾 Lưu** (Save project).

---

## BƯỚC 3: Triển khai Web App (Lấy link)
1. Ở góc trên bên phải, bấm nút màu xanh: **Triển khai (Deploy)** ➔ chọn **Tùy chọn triển khai mới (New deployment)**.
2. Tại mục "Chọn loại" (bánh răng ⚙️), chọn **Ứng dụng web (Web app)**.
3. Điền các trường:
   - **Mô tả (Description):** `VKU Webhook`
   - **Thực thi dưới dạng (Execute as):** `Tôi (Email của bạn)`
   - **Ai có quyền truy cập (Who has access):** **`Bất kỳ ai (Anyone)`** *(RẤT QUAN TRỌNG để ứng dụng gửi được dữ liệu)*
4. Bấm **Triển khai (Deploy)**.
5. Nếu Google hỏi quyền truy cập:
   - Bấm **Ủy quyền truy cập (Authorize access)** ➔ Chọn tài khoản Google của bạn.
   - Bấm **Nâng cao (Advanced)** ➔ Chọn **Đi tới ... (không an toàn)** ➔ Bấm **Cho phép (Allow)**.
6. Copy đường link tại mục **Ứng dụng web - URL** (dạng: `https://script.google.com/macros/s/AKfycb.../exec`).

---

## BƯỚC 4: Dán link vào ứng dụng VKU Facility Check
1. Mở ứng dụng VKU Facility Check trên trình duyệt.
2. Vào mục **⚙️ Cài đặt (Settings)**.
3. Tại phần **📊 Thu thập dữ liệu (Google Sheets)**, dán đường link vừa copy vào ô **Link Webhook Google Sheets**.
4. Bấm **💾 Lưu cấu hình**, sau đó bấm **🧪 Gửi thử nghiệm**.
5. Mở lại Google Sheets, bạn sẽ thấy ngay 1 dòng test xuất hiện!

Từ bây giờ, bất kỳ ai vào link làm khảo sát, kết quả sẽ tự động lưu vào Google Sheets của bạn.
