/**
 * db.js – IndexedDB Wrapper for VKU Facility Check
 *
 * Database: VKUFacilityDB
 * Object Stores:
 *   v1: surveys  – phiếu khảo sát
 *   v2: users    – tài khoản đăng nhập (offline auth)
 */

const DB_NAME = 'VKUFacilityDB';
const DB_VERSION = 2;          // ← tăng lên 2 để thêm users store
const STORE_NAME = 'surveys';
const USERS_STORE = 'users';

class VKUDatabase {
  constructor() {
    this.db = null;
  }

  /**
   * Khởi tạo IndexedDB, tạo object store nếu chưa có.
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // Tạo hoặc nâng cấp schema
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // ── Version 1: surveys store ──
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('synced', 'synced', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
            store.createIndex('room', 'room', { unique: false });
            store.createIndex('building', 'building', { unique: false });
            console.log('[DB] surveys store created');
          }
        }

        // ── Version 2: users store (offline auth) ──
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(USERS_STORE)) {
            const usersStore = db.createObjectStore(USERS_STORE, { keyPath: 'id' });
            // Index username duy nhất để tra cứu khi đăng nhập
            usersStore.createIndex('username', 'username', { unique: true });
            usersStore.createIndex('role', 'role', { unique: false });
            console.log('[DB] users store created');
          }
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('[DB] IndexedDB opened successfully');
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('[DB] Error opening IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Đảm bảo DB đã được khởi tạo trước khi thực hiện thao tác.
   */
  async ensureDB() {
    if (!this.db) {
      await this.init();
    }
    return this.db;
  }

  /**
   * Lưu một phiếu khảo sát (thêm mới hoặc cập nhật).
   * @param {Object} surveyData - Dữ liệu phiếu khảo sát
   * @returns {Promise<string>} - ID của phiếu đã lưu
   */
  async saveSurvey(surveyData) {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // Tạo ID duy nhất nếu chưa có
      if (!surveyData.id) {
        surveyData.id = this._generateId();
      }
      if (!surveyData.createdAt) {
        surveyData.createdAt = new Date().toISOString();
      }
      surveyData.updatedAt = new Date().toISOString();

      const request = store.put(surveyData);

      request.onsuccess = () => {
        console.log('[DB] Survey saved:', surveyData.id);
        resolve(surveyData.id);
      };

      request.onerror = (event) => {
        console.error('[DB] Error saving survey:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Lấy tất cả phiếu khảo sát, sắp xếp theo thời gian tạo mới nhất.
   * @returns {Promise<Array>}
   */
  async getAllSurveys() {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const surveys = request.result;
        // Sắp xếp mới nhất lên đầu
        surveys.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(surveys);
      };

      request.onerror = (event) => {
        console.error('[DB] Error getting surveys:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Lấy phiếu khảo sát theo ID.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getSurveyById(id) {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * Cập nhật phiếu khảo sát theo ID.
   * @param {string} id
   * @param {Object} updates - Các trường cần cập nhật
   * @returns {Promise<boolean>}
   */
  async updateSurvey(id, updates) {
    const existing = await this.getSurveyById(id);
    if (!existing) {
      throw new Error(`Survey ${id} not found`);
    }
    const updated = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
    await this.saveSurvey(updated);
    return true;
  }

  /**
   * Xóa phiếu khảo sát theo ID.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteSurvey(id) {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log('[DB] Survey deleted:', id);
        resolve(true);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * Lấy tất cả phiếu chưa được đồng bộ.
   * @returns {Promise<Array>}
   */
  async getPendingSurveys() {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * Đếm số phiếu theo trạng thái synced.
   * @returns {Promise<{total, pending, synced}>}
   */
  async getCounts() {
    const surveys = await this.getAllSurveys();
    const total = surveys.length;
    const synced = surveys.filter(s => s.synced).length;
    const pending = surveys.filter(s => !s.synced).length;
    const hasIssues = surveys.filter(s => s.hasIssues).length;
    const completed = surveys.filter(s => s.status === 'completed').length;

    return { total, synced, pending, hasIssues, completed };
  }

  /**
   * Xóa toàn bộ dữ liệu (dùng khi reset).
   * @returns {Promise<boolean>}
   */
  async clearAll() {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[DB] All surveys cleared');
        resolve(true);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // ── Users (offline auth) ───────────────────────────────────

  /**
   * Lưu hoặc cập nhật một user.
   * @param {Object} userData
   * @returns {Promise<string>} id
   */
  async saveUser(userData) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(USERS_STORE, 'readwrite');
      const store = tx.objectStore(USERS_STORE);
      const req = store.put(userData);
      req.onsuccess = () => resolve(userData.id);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Lấy user theo username (dùng khi đăng nhập).
   * @param {string} username
   * @returns {Promise<Object|null>}
   */
  async getUserByUsername(username) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(USERS_STORE, 'readonly');
      const store = tx.objectStore(USERS_STORE);
      const index = store.index('username');
      const req = index.get(username.toLowerCase());
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Lấy tất cả users.
   * @returns {Promise<Array>}
   */
  async getAllUsers() {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(USERS_STORE, 'readonly');
      const store = tx.objectStore(USERS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Shared helpers ─────────────────────────────────────────

  /**
   * Tạo ID duy nhất dạng timestamp + random.
   * @returns {string}
   */
  _generateId() {
    return `vku_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
const vkuDB = new VKUDatabase();
