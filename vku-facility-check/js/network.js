/**
 * network.js – Network Status Manager
 * 
 * Theo dõi trạng thái kết nối Internet và cập nhật UI.
 * Lắng nghe events online/offline của browser.
 */

class NetworkManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.onlineCallbacks = [];
    this.offlineCallbacks = [];
    this._init();
  }

  /**
   * Khởi tạo event listeners.
   */
  _init() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('[Network] Online');
      this._updateUI(true);
      this._triggerCallbacks(this.onlineCallbacks);
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('[Network] Offline');
      this._updateUI(false);
      this._triggerCallbacks(this.offlineCallbacks);
    });

    // Cập nhật UI ngay khi khởi tạo
    this._updateUI(this.isOnline);
  }

  /**
   * Cập nhật các phần tử UI khi trạng thái mạng thay đổi.
   * @param {boolean} online
   */
  _updateUI(online) {
    // Top nav status indicator
    const navStatus = document.getElementById('nav-network-status');
    if (navStatus) {
      if (online) {
        navStatus.classList.remove('offline');
        navStatus.innerHTML = `
          <div class="status-dot"></div>
          <span>ONLINE</span>
        `;
      } else {
        navStatus.classList.add('offline');
        navStatus.innerHTML = `
          <div class="status-dot"></div>
          <span>OFFLINE</span>
        `;
      }
    }

    // Offline banner
    const offlineBanner = document.getElementById('offline-banner');
    if (offlineBanner) {
      if (online) {
        offlineBanner.classList.remove('visible');
      } else {
        offlineBanner.classList.add('visible');
      }
    }

    // Dashboard status card
    const dashStatus = document.getElementById('dash-network-status');
    if (dashStatus) {
      dashStatus.innerHTML = online
        ? `<span class="badge badge-success"><span class="badge-dot"></span>Đang trực tuyến</span>`
        : `<span class="badge badge-error"><span class="badge-dot"></span>Đang ngoại tuyến</span>`;
    }

    // Sidebar status (tablet/desktop)
    const sidebarStatus = document.getElementById('sidebar-network-status');
    if (sidebarStatus) {
      sidebarStatus.innerHTML = online
        ? `<span style="color: var(--color-success); font-size: 0.7rem; font-weight: 600;">● ONLINE</span>`
        : `<span style="color: var(--color-error); font-size: 0.7rem; font-weight: 600;">● OFFLINE</span>`;
    }
  }

  /**
   * Thực thi các callback đã đăng ký.
   * @param {Array<Function>} callbacks
   */
  _triggerCallbacks(callbacks) {
    callbacks.forEach(cb => {
      try { cb(this.isOnline); } catch (e) { console.error(e); }
    });
  }

  /**
   * Đăng ký callback khi có mạng trở lại.
   * @param {Function} callback
   */
  onOnline(callback) {
    this.onlineCallbacks.push(callback);
    // Nếu hiện tại đã online, gọi ngay
    if (this.isOnline) callback(true);
  }

  /**
   * Đăng ký callback khi mất mạng.
   * @param {Function} callback
   */
  onOffline(callback) {
    this.offlineCallbacks.push(callback);
  }

  /**
   * Kiểm tra trạng thái mạng hiện tại.
   * @returns {boolean}
   */
  checkOnline() {
    return navigator.onLine;
  }
}

// Singleton instance
const networkManager = new NetworkManager();
