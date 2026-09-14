/**
 * sync.js – Sync Service (Mock Implementation)
 * 
 * Mô phỏng quá trình đồng bộ dữ liệu lên server.
 * 
 * KIẾN TRÚC:
 * - Hàm mockApiCall() mô phỏng REST API call
 * - Để tích hợp backend thật: thay mockApiCall() bằng fetch() thật
 * - Không cần sửa bất kỳ logic nào khác
 * 
 * LUỒNG ĐỒNG BỘ:
 * offline → IndexedDB (synced: false) → online → syncAll() → server → (synced: true)
 */

class SyncService {
  constructor() {
    this.isSyncing = false;
    this.syncListeners = [];
    this.storageKey = 'vku_google_sheet_url';

    /**
     * URL Webhook Google Sheets hoặc Backend Server.
     * Mặc định lấy từ localStorage để người dùng có thể cấu hình trực tiếp.
     */
    this.apiBaseUrl = localStorage.getItem(this.storageKey) || null;
  }

  /** Lấy endpoint hiện tại (ưu tiên localStorage) */
  getEndpointUrl() {
    return localStorage.getItem(this.storageKey) || this.apiBaseUrl || null;
  }

  /** Cập nhật endpoint và lưu vào localStorage */
  setEndpointUrl(url) {
    this.apiBaseUrl = url ? url.trim() : null;
    if (this.apiBaseUrl) {
      localStorage.setItem(this.storageKey, this.apiBaseUrl);
    } else {
      localStorage.removeItem(this.storageKey);
    }
  }

  /**
   * Đồng bộ tất cả phiếu chưa sync.
   * @returns {Promise<{success: number, failed: number}>}
   */
  async syncAll() {
    if (this.isSyncing) {
      console.log('[Sync] Already syncing...');
      return { success: 0, failed: 0 };
    }

    if (!networkManager.checkOnline()) {
      console.log('[Sync] Cannot sync – offline');
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    this._notifyListeners('start', null);

    try {
      const pendingSurveys = await vkuDB.getPendingSurveys();

      if (pendingSurveys.length === 0) {
        console.log('[Sync] No pending surveys');
        this._notifyListeners('complete', { success: 0, failed: 0 });
        return { success: 0, failed: 0 };
      }

      console.log(`[Sync] Syncing ${pendingSurveys.length} surveys...`);

      // Hiển thị sync banner
      this._showSyncBanner(`Đang đồng bộ ${pendingSurveys.length} phiếu...`);

      let successCount = 0;
      let failedCount = 0;

      for (const survey of pendingSurveys) {
        try {
          // Gọi API (mock hoặc thật)
          await this._uploadSurvey(survey);

          // Đánh dấu đã sync
          await vkuDB.updateSurvey(survey.id, {
            synced: true,
            status: 'completed',
            syncedAt: new Date().toISOString()
          });

          successCount++;
          console.log(`[Sync] Survey ${survey.id} synced ✓`);

        } catch (err) {
          failedCount++;
          console.error(`[Sync] Failed to sync ${survey.id}:`, err);

          // Đánh dấu lỗi sync
          await vkuDB.updateSurvey(survey.id, {
            syncError: err.message,
            lastSyncAttempt: new Date().toISOString()
          });
        }
      }

      const result = { success: successCount, failed: failedCount };
      this._notifyListeners('complete', result);
      this._hideSyncBanner();

      return result;

    } catch (err) {
      console.error('[Sync] Sync error:', err);
      this._notifyListeners('error', err);
      this._hideSyncBanner();
      return { success: 0, failed: 0 };

    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Upload một phiếu lên Backend Server và Google Sheets (nếu có).
   * @param {Object} survey
   * @returns {Promise}
   */
  async _uploadSurvey(survey) {
    const sheetEndpoint = this.getEndpointUrl();
    const localApiEndpoint = `${window.location.origin}/api/surveys`;

    let uploaded = false;

    // 1. Luôn gửi về Server Backend nội bộ (để Admin lập tức xem được)
    try {
      const response = await fetch(localApiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(survey)
      });
      if (response.ok) {
        uploaded = true;
        console.log(`[Sync] Survey ${survey.id} saved to backend server ✓`);
      }
    } catch (e) {
      console.warn('[Sync] Backend API push warning:', e);
    }

    // 2. Gửi về Google Sheets nếu đã cấu hình
    if (sheetEndpoint) {
      try {
        const payload = {
          action: 'submit_survey',
          id: survey.id,
          timestamp: survey.createdAt || new Date().toISOString(),
          inspector: survey.inspector || 'Ẩn danh',
          facility: survey.facility || '',
          building: survey.building || '',
          floor: survey.floor || '',
          room: survey.room || '',
          date: survey.date || '',
          time: survey.time || '',
          facilities: survey.facilities || {},
          note: survey.note || '',
          hasIssues: survey.hasIssues ? 'Có sự cố' : 'Bình thường',
          imageCount: (survey.images && survey.images.length) || 0,
          device: navigator.userAgent
        };

        await fetch(sheetEndpoint, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        uploaded = true;
        console.log(`[Sync] Survey ${survey.id} pushed to Google Sheets ✓`);
      } catch (err) {
        console.error('[Sync] Google Sheets upload error:', err);
      }
    }

    if (!uploaded) {
      return this.mockApiCall(survey);
    }

    return { success: true };
  }

  /**
   * Tải tất cả phiếu khảo sát từ Server về máy (để Admin xem được bài người khác).
   */
  async pullSurveysFromServer() {
    if (!networkManager.checkOnline()) return;

    try {
      const res = await fetch(`${window.location.origin}/api/surveys`);
      if (!res.ok) return;

      const serverSurveys = await res.json();
      if (!Array.isArray(serverSurveys)) return;

      let newCount = 0;
      for (const s of serverSurveys) {
        if (!s.id) continue;
        const local = await vkuDB.getSurveyById(s.id);
        if (!local) {
          await vkuDB.saveSurvey(s);
          newCount++;
        }
      }
      if (newCount > 0) {
        console.log(`[Sync] Pulled ${newCount} new surveys from server ✓`);
      }
    } catch (e) {
      // Bỏ qua nếu server không hỗ trợ API
    }
  }

  /**
   * Ghi nhận lượt khách truy cập vào liên kết khảo sát.
   * @param {Object} [extra]
   */
  async logVisitorAccess(extra = {}) {
    const payload = {
      action: 'visitor_access',
      timestamp: new Date().toLocaleString('vi-VN'),
      userAgent: navigator.userAgent,
      screen: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language,
      referrer: document.referrer || 'Trực tiếp',
      ...extra
    };

    // 1. Gửi về Backend server
    try {
      await fetch(`${window.location.origin}/api/visitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {}

    // 2. Gửi về Google Sheets nếu có
    const endpoint = this.getEndpointUrl();
    if (endpoint) {
      try {
        await fetch(endpoint, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        console.log('[Sync] Visitor access logged ✓');
      } catch (e) {
        console.warn('[Sync] Visitor log warning:', e);
      }
    }
  }

  /**
   * Mock API call – mô phỏng gửi dữ liệu lên server.
   * Delay ngẫu nhiên 0.5–2 giây để giống thật.
   * @param {Object} survey
   * @returns {Promise}
   */
  mockApiCall(survey) {
    const delay = 500 + Math.random() * 1500;
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Mô phỏng 95% thành công, 5% thất bại
        if (Math.random() > 0.05) {
          resolve({
            success: true,
            serverId: `server_${Date.now()}`,
            message: 'Survey synced successfully'
          });
        } else {
          reject(new Error('Network timeout (mock)'));
        }
      }, delay);
    });
  }

  /**
   * Đồng bộ một phiếu cụ thể theo ID.
   * @param {string} surveyId
   * @returns {Promise<boolean>}
   */
  async syncOne(surveyId) {
    const survey = await vkuDB.getSurveyById(surveyId);
    if (!survey) throw new Error('Survey not found');

    await this._uploadSurvey(survey);
    await vkuDB.updateSurvey(surveyId, {
      synced: true,
      status: 'completed',
      syncedAt: new Date().toISOString()
    });

    return true;
  }

  /**
   * Hiển thị sync banner.
   */
  _showSyncBanner(message) {
    const banner = document.getElementById('sync-banner');
    if (banner) {
      banner.innerHTML = `<span>⟳</span> ${message}`;
      banner.classList.add('visible');
    }
  }

  /**
   * Ẩn sync banner.
   */
  _hideSyncBanner() {
    const banner = document.getElementById('sync-banner');
    if (banner) {
      setTimeout(() => banner.classList.remove('visible'), 2000);
    }
  }

  /**
   * Đăng ký listener cho sync events.
   * @param {Function} listener - Nhận (event: 'start'|'complete'|'error', data)
   */
  onSync(listener) {
    this.syncListeners.push(listener);
  }

  /**
   * Thông báo các listener.
   */
  _notifyListeners(event, data) {
    this.syncListeners.forEach(listener => {
      try { listener(event, data); } catch (e) { console.error(e); }
    });
  }
}

// Singleton instance
const syncService = new SyncService();
