/**
 * auth.js – Authentication Manager
 *
 * Xử lý đăng nhập / đăng xuất.
 * Hoạt động OFFLINE: xác thực dựa vào IndexedDB (đã cache sẵn).
 * Session lưu trong localStorage – tồn tại qua reload / tắt trình duyệt.
 *
 * Luồng đăng nhập offline:
 *   [Mở app] → localStorage có session? → Vào app
 *            → Không có session → Hiện login form
 *            → Nhập user/pass → Kiểm tra IndexedDB (users store)
 *            → Đúng → Lưu session localStorage → Vào app
 */

const SESSION_KEY = 'vku_auth_session';

class AuthManager {
  constructor() {
    /** @type {{userId, username, displayName, role, loginAt}|null} */
    this.currentUser = null;
    this._loadSession();
  }

  // ── Khởi tạo (gọi sau khi DB sẵn sàng) ──────────────────────

  /**
   * Seed users mặc định vào IndexedDB nếu chưa có.
   * Chỉ chạy 1 lần khi cài app lần đầu.
   */
  async init() {
    try {
      const existing = await vkuDB.getUserByUsername('admin');
      if (existing) return; // Đã seed rồi

      const defaults = [
        {
          id: 'user_admin',
          username: 'admin',
          displayName: 'Quản trị viên',
          role: 'admin',
          email: 'admin@vku.udn.vn',
          password: await this._hash('vku2026'),
        },
        {
          id: 'user_an',
          username: 'inspector1',
          displayName: 'Nguyễn Văn An',
          role: 'inspector',
          email: 'nvan@vku.udn.vn',
          password: await this._hash('vku2026'),
        },
        {
          id: 'user_binh',
          username: 'inspector2',
          displayName: 'Trần Thị Bình',
          role: 'inspector',
          email: 'ttbinh@vku.udn.vn',
          password: await this._hash('vku2026'),
        },
      ];

      for (const u of defaults) {
        u.createdAt = new Date().toISOString();
        await vkuDB.saveUser(u);
      }
      console.log('[Auth] Default users seeded ✓');
    } catch (err) {
      console.error('[Auth] Seed error:', err);
    }
  }

  // ── Login / Logout ────────────────────────────────────────────

  /**
   * Đăng nhập – kiểm tra credentials trong IndexedDB (offline OK).
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async login(username, password) {
    if (!username || !password) {
      return { success: false, error: 'Vui lòng nhập đầy đủ thông tin.' };
    }

    try {
      const user = await vkuDB.getUserByUsername(username.trim().toLowerCase());
      if (!user) {
        return { success: false, error: 'Tên đăng nhập không tồn tại.' };
      }

      const hashed = await this._hash(password);
      if (user.password !== hashed) {
        return { success: false, error: 'Mật khẩu không chính xác.' };
      }

      // Tạo session
      const session = {
        userId:      user.id,
        username:    user.username,
        displayName: user.displayName,
        role:        user.role,
        loginAt:     new Date().toISOString(),
      };

      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      this.currentUser = session;

      console.log('[Auth] Logged in:', session.username);
      return { success: true };

    } catch (err) {
      console.error('[Auth] Login error:', err);
      return { success: false, error: 'Lỗi hệ thống. Thử lại.' };
    }
  }

  /**
   * Đăng nhập chế độ Khách (Khảo sát nhanh dành cho sinh viên / người tham gia)
   * @param {string} fullName
   * @param {string} [studentCode]
   * @returns {Promise<{success:boolean, error?:string}>}
   */
  async guestLogin(fullName, studentCode = '') {
    if (!fullName || !fullName.trim()) {
      return { success: false, error: 'Vui lòng nhập họ và tên của bạn.' };
    }

    const cleanName = fullName.trim();
    const cleanCode = (studentCode || '').trim();
    const displayName = cleanCode ? `${cleanName} (${cleanCode})` : cleanName;

    const session = {
      userId:      'guest_' + Date.now(),
      username:    cleanCode || 'guest',
      displayName: displayName,
      role:        'guest',
      isGuest:     true,
      loginAt:     new Date().toISOString(),
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this.currentUser = session;

    console.log('[Auth] Guest logged in:', displayName);
    return { success: true };
  }

  /**
   * Đăng xuất – xóa session.
   */
  logout() {
    localStorage.removeItem(SESSION_KEY);
    this.currentUser = null;
    console.log('[Auth] Logged out');
  }

  // ── Getters ───────────────────────────────────────────────────

  isLoggedIn()    { return this.currentUser !== null; }
  getCurrentUser(){ return this.currentUser; }

  /** Lấy tên viết tắt để hiển thị avatar (vd: "NVA"). */
  getInitials() {
    if (!this.currentUser) return '?';
    return this.currentUser.displayName
      .split(' ')
      .map(w => w[0])
      .slice(-2)
      .join('')
      .toUpperCase();
  }

  // ── Private helpers ───────────────────────────────────────────

  /**
   * Load session từ localStorage khi khởi tạo.
   */
  _loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      this.currentUser = raw ? JSON.parse(raw) : null;
    } catch {
      this.currentUser = null;
    }
  }

  /**
   * Hash mật khẩu bằng SHA-256 (Web Crypto API – hoạt động offline).
   * @param {string} text
   * @returns {Promise<string>} hex string
   */
  async _hash(text) {
    const buf = new TextEncoder().encode(text);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

// Singleton
const authManager = new AuthManager();
