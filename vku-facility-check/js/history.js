/**
 * history.js – Survey History Manager
 * 
 * Hiển thị danh sách phiếu khảo sát.
 * Hỗ trợ: filter, xem chi tiết (modal), sửa, xóa, sync lại.
 */

class HistoryManager {
  constructor() {
    this.currentFilter = 'all';
    this.surveys = [];
  }

  /**
   * Render trang lịch sử.
   */
  async render() {
    const view = document.getElementById('view-history');
    if (!view) return;

    view.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">📂 Lịch sử khảo sát</h1>
        <p class="page-subtitle">Tất cả phiếu khảo sát đã lưu</p>
      </div>

      <!-- Filter Tabs -->
      <div class="filter-tabs" id="filter-tabs">
        <button class="filter-tab active" data-filter="all" onclick="historyManager.setFilter('all')">
          Tất cả
        </button>
        <button class="filter-tab" data-filter="synced" onclick="historyManager.setFilter('synced')">
          🟢 Đã đồng bộ
        </button>
        <button class="filter-tab" data-filter="pending" onclick="historyManager.setFilter('pending')">
          🟠 Chờ đồng bộ
        </button>
        <button class="filter-tab" data-filter="issues" onclick="historyManager.setFilter('issues')">
          ⚠️ Có vấn đề
        </button>
      </div>

      <!-- Danh sách phiếu -->
      <div id="survey-list-container"></div>
    `;

    await this.loadAndRender();
  }

  /**
   * Tải dữ liệu và render danh sách.
   */
  async loadAndRender() {
    try {
      if (typeof syncService !== 'undefined') {
        await syncService.pullSurveysFromServer();
      }
      this.surveys = await vkuDB.getAllSurveys();
      this._renderList();
    } catch (err) {
      console.error('[History] Error loading surveys:', err);
      const container = document.getElementById('survey-list-container');
      if (container) {
        container.innerHTML = `<p style="color:var(--color-error); padding: 1rem;">Lỗi tải dữ liệu.</p>`;
      }
    }
  }

  /**
   * Lọc và render danh sách phiếu theo filter hiện tại.
   */
  _renderList() {
    const container = document.getElementById('survey-list-container');
    if (!container) return;

    // Áp dụng filter
    let filtered = this.surveys;
    if (this.currentFilter === 'synced') {
      filtered = this.surveys.filter(s => s.synced);
    } else if (this.currentFilter === 'pending') {
      filtered = this.surveys.filter(s => !s.synced);
    } else if (this.currentFilter === 'issues') {
      filtered = this.surveys.filter(s => s.hasIssues);
    }

    // Cập nhật số lượng tab
    this._updateTabCounts();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">Chưa có phiếu khảo sát</div>
          <div class="empty-desc">
            ${this.currentFilter === 'all'
              ? 'Nhấn nút + để tạo phiếu khảo sát đầu tiên.'
              : 'Không có phiếu nào phù hợp với bộ lọc này.'}
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="survey-list">
        ${filtered.map(survey => this._renderSurveyCard(survey)).join('')}
      </div>
    `;
  }

  /**
   * Render một survey card.
   */
  _renderSurveyCard(survey) {
    const syncBadge = survey.synced
      ? `<span class="badge badge-success"><span class="badge-dot"></span>Đã đồng bộ</span>`
      : `<span class="badge badge-warning"><span class="badge-dot"></span>Chờ đồng bộ</span>`;

    const issuesBadge = survey.hasIssues
      ? `<span class="badge badge-error">⚠️ Có vấn đề</span>`
      : `<span class="badge badge-success">✓ Bình thường</span>`;

    const dateFormatted = survey.date
      ? new Date(survey.date + 'T00:00:00').toLocaleDateString('vi-VN')
      : '—';

    // Đếm thiết bị hỏng
    const brokenCount = survey.facilities
      ? Object.values(survey.facilities).filter(v => v === 'broken').length
      : 0;
    const checkCount = survey.facilities
      ? Object.values(survey.facilities).filter(v => v === 'check').length
      : 0;

    return `
      <div class="survey-card" id="card-${survey.id}">
        <div class="survey-card-header">
          <div>
            <div class="survey-card-room">${survey.room || '—'}</div>
            <div class="survey-card-location">
              ${[survey.facility, survey.building, survey.floor].filter(Boolean).join(' – ')}
            </div>
          </div>
          <div>${syncBadge}</div>
        </div>

        <div class="survey-card-body">
          <div class="survey-card-meta">
            <span>📅 ${dateFormatted}</span>
            ${survey.time ? `<span>🕐 ${survey.time}</span>` : ''}
            <span>👤 ${survey.inspector || '—'}</span>
            ${brokenCount > 0 ? `<span style="color:var(--color-error)">❌ ${brokenCount} hỏng</span>` : ''}
            ${checkCount > 0 ? `<span style="color:var(--color-warning)">⚠️ ${checkCount} cần KT</span>` : ''}
          </div>

          <div style="margin-bottom: var(--space-3)">
            ${issuesBadge}
          </div>

          <div class="survey-card-actions">
            <button class="btn btn-ghost btn-sm" onclick="historyManager.viewDetail('${survey.id}')">
              👁️ Chi tiết
            </button>
            <button class="btn btn-secondary btn-sm" onclick="historyManager.editSurvey('${survey.id}')">
              ✏️ Sửa
            </button>
            ${!survey.synced ? `
              <button class="btn btn-success btn-sm" onclick="historyManager.syncSurvey('${survey.id}')">
                🔄 Sync
              </button>
            ` : ''}
            <button class="btn btn-danger btn-sm" onclick="historyManager.deleteSurvey('${survey.id}')">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Cập nhật số lượng hiển thị trên tab.
   */
  _updateTabCounts() {
    const total = this.surveys.length;
    const synced = this.surveys.filter(s => s.synced).length;
    const pending = this.surveys.filter(s => !s.synced).length;
    const issues = this.surveys.filter(s => s.hasIssues).length;

    const tabs = document.querySelectorAll('.filter-tab');
    const counts = [total, synced, pending, issues];
    tabs.forEach((tab, i) => {
      const base = ['Tất cả', '🟢 Đã đồng bộ', '🟠 Chờ đồng bộ', '⚠️ Có vấn đề'][i];
      tab.textContent = `${base} (${counts[i]})`;
    });
  }

  /**
   * Đặt filter và re-render.
   */
  setFilter(filter) {
    this.currentFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.filter === filter);
    });
    this._renderList();
  }

  /**
   * Mở modal xem chi tiết phiếu.
   */
  async viewDetail(id) {
    const survey = await vkuDB.getSurveyById(id);
    if (!survey) { showToast('Không tìm thấy phiếu.', 'error'); return; }

    const FACILITY_MAP = {
      lighting: '💡 Đèn chiếu sáng',
      airConditioner: '❄️ Điều hòa',
      projector: '📽️ Máy chiếu',
      computer: '💻 Máy tính',
      tables: '🪑 Bàn ghế',
      electricity: '🔌 Ổ điện',
      wifi: '📶 Wi-Fi',
      fan: '🌀 Quạt',
      door: '🚪 Cửa phòng',
      safety: '🧯 Thiết bị an toàn',
    };

    const STATUS_MAP = {
      good: { label: 'Tốt', badge: 'badge-success', icon: '✅' },
      check: { label: 'Cần kiểm tra', badge: 'badge-warning', icon: '⚠️' },
      broken: { label: 'Hỏng', badge: 'badge-error', icon: '❌' },
    };

    const dateFormatted = survey.date
      ? new Date(survey.date + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : '—';

    const modal = document.getElementById('detail-modal');
    const modalBody = document.getElementById('detail-modal-body');
    const modalTitle = document.getElementById('detail-modal-title');

    if (modalTitle) modalTitle.textContent = `Phòng ${survey.room}`;

    if (modalBody) {
      modalBody.innerHTML = `
        <!-- Thông tin cơ bản -->
        <div class="detail-info-grid">
          <div class="detail-info-item">
            <div class="detail-info-label">Phòng</div>
            <div class="detail-info-value">${survey.room}</div>
          </div>
          <div class="detail-info-item">
            <div class="detail-info-label">Khu vực</div>
            <div class="detail-info-value">${survey.facility || '—'}</div>
          </div>
          <div class="detail-info-item">
            <div class="detail-info-label">Tòa nhà</div>
            <div class="detail-info-value">${survey.building || '—'}</div>
          </div>
          <div class="detail-info-item">
            <div class="detail-info-label">Tầng</div>
            <div class="detail-info-value">${survey.floor || '—'}</div>
          </div>
          <div class="detail-info-item">
            <div class="detail-info-label">Người khảo sát</div>
            <div class="detail-info-value">${survey.inspector || '—'}</div>
          </div>
          <div class="detail-info-item">
            <div class="detail-info-label">Ngày</div>
            <div class="detail-info-value">${dateFormatted}</div>
          </div>
        </div>

        <!-- Trạng thái đồng bộ -->
        <div style="margin-bottom: var(--space-4)">
          ${survey.synced
            ? `<span class="badge badge-success"><span class="badge-dot"></span>Đã đồng bộ</span>`
            : `<span class="badge badge-warning"><span class="badge-dot"></span>Chờ đồng bộ</span>`}
          ${survey.hasIssues
            ? `&nbsp;<span class="badge badge-error">⚠️ Có thiết bị vấn đề</span>`
            : `&nbsp;<span class="badge badge-success">✓ Tất cả bình thường</span>`}
        </div>

        <div class="divider"></div>

        <!-- Tình trạng thiết bị -->
        <div class="section-label">Tình trạng thiết bị</div>
        <div class="detail-facilities">
          ${Object.entries(survey.facilities || {}).map(([key, status]) => {
            const fName = FACILITY_MAP[key] || key;
            const sInfo = STATUS_MAP[status] || STATUS_MAP.good;
            return `
              <div class="detail-facility-row">
                <span>${fName}</span>
                <span class="badge ${sInfo.badge}">${sInfo.icon} ${sInfo.label}</span>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Ghi chú -->
        ${survey.note ? `
          <div class="divider"></div>
          <div class="section-label">Ghi chú</div>
          <div style="background: var(--color-surface-2); border-radius: var(--radius); padding: var(--space-3); font-size: var(--font-size-sm); color: var(--color-text-secondary);">
            ${survey.note}
          </div>
        ` : ''}

        <!-- Ảnh -->
        ${survey.images && survey.images.length > 0 ? `
          <div class="divider"></div>
          <div class="section-label">Hình ảnh (${survey.images.length})</div>
          <div class="image-preview-grid">
            ${survey.images.map((img, i) => `
              <div class="image-preview-item">
                <img src="${img}" alt="Ảnh ${i+1}" style="cursor: pointer" onclick="window.open('${img}','_blank')" />
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Actions -->
        <div class="divider"></div>
        <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
          <button class="btn btn-secondary btn-sm" onclick="historyManager.editSurvey('${survey.id}'); historyManager.closeModal();">
            ✏️ Chỉnh sửa
          </button>
          ${!survey.synced ? `
            <button class="btn btn-success btn-sm" onclick="historyManager.syncSurvey('${survey.id}')">
              🔄 Đồng bộ ngay
            </button>
          ` : ''}
          <button class="btn btn-danger btn-sm" onclick="historyManager.deleteSurvey('${survey.id}'); historyManager.closeModal();">
            🗑️ Xóa
          </button>
        </div>
      `;
    }

    if (modal) modal.classList.add('open');
  }

  /**
   * Đóng modal chi tiết.
   */
  closeModal() {
    const modal = document.getElementById('detail-modal');
    if (modal) modal.classList.remove('open');
  }

  /**
   * Chuyển sang trang sửa phiếu.
   */
  editSurvey(id) {
    app.navigateTo('survey', { editId: id });
  }

  /**
   * Đồng bộ một phiếu cụ thể.
   */
  async syncSurvey(id) {
    if (!networkManager.checkOnline()) {
      showToast('Cần có Internet để đồng bộ.', 'warning');
      return;
    }

    showToast('Đang đồng bộ...', 'info');
    try {
      await syncService.syncOne(id);
      showToast('✓ Đồng bộ thành công!', 'success');
      await this.loadAndRender();
    } catch (err) {
      showToast('Lỗi đồng bộ. Thử lại sau.', 'error');
    }
  }

  /**
   * Xóa phiếu khảo sát.
   */
  async deleteSurvey(id) {
    if (!confirm('Bạn có chắc muốn xóa phiếu khảo sát này?')) return;

    try {
      await vkuDB.deleteSurvey(id);
      showToast('Đã xóa phiếu khảo sát.', 'success');
      await this.loadAndRender();
      // Cập nhật dashboard nếu đang hiển thị
      if (document.getElementById('view-dashboard')?.classList.contains('active')) {
        app.renderDashboard();
      }
    } catch (err) {
      showToast('Lỗi khi xóa.', 'error');
    }
  }
}

// Singleton instance
const historyManager = new HistoryManager();
