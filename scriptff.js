let nameToInfoMap = new Map(); // Map lowercase query string -> { steamId, discordId, ingameName }
let allNames = [];             // Ingame names cho autocomplete
let statsData = {};
let playtimeData = {};         // Phút chơi từ last_week.json

// Maps để tra cứu ID & Name 2 chiều
let steamToDiscordMap = new Map();
let discordToSteamMap = new Map();
let steamToNameMap = new Map();
let discordToNameMap = new Map();

// Dữ liệu Log FF được gom nhóm
let ffLogDealt = {};
let ffLogReceived = {};

let currentQueriedSteamId = "";
let currentFFMode = "dealt"; // "dealt" | "received"
let currentLeaderboardSort = "shot";
let leaderboardSortAsc = false;

// DOM Elements
const searchInput = document.getElementById('search-input');
const autocompleteList = document.getElementById('autocomplete-list');
const playerProfile = document.getElementById('player-profile');
const playerNameEl = document.getElementById('player-name');
const playerIdEl = document.getElementById('player-id');
const playerPlaytimeEl = document.getElementById('player-playtime');
const weekInfoEl = document.getElementById('week-info');

// Stats Elements
const statShot = document.getElementById('stat-shot');
const statShotted = document.getElementById('stat-shotted');
const statKills = document.getElementById('stat-kills');
const statIncaps = document.getElementById('stat-incaps');

// Tab & Toggle Elements
const tabBtnLookup = document.getElementById('tab-btn-lookup');
const tabBtnLeaderboard = document.getElementById('tab-btn-leaderboard');
const tabContentLookup = document.getElementById('tab-content-lookup');
const tabContentLeaderboard = document.getElementById('tab-content-leaderboard');

const ffToggleDealt = document.getElementById('ff-toggle-dealt');
const ffToggleReceived = document.getElementById('ff-toggle-received');
const ffDetailTbody = document.getElementById('ff-detail-tbody');
const ffDetailTfoot = document.getElementById('ff-detail-tfoot');

// Hàm hỗ trợ escape Regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Hàm hỗ trợ escape HTML
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Hàm phân loại vũ khí (Lọc bỏ môi trường/khác & không phải vũ khí người chơi)
function normalizeWeapon(weaponStr) {
    if (!weaponStr) return null;
    const w = weaponStr.trim().toLowerCase();
    if (w.includes('môi trường') || w.includes('khác')) return null;
    if (w.includes('súng') || w.includes('gun')) return 'sung';
    if (w.includes('fire') || w.includes('boom') || w.includes('lửa') || w.includes('lua')) return 'lua';
    if (w.includes('melee') || w.includes('cận chiến')) return 'melee';
    return null;
}

// Phân tích mappings.json
function processMappings(mappings) {
    nameToInfoMap.clear();
    allNames = [];
    steamToDiscordMap.clear();
    discordToSteamMap.clear();
    steamToNameMap.clear();
    discordToNameMap.clear();

    for (const [steamId, data] of Object.entries(mappings)) {
        const discordId = data.discord_id || "";
        const ingameName = data.ingame_name || "";

        if (steamId && discordId) {
            steamToDiscordMap.set(steamId, discordId);
            discordToSteamMap.set(discordId, steamId);
        }
        if (steamId && ingameName) {
            steamToNameMap.set(steamId, ingameName);
        }
        if (discordId && ingameName) {
            discordToNameMap.set(discordId, ingameName);
        }

        const info = { steamId, discordId, ingameName };

        if (ingameName) {
            nameToInfoMap.set(ingameName.toLowerCase(), info);
            if (!allNames.includes(ingameName)) {
                allNames.push(ingameName);
            }
        }
        if (steamId) {
            nameToInfoMap.set(steamId.toLowerCase(), info);
        }
        if (discordId) {
            nameToInfoMap.set(discordId.toLowerCase(), info);
        }
    }
}

// Hàm hỗ trợ đọc 1 file log từ đường dẫn trong thư mục data
async function fetchSingleLogFile(filepath) {
    try {
        const res = await fetch(filepath);
        if (res.ok) return await res.text();
    } catch (e) {
        // Lỗi kết nối hoặc không tìm thấy file
    }
    return null;
}

// Hàm tải và ghép nối tất cả các file log từ thư mục data/ (data/l4d2_ff_1.log, data/l4d2_ff_2.log,...)
async function loadAllFFLogs() {
    let index = 1;
    let combinedLogText = "";

    while (index <= 50) { // Giới hạn kiểm tra tối đa 50 file log
        const filepath = `data/l4d2_ff_${index}.log`;
        const logContent = await fetchSingleLogFile(filepath);

        // Nếu không tải được file (hết chuỗi file log), dừng lại
        if (!logContent) {
            break;
        }

        combinedLogText += logContent + "\n";
        index++;
    }

    if (combinedLogText.trim().length > 0) {
        parseFFLog(combinedLogText);
    }
}

// Phân tích chuỗi dữ liệu Log FF tổng hợp
function parseFFLog(logText) {
    ffLogDealt = {};
    ffLogReceived = {};

    if (!logText) return;

    const lines = logText.split(/\r?\n/);

    // Regex yêu cầu phải có dạng STEAM_... chuẩn (Loại bỏ <BOT>, <BOT_OR_UNKNOWN>, <N/A>)
    const ffRegex = /\[FF\]\s+\[(.*?)\]\s+<(STEAM_\d:\d:\d+)>\s+->\s+(\d+)\s+HP\s+bằng\s+\((.*?)\)\s+->\s+\[(.*?)\]\s+<(STEAM_\d:\d:\d+)>/i;
    const incapRegex = /\[HẠ GỤC\]\s+(.*?)\s+<(STEAM_\d:\d:\d+)>\s+đã hạ gục\s+(.*?)\s+<(STEAM_\d:\d:\d+)>\s+bằng\s+\((.*?)\)/i;
    const killRegex = /\[KILL\]\s+(.*?)\s+<(STEAM_\d:\d:\d+)>\s+đã giết\s+(.*?)\s+<(STEAM_\d:\d:\d+)>\s+bằng\s+\((.*?)\)/i;

    function getOrCreateRecord(attackerId, victimId) {
        if (!ffLogDealt[attackerId]) ffLogDealt[attackerId] = {};
        if (!ffLogDealt[attackerId][victimId]) {
            ffLogDealt[attackerId][victimId] = { sung: 0, lua: 0, melee: 0, incaps: 0, kills: 0, total: 0 };
        }
        if (!ffLogReceived[victimId]) ffLogReceived[victimId] = {};
        if (!ffLogReceived[victimId][attackerId]) {
            ffLogReceived[victimId][attackerId] = { sung: 0, lua: 0, melee: 0, incaps: 0, kills: 0, total: 0 };
        }
        return {
            dealt: ffLogDealt[attackerId][victimId],
            received: ffLogReceived[victimId][attackerId]
        };
    }

    lines.forEach(line => {
        if (!line) return;

        // 1. Dòng FF Dame
        const ffMatch = line.match(ffRegex);
        if (ffMatch) {
            const [, attName, attSteam, hpStr, weaponStr, vicName, vicSteam] = ffMatch;
            const category = normalizeWeapon(weaponStr);
            if (!category) return; // Bỏ qua môi trường / khác

            if (attName && !steamToNameMap.has(attSteam)) steamToNameMap.set(attSteam, attName);
            if (vicName && !steamToNameMap.has(vicSteam)) steamToNameMap.set(vicSteam, vicName);

            const hp = parseInt(hpStr, 10) || 0;
            const rec = getOrCreateRecord(attSteam, vicSteam);

            rec.dealt[category] += hp;
            rec.dealt.total += hp;

            rec.received[category] += hp;
            rec.received.total += hp;
            return;
        }

        // 2. Dòng HẠ GỤC
        const incapMatch = line.match(incapRegex);
        if (incapMatch) {
            const [, attName, attSteam, vicName, vicSteam, weaponStr] = incapMatch;
            const category = normalizeWeapon(weaponStr);
            if (!category) return;

            if (attName && !steamToNameMap.has(attSteam)) steamToNameMap.set(attSteam, attName);
            if (vicName && !steamToNameMap.has(vicSteam)) steamToNameMap.set(vicSteam, vicName);

            const rec = getOrCreateRecord(attSteam, vicSteam);
            rec.dealt.incaps += 1;
            rec.received.incaps += 1;
            return;
        }

        // 3. Dòng KILL
        const killMatch = line.match(killRegex);
        if (killMatch) {
            const [, attName, attSteam, vicName, vicSteam, weaponStr] = killMatch;
            const category = normalizeWeapon(weaponStr);
            if (!category) return;

            if (attName && !steamToNameMap.has(attSteam)) steamToNameMap.set(attSteam, attName);
            if (vicName && !steamToNameMap.has(vicSteam)) steamToNameMap.set(vicSteam, vicName);

            const rec = getOrCreateRecord(attSteam, vicSteam);
            rec.dealt.kills += 1;
            rec.received.kills += 1;
            return;
        }
    });

    // Cập nhật tên tìm kiếm từ log nếu chưa có trong mappings
    for (const [steamId, name] of steamToNameMap.entries()) {
        if (name) {
            const discordId = steamToDiscordMap.get(steamId) || "";
            const info = { steamId, discordId, ingameName: name };
            if (!nameToInfoMap.has(name.toLowerCase())) {
                nameToInfoMap.set(name.toLowerCase(), info);
                if (!allNames.includes(name)) allNames.push(name);
            }
        }
    }
}

// Khởi tạo hệ thống
async function init() {
    try {
        const [mappingsRes, statsRes, lastWeekRes] = await Promise.all([
            fetch('mappings.json'),
            fetch('/data/ff_stats_current.json'),
            fetch('/data/last_week.json').catch(() => null)
        ]);

        const mappings = await mappingsRes.json();
        statsData = await statsRes.json();
        
        if (lastWeekRes && lastWeekRes.ok) {
            playtimeData = await lastWeekRes.json();
        }

        processMappings(mappings);

        // Tải tất cả các file log hiện có: data/l4d2_ff_1.log, data/l4d2_ff_2.log,...
        await loadAllFFLogs();

        if (statsData.meta && statsData.meta.week) {
            weekInfoEl.textContent = `Dữ liệu cập nhật cho tuần: ${statsData.meta.week}`;
        } else {
            weekInfoEl.textContent = `Dữ liệu thống kê mới nhất`;
        }

        setupTabs();
        renderLeaderboard();

    } catch (err) {
        console.error("Lỗi khi tải dữ liệu:", err);
        weekInfoEl.textContent = "Không thể tải dữ liệu thống kê!";
    }
}

// Cấu hình sự kiện chuyển Tab & Toggle
function setupTabs() {
    tabBtnLookup.addEventListener('click', () => {
        tabBtnLookup.classList.add('active');
        tabBtnLeaderboard.classList.remove('active');
        tabContentLookup.classList.remove('hidden');
        tabContentLeaderboard.classList.add('hidden');
    });

    tabBtnLeaderboard.addEventListener('click', () => {
        tabBtnLeaderboard.classList.add('active');
        tabBtnLookup.classList.remove('active');
        tabContentLeaderboard.classList.remove('hidden');
        tabContentLookup.classList.add('hidden');
        renderLeaderboard();
    });

    ffToggleDealt.addEventListener('click', () => {
        currentFFMode = 'dealt';
        ffToggleDealt.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-amber-500 text-amber-950 shadow";
        ffToggleReceived.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-amber-300/70 hover:text-amber-100";
        if (currentQueriedSteamId) {
            renderFFLogTable(currentQueriedSteamId, 'dealt');
        }
    });

    ffToggleReceived.addEventListener('click', () => {
        currentFFMode = 'received';
        ffToggleReceived.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-amber-500 text-amber-950 shadow";
        ffToggleDealt.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-amber-300/70 hover:text-amber-100";
        if (currentQueriedSteamId) {
            renderFFLogTable(currentQueriedSteamId, 'received');
        }
    });
}

// Tìm kiếm Autocomplete
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    autocompleteList.innerHTML = '';

    if (!query) {
        autocompleteList.classList.add('hidden');
        return;
    }

    const matches = allNames.filter(name => name.toLowerCase().includes(query));

    if (matches.length > 0) {
        matches.forEach(name => {
            const li = document.createElement('li');
            li.className = 'px-6 py-3 hover:bg-amber-500/20 cursor-pointer transition-colors text-amber-100 flex justify-between items-center';
            
            const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
            const highlightedName = escapeHTML(name).replace(regex, '<span class="text-amber-400 font-bold">$1</span>');
            
            li.innerHTML = `<span>${highlightedName}</span><span class="text-xs text-amber-300/40">Ingame</span>`;
            
            li.addEventListener('click', () => {
                searchInput.value = name;
                autocompleteList.classList.add('hidden');
                displayPlayerStats(name);
            });
            
            autocompleteList.appendChild(li);
        });
        autocompleteList.classList.remove('hidden');
    } else {
        autocompleteList.classList.add('hidden');
    }
});

// Ẩn Autocomplete khi click ra ngoài
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !autocompleteList.contains(e.target)) {
        autocompleteList.classList.add('hidden');
    }
});

// Nhấn Enter để tìm
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
            autocompleteList.classList.add('hidden');
            displayPlayerStats(query);
        }
    }
});

// Hiển thị thông tin người chơi
function displayPlayerStats(query) {
    const info = nameToInfoMap.get(query.toLowerCase());

    let discordId = "";
    let steamId = "";
    let displayName = query;

    if (info) {
        discordId = info.discordId;
        steamId = info.steamId;
        displayName = info.ingameName || query;
    } else {
        discordId = query;
    }

    if (!steamId && discordId) steamId = discordToSteamMap.get(discordId) || "";
    if (!discordId && steamId) discordId = steamToDiscordMap.get(steamId) || "";

    currentQueriedSteamId = steamId;

    const playersData = statsData.players || {};
    const playerStats = playersData[discordId] || {};
    const minutes = playtimeData[discordId] || 0;

    playerNameEl.textContent = displayName;
    playerIdEl.textContent = `ID: ${steamId || discordId || 'N/A'}`;
    
    if (playerPlaytimeEl) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        let timeFormatted = `${minutes} phút`;
        
        if (hours > 0) {
            timeFormatted += ` (${hours}h ${remainingMinutes}m)`;
        }
        
        playerPlaytimeEl.textContent = `⏱️ Thời gian chơi tuần trước: ${timeFormatted}`;
    }

    playerProfile.classList.remove('hidden');

    // Animate nhảy số
    animateNumber(statShot, playerStats.shot || playerStats.shots || 0);
    animateNumber(statShotted, playerStats.shotted || playerStats.shots_received || 0);
    animateNumber(statKills, playerStats.kills_dealt || playerStats.kills || 0);
    animateNumber(statIncaps, playerStats.incaps_dealt || playerStats.incaps || 0);

    // Hiển thị bảng log FF chi tiết
    renderFFLogTable(steamId, currentFFMode);
}

// Vẽ bảng chi tiết Log FF
function renderFFLogTable(steamId, mode) {
    ffDetailTbody.innerHTML = '';
    ffDetailTfoot.innerHTML = '';

    const sourceData = (mode === 'dealt') ? ffLogDealt : ffLogReceived;
    const records = (steamId && sourceData[steamId]) ? sourceData[steamId] : null;

    if (!records || Object.keys(records).length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="7" class="py-6 text-center text-amber-300/40 italic">Không có dữ liệu bắn đồng đội trong file log.</td>`;
        ffDetailTbody.appendChild(emptyRow);
        return;
    }

    let totSung = 0, totLua = 0, totMelee = 0, totIncaps = 0, totKills = 0, totTotal = 0;

    // Sắp xếp giảm dần theo tổng dame
    const entries = Object.entries(records).sort((a, b) => b[1].total - a[1].total);

    entries.forEach(([otherSteamId, data]) => {
        totSung += data.sung;
        totLua += data.lua;
        totMelee += data.melee;
        totIncaps += data.incaps;
        totKills += data.kills;
        totTotal += data.total;

        const otherName = steamToNameMap.get(otherSteamId) || otherSteamId;

        const row = document.createElement('tr');
        row.className = "hover:bg-amber-500/10 transition-colors";
        row.innerHTML = `
            <td class="py-3 px-4 font-semibold text-amber-100 flex flex-col">
                <span>${escapeHTML(otherName)}</span>
                <span class="text-[10px] font-mono text-amber-300/40">${otherSteamId}</span>
            </td>
            <td class="py-3 px-3 text-center ${data.sung > 0 ? 'text-amber-200 font-bold' : 'text-amber-200/40'}">${data.sung.toLocaleString('vi-VN')}</td>
            <td class="py-3 px-3 text-center ${data.lua > 0 ? 'text-orange-300 font-bold' : 'text-amber-200/40'}">${data.lua.toLocaleString('vi-VN')}</td>
            <td class="py-3 px-3 text-center ${data.melee > 0 ? 'text-yellow-300 font-bold' : 'text-amber-200/40'}">${data.melee.toLocaleString('vi-VN')}</td>
            <td class="py-3 px-3 text-center ${data.incaps > 0 ? 'text-yellow-400 font-bold' : 'text-amber-200/40'}">${data.incaps}</td>
            <td class="py-3 px-3 text-center ${data.kills > 0 ? 'text-red-400 font-bold' : 'text-amber-200/40'}">${data.kills}</td>
            <td class="py-3 px-4 text-right font-extrabold text-amber-300">${data.total.toLocaleString('vi-VN')} HP</td>
        `;
        ffDetailTbody.appendChild(row);
    });

    // Dòng tổng cộng
    const tfootRow = document.createElement('tr');
    tfootRow.className = "text-amber-200";
    tfootRow.innerHTML = `
        <td class="py-3 px-4 uppercase text-xs tracking-wider">Tổng cộng</td>
        <td class="py-3 px-3 text-center">${totSung.toLocaleString('vi-VN')}</td>
        <td class="py-3 px-3 text-center">${totLua.toLocaleString('vi-VN')}</td>
        <td class="py-3 px-3 text-center">${totMelee.toLocaleString('vi-VN')}</td>
        <td class="py-3 px-3 text-center">${totIncaps}</td>
        <td class="py-3 px-3 text-center">${totKills}</td>
        <td class="py-3 px-4 text-right font-black text-amber-300">${totTotal.toLocaleString('vi-VN')} HP</td>
    `;
    ffDetailTfoot.appendChild(tfootRow);
}

// Vẽ Bảng Xếp Hạng
function renderLeaderboard() {
    if (!statsData || !statsData.players) return;

    const playersList = Object.entries(statsData.players).map(([discordId, stats]) => {
        const steamId = discordToSteamMap.get(discordId) || '';
        let name = discordToNameMap.get(discordId) || (steamId ? steamToNameMap.get(steamId) : '') || '';
        if (!name) name = `ID: ${discordId}`;

        const playtime = playtimeData[discordId] || 0;

        return {
            discordId,
            steamId,
            name,
            shot: stats.shot || stats.shots || 0,
            shotted: stats.shotted || stats.shots_received || 0,
            kills_dealt: stats.kills_dealt || stats.kills || 0,
            incaps_dealt: stats.incaps_dealt || stats.incaps || 0,
            playtime
        };
    });

    function renderTopCard(elementId, metricKey, unitStr, colorClass) {
        const container = document.getElementById(elementId);
        if (!container) return;
        container.innerHTML = '';

        const sorted = [...playersList].sort((a, b) => b[metricKey] - a[metricKey]).slice(0, 5);
        const rankBadges = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

        sorted.forEach((player, idx) => {
            const li = document.createElement('li');
            li.className = "pt-2 pb-1 flex items-center justify-between cursor-pointer hover:bg-amber-500/10 px-2 rounded-xl transition-colors";
            li.innerHTML = `
                <div class="flex items-center gap-2 overflow-hidden">
                    <span class="text-base">${rankBadges[idx]}</span>
                    <span class="font-semibold text-amber-100 truncate text-sm">${escapeHTML(player.name)}</span>
                </div>
                <span class="font-extrabold ${colorClass} text-sm whitespace-nowrap ml-2">${player[metricKey].toLocaleString('vi-VN')} ${unitStr}</span>
            `;
            li.addEventListener('click', () => {
                tabBtnLookup.click();
                searchInput.value = player.name;
                displayPlayerStats(player.name);
            });
            container.appendChild(li);
        });
    }

    renderTopCard('leaderboard-top-shot', 'shot', 'HP', 'text-amber-300');
    renderTopCard('leaderboard-top-shotted', 'shotted', 'HP', 'text-orange-300');
    renderTopCard('leaderboard-top-incaps', 'incaps_dealt', 'lần', 'text-yellow-300');
    renderTopCard('leaderboard-top-kills', 'kills_dealt', 'lần', 'text-red-400');

    renderLeaderboardTable(playersList);
}

// Sắp xếp Bảng Xếp Hạng khi bấm tiêu đề
function sortLeaderboard(field) {
    if (currentLeaderboardSort === field) {
        leaderboardSortAsc = !leaderboardSortAsc;
    } else {
        currentLeaderboardSort = field;
        leaderboardSortAsc = false;
    }
    renderLeaderboard();
}

// Vẽ Bảng Tổng Hợp Tất Cả Người Chơi
function renderLeaderboardTable(playersList) {
    const tbody = document.getElementById('leaderboard-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sorted = [...playersList].sort((a, b) => {
        if (leaderboardSortAsc) {
            return a[currentLeaderboardSort] - b[currentLeaderboardSort];
        } else {
            return b[currentLeaderboardSort] - a[currentLeaderboardSort];
        }
    });

    sorted.forEach((player, idx) => {
        const hours = Math.floor(player.playtime / 60);
        const mins = player.playtime % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-amber-500/10 cursor-pointer transition-colors";
        tr.innerHTML = `
            <td class="py-3 px-3 text-center text-amber-300/60 font-mono text-xs">${idx + 1}</td>
            <td class="py-3 px-4 font-bold text-amber-100">${escapeHTML(player.name)}</td>
            <td class="py-3 px-3 text-right text-amber-300 font-semibold">${player.shot.toLocaleString('vi-VN')}</td>
            <td class="py-3 px-3 text-right text-orange-300 font-semibold">${player.shotted.toLocaleString('vi-VN')}</td>
            <td class="py-3 px-3 text-center text-yellow-300 font-semibold">${player.incaps_dealt}</td>
            <td class="py-3 px-3 text-center text-red-400 font-semibold">${player.kills_dealt}</td>
            <td class="py-3 px-4 text-right text-amber-200/70 text-xs">${timeStr}</td>
        `;

        tr.addEventListener('click', () => {
            tabBtnLookup.click();
            searchInput.value = player.name;
            displayPlayerStats(player.name);
        });

        tbody.appendChild(tr);
    });
}

// Hiệu ứng nhảy số
function animateNumber(element, targetValue) {
    const duration = 500;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const currentValue = Math.floor(progress * targetValue);
        
        element.textContent = currentValue.toLocaleString('vi-VN');

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = targetValue.toLocaleString('vi-VN');
        }
    }
    requestAnimationFrame(update);
}

// Chạy khởi tạo
init();
