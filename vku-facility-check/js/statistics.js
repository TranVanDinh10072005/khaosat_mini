/**
 * statistics.js – Statistics Manager
 * 
 * Tính toán và hiển thị thống kê tình trạng cơ sở vật chất.
 * Sử dụng CSS progress bars và biểu đồ donut bằng CSS conic-gradient.
 */

// Map tên thiết bị hiển thị
const FACILITY_DISPLAY_NAMES = {
  lighting: 'Đèn chiếu sáng',
  airConditioner: 'Điều hòa',
  projector: 'Máy chiếu',
  computer: 'Máy tính',
  tables: 'Bàn ghế',
  electricity: 'Ổ điện',
  wifi: 'Wi-Fi',
  fan: 'Quạt',
  door: 'Cửa phòng',
  safety: 'Thiết bị an toàn',
};

class StatisticsManager {
  constructor() {}

  /**
   * Render trang thống kê.
   */
  async render() {
    const view = document.getElementById('view-statistics');
    if (!view) return;

    view.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">📊 Thống kê</h1>
        <p class="page-subtitle">Tình trạng cơ sở vật chất VKU</p>
      </div>
      <div id="stats-content">
        <div style="text-align:center; padding: 2rem;">
          <div class="spinner spinner-primary"></div>
          <p style="margin-top: 1rem; color: var(--color-text-muted);">Đang tính toán...</p>
        </div>
      </div>
    `;

    try {
      const surveys = await vkuDB.getAllSurveys();
      this._renderStats(surveys);
    } catch (err) {
      console.error('[Stats] Error:', err);
    }
  }

  /**
   * Tính toán và render thống kê từ danh sách surveys.
   */
  _renderStats(surveys) {
    const container = document.getElementById('stats-content');
    if (!container) return;

    if (surveys.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <div class="empty-title">Chưa có dữ liệu</div>
          <div class="empty-desc">Tạo phiếu khảo sát để xem thống kê.</div>
        </div>
      `;
      return;
    }

    // ── Tính toán tổng quan ──
    const totalSurveys = surveys.length;
    const syncedCount = surveys.filter(s => s.synced).length;
    const pendingCount = surveys.filter(s => !s.synced).length;
    const issueCount = surveys.filter(s => s.hasIssues).length;

    // ── Tổng hợp trạng thái thiết bị ──
    let goodTotal = 0, checkTotal = 0, brokenTotal = 0;
    const perFacility = {};

    Object.keys(FACILITY_DISPLAY_NAMES).forEach(key => {
      perFacility[key] = { good: 0, check: 0, broken: 0 };
    });

    surveys.forEach(survey => {
      if (!survey.facilities) return;
      Object.entries(survey.facilities).forEach(([key, status]) => {
        if (!perFacility[key]) return;
        perFacility[key][status] = (perFacility[key][status] || 0) + 1;
        if (status === 'good') goodTotal++;
        else if (status === 'check') checkTotal++;
        else if (status === 'broken') brokenTotal++;
      });
    });

    const total = goodTotal + checkTotal + brokenTotal;
    const goodPct = total > 0 ? Math.round(goodTotal / total * 100) : 0;
    const checkPct = total > 0 ? Math.round(checkTotal / total * 100) : 0;
    const brokenPct = total > 0 ? Math.round(brokenTotal / total * 100) : 0;

    // ── Render ──
    container.innerHTML = `
      <!-- Tổng quan phiếu -->
      <div class="card mb-5">
        <div class="card-header">
          <div class="card-title">📋 Tổng quan phiếu khảo sát</div>
        </div>
        <div class="card-body">
          <div class="stats-grid" style="grid-template-columns: repeat(2,1fr); gap: 0.75rem;">
            ${this._statCard('Tổng số phiếu', totalSurveys, '📋', '#1565C0', '#EFF6FF')}
            ${this._statCard('Đã đồng bộ', syncedCount, '🟢', '#2E7D32', '#E8F5E9')}
            ${this._statCard('Chờ đồng bộ', pendingCount, '🟠', '#F57F17', '#FFF8E1')}
            ${this._statCard('Có vấn đề', issueCount, '⚠️', '#C62828', '#FFEBEE')}
          </div>
        </div>
      </div>

      <!-- Biểu đồ tổng hợp -->
      <div class="card mb-5">
        <div class="card-header">
          <div class="card-title">🔧 Tình trạng thiết bị (tổng hợp)</div>
        </div>
        <div class="card-body">
          <div class="donut-wrapper">
            <div class="donut" style="
              background: conic-gradient(
                #4CAF50 0% ${goodPct}%,
                #FFB300 ${goodPct}% ${goodPct + checkPct}%,
                #E53935 ${goodPct + checkPct}% 100%
              );
              border-radius: 50%;
              box-shadow: var(--shadow-md);
            ">
              <div style="
                position: absolute;
                inset: 20px;
                background: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
                font-weight: 800;
                color: var(--color-text-primary);
              ">
                ${goodPct}%
              </div>
            </div>
            <div class="donut-legend">
              <div class="donut-legend-item">
                <div class="legend-dot" style="background: #4CAF50"></div>
                <span class="legend-label">Tốt</span>
                <span class="legend-value">${goodPct}% <small style="color:var(--color-text-muted)">(${goodTotal})</small></span>
              </div>
              <div class="donut-legend-item">
                <div class="legend-dot" style="background: #FFB300"></div>
                <span class="legend-label">Cần kiểm tra</span>
                <span class="legend-value">${checkPct}% <small style="color:var(--color-text-muted)">(${checkTotal})</small></span>
              </div>
              <div class="donut-legend-item">
                <div class="legend-dot" style="background: #E53935"></div>
                <span class="legend-label">Hỏng</span>
                <span class="legend-value">${brokenPct}% <small style="color:var(--color-text-muted)">(${brokenTotal})</small></span>
              </div>
            </div>
          </div>

          <!-- Progress bars -->
          <div class="progress-bar-group">
            ${this._progressBar('Tốt', goodTotal, total, 'good', '✅')}
            ${this._progressBar('Cần kiểm tra', checkTotal, total, 'check', '⚠️')}
            ${this._progressBar('Hỏng', brokenTotal, total, 'broken', '❌')}
          </div>
        </div>
      </div>

      <!-- Chi tiết theo thiết bị -->
      <div class="card mb-5">
        <div class="card-header">
          <div class="card-title">🔍 Chi tiết theo thiết bị</div>
        </div>
        <div class="card-body">
          <div style="display: flex; flex-direction: column; gap: var(--space-4);">
            ${Object.entries(perFacility).map(([key, counts]) => {
              const total = counts.good + counts.check + counts.broken;
              if (total === 0) return '';
              const goodP = Math.round(counts.good / total * 100);
              const checkP = Math.round(counts.check / total * 100);
              const brokenP = Math.round(counts.broken / total * 100);

              // Mức độ tình trạng chung
              let overallStatus = 'badge-success';
              let overallLabel = 'Tốt';
              if (counts.broken > 0) { overallStatus = 'badge-error'; overallLabel = 'Có hỏng'; }
              else if (counts.check > 0) { overallStatus = 'badge-warning'; overallLabel = 'Cần KT'; }

              return `
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                    <span style="font-size: var(--font-size-sm); font-weight: 600;">
                      ${FACILITY_DISPLAY_NAMES[key] || key}
                    </span>
                    <span class="badge ${overallStatus}">${overallLabel}</span>
                  </div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem;">
                    <div style="height: 6px; border-radius: 3px; background: #4CAF50; width: ${goodP}%; min-width: ${goodP > 0 ? '4px' : '0'}; transition: width 0.8s;"></div>
                  </div>
                  <div style="height: 8px; border-radius: 4px; overflow: hidden; background: var(--color-border); margin-bottom: 0.25rem;">
                    <div style="
                      height: 100%;
                      background: linear-gradient(90deg,
                        #4CAF50 0% ${goodP}%,
                        #FFB300 ${goodP}% ${goodP+checkP}%,
                        #E53935 ${goodP+checkP}% 100%
                      );
                      width: 100%;
                      border-radius: 4px;
                      transition: all 0.8s;
                    "></div>
                  </div>
                  <div style="display: flex; gap: var(--space-3); font-size: var(--font-size-xs); color: var(--color-text-muted);">
                    <span>✅ ${counts.good}</span>
                    <span>⚠️ ${counts.check}</span>
                    <span>❌ ${counts.broken}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Thống kê theo phòng -->
      ${this._renderRoomStats(surveys)}
    `;
  }

  /**
   * Render một stat mini card.
   */
  _statCard(label, value, icon, color, bg) {
    return `
      <div class="stat-card" style="--stat-color: ${color}; --stat-icon-bg: ${bg};">
        <div class="stat-icon">
          <span style="font-size: 1.1rem;">${icon}</span>
        </div>
        <div class="stat-value">${value}</div>
        <div class="stat-label">${label}</div>
      </div>
    `;
  }

  /**
   * Render một progress bar dòng.
   */
  _progressBar(label, count, total, cls, icon) {
    const pct = total > 0 ? Math.round(count / total * 100) : 0;
    return `
      <div style="margin-bottom: var(--space-2);">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
          <span style="font-size: var(--font-size-sm); color: var(--color-text-secondary);">${icon} ${label}</span>
          <span style="font-size: var(--font-size-sm); font-weight: 700;">${pct}% <small style="color:var(--color-text-muted); font-weight: 400;">(${count})</small></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${cls}" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;
  }

  /**
   * Thống kê theo phòng – top phòng có vấn đề nhiều nhất.
   */
  _renderRoomStats(surveys) {
    const roomStats = {};
    surveys.forEach(s => {
      const key = `${s.room} (${s.building || ''})`;
      if (!roomStats[key]) roomStats[key] = { good: 0, check: 0, broken: 0, room: s.room, building: s.building };
      if (s.facilities) {
        Object.values(s.facilities).forEach(status => {
          roomStats[key][status] = (roomStats[key][status] || 0) + 1;
        });
      }
    });

    // Sắp xếp theo số thiết bị hỏng + cần kiểm tra
    const sorted = Object.values(roomStats).sort((a, b) =>
      (b.broken + b.check) - (a.broken + a.check)
    ).slice(0, 5);

    if (sorted.length === 0) return '';

    return `
      <div class="card mb-5">
        <div class="card-header">
          <div class="card-title">🏆 Phòng cần chú ý</div>
        </div>
        <div class="card-body">
          ${sorted.map((room, i) => {
            const total = room.good + room.check + room.broken;
            const issueRate = total > 0 ? Math.round((room.check + room.broken) / total * 100) : 0;
            const statusColor = room.broken > 0 ? 'var(--color-error)' : room.check > 0 ? 'var(--color-warning)' : 'var(--color-success)';
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border-light);">
                <div>
                  <div style="font-weight: 600; font-size: var(--font-size-sm);">
                    ${i + 1}. ${room.room}
                    ${room.building ? `<small style="color:var(--color-text-muted)"> – ${room.building}</small>` : ''}
                  </div>
                  <div style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: 2px;">
                    ❌ ${room.broken} hỏng &nbsp;⚠️ ${room.check} cần KT &nbsp;✅ ${room.good} tốt
                  </div>
                </div>
                <div style="font-size: var(--font-size-sm); font-weight: 700; color: ${statusColor}">
                  ${issueRate}% vấn đề
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
}

// Singleton instance
const statisticsManager = new StatisticsManager();
