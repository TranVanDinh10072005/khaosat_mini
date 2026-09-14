/**
 * app.js – Main Application Controller
 *
 * Khởi tạo toàn bộ ứng dụng:
 * - Auth (đăng nhập / đăng xuất offline)
 * - SPA Router (hash-based)
 * - Toast notifications
 * - Service Worker registration
 * - Dữ liệu demo
 * - Dashboard render
 * - Pending badge & auto-sync
 */

// ── Toast Notification Helper ──────────────────────────────────

/**
 * Hiển thị toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration - ms
 */
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const iconMap = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] || 'ℹ'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  }, duration);

  toast.addEventListener('click', () => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  });
}

// ── App Controller ──────────────────────────────────────────────

class App {
  constructor() {
    this.currentView = 'dashboard';
    this.navItems = ['dashboard', 'survey', 'history', 'statistics', 'settings'];
    this._dropdownOpen = false;
  }

  // ── Khởi động ────────────────────────────────────────────────

  /**
   * Bước 1: Khởi động app.
   * DB → Auth seed → Kiểm tra session → Login hoặc vào app.
   */
  async init() {
    console.log('[App] Initializing VKU Facility Check...');

    // Đăng ký Service Worker
    this._registerServiceWorker();

    // Khởi tạo IndexedDB
    try {
      await vkuDB.init();
      console.log('[App] Database ready');
    } catch (err) {
      console.error('[App] DB init failed:', err);
      showToast('Lỗi khởi tạo cơ sở dữ liệu', 'error');
    }

    // Seed users mặc định vào IndexedDB
    await authManager.init();

    // Ghi nhận lượt truy cập (nếu có cấu hình Webhook)
    syncService.logVisitorAccess();

    // Kiểm tra session đăng nhập
    if (!authManager.isLoggedIn()) {
      // Chưa đăng nhập → Hiện login overlay
      this._showLoginOverlay();
      return; // Dừng lại, chờ người dùng đăng nhập
    }

    // Đã đăng nhập → Khởi động app
    await this._bootApp();
  }

  /**
   * Bước 2: Khởi động app sau khi đã xác thực.
   */
  async _bootApp() {
    // Ẩn login overlay (user đã authenticated)
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.add('hidden');

    // Cập nhật nav hiển thị thông tin user
    this._updateUserNav();

    // Thiết lập routing
    this._setupRouter();

    // Auto-sync khi có mạng trở lại
    networkManager.onOnline(async (online) => {
      if (!authManager.isLoggedIn()) return;
      if (online) {
        const pending = await vkuDB.getPendingSurveys();
        if (pending.length > 0) {
          showToast(`🟢 ONLINE – Đang đồng bộ ${pending.length} phiếu chờ...`, 'info', 4000);
          // Hiện progress bar
          this._showSyncProgressBar();
          setTimeout(async () => {
            const result = await syncService.syncAll();
            this._hideSyncProgressBar();
            if (result.success > 0) {
              showToast(`✅ Đã đồng bộ thành công ${result.success} phiếu!`, 'success', 5000);
              // Refresh view hiện tại
              if (this.currentView === 'history') historyManager.loadAndRender();
              if (this.currentView === 'dashboard') this.renderDashboard();
              if (this.currentView === 'statistics') statisticsManager.render();
              // Cập nhật pending badge
              await this._updatePendingBadge();
            }
          }, 1000);
        } else {
          showToast('🟢 ONLINE – Tất cả dữ liệu đã được đồng bộ', 'success');
        }
      } else {
        // Hiện offline notice trên login nếu đang ở đó
        const loginNotice = document.getElementById('login-offline-notice');
        if (loginNotice) loginNotice.classList.remove('hidden');
        showToast('🔴 OFFLINE – Dữ liệu đang được lưu trên thiết bị', 'warning', 5000);
      }
    });

    // Theo dõi offline để hiện notice trên login form
    networkManager.onOffline(() => {
      const loginNotice = document.getElementById('login-offline-notice');
      if (loginNotice) loginNotice.classList.remove('hidden');
    });

    // Cập nhật offline notice trên login nếu hiện tại offline
    if (!networkManager.isOnline) {
      const loginNotice = document.getElementById('login-offline-notice');
      if (loginNotice) loginNotice.classList.remove('hidden');
    }

    // Nạp dữ liệu demo lần đầu
    await this._loadDemoData();

    // Cập nhật pending badge
    await this._updatePendingBadge();

    // Tự động kiểm tra và đồng bộ phiếu mới từ Server mỗi 8 giây
    if (!this._syncIntervalStarted) {
      this._syncIntervalStarted = true;
      setInterval(async () => {
        if (networkManager.isOnline && typeof syncService !== 'undefined') {
          try {
            await syncService.pullSurveysFromServer();
            await this._updatePendingBadge();
            // Nếu đang xem danh sách hoặc dashboard thì cập nhật lại giao diện
            if (this.currentView === 'history' && typeof historyManager !== 'undefined') {
              historyManager.surveys = await vkuDB.getAllSurveys();
              historyManager._renderList();
            }
          } catch(e) {}
        }
      }, 8000);
    }

    console.log('[App] Ready!');
  }

  // ── Login / Auth ──────────────────────────────────────────────

  /**
   * Chuyển đổi giữa tab Khảo sát nhanh và Đăng nhập Quản trị.
   * @param {'guest'|'admin'} tab
   */
  switchAuthTab(tab) {
    const tabGuest = document.getElementById('tab-btn-guest');
    const tabAdmin = document.getElementById('tab-btn-admin');
    const guestForm = document.getElementById('guest-form');
    const loginForm = document.getElementById('login-form');
    const hintBlock = document.getElementById('login-hint-block');
    const subtitle = document.getElementById('login-subtitle-text');

    if (tab === 'guest') {
      if (tabGuest) {
        tabGuest.style.background = '#fff';
        tabGuest.style.color = 'var(--color-primary)';
        tabGuest.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      }
      if (tabAdmin) {
        tabAdmin.style.background = 'transparent';
        tabAdmin.style.color = 'var(--color-text-muted)';
        tabAdmin.style.boxShadow = 'none';
      }
      guestForm?.classList.remove('hidden');
      loginForm?.classList.add('hidden');
      hintBlock?.classList.add('hidden');
      if (subtitle) subtitle.textContent = 'Khảo sát tình trạng cơ sở vật chất VKU';
      setTimeout(() => document.getElementById('guest-name')?.focus(), 150);
    } else {
      if (tabAdmin) {
        tabAdmin.style.background = '#fff';
        tabAdmin.style.color = 'var(--color-primary)';
        tabAdmin.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      }
      if (tabGuest) {
        tabGuest.style.background = 'transparent';
        tabGuest.style.color = 'var(--color-text-muted)';
        tabGuest.style.boxShadow = 'none';
      }
      guestForm?.classList.add('hidden');
      loginForm?.classList.remove('hidden');
      hintBlock?.classList.remove('hidden');
      if (subtitle) subtitle.textContent = 'Đăng nhập Cán bộ / Quản trị viên';
      setTimeout(() => document.getElementById('login-username')?.focus(), 150);
    }
  }

  /**
   * Xử lý đăng nhập khảo sát nhanh cho khách.
   */
  async _handleGuestLogin() {
    const btn = document.getElementById('guest-btn');
    const errorEl = document.getElementById('guest-error');
    const name = document.getElementById('guest-name')?.value?.trim();
    const code = document.getElementById('guest-code')?.value?.trim();

    if (!name) {
      if (errorEl) {
        errorEl.textContent = 'Vui lòng nhập Họ và tên của bạn.';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner"></div> Đang vào khảo sát...`;
    }
    if (errorEl) errorEl.classList.add('hidden');

    try {
      const result = await authManager.guestLogin(name, code);
      if (result.success) {
        const overlay = document.getElementById('login-overlay');
        if (overlay) {
          overlay.style.animation = 'none';
          overlay.style.transition = 'opacity 0.4s ease';
          overlay.style.opacity = '0';
          setTimeout(() => overlay.classList.add('hidden'), 400);
        }

        showToast(`👋 Chào bạn ${name}! Bắt đầu khảo sát.`, 'success');
        window.location.hash = 'survey';
        await this._bootApp();
      } else {
        if (errorEl) {
          errorEl.textContent = result.error || 'Có lỗi xảy ra.';
          errorEl.classList.remove('hidden');
        }
      }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = 'Lỗi hệ thống. Thử lại.';
        errorEl.classList.remove('hidden');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '🚀 Bắt đầu làm khảo sát';
      }
    }
  }

  /**
   * Hiện login overlay và gắn form handler.
   */
  _showLoginOverlay() {
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.remove('hidden');

    // Hiện offline notice nếu đang offline
    if (!networkManager.isOnline) {
      const notice = document.getElementById('login-offline-notice');
      if (notice) notice.classList.remove('hidden');
    }

    // Theo dõi online/offline trên login page
    networkManager.onOffline(() => {
      const notice = document.getElementById('login-offline-notice');
      if (notice) notice.classList.remove('hidden');
    });

    // Bind guest form submit
    const guestForm = document.getElementById('guest-form');
    if (guestForm) {
      guestForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this._handleGuestLogin();
      });
    }

    // Bind admin login form submit
    const form = document.getElementById('login-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this._handleLogin();
      });
    }

    // Focus vào guest name field
    setTimeout(() => {
      document.getElementById('guest-name')?.focus();
    }, 400);
  }

  /**
   * Xử lý submit form đăng nhập.
   */
  async _handleLogin() {
    const btn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');
    const username = document.getElementById('login-username')?.value?.trim();
    const password = document.getElementById('login-password')?.value;

    // Loading state
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner"></div> Đang kiểm tra...`;
    }
    if (errorEl) errorEl.classList.add('hidden');

    try {
      const result = await authManager.login(username, password);

      if (result.success) {
        // Đăng nhập thành công
        const overlay = document.getElementById('login-overlay');
        if (overlay) {
          overlay.style.animation = 'none';
          overlay.style.transition = 'opacity 0.4s ease';
          overlay.style.opacity = '0';
          setTimeout(() => overlay.classList.add('hidden'), 400);
        }

        showToast(`👋 Xin chào, ${authManager.getCurrentUser().displayName}!`, 'success');

        // Khởi động app
        await this._bootApp();

      } else {
        // Lỗi đăng nhập
        if (errorEl) {
          errorEl.textContent = result.error;
          errorEl.classList.remove('hidden');
        }
      }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = 'Lỗi hệ thống. Thử lại.';
        errorEl.classList.remove('hidden');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          Đăng nhập
        `;
      }
    }
  }

  /**
   * Đăng xuất.
   */
  logout() {
    if (!confirm('Bạn có muốn đăng xuất không?')) return;
    authManager.logout();
    this.closeUserDropdown();
    showToast('Đã đăng xuất.', 'info');
    // Reload để show login
    setTimeout(() => window.location.reload(), 800);
  }

  /**
   * Ẩn/hiện mật khẩu trên login form.
   */
  togglePasswordVisibility() {
    const input = document.getElementById('login-password');
    const btn = document.getElementById('toggle-password');
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
      if (btn) btn.textContent = input.type === 'password' ? '👁' : '🙈';
    }
  }

  // ── User Nav ──────────────────────────────────────────────────

  /**
   * Cập nhật nav với thông tin user đã đăng nhập.
   */
  _updateUserNav() {
    const user = authManager.getCurrentUser();
    if (!user) return;

    // Avatar initials
    const initialsEl = document.getElementById('user-initials');
    if (initialsEl) initialsEl.textContent = authManager.getInitials();

    // Dropdown info
    const nameEl = document.getElementById('dropdown-display-name');
    if (nameEl) nameEl.textContent = user.displayName;

    const roleEl = document.getElementById('dropdown-role');
    if (roleEl) {
      const roleMap = { admin: '👑 Quản trị viên', inspector: '🔍 Người khảo sát' };
      roleEl.textContent = roleMap[user.role] || user.role;
    }
  }

  /**
   * Toggle user dropdown menu.
   */
  toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (!dropdown) return;

    this._dropdownOpen = !this._dropdownOpen;
    dropdown.classList.toggle('hidden', !this._dropdownOpen);

    // Đóng khi click bên ngoài
    if (this._dropdownOpen) {
      setTimeout(() => {
        document.addEventListener('click', this._closeDropdownOnOutsideClick.bind(this), { once: true });
      }, 0);
    }
  }

  _closeDropdownOnOutsideClick(e) {
    if (!e.target.closest('#user-dropdown') && !e.target.closest('#user-avatar-btn')) {
      this.closeUserDropdown();
    }
  }

  closeUserDropdown() {
    this._dropdownOpen = false;
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
  }

  // ── Pending Badge ─────────────────────────────────────────────

  /**
   * Cập nhật badge số phiếu đang chờ sync trên nav history.
   */
  async _updatePendingBadge() {
    try {
      const pending = await vkuDB.getPendingSurveys();
      const count = pending.length;

      // Bottom nav badge
      const historyNavItem = document.getElementById('nav-history');
      if (historyNavItem) {
        const existing = historyNavItem.querySelector('.pending-badge');
        if (existing) existing.remove();
        if (count > 0) {
          const badge = document.createElement('span');
          badge.className = 'pending-badge';
          badge.textContent = count > 9 ? '9+' : count;
          historyNavItem.appendChild(badge);
        }
      }
    } catch (e) { /* ignore */ }
  }

  // ── Sync Progress Bar ─────────────────────────────────────────

  _showSyncProgressBar() {
    let bar = document.getElementById('sync-progress-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'sync-progress-bar';
      bar.className = 'sync-progress-bar';
      bar.style.width = '100%';
      document.body.appendChild(bar);
    }
  }

  _hideSyncProgressBar() {
    setTimeout(() => {
      const bar = document.getElementById('sync-progress-bar');
      if (bar) bar.remove();
    }, 1500);
  }


  /**
   * Đăng ký Service Worker.
   */
  _registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js')
        .then(reg => {
          console.log('[SW] Registered:', reg.scope);

          // Thông báo khi có phiên bản mới
          reg.onupdatefound = () => {
            const newWorker = reg.installing;
            newWorker.onstatechange = () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showToast('Có phiên bản mới! Tải lại để cập nhật.', 'info', 8000);
              }
            };
          };
        })
        .catch(err => console.error('[SW] Registration failed:', err));
    }
  }

  /**
   * Thiết lập SPA router dựa trên URL hash.
   */
  _setupRouter() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) this.navigateTo(hash);
    });
  }

  /**
   * Điều hướng tới một view.
   * @param {string} viewName - 'dashboard'|'survey'|'history'|'statistics'|'settings'
   * @param {Object} params - Tham số bổ sung (vd: { editId: '...' })
   */
  async navigateTo(viewName, params = {}) {
    // Normalize viewName
    if (!this.navItems.includes(viewName)) viewName = 'dashboard';

    this.currentView = viewName;

    // Cập nhật URL hash
    if (window.location.hash !== `#${viewName}`) {
      window.history.pushState(null, null, `#${viewName}`);
    }

    // Ẩn tất cả views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    // Hiện view mới
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.classList.add('active');

    // Cập nhật nav active states
    this._updateNavActive(viewName);

    // Render nội dung view
    await this._renderView(viewName, params);

    // Scroll lên đầu
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Render nội dung cho từng view.
   */
  async _renderView(viewName, params) {
    switch (viewName) {
      case 'dashboard':
        await this.renderDashboard();
        break;
      case 'survey':
        await surveyManager.renderForm(params.editId || null);
        break;
      case 'history':
        await historyManager.render();
        break;
      case 'statistics':
        await statisticsManager.render();
        break;
      case 'settings':
        await this.renderSettings();
        break;
    }
  }

  /**
   * Cập nhật trạng thái active trên navigation.
   */
  _updateNavActive(viewName) {
    // Bottom nav (mobile)
    document.querySelectorAll('#bottom-nav .nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });
    // Sidebar nav (tablet/desktop)
    document.querySelectorAll('#sidebar-nav .sidebar-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });
  }

  /**
   * Render Dashboard.
   */
  async renderDashboard() {
    const view = document.getElementById('view-dashboard');
    if (!view) return;

    // Tự động kéo dữ liệu khảo sát mới nhất từ server về máy
    if (typeof syncService !== 'undefined') {
      try { await syncService.pullSurveysFromServer(); } catch(e) {}
    }

    let counts = { total: 0, synced: 0, pending: 0, hasIssues: 0, completed: 0 };
    let recentSurveys = [];

    try {
      counts = await vkuDB.getCounts();
      const allSurveys = await vkuDB.getAllSurveys();
      recentSurveys = allSurveys.slice(0, 3);
    } catch (e) {
      console.error('[Dashboard] Error:', e);
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    view.innerHTML = `
      <!-- Welcome Card -->
      <div class="welcome-card">
        <div class="welcome-greeting">VKU Facility Check</div>
        <div class="welcome-title">Xin chào! 👋</div>
        <div class="welcome-desc">Hệ thống khảo sát cơ sở vật chất</div>
        <div class="welcome-date">📅 ${dateStr}</div>
        <div style="margin-top: var(--space-3)">
          <div id="dash-network-status"></div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="section-label">Tổng quan</div>
      <div class="stats-grid mb-5">
        <div class="stat-card" style="--stat-color: #1565C0; --stat-icon-bg: #EFF6FF;">
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div class="stat-value">${counts.total}</div>
          <div class="stat-label">Tổng số phiếu</div>
        </div>

        <div class="stat-card" style="--stat-color: #2E7D32; --stat-icon-bg: #E8F5E9;">
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="stat-value">${counts.synced}</div>
          <div class="stat-label">Đã đồng bộ</div>
        </div>

        <div class="stat-card" style="--stat-color: #F57F17; --stat-icon-bg: #FFF8E1;">
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="stat-value">${counts.pending}</div>
          <div class="stat-label">Chờ đồng bộ</div>
        </div>

        <div class="stat-card" style="--stat-color: #C62828; --stat-icon-bg: #FFEBEE;">
          <div class="stat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div class="stat-value">${counts.hasIssues}</div>
          <div class="stat-label">Có vấn đề</div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="section-label">Thao tác nhanh</div>
      <div class="quick-actions mb-5">
        <button class="quick-action-card" onclick="app.navigateTo('survey')">
          <div class="quick-action-icon" style="background: #EFF6FF;">📋</div>
          <div>
            <div class="quick-action-title">Tạo phiếu mới</div>
            <div class="quick-action-desc">Khảo sát phòng</div>
          </div>
        </button>

        <button class="quick-action-card" onclick="app.navigateTo('history')">
          <div class="quick-action-icon" style="background: #F0FDF4;">📂</div>
          <div>
            <div class="quick-action-title">Lịch sử</div>
            <div class="quick-action-desc">Xem phiếu đã tạo</div>
          </div>
        </button>

        <button class="quick-action-card" onclick="app.navigateTo('statistics')">
          <div class="quick-action-icon" style="background: #FFF8E1;">📊</div>
          <div>
            <div class="quick-action-title">Thống kê</div>
            <div class="quick-action-desc">Báo cáo tình trạng</div>
          </div>
        </button>

        <button class="quick-action-card" onclick="app.syncAll()">
          <div class="quick-action-icon" style="background: #F0FDF4;">🔄</div>
          <div>
            <div class="quick-action-title">Đồng bộ</div>
            <div class="quick-action-desc">${counts.pending} phiếu chờ</div>
          </div>
        </button>
      </div>

      <!-- Phiếu gần đây -->
      ${recentSurveys.length > 0 ? `
        <div style="display: flex; justify-content: space-between; align-items: center;" class="mb-3">
          <div class="section-label" style="margin-bottom: 0;">Phiếu gần đây</div>
          <button onclick="app.navigateTo('history')" style="background:none;border:none;color:var(--color-primary);font-size:var(--font-size-sm);font-weight:600;cursor:pointer;">
            Xem tất cả →
          </button>
        </div>
        <div class="survey-list mb-5">
          ${recentSurveys.map(s => `
            <div class="survey-card" onclick="historyManager.viewDetail('${s.id}'); app.navigateTo('history');" style="cursor:pointer;">
              <div class="survey-card-header">
                <div>
                  <div class="survey-card-room">${s.room}</div>
                  <div class="survey-card-location">${[s.building, s.floor].filter(Boolean).join(' – ')}</div>
                </div>
                ${s.synced
                  ? `<span class="badge badge-success"><span class="badge-dot"></span>Đã đồng bộ</span>`
                  : `<span class="badge badge-warning"><span class="badge-dot"></span>Chờ sync</span>`}
              </div>
              <div class="survey-card-body">
                <div class="survey-card-meta">
                  <span>📅 ${s.date ? new Date(s.date + 'T00:00:00').toLocaleDateString('vi-VN') : '—'}</span>
                  <span>👤 ${s.inspector || '—'}</span>
                  ${s.hasIssues ? `<span style="color:var(--color-error)">⚠️ Có vấn đề</span>` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    // Cập nhật network status indicator sau khi render
    networkManager._updateUI(networkManager.isOnline);
  }

  /**
   * Render Settings.
   */
  async renderSettings() {
    const view = document.getElementById('view-settings');
    if (!view) return;

    let storageInfo = 'Không hỗ trợ';
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const est = await navigator.storage.estimate();
        const used = (est.usage / 1024 / 1024).toFixed(2);
        const quota = (est.quota / 1024 / 1024).toFixed(0);
        storageInfo = `${used} MB / ${quota} MB`;
      } catch (e) {}
    }

    let counts = { total: 0, pending: 0 };
    try { counts = await vkuDB.getCounts(); } catch(e) {}

    const swStatus = 'serviceWorker' in navigator
      ? (navigator.serviceWorker.controller ? 'Đang hoạt động ✅' : 'Chưa kích hoạt')
      : 'Không hỗ trợ';

    view.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">⚙️ Cài đặt</h1>
        <p class="page-subtitle">Thông tin ứng dụng và lưu trữ</p>
      </div>

      <!-- App Info -->
      <div class="settings-section">
        <div class="settings-section-title">Ứng dụng</div>
        <div class="settings-list">
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #EFF6FF;">🏫</div>
              <div>
                <div class="settings-item-title">VKU Facility Check</div>
                <div class="settings-item-subtitle">Phiên bản 1.0.0</div>
              </div>
            </div>
          </div>
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #F0FDF4;">📡</div>
              <div>
                <div class="settings-item-title">Trạng thái mạng</div>
                <div class="settings-item-subtitle">Kết nối hiện tại</div>
              </div>
            </div>
            <div class="settings-item-value" id="settings-network">
              ${networkManager.isOnline ? '🟢 Online' : '🔴 Offline'}
            </div>
          </div>
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #FFF8E1;">⚙️</div>
              <div>
                <div class="settings-item-title">Service Worker</div>
                <div class="settings-item-subtitle">PWA cache</div>
              </div>
            </div>
            <div class="settings-item-value">${swStatus}</div>
          </div>
        </div>
      </div>

      <!-- Dữ liệu -->
      <div class="settings-section">
        <div class="settings-section-title">Dữ liệu</div>
        <div class="settings-list">
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #EFF6FF;">📋</div>
              <div>
                <div class="settings-item-title">Tổng số phiếu</div>
                <div class="settings-item-subtitle">Lưu trên thiết bị</div>
              </div>
            </div>
            <div class="settings-item-value">${counts.total}</div>
          </div>
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #FFF8E1;">⏳</div>
              <div>
                <div class="settings-item-title">Chờ đồng bộ</div>
                <div class="settings-item-subtitle">Chưa gửi lên server</div>
              </div>
            </div>
            <div class="settings-item-value">${counts.pending}</div>
          </div>
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #F0FDF4;">💾</div>
              <div>
                <div class="settings-item-title">Dung lượng sử dụng</div>
                <div class="settings-item-subtitle">IndexedDB + Cache</div>
              </div>
            </div>
            <div class="settings-item-value">${storageInfo}</div>
          </div>
        </div>
      </div>

      <!-- Hành động -->
      <div class="settings-section">
        <div class="settings-section-title">Hành động</div>
        <div class="settings-list">
          <div class="settings-item" onclick="app.syncAll()">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #F0FDF4;">🔄</div>
              <div>
                <div class="settings-item-title">Đồng bộ ngay</div>
                <div class="settings-item-subtitle">Gửi ${counts.pending} phiếu lên server</div>
              </div>
            </div>
            <span>›</span>
          </div>
          <div class="settings-item" onclick="app.clearData()">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #FFEBEE;">🗑️</div>
              <div>
                <div class="settings-item-title" style="color: var(--color-error);">Xóa tất cả dữ liệu</div>
                <div class="settings-item-subtitle">Không thể khôi phục</div>
              </div>
            </div>
            <span>›</span>
          </div>
        </div>
      </div>

      <!-- Cấu hình Google Sheets -->
      <div class="settings-section">
        <div class="settings-section-title">📊 Thu thập dữ liệu (Google Sheets)</div>
        <div class="card">
          <div class="card-body">
            <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 1rem;">
              Dán URL Google Apps Script Web App để tự động lưu thông tin người khảo sát và kết quả về file Google Sheets của bạn.
            </p>
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label" for="setting-sheets-url" style="font-weight: 600;">Link Webhook Google Sheets:</label>
              <input
                type="url"
                id="setting-sheets-url"
                class="form-control"
                placeholder="https://script.google.com/macros/s/.../exec"
                value="${syncService.getEndpointUrl() || ''}"
              />
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button type="button" class="btn btn-primary btn-sm" onclick="app.saveGoogleSheetUrl()">
                💾 Lưu cấu hình
              </button>
              <button type="button" class="btn btn-outline btn-sm" onclick="app.testGoogleSheetConnection()">
                🧪 Gửi thử nghiệm
              </button>
            </div>
            ${syncService.getEndpointUrl() ? `
              <div style="margin-top: 0.75rem; font-size: 0.8rem; color: var(--color-success); display: flex; align-items: center; gap: 6px;">
                <span>🟢 Đang liên kết:</span>
                <span style="word-break: break-all; font-size: 0.75rem;">${syncService.getEndpointUrl()}</span>
              </div>
            ` : `
              <div style="margin-top: 0.75rem; font-size: 0.8rem; color: var(--color-text-muted);">
                ℹ️ Chưa cấu hình link (Dữ liệu sẽ lưu offline trên máy và dùng mô phỏng).
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- PWA Info -->
      <div class="settings-section">
        <div class="settings-section-title">PWA & Triển khai</div>
        <div class="card">
          <div class="card-body">
            <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: 1.8;">
              Ứng dụng này là một <strong>Progressive Web App (PWA)</strong>.<br>
              Bạn có thể cài đặt lên màn hình chính điện thoại.<br><br>
              Trên Chrome/Android: Menu → "Thêm vào màn hình chính"<br>
              Trên Safari/iOS: Chia sẻ → "Thêm vào màn hình chính"
            </p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Lưu URL Google Sheets Webhook.
   */
  saveGoogleSheetUrl() {
    const input = document.getElementById('setting-sheets-url');
    const url = input?.value?.trim();
    syncService.setEndpointUrl(url);
    if (url) {
      showToast('✓ Đã lưu link Google Sheets thành công!', 'success');
    } else {
      showToast('Đã xóa link Google Sheets (sử dụng chế độ offline/mô phỏng)', 'info');
    }
    this.renderSettings();
  }

  /**
   * Gửi tín hiệu test kết nối Google Sheets.
   */
  async testGoogleSheetConnection() {
    const url = syncService.getEndpointUrl();
    if (!url) {
      showToast('Vui lòng nhập và lưu link Webhook Google Sheets trước!', 'warning');
      return;
    }
    showToast('Đang gửi tín hiệu kiểm tra tới Google Sheets...', 'info');
    try {
      await syncService.logVisitorAccess({ note: 'Thử nghiệm kết nối từ trang Cài đặt' });
      showToast('✓ Đã gửi thành công! Hãy kiểm tra Google Sheet của bạn.', 'success', 4000);
    } catch (e) {
      showToast('Lỗi khi gửi dữ liệu. Vui lòng kiểm tra lại URL.', 'error');
    }
  }

  /**
   * Kích hoạt sync tất cả phiếu.
   */
  async syncAll() {
    if (!networkManager.checkOnline()) {
      showToast('Cần có Internet để đồng bộ.', 'warning');
      return;
    }
    showToast('Đang đồng bộ...', 'info');
    try {
      const result = await syncService.syncAll();
      if (result.success > 0) {
        showToast(`✓ Đã đồng bộ ${result.success} phiếu!`, 'success');
        if (this.currentView === 'history') await historyManager.loadAndRender();
        if (this.currentView === 'dashboard') await this.renderDashboard();
        if (this.currentView === 'settings') await this.renderSettings();
      } else {
        showToast('Không có phiếu nào cần đồng bộ.', 'info');
      }
    } catch (err) {
      showToast('Lỗi đồng bộ. Thử lại sau.', 'error');
    }
  }

  /**
   * Xóa toàn bộ dữ liệu (với xác nhận).
   */
  async clearData() {
    if (!confirm('Bạn có chắc muốn XÓA TẤT CẢ dữ liệu?\nHành động này không thể hoàn tác!')) return;
    try {
      await vkuDB.clearAll();
      showToast('Đã xóa tất cả dữ liệu.', 'success');
      await this.navigateTo('dashboard');
    } catch (err) {
      showToast('Lỗi khi xóa dữ liệu.', 'error');
    }
  }

  /**
   * Nạp dữ liệu demo vào IndexedDB lần đầu.
   */
  async _loadDemoData() {
    try {
      const existing = await vkuDB.getAllSurveys();
      if (existing.length > 0) return; // Đã có dữ liệu, không nạp lại

      const demoSurveys = [
        {
          id: 'demo_001',
          facility: 'Cơ sở 1 – Đà Nẵng',
          building: 'Tòa A',
          floor: 'Tầng 1',
          room: 'A101',
          inspector: 'Nguyễn Văn An',
          date: '2026-09-10',
          time: '08:30',
          facilities: {
            lighting: 'good', airConditioner: 'good', projector: 'good',
            computer: 'good', tables: 'good', electricity: 'good',
            wifi: 'good', fan: 'good', door: 'good', safety: 'good'
          },
          note: 'Tất cả thiết bị hoạt động tốt.',
          images: [],
          hasIssues: false,
          status: 'completed',
          synced: true,
          createdAt: '2026-09-10T08:35:00.000Z',
        },
        {
          id: 'demo_002',
          facility: 'Cơ sở 1 – Đà Nẵng',
          building: 'Tòa A',
          floor: 'Tầng 1',
          room: 'A102',
          inspector: 'Trần Thị Bình',
          date: '2026-09-10',
          time: '09:00',
          facilities: {
            lighting: 'good', airConditioner: 'check', projector: 'broken',
            computer: 'good', tables: 'good', electricity: 'check',
            wifi: 'good', fan: 'good', door: 'good', safety: 'good'
          },
          note: 'Máy chiếu không hoạt động. Điều hòa có tiếng ồn lạ. Ổ điện gần cửa sổ cần kiểm tra.',
          images: [],
          hasIssues: true,
          status: 'pending',
          synced: false,
          createdAt: '2026-09-10T09:05:00.000Z',
        },
        {
          id: 'demo_003',
          facility: 'Cơ sở 1 – Đà Nẵng',
          building: 'Tòa B',
          floor: 'Tầng 2',
          room: 'B201',
          inspector: 'Lê Văn Cường',
          date: '2026-09-11',
          time: '10:00',
          facilities: {
            lighting: 'good', airConditioner: 'good', projector: 'good',
            computer: 'check', tables: 'good', electricity: 'good',
            wifi: 'check', fan: 'good', door: 'good', safety: 'good'
          },
          note: '2 máy tính cuối phòng bị lag. Wi-Fi yếu ở góc phòng.',
          images: [],
          hasIssues: true,
          status: 'completed',
          synced: true,
          createdAt: '2026-09-11T10:05:00.000Z',
        },
        {
          id: 'demo_004',
          facility: 'Cơ sở 1 – Đà Nẵng',
          building: 'Tòa B',
          floor: 'Tầng 2',
          room: 'B202',
          inspector: 'Nguyễn Thị Dung',
          date: '2026-09-12',
          time: '14:00',
          facilities: {
            lighting: 'broken', airConditioner: 'broken', projector: 'good',
            computer: 'good', tables: 'check', electricity: 'good',
            wifi: 'good', fan: 'broken', door: 'good', safety: 'check'
          },
          note: 'Đèn phòng học bị hỏng 3 bóng. Điều hòa không lạnh. Quạt bàn GV bị hỏng.',
          images: [],
          hasIssues: true,
          status: 'pending',
          synced: false,
          createdAt: '2026-09-12T14:05:00.000Z',
        },
        {
          id: 'demo_005',
          facility: 'Cơ sở 1 – Đà Nẵng',
          building: 'Tòa C',
          floor: 'Tầng 3',
          room: 'C301',
          inspector: 'Phạm Minh Đức',
          date: '2026-09-14',
          time: '08:00',
          facilities: {
            lighting: 'good', airConditioner: 'good', projector: 'good',
            computer: 'good', tables: 'good', electricity: 'good',
            wifi: 'good', fan: 'good', door: 'good', safety: 'good'
          },
          note: '',
          images: [],
          hasIssues: false,
          status: 'pending',
          synced: false,
          createdAt: '2026-09-14T08:05:00.000Z',
        },
      ];

      // Lưu tất cả demo surveys
      for (const survey of demoSurveys) {
        await vkuDB.saveSurvey(survey);
      }

      console.log('[App] Demo data loaded:', demoSurveys.length, 'surveys');

    } catch (err) {
      console.error('[App] Error loading demo data:', err);
    }
  }

  // ── Cập nhật settings để hiện thông tin user ─────────────────

  /**
   * Render Settings (override để thêm user info).
   */
  async renderSettings() {
    const view = document.getElementById('view-settings');
    if (!view) return;

    let storageInfo = 'Không hỗ trợ';
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const est = await navigator.storage.estimate();
        const used = (est.usage / 1024 / 1024).toFixed(2);
        const quota = (est.quota / 1024 / 1024).toFixed(0);
        storageInfo = `${used} MB / ${quota} MB`;
      } catch (e) {}
    }

    let counts = { total: 0, pending: 0 };
    try { counts = await vkuDB.getCounts(); } catch(e) {}

    const user = authManager.getCurrentUser();
    const roleMap = { admin: '👑 Quản trị viên', inspector: '🔍 Người khảo sát' };

    const swStatus = 'serviceWorker' in navigator
      ? (navigator.serviceWorker.controller ? 'Đang hoạt động ✅' : 'Chưa kích hoạt')
      : 'Không hỗ trợ';

    view.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">⚙️ Cài đặt</h1>
        <p class="page-subtitle">Thông tin ứng dụng và lưu trữ</p>
      </div>

      <!-- Thông tin tài khoản -->
      ${user ? `
      <div class="settings-section">
        <div class="settings-section-title">Tài khoản</div>
        <div class="settings-list">
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #EFF6FF; font-size: 1.3rem;">👤</div>
              <div>
                <div class="settings-item-title">${user.displayName}</div>
                <div class="settings-item-subtitle">${roleMap[user.role] || user.role} · @${user.username}</div>
              </div>
            </div>
          </div>
          <div class="settings-item" onclick="app.logout()" style="cursor:pointer;">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #FFEBEE; font-size: 1.2rem;">🚪</div>
              <div>
                <div class="settings-item-title" style="color: var(--color-error);">Đăng xuất</div>
                <div class="settings-item-subtitle">Kết thúc phiên làm việc</div>
              </div>
            </div>
            <span>›</span>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Trạng thái kết nối -->
      <div class="settings-section">
        <div class="settings-section-title">Kết nối & Đồng bộ</div>
        <div class="settings-list">
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #F0FDF4;">📡</div>
              <div>
                <div class="settings-item-title">Trạng thái mạng</div>
                <div class="settings-item-subtitle">Kết nối hiện tại</div>
              </div>
            </div>
            <div class="settings-item-value">${networkManager.isOnline ? '🟢 Online' : '🔴 Offline'}</div>
          </div>
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #FFF8E1;">⏳</div>
              <div>
                <div class="settings-item-title">Chờ đồng bộ</div>
                <div class="settings-item-subtitle">Phiếu chưa gửi lên server</div>
              </div>
            </div>
            <div class="settings-item-value">${counts.pending > 0 ? `<span class="badge badge-warning">${counts.pending} phiếu</span>` : `<span class="badge badge-success">Đã đồng bộ</span>`}</div>
          </div>
          <div class="settings-item" onclick="app.syncAll()">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #F0FDF4;">🔄</div>
              <div>
                <div class="settings-item-title">Đồng bộ ngay</div>
                <div class="settings-item-subtitle">Gửi ${counts.pending} phiếu lên server</div>
              </div>
            </div>
            <span>›</span>
          </div>
        </div>
      </div>

      <!-- Ứng dụng -->
      <div class="settings-section">
        <div class="settings-section-title">Ứng dụng</div>
        <div class="settings-list">
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #EFF6FF;">🏫</div>
              <div>
                <div class="settings-item-title">VKU Facility Check</div>
                <div class="settings-item-subtitle">Phiên bản 1.0.0</div>
              </div>
            </div>
          </div>
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #F0FDF4;">⚙️</div>
              <div>
                <div class="settings-item-title">Service Worker</div>
                <div class="settings-item-subtitle">PWA cache & offline</div>
              </div>
            </div>
            <div class="settings-item-value">${swStatus}</div>
          </div>
          <div class="settings-item">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #F0FDF4;">💾</div>
              <div>
                <div class="settings-item-title">Dung lượng sử dụng</div>
                <div class="settings-item-subtitle">IndexedDB + Cache</div>
              </div>
            </div>
            <div class="settings-item-value">${storageInfo}</div>
          </div>
          <div class="settings-item" onclick="app.clearData()">
            <div class="settings-item-left">
              <div class="settings-item-icon" style="background: #FFEBEE;">🗑️</div>
              <div>
                <div class="settings-item-title" style="color: var(--color-error);">Xóa tất cả dữ liệu</div>
                <div class="settings-item-subtitle">Không thể khôi phục</div>
              </div>
            </div>
            <span>›</span>
          </div>
        </div>
      </div>

      <!-- PWA Install -->
      <div class="settings-section">
        <div class="settings-section-title">Cài đặt PWA</div>
        <div class="card">
          <div class="card-body">
            <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: 1.8;">
              Ứng dụng này là <strong>Progressive Web App (PWA)</strong>.<br>
              Cài lên màn hình chính để dùng như app thật.<br><br>
              📱 <strong>Android (Chrome):</strong> Menu ⋮ → "Thêm vào màn hình chính"<br>
              🍎 <strong>iOS (Safari):</strong> Chia sẻ ⬆ → "Thêm vào màn hình chính"
            </p>
          </div>
        </div>
      </div>
    `;
  }
}

// ── Khởi động ────────────────────────────────────────────────────

const app = new App();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
