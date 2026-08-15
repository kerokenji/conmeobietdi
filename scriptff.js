/**
 * scriptff.js - Stat Tracker & Player Mapping Engine for ff_stats.html
 * Host: https://conmeobietdi.vercel.app
 */

(function () {
  'use strict';

  // 1. Cấu hình đường dẫn lấy dữ liệu (Hỗ trợ đường dẫn tương đối và Vercel Domain)
  const CONFIG = {
    endpoints: {
      mappings: ['/mappings.json', 'https://conmeobietdi.vercel.app/mappings.json'],
      statsCurrent: ['/data/ff_stats_current.json', 'https://conmeobietdi.vercel.app/data/ff_stats_current.json'],
      statsLastWeek: ['/data/last_week.json', 'https://conmeobietdi.vercel.app/data/last_week.json']
    }
  };

  // State lưu trữ dữ liệu ứng dụng
  const state = {
    profiles: {},        // Map ID -> Player Profile { id, primaryName, aliases, statsCurrent, statsLastWeek }
    nameToId: {},        // Map Lowercase Name -> Player ID
    activeTab: 'current',// 'current' hoặc 'last_week'
    activeTarget: null,  // Profile player đang tìm kiếm / chọn
    isLoaded: false
  };

  /**
   * Helper Fetch Data có fallback
   */
  async function fetchJSON(urls) {
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn(`[ScriptFF] Không thể tải từ ${url}, thử endpoint dự phòng...`);
      }
    }
    return null;
  }

  /**
   * 2. Xử lý & Chuẩn hóa file mappings.json mới
   * Structure: { "Tên Ingame": "DiscordID" }
   */
  function parseMappings(rawMappings) {
    state.profiles = {};
    state.nameToId = {};

    if (!rawMappings || typeof rawMappings !== 'object') return;

    // Duyệt qua từng cặp Name -> ID trong mappings.json
    Object.entries(rawMappings).forEach(([ingameName, rawId]) => {
      const name = String(ingameName).trim();
      const id = String(rawId).trim();
      if (!name || !id) return;

      const nameLower = name.toLowerCase();
      state.nameToId[nameLower] = id;

      // Nếu ID này chưa tạo Profile -> Khởi tạo Profile mới
      if (!state.profiles[id]) {
        state.profiles[id] = {
          id: id,
          primaryName: name, // Tên xuất hiện đầu tiên lấy làm tên chính
          aliases: [],
          statsCurrent: createEmptyStats(),
          statsLastWeek: createEmptyStats()
        };
      }

      // Thêm tên vào danh sách aliases (không trùng lặp)
      if (!state.profiles[id].aliases.includes(name)) {
        state.profiles[id].aliases.push(name);
      }
    });
  }

  function createEmptyStats() {
    return {
      ff_damage: 0,
      team_kills: 0,
      kills: 0,
      headshots: 0,
      games: 0,
      entries: []
    };
  }

  /**
   * 3. Ánh xạ dữ liệu điểm/thống kê từ stats JSON vào Player Profile
   */
  function aggregateStats(rawStatsData, statType) {
    if (!rawStatsData) return;

    // Chuyển dữ liệu đầu vào thành Mảng
    let items = [];
    if (Array.isArray(rawStatsData)) {
      items = rawStatsData;
    } else if (typeof rawStatsData === 'object') {
      items = Object.entries(rawStatsData).map(([k, v]) => ({
        player_key: k,
        ...(typeof v === 'object' ? v : { val: v })
      }));
    }

    items.forEach(item => {
      const rawName = item.name || item.player_name || item.player || item.player_key || '';
      const rawId = item.discordId || item.steamId || item.id || '';
      
      const cleanName = String(rawName).trim();
      const cleanId = String(rawId).trim();

      // Xác định Player ID tương ứng trong mappings
      let matchedId = null;
      if (cleanId && state.profiles[cleanId]) {
        matchedId = cleanId;
      } else if (cleanName && state.nameToId[cleanName.toLowerCase()]) {
        matchedId = state.nameToId[cleanName.toLowerCase()];
      }

      // Nếu người chơi chưa có trong mappings.json -> Tự tạo profile tạm để không mất dữ liệu
      if (!matchedId) {
        matchedId = cleanId || cleanName || `unmapped_${Math.random()}`;
        if (!state.profiles[matchedId]) {
          state.profiles[matchedId] = {
            id: matchedId,
            primaryName: cleanName || matchedId,
            aliases: cleanName ? [cleanName] : [],
            statsCurrent: createEmptyStats(),
            statsLastWeek: createEmptyStats()
          };
        }
      }

      const profile = state.profiles[matchedId];
      const targetStats = (statType === 'last_week') ? profile.statsLastWeek : profile.statsCurrent;

      // Lấy các chỉ số từ record
      const ff = Number(item.ff_damage || item.friendly_fire || item.ff || item.damage || 0);
      const tk = Number(item.team_kills || item.ff_kills || item.tk || item.incaps || 0);
      const kills = Number(item.kills || item.zombie_kills || item.kills_count || 0);
      const hs = Number(item.headshots || item.hs || 0);

      // Cộng dồn điểm số
      targetStats.ff_damage += ff;
      targetStats.team_kills += tk;
      targetStats.kills += kills;
      targetStats.headshots += hs;
      targetStats.games += 1;
      targetStats.entries.push(item);
    });
  }

  /**
   * 4. Hàm Tìm Kiếm Target Player
   * Cho phép tìm theo: SteamID / DiscordID / Tên chính / Tên ingame cũ
   */
  function findTarget(query) {
    if (!query) return null;
    const q = String(query).trim().toLowerCase();
    if (!q) return null;

    // 1. Tìm theo ID trước (Discord ID / Steam ID)
    if (state.profiles[query.trim()]) {
      return state.profiles[query.trim()];
    }

    // 2. Tìm theo tên trong mapping
    const values = Object.values(state.profiles);
    return values.find(p => {
      if (p.id.toLowerCase() === q) return true;
      if (p.primaryName.toLowerCase() === q) return true;
      if (p.aliases.some(alias => alias.toLowerCase() === q)) return true;
      if (p.aliases.some(alias => alias.toLowerCase().includes(q))) return true;
      return false;
    }) || null;
  }

  /**
   * 5. Hiển thị thông tin & Bảng điểm lên trang web (DOM Engine)
   */
  function renderUI() {
    const searchInput = document.getElementById('search-input') || document.getElementById('target-input') || document.querySelector('input[type="text"]');
    const leaderboardTable = document.getElementById('leaderboard-table') || document.querySelector('table tbody');
    const targetCard = document.getElementById('target-info') || document.getElementById('player-profile');

    // 5.1 Render Thông tin Target Player nếu đang chọn
    if (targetCard) {
      if (state.activeTarget) {
        const p = state.activeTarget;
        const cur = p.statsCurrent;
        const last = p.statsLastWeek;

        targetCard.innerHTML = `
          <div class="stat-card active-player">
            <h3>👤 Người chơi: ${escapeHtml(p.primaryName)}</h3>
            <p><strong>Discord/Steam ID:</strong> <code>${p.id}</code></p>
            <p><strong>Tên Ingame đã lưu:</strong> ${p.aliases.map(a => `<span class="badge">${escapeHtml(a)}</span>`).join(' ')}</p>
            <div class="stat-summary-grid">
              <div class="stat-box">
                <h4>Tuần Hiện Tại</h4>
                <div>FF Damage: <strong>${cur.ff_damage}</strong></div>
                <div>Team Kills: <strong>${cur.team_kills}</strong></div>
                <div>Zombie Kills: <strong>${cur.kills}</strong></div>
              </div>
              <div class="stat-box">
                <h4>Tuần Trước</h4>
                <div>FF Damage: <strong>${last.ff_damage}</strong></div>
                <div>Team Kills: <strong>${last.team_kills}</strong></div>
                <div>Zombie Kills: <strong>${last.kills}</strong></div>
              </div>
            </div>
          </div>
        `;
      } else {
        targetCard.innerHTML = `<p class="info-text">Nhập Tên In-game hoặc ID để xem thông số chi tiết.</p>`;
      }
    }

    // 5.2 Render Bảng Xếp Hạng (Leaderboard Table)
    if (leaderboardTable) {
      leaderboardTable.innerHTML = '';

      let profilesList = Object.values(state.profiles);

      // Nếu đang active target -> Chỉ hiển thị player đó
      if (state.activeTarget) {
        profilesList = [state.activeTarget];
      } else {
        // Sắp xếp theo FF Damage giảm dần
        const statKey = state.activeTab === 'last_week' ? 'statsLastWeek' : 'statsCurrent';
        profilesList.sort((a, b) => b[statKey].ff_damage - a[statKey].ff_damage);
      }

      if (profilesList.length === 0) {
        leaderboardTable.innerHTML = `<tr><td colspan="6" style="text-align:center;">Không tìm thấy dữ liệu phù hợp.</td></tr>`;
        return;
      }

      profilesList.forEach((p, idx) => {
        const stats = state.activeTab === 'last_week' ? p.statsLastWeek : p.statsCurrent;
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
          <td>${idx + 1}</td>
          <td>
            <strong>${escapeHtml(p.primaryName)}</strong>
            <br/><small class="text-muted">ID: ${p.id}</small>
          </td>
          <td class="text-danger"><strong>${stats.ff_damage}</strong></td>
          <td class="text-warning">${stats.team_kills}</td>
          <td>${stats.kills}</td>
          <td>${p.aliases.length > 1 ? p.aliases.join(', ') : '-'}</td>
        `;
        
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
          state.activeTarget = p;
          if (searchInput) searchInput.value = p.primaryName;
          renderUI();
        });

        leaderboardTable.appendChild(tr);
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * 6. Khởi tạo & Tải dữ liệu toàn bộ
   */
  async function init() {
    console.log('[ScriptFF] Đang nạp dữ liệu từ các endpoints...');

    const [mappingsData, statsCurrentData, statsLastWeekData] = await Promise.all([
      fetchJSON(CONFIG.endpoints.mappings),
      fetchJSON(CONFIG.endpoints.statsCurrent),
      fetchJSON(CONFIG.endpoints.statsLastWeek)
    ]);

    // Parse mappings.json mới
    if (mappingsData) parseMappings(mappingsData);
    
    // Parse stats
    if (statsCurrentData) aggregateStats(statsCurrentData, 'current');
    if (statsLastWeekData) aggregateStats(statsLastWeekData, 'last_week');

    state.isLoaded = true;

    // Kích hoạt Event Handlers & Render UI
    setupEvents();
    
    // Kiểm tra URL Parameter xem có ?target=... hoặc ?user=... không
    const urlParams = new URLSearchParams(window.location.search);
    const queryTarget = urlParams.get('target') || urlParams.get('user') || urlParams.get('id');
    if (queryTarget) {
      state.activeTarget = findTarget(queryTarget);
    }

    renderUI();
  }

  /**
   * 7. Sự kiện ô Tìm kiếm & Chuyển Tab Tuần
   */
  function setupEvents() {
    const searchInput = document.getElementById('search-input') || document.getElementById('target-input') || document.querySelector('input[type="text"]');
    const searchBtn = document.getElementById('search-btn') || document.querySelector('button[type="submit"]');
    const currentTabBtn = document.getElementById('btn-current') || document.getElementById('tab-current');
    const lastWeekTabBtn = document.getElementById('btn-lastweek') || document.getElementById('tab-lastweek');

    const handleSearch = () => {
      if (!searchInput) return;
      const val = searchInput.value.trim();
      if (!val) {
        state.activeTarget = null;
      } else {
        state.activeTarget = findTarget(val);
      }
      renderUI();
    };

    if (searchBtn) searchBtn.addEventListener('click', (e) => { e.preventDefault(); handleSearch(); });
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (!searchInput.value.trim()) {
          state.activeTarget = null;
          renderUI();
        }
      });
      searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleSearch();
      });
    }

    // Switch Tab Tuần Hiện Tại / Tuần Trước
    if (currentTabBtn) {
      currentTabBtn.addEventListener('click', () => {
        state.activeTab = 'current';
        renderUI();
      });
    }
    if (lastWeekTabBtn) {
      lastWeekTabBtn.addEventListener('click', () => {
        state.activeTab = 'last_week';
        renderUI();
      });
    }
  }

  // Chạy ứng dụng khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export Global API
  window.ScriptFF = {
    state,
    findTarget,
    renderUI,
    init
  };

})();
