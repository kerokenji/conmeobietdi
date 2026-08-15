/**
 * scriptff.js - Flexible Stat Tracker & Player Mapping Script for ff_stats.html
 * 
 * Tự động ánh xạ và tìm kiếm người chơi theo:
 * 1. SteamID (SteamID2, SteamID3, SteamID64)
 * 2. Discord ID
 * 3. Tên Ingame (Name, Aliases, Nicknames)
 */

(function () {
  'use strict';

  // Quản lý trạng thái ứng dụng
  const state = {
    mappings: [],       // Danh sách player mapping đã được chuẩn hóa
    statsData: [],      // Dữ liệu chỉ số Friendly Fire / Gameplay stats
    activeTarget: null, // Player đang được chọn/hiển thị
  };

  /**
   * 1. HÀM CHUẨN HÓA DỮ LIỆU MAPPING
   * Tự động đọc mọi cấu trúc mapping JSON (Array hoặc Object)
   */
  function normalizeMappings(rawMappings) {
    if (!rawMappings) return [];
    
    let items = [];
    if (Array.isArray(rawMappings)) {
      items = rawMappings;
    } else if (typeof rawMappings === 'object') {
      // Nếu mapping là object dạng key-value { "steamid_or_key": { ... } }
      items = Object.entries(rawMappings).map(([key, val]) => {
        if (typeof val === 'object' && val !== null) {
          return { keyId: key, ...val };
        }
        return { keyId: key, name: String(val) };
      });
    }

    return items.map((item, index) => {
      // 1. Trích xuất SteamID
      const rawSteam = item.steamId || item.steamid || item.steam_id || item.steamID64 || item.steam64 || item.keyId || '';
      const steamIds = Array.isArray(rawSteam) 
        ? rawSteam.map(s => String(s).trim()) 
        : [String(rawSteam).trim()].filter(Boolean);

      // 2. Trích xuất Discord ID
      const discordId = String(item.discordId || item.discord_id || item.discord || item.discordID || '').trim();

      // 3. Trích xuất Tên In-game & Biệt danh
      let names = [];
      if (item.ingameNames && Array.isArray(item.ingameNames)) {
        names = item.ingameNames;
      } else if (item.names && Array.isArray(item.names)) {
        names = item.names;
      } else if (item.aliases && Array.isArray(item.aliases)) {
        names = item.aliases;
      } else {
        const singleName = item.name || item.ingameName || item.ingame_name || item.username || item.player_name;
        if (singleName) names.push(singleName);
      }
      
      names = names.map(n => String(n).trim()).filter(Boolean);
      const primaryName = names[0] || item.keyId || `Player #${index + 1}`;

      return {
        id: item.id || `player_${index}`,
        primaryName: primaryName,
        steamIds: steamIds,
        discordId: discordId,
        names: names,
        raw: item
      };
    });
  }

  /**
   * 2. HÀM TÌM KIẾM TARGET THEO STEAM ID, DISCORD ID HOẶC TÊN INGAME
   */
  function findTarget(query) {
    if (!query || typeof query !== 'string') return null;
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return null;

    return state.mappings.find(player => {
      // Khớp Steam ID
      if (player.steamIds.some(sid => sid.toLowerCase() === cleanQuery || sid.toLowerCase().includes(cleanQuery))) {
        return true;
      }

      // Khớp Discord ID
      if (player.discordId && player.discordId.toLowerCase() === cleanQuery) {
        return true;
      }

      // Khớp Tên Ingame (trong danh sách alias)
      if (player.names.some(name => name.toLowerCase() === cleanQuery)) {
        return true;
      }

      // Khớp Tên chính
      if (player.primaryName.toLowerCase() === cleanQuery) {
        return true;
      }

      return false;
    }) || null;
  }

  /**
   * 3. LỌC DỮ LIỆU THỐNG KÊ CỦA PLAYER TARGET
   */
  function getStatsForPlayer(targetPlayer) {
    if (!targetPlayer || !state.statsData) return null;

    const dataList = Array.isArray(state.statsData) ? state.statsData : [state.statsData];

    return dataList.filter(stat => {
      const statSteam = String(stat.steamId || stat.steamid || stat.steam_id || '').trim().toLowerCase();
      const statDiscord = String(stat.discordId || stat.discord_id || '').trim().toLowerCase();
      const statName = String(stat.name || stat.player_name || stat.ingame_name || '').trim().toLowerCase();

      if (statSteam && targetPlayer.steamIds.some(s => s.toLowerCase() === statSteam)) return true;
      if (statDiscord && targetPlayer.discordId.toLowerCase() === statDiscord) return true;
      if (statName && targetPlayer.names.some(n => n.toLowerCase() === statName)) return true;

      return false;
    });
  }

  /**
   * 4. LẤY THAM SỐ TARGET TỪ URL (Ví dụ: ff_stats.html?target=76561198012345678)
   */
  function getQueryParam() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('target') || urlParams.get('user') || urlParams.get('id') || urlParams.get('name');
  }

  /**
   * 5. HIỂN THỊ DỮ LIỆU LÊN TRANG WEB (DOM RENDERING)
   */
  function renderUI() {
    const searchInput = document.getElementById('search-input') || document.getElementById('target-input') || document.querySelector('input[type="text"]');
    const targetInfoContainer = document.getElementById('target-info') || document.getElementById('player-profile');
    const leaderboardTable = document.getElementById('leaderboard-table') || document.querySelector('table tbody');

    // Cập nhật ô input tìm kiếm
    if (searchInput && state.activeTarget) {
      searchInput.value = state.activeTarget.primaryName;
    }

    // Cập nhật thẻ thông tin Player Target
    if (targetInfoContainer && state.activeTarget) {
      const p = state.activeTarget;
      targetInfoContainer.innerHTML = `
        <div class="player-card">
          <h2>${escapeHtml(p.primaryName)}</h2>
          <p><strong>Steam ID:</strong> ${p.steamIds.length ? p.steamIds.join(', ') : 'N/A'}</p>
          <p><strong>Discord ID:</strong> ${p.discordId || 'N/A'}</p>
          <p><strong>Tên Ingame:</strong> ${p.names.join(', ')}</p>
        </div>
      `;
    }

    // Render danh sách chỉ số vào bảng HTML
    if (leaderboardTable) {
      if (state.activeTarget) {
        const matchedStats = getStatsForPlayer(state.activeTarget);
        renderStatsRows(leaderboardTable, matchedStats);
      } else {
        renderStatsRows(leaderboardTable, state.statsData);
      }
    }
  }

  function renderStatsRows(tbody, stats) {
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!stats || (Array.isArray(stats) && stats.length === 0)) {
      tbody.innerHTML = `<tr><td colspan="100%" style="text-align:center;">Không tìm thấy dữ liệu thống kê phù hợp.</td></tr>`;
      return;
    }

    const list = Array.isArray(stats) ? stats : [stats];
    list.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(row.name || row.player_name || 'N/A')}</strong></td>
        <td>${row.ff_damage || row.friendly_fire || row.ff || 0}</td>
        <td>${row.ff_kills || row.team_kills || row.tk || 0}</td>
        <td>${row.kills || row.zombie_kills || 0}</td>
        <td>${row.headshots || 0}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 6. KHỞI TẠO VÀ NẠP DỮ LIỆU (INIT)
   */
  async function init() {
    try {
      // Đọc file mappings.json và stats.json (nếu có)
      const [mappingRes, statsRes] = await Promise.allSettled([
        fetch('mappings.json').then(r => r.json()),
        fetch('stats.json').then(r => r.json()).catch(() => [])
      ]);

      if (mappingRes.status === 'fulfilled') {
        state.mappings = normalizeMappings(mappingRes.value);
        console.log('[ScriptFF] Mappings loaded:', state.mappings.length, 'players');
      } else {
        console.warn('[ScriptFF] Không thể nạp file mappings.json:', mappingRes.reason);
      }

      if (statsRes.status === 'fulfilled') {
        state.statsData = statsRes.value;
      }

      // Đọc target từ query URL nếu có
      const urlQuery = getQueryParam();
      if (urlQuery) {
        state.activeTarget = findTarget(urlQuery);
      }

      setupEventListeners();
      renderUI();

    } catch (err) {
      console.error('[ScriptFF] Lỗi khi chạy scriptff.js:', err);
    }
  }

  /**
   * 7. BẮT SỰ KIỆN TÌM KIẾM TRÊN TRANG WEB
   */
  function setupEventListeners() {
    const searchForm = document.getElementById('search-form') || document.querySelector('form');
    const searchInput = document.getElementById('search-input') || document.getElementById('target-input') || document.querySelector('input[type="text"]');
    const searchBtn = document.getElementById('search-btn') || document.querySelector('button[type="submit"]');

    const handleSearch = (e) => {
      if (e) e.preventDefault();
      if (!searchInput) return;

      const query = searchInput.value;
      const matched = findTarget(query);

      state.activeTarget = matched;
      renderUI();
    };

    if (searchForm) searchForm.addEventListener('submit', handleSearch);
    if (searchBtn) searchBtn.addEventListener('click', handleSearch);
    if (searchInput) {
      searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleSearch(e);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Bộc lộ API ra window nếu bạn muốn gọi từ file HTML
  window.ScriptFF = {
    findTarget,
    getStatsForPlayer,
    getState: () => state,
    init
  };

})();
