/**
 * survey.js – Survey Form Manager
 * 
 * Xử lý form tạo/sửa phiếu khảo sát.
 * Bao gồm: render form, validate, lưu ảnh, submit.
 */

// Định nghĩa danh sách thiết bị cần kiểm tra
const FACILITY_ITEMS = [
  { key: 'lighting',       name: 'Đèn chiếu sáng',   icon: '💡' },
  { key: 'airConditioner', name: 'Điều hòa',           icon: '❄️' },
  { key: 'projector',      name: 'Máy chiếu',          icon: '📽️' },
  { key: 'computer',       name: 'Máy tính',            icon: '💻' },
  { key: 'tables',         name: 'Bàn ghế',             icon: '🪑' },
  { key: 'electricity',    name: 'Ổ điện',              icon: '🔌' },
  { key: 'wifi',           name: 'Wi-Fi',               icon: '📶' },
  { key: 'fan',            name: 'Quạt',                icon: '🌀' },
  { key: 'door',           name: 'Cửa phòng',           icon: '🚪' },
  { key: 'safety',         name: 'Thiết bị an toàn',   icon: '🧯' },
];

// Danh sách khu vực/cơ sở của VKU
const FACILITIES_LIST = [
  'Cơ sở 1 – Đà Nẵng',
  'Cơ sở 2 – Đà Nẵng',
];

const BUILDINGS = {
  'Cơ sở 1 – Đà Nẵng': ['Tòa A', 'Tòa B', 'Tòa C', 'Tòa D', 'Nhà Ký túc xá'],
  'Cơ sở 2 – Đà Nẵng': ['Tòa E', 'Tòa F', 'Nhà Thể chất'],
};

class SurveyManager {
  constructor() {
    this.editingId = null;   // ID phiếu đang chỉnh sửa (null = tạo mới)
    this.images = [];         // Mảng data URL ảnh
    this.currentData = null;  // Dữ liệu form hiện tại
  }

  /**
   * Render form khảo sát vào view #survey.
   * @param {string|null} surveyId - ID để chỉnh sửa, null để tạo mới
   */
  async renderForm(surveyId = null) {
    this.editingId = surveyId;
    this.images = [];

    const view = document.getElementById('view-survey');
    if (!view) return;

    // Nếu đang sửa, tải dữ liệu cũ
    let existing = null;
    if (surveyId) {
      existing = await vkuDB.getSurveyById(surveyId);
      if (existing) {
        this.images = existing.images || [];
      }
    }

    // Ngày và giờ hiện tại
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);

    view.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">${surveyId ? '✏️ Chỉnh sửa phiếu' : '📋 Tạo phiếu khảo sát'}</h1>
        <p class="page-subtitle">${surveyId ? 'Cập nhật thông tin khảo sát' : 'Khảo sát tình trạng cơ sở vật chất'}</p>
      </div>

      <form id="survey-form" novalidate>

        <!-- THÔNG TIN KHẢO SÁT -->
        <div class="card mb-5">
          <div class="card-body">
            <div class="form-section-title">
              <span>📍</span> Thông tin khảo sát
            </div>

            <div class="form-group">
              <label class="form-label" for="survey-facility">
                Khu vực / Cơ sở <span class="required">*</span>
              </label>
              <select class="form-control" id="survey-facility" required>
                <option value="">-- Chọn cơ sở --</option>
                ${FACILITIES_LIST.map(f => `
                  <option value="${f}" ${existing?.facility === f ? 'selected' : ''}>${f}</option>
                `).join('')}
              </select>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="survey-building">
                  Tòa nhà <span class="required">*</span>
                </label>
                <select class="form-control" id="survey-building" required>
                  <option value="">-- Chọn tòa --</option>
                  ${existing?.building ? `<option value="${existing.building}" selected>${existing.building}</option>` : ''}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="survey-floor">
                  Tầng <span class="required">*</span>
                </label>
                <select class="form-control" id="survey-floor" required>
                  <option value="">-- Tầng --</option>
                  ${['Tầng 1','Tầng 2','Tầng 3','Tầng 4','Tầng 5','Tầng 6'].map(f =>
                    `<option value="${f}" ${existing?.floor === f ? 'selected' : ''}>${f}</option>`
                  ).join('')}
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="survey-room">
                Phòng <span class="required">*</span>
              </label>
              <input
                type="text"
                class="form-control"
                id="survey-room"
                placeholder="Ví dụ: A101, B202..."
                value="${existing?.room || ''}"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="survey-inspector">
                Người khảo sát <span class="required">*</span>
              </label>
              <input
                type="text"
                class="form-control"
                id="survey-inspector"
                placeholder="Họ và tên người khảo sát"
                value="${existing?.inspector || (typeof authManager !== 'undefined' ? authManager.getCurrentUser()?.displayName || '' : '')}"
                required
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="survey-date">Ngày khảo sát</label>
                <input
                  type="date"
                  class="form-control"
                  id="survey-date"
                  value="${existing?.date || dateStr}"
                />
              </div>
              <div class="form-group">
                <label class="form-label" for="survey-time">Thời gian</label>
                <input
                  type="time"
                  class="form-control"
                  id="survey-time"
                  value="${existing?.time || timeStr}"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- KIỂM TRA CƠ SỞ VẬT CHẤT -->
        <div class="card mb-5">
          <div class="card-body">
            <div class="form-section-title">
              <span>🔍</span> Kiểm tra cơ sở vật chất
            </div>

            <div class="facility-grid" id="facility-checks">
              ${FACILITY_ITEMS.map(item => this._renderFacilityItem(item, existing?.facilities)).join('')}
            </div>
          </div>
        </div>

        <!-- GHI CHÚ & ẢNH -->
        <div class="card mb-5">
          <div class="card-body">
            <div class="form-section-title">
              <span>📝</span> Ghi chú & Hình ảnh
            </div>

            <div class="form-group">
              <label class="form-label" for="survey-note">Ghi chú</label>
              <textarea
                class="form-control"
                id="survey-note"
                rows="4"
                placeholder="Mô tả chi tiết tình trạng, thiết bị hỏng, yêu cầu sửa chữa..."
              >${existing?.note || ''}</textarea>
            </div>

            <!-- Chụp ảnh / Chọn ảnh -->
            <div class="form-group">
              <label class="form-label">Hình ảnh hiện trạng</label>

              <div class="image-upload-area" id="upload-area" onclick="document.getElementById('image-input').click()">
                <div class="upload-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
                <p class="upload-text">Nhấn để chụp ảnh hoặc chọn ảnh</p>
                <p class="upload-subtext">Hỗ trợ JPG, PNG – Tối đa 5 ảnh</p>
              </div>

              <input
                type="file"
                id="image-input"
                accept="image/*"
                capture="environment"
                multiple
                class="hidden"
                onchange="surveyManager.handleImages(event)"
              />

              <!-- Preview grid -->
              <div class="image-preview-grid" id="image-preview-grid">
                ${this.images.map((img, i) => this._renderImagePreview(img, i)).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- NÚT LƯU -->
        <div class="mb-5">
          <button type="submit" class="btn btn-primary btn-lg btn-block" id="save-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            LƯU KHẢO SÁT
          </button>

          ${surveyId ? `
            <button type="button" class="btn btn-ghost btn-block mt-3"
              onclick="app.navigateTo('history')">
              Hủy
            </button>
          ` : ''}
        </div>

      </form>
    `;

    // Gắn event listeners
    this._bindEvents();
  }

  /**
   * Render một facility item với radio buttons.
   */
  _renderFacilityItem(item, existingFacilities) {
    const currentStatus = existingFacilities?.[item.key] || 'good';

    return `
      <div class="facility-item">
        <div class="facility-item-header">
          <div class="facility-item-icon">
            <span style="font-size: 1.1rem;">${item.icon}</span>
          </div>
          <div class="facility-item-name">${item.name}</div>
        </div>

        <div class="status-group" role="radiogroup" aria-label="${item.name}">
          <div class="status-option good">
            <input
              type="radio"
              name="facility_${item.key}"
              id="f_${item.key}_good"
              value="good"
              ${currentStatus === 'good' ? 'checked' : ''}
            />
            <label class="status-label" for="f_${item.key}_good">
              <span class="status-icon">✅</span>
              <span>Tốt</span>
            </label>
          </div>

          <div class="status-option check">
            <input
              type="radio"
              name="facility_${item.key}"
              id="f_${item.key}_check"
              value="check"
              ${currentStatus === 'check' ? 'checked' : ''}
            />
            <label class="status-label" for="f_${item.key}_check">
              <span class="status-icon">⚠️</span>
              <span>Cần KT</span>
            </label>
          </div>

          <div class="status-option broken">
            <input
              type="radio"
              name="facility_${item.key}"
              id="f_${item.key}_broken"
              value="broken"
              ${currentStatus === 'broken' ? 'checked' : ''}
            />
            <label class="status-label" for="f_${item.key}_broken">
              <span class="status-icon">❌</span>
              <span>Hỏng</span>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render preview một ảnh.
   */
  _renderImagePreview(dataUrl, index) {
    return `
      <div class="image-preview-item" id="img-preview-${index}">
        <img src="${dataUrl}" alt="Ảnh ${index + 1}" />
        <button
          type="button"
          class="image-preview-remove"
          onclick="surveyManager.removeImage(${index})"
          aria-label="Xóa ảnh"
        >×</button>
      </div>
    `;
  }

  /**
   * Gắn event listeners sau khi render.
   */
  _bindEvents() {
    // Submit form
    const form = document.getElementById('survey-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitForm();
      });
    }

    // Dynamic building list khi chọn cơ sở
    const facilitySelect = document.getElementById('survey-facility');
    if (facilitySelect) {
      facilitySelect.addEventListener('change', () => {
        this._updateBuildingOptions(facilitySelect.value);
      });
      // Trigger nếu đang edit
      if (facilitySelect.value) {
        this._updateBuildingOptions(facilitySelect.value);
      }
    }

    // Drag & drop ảnh vào upload area
    const uploadArea = document.getElementById('upload-area');
    if (uploadArea) {
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
      });
      uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
      });
      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        this._processFiles(files);
      });
    }
  }

  /**
   * Cập nhật danh sách tòa nhà theo cơ sở đã chọn.
   */
  _updateBuildingOptions(facility) {
    const buildingSelect = document.getElementById('survey-building');
    if (!buildingSelect) return;

    const buildings = BUILDINGS[facility] || [];
    const currentVal = buildingSelect.value;

    buildingSelect.innerHTML = `<option value="">-- Chọn tòa --</option>` +
      buildings.map(b => `<option value="${b}" ${b === currentVal ? 'selected' : ''}>${b}</option>`).join('');
  }

  /**
   * Xử lý khi chọn ảnh từ input.
   */
  async handleImages(event) {
    const files = Array.from(event.target.files);
    await this._processFiles(files);
    // Reset input để có thể chọn lại cùng file
    event.target.value = '';
  }

  /**
   * Đọc file ảnh và chuyển thành data URL.
   */
  async _processFiles(files) {
    const remaining = 5 - this.images.length;
    const toProcess = files.slice(0, remaining);

    if (files.length > remaining) {
      showToast(`Tối đa 5 ảnh. Đã bỏ qua ${files.length - remaining} ảnh.`, 'warning');
    }

    for (const file of toProcess) {
      const dataUrl = await this._readFileAsDataURL(file);
      this.images.push(dataUrl);
    }

    this._refreshImagePreview();
  }

  /**
   * Đọc File thành data URL.
   */
  _readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Cập nhật UI preview ảnh.
   */
  _refreshImagePreview() {
    const grid = document.getElementById('image-preview-grid');
    if (grid) {
      grid.innerHTML = this.images.map((img, i) => this._renderImagePreview(img, i)).join('');
    }
  }

  /**
   * Xóa ảnh theo index.
   */
  removeImage(index) {
    this.images.splice(index, 1);
    this._refreshImagePreview();
  }

  /**
   * Thu thập dữ liệu từ form.
   */
  _collectFormData() {
    const facility = document.getElementById('survey-facility')?.value || '';
    const building = document.getElementById('survey-building')?.value || '';
    const floor = document.getElementById('survey-floor')?.value || '';
    const room = document.getElementById('survey-room')?.value.trim() || '';
    const inspector = document.getElementById('survey-inspector')?.value.trim() || '';
    const date = document.getElementById('survey-date')?.value || '';
    const time = document.getElementById('survey-time')?.value || '';
    const note = document.getElementById('survey-note')?.value.trim() || '';

    // Thu thập trạng thái từng thiết bị
    const facilities = {};
    let hasIssues = false;

    FACILITY_ITEMS.forEach(item => {
      const selected = document.querySelector(`input[name="facility_${item.key}"]:checked`);
      const status = selected ? selected.value : 'good';
      facilities[item.key] = status;
      if (status === 'check' || status === 'broken') hasIssues = true;
    });

    return { facility, building, floor, room, inspector, date, time, note, facilities, hasIssues };
  }

  /**
   * Validate form trước khi lưu.
   */
  _validate(data) {
    const errors = [];
    if (!data.facility) errors.push('Vui lòng chọn khu vực / cơ sở');
    if (!data.building) errors.push('Vui lòng chọn tòa nhà');
    if (!data.floor) errors.push('Vui lòng chọn tầng');
    if (!data.room) errors.push('Vui lòng nhập tên phòng');
    if (!data.inspector) errors.push('Vui lòng nhập tên người khảo sát');
    return errors;
  }

  /**
   * Submit form: validate → lưu IndexedDB → thông báo → chuyển trang.
   */
  async submitForm() {
    const saveBtn = document.getElementById('save-btn');

    // Hiển thị loading
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<div class="spinner"></div> Đang lưu...`;
    }

    try {
      const data = this._collectFormData();
      const errors = this._validate(data);

      if (errors.length > 0) {
        showToast(errors[0], 'error');
        return;
      }

      // Tạo object phiếu khảo sát
      const survey = {
        id: this.editingId || undefined,
        facility: data.facility,
        building: data.building,
        floor: data.floor,
        room: data.room,
        inspector: data.inspector,
        date: data.date,
        time: data.time,
        facilities: data.facilities,
        note: data.note,
        images: this.images,
        hasIssues: data.hasIssues,
        status: 'pending',
        synced: false,
      };

      // Lưu vào IndexedDB
      const savedId = await vkuDB.saveSurvey(survey);

      // Thông báo UX
      const isOnline = networkManager.checkOnline();
      if (isOnline) {
        showToast('✓ Đã lưu khảo sát. Đang đồng bộ dữ liệu...', 'success');
        // Tự động sync ngầm
        setTimeout(async () => {
          try {
            const result = await syncService.syncOne(savedId);
            if (result) showToast('🔄 Đã đồng bộ thành công!', 'info');
          } catch (e) { /* Không hiện lỗi sync – đã lưu local rồi */ }
        }, 500);
      } else {
        showToast('✓ Đã lưu khảo sát trên thiết bị. Sẽ đồng bộ khi có Internet.', 'success');
      }

      // Reset form nếu là tạo mới
      if (!this.editingId) {
        this.editingId = null;
        this.images = [];
      }

      // Chuyển sang trang lịch sử sau 1.2s
      setTimeout(() => {
        app.navigateTo('history');
      }, 1200);

    } catch (err) {
      console.error('[Survey] Error saving:', err);
      showToast('Lỗi khi lưu khảo sát. Vui lòng thử lại.', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          LƯU KHẢO SÁT
        `;
      }
    }
  }
}

// Singleton instance
const surveyManager = new SurveyManager();
