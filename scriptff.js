/**
 * scriptff.js - Script xử lý mapping và hiển thị thống kê cho ff_stats.html
 * Hỗ trợ target theo: SteamID, Discord ID, và Tên In-game.
 */

let globalMappings = [];

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Đang khởi tạo scriptff.js...");
    await loadMappings();
    setupEventListeners();
});

/**
 * Tải file mappings.json cố định
 */
async function loadMappings() {
    try {
        const response = await fetch('mappings.json');
        if (!response.ok) {
            throw new Error(`Không thể tải mappings.json (Status: ${response.status})`);
        }
        globalMappings = await response.json();
        console.log(`Đã tải thành công ${globalMappings.length} bản ghi mapping.`);
    } catch (error) {
        console.error("Lỗi khi tải mappings.json:", error);
        showNotification("Lỗi tải file mapping. Vui lòng kiểm tra lại file JSON.", "error");
    }
}

/**
 * Hàm tìm kiếm người chơi đa năng hỗ trợ: SteamID, Discord ID, hoặc Tên In-game.
 * Tương thích với cấu trúc mappings.json cố định của bạn.
 */
function findPlayer(mappings, searchTarget) {
    if (!searchTarget || !Array.isArray(mappings) || mappings.length === 0) return null;

    const query = String(searchTarget).trim().toLowerCase();

    return mappings.find(player => {
        // Lấy các trường định danh với độ tương thích cao (phòng hờ tên biến khác nhau chút ít)
        const steamId = String(player.steamid || player.steamId || player.SteamID || player.steam_id || "").trim().toLowerCase();
        const discordId = String(player.discordid || player.discordId || player.discord_id || player.discord || "").trim().toLowerCase();
        
        // Kiểm tra tên in-game chính và danh sách tên cũ/alias (nếu có)
        const nameField = player.name || player.ingame_name || player.ingameName || player.username || "";
        const aliases = player.aliases || player.ingameNames || player.names || [];

        let matchesName = false;
        if (typeof nameField === 'string' && nameField.trim().toLowerCase() === query) {
            matchesName = true;
        } else if (Array.isArray(aliases)) {
            matchesName = aliases.some(alias => String(alias).trim().toLowerCase() === query);
        }

        return (steamId && steamId === query) || 
               (discordId && discordId === query) || 
               matchesName;
    });
}

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput') || document.getElementById('playerSearch');
    const searchButton = document.getElementById('searchButton') || document.getElementById('btnSearch');

    if (searchButton && searchInput) {
        searchButton.addEventListener('click', () => {
            handleSearch(searchInput.value);
        });

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSearch(searchInput.value);
            }
        });
    }

    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const val = searchInput ? searchInput.value : '';
            handleSearch(val);
        });
    }
}

function handleSearch(query) {
    if (!query || query.trim() === "") {
        showNotification("Vui lòng nhập SteamID, Discord ID hoặc Tên In-game để tra cứu!", "warning");
        return;
    }

    console.log(`Đang tìm kiếm target: "${query}"`);
    const player = findPlayer(globalMappings, query);

    if (player) {
        console.log("Tìm thấy thông tin player:", player);
        renderPlayerStats(player);
        showNotification(`Đã tìm thấy dữ liệu cho: ${player.name || player.ingame_name || query}`, "success");
    } else {
        console.warn(`Không tìm thấy player với từ khóa: "${query}"`);
        showNotification(`Không tìm thấy người chơi nào khớp với "${query}"!`, "error");
        clearPlayerStats();
    }
}

function renderPlayerStats(player) {
    safeSetText('playerName', player.name || player.ingame_name || player.username || "Không rõ");
    safeSetText('playerSteamId', player.steamid || player.steamId || player.SteamID || "N/A");
    safeSetText('playerDiscordId', player.discordid || player.discordId || player.discord_id || "N/A");
    
    safeSetText('statKills', player.kills || player.stats?.kills || '0');
    safeSetText('statDeaths', player.deaths || player.stats?.deaths || '0');
    safeSetText('statPlaytime', player.playtime || player.stats?.playtime || '0h');
    safeSetText('statRank', player.rank || player.stats?.rank || 'Unranked');

    const avatarEl = document.getElementById('playerAvatar') || document.getElementById('avatarImg');
    if (avatarEl && player.avatar) {
        avatarEl.src = player.avatar;
    }

    const resultContainer = document.getElementById('statsContainer') || document.getElementById('playerResult');
    if (resultContainer) {
        resultContainer.style.display = 'block';
    }
}

function clearPlayerStats() {
    safeSetText('playerName', '---');
    safeSetText('playerSteamId', '---');
    safeSetText('playerDiscordId', '---');
    safeSetText('statKills', '0');
    safeSetText('statDeaths', '0');
    safeSetText('statPlaytime', '0');
    safeSetText('statRank', '---');
}

function safeSetText(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = text;
    }
}

function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    const toastEl = document.getElementById('toastNotification') || document.getElementById('alertBox');
    if (toastEl) {
        toastEl.textContent = message;
        toastEl.className = `toast show ${type}`;
        setTimeout(() => {
            toastEl.classList.remove('show');
        }, 3000);
    }
}

window.findPlayer = findPlayer;
window.handleSearch = handleSearch;
