let nameToIdMap = new Map(); // Lưu map Tên -> PlayerID
let allNames = [];          // Danh sách tất cả tên ingame phục vụ cho autocomplete
let statsData = {};
let playtimeData = {};      // Biến lưu dữ liệu phút chơi từ last_week.json

const searchInput = document.getElementById('search-input');
const autocompleteList = document.getElementById('autocomplete-list');
const playerProfile = document.getElementById('player-profile');
const playerNameEl = document.getElementById('player-name');
const playerIdEl = document.getElementById('player-id');
const playerPlaytimeEl = document.getElementById('player-playtime');
const weekInfoEl = document.getElementById('week-info');

// Elements hiển thị chỉ số
const statShot = document.getElementById('stat-shot');
const statShotted = document.getElementById('stat-shotted');
const statKills = document.getElementById('stat-kills');
const statIncaps = document.getElementById('stat-incaps');

// Hàm hỗ trợ escape các ký tự đặc biệt trong Regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Hàm hỗ trợ escape HTML tránh vỡ giao diện nếu tên chứa ký tự < > &
function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Hàm hỗ trợ phân tích mappings.json (hỗ trợ tên nằm bên trong/dưới ID và cấu trúc cũ)
function parseMappingsData(rawMappings) {
    const map = new Map();

    if (Array.isArray(rawMappings)) {
        // Cấu trúc dạng mảng: [{ id: "STEAM_...", names: ["Name1", "Name2"] }, ...]
        rawMappings.forEach(item => {
            const id = item.id || item.playerId || item.steam_id || item.steamid;
            if (!id) return;
            
            const names = item.names || item.aliases || (item.name ? [item.name] : []);
            names.forEach(n => {
                if (typeof n === 'string' && n.trim()) {
                    map.set(n.trim(), id);
                }
            });
        });
    } else if (typeof rawMappings === 'object' && rawMappings !== null) {
        // Cấu trúc Object
        Object.entries(rawMappings).forEach(([key, val]) => {
            if (typeof val === 'string') {
                // Chuỗi đơn: Kiểm tra key hay val là ID
                if (key.startsWith('STEAM_') || /^\d{17}$/.test(key)) {
                    map.set(val.trim(), key);
                } else {
                    map.set(key.trim(), val);
                }
            } else if (Array.isArray(val)) {
                // Cấu trúc mới: { "STEAM_ID": ["Tên 1", "Tên 2", ...] }
                const id = key;
                val.forEach(n => {
                    if (typeof n === 'string' && n.trim()) {
                        map.set(n.trim(), id);
                    }
                });
            } else if (typeof val === 'object' && val !== null) {
                // Cấu trúc mới: { "STEAM_ID": { name: "Tên", aliases: [...], ingame: [...] } }
                const id = val.id || val.playerId || val.steam_id || key;
                const namesList = [];

                if (typeof val.name === 'string') namesList.push(val.name);
                if (typeof val.ingame === 'string') namesList.push(val.ingame);
                if (Array.isArray(val.names)) namesList.push(...val.names);
                if (Array.isArray(val.aliases)) namesList.push(...val.aliases);
                if (Array.isArray(val.ingame_names)) namesList.push(...val.ingame_names);

                // Nếu không có field tên chuẩn, quét toàn bộ giá trị chuỗi/mảng bên trong
                if (namesList.length === 0) {
                    Object.values(val).forEach(v => {
                        if (typeof v === 'string' && v !== id) namesList.push(v);
                        else if (Array.isArray(v)) namesList.push(...v);
                    });
                }

                namesList.forEach(n => {
                    if (typeof n === 'string' && n.trim()) {
                        map.set(n.trim(), id);
                    }
                });
            }
        });
    }

    return map;
}

// 1. Tải dữ liệu từ 3 file JSON trong thư mục data/
async function loadData() {
    try {
        const [namesRes, statsRes, playtimeRes] = await Promise.all([
            fetch('./mappings.json'),
            fetch('./data/ff_stats_current.json'),
            fetch('./data/last_week.json')
        ]);

        const rawNamesData = await namesRes.json();
        const fullStats = await statsRes.json();
        playtimeData = await playtimeRes.json();
        
        // Tự động phân tích mappings.json và trích xuất danh sách tên
        nameToIdMap = parseMappingsData(rawNamesData);
        allNames = Array.from(nameToIdMap.keys());

        statsData = fullStats.players || {};
        
        if (fullStats.meta && fullStats.meta.week) {
            weekInfoEl.textContent = `Dữ liệu cập nhật: Tuần ${fullStats.meta.week}`;
        } else {
            weekInfoEl.textContent = 'Dữ liệu thống kê người chơi';
        }
    } catch (error) {
        console.error('Lỗi khi tải dữ liệu:', error);
        weekInfoEl.textContent = 'Không thể tải dữ liệu từ file JSON!';
        weekInfoEl.classList.add('text-rose-500');
    }
}

// 2. Tìm kiếm tên và render danh sách gợi ý
searchInput.addEventListener('input', function () {
    const query = this.value.trim().toLowerCase();
    autocompleteList.innerHTML = '';

    if (!query) {
        autocompleteList.classList.add('hidden');
        return;
    }

    // Lọc danh sách tên (Hỗ trợ Unicode, tiếng Trung, Ả Rập & Ký tự đặc biệt)
    const matchedNames = allNames.filter(name => 
        name.toLowerCase().includes(query)
    );

    if (matchedNames.length === 0) {
        const noResultItem = document.createElement('li');
        noResultItem.className = 'px-5 py-3 text-gray-500 text-sm italic';
        noResultItem.textContent = 'Không tìm thấy người chơi...';
        autocompleteList.appendChild(noResultItem);
    } else {
        const safeQuery = escapeRegExp(query);
        const reg = new RegExp(`(${safeQuery})`, 'gi');

        matchedNames.forEach(name => {
            const li = document.createElement('li');
            li.className = 'px-5 py-3 cursor-pointer hover:bg-indigo-600/30 transition-colors flex justify-between items-center';
            
            // Safe Highlight ký tự khớp
            const safeName = escapeHTML(name);
            const highlightedName = safeName.replace(reg, '<span class="text-indigo-400 font-bold">$1</span>');

            li.innerHTML = `<span>${highlightedName}</span>`;
            
            li.addEventListener('click', () => {
                selectPlayer(name);
            });

            autocompleteList.appendChild(li);
        });
    }

    autocompleteList.classList.remove('hidden');
});

// Hide dropdown khi click ra ngoài
document.addEventListener('click', function (e) {
    if (!searchInput.contains(e.target) && !autocompleteList.contains(e.target)) {
        autocompleteList.classList.add('hidden');
    }
});

// 3. Hiển thị thông tin người chơi khi được chọn
function selectPlayer(name) {
    searchInput.value = name;
    autocompleteList.classList.add('hidden');

    // Tra cứu PlayerID từ Map đã tạo
    const playerId = nameToIdMap.get(name);
    if (!playerId) {
        console.error('Không tìm thấy ID người chơi:', name);
        return;
    }

    const playerStats = statsData[playerId] || {
        shot: 0,
        shotted: 0,
        kills_dealt: 0,
        incaps_dealt: 0
    };

    // Lấy số phút chơi từ last_week.json
    const minutes = playtimeData[playerId] || 0;

    // Render thông tin người chơi
    playerNameEl.textContent = name;
    playerIdEl.textContent = `ID: ${playerId}`;
    
    // Hiển thị phút chơi (có chuyển đổi thêm giờ cho trực quan)
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

    // Animate đếm số mượt mà
    animateNumber(statShot, playerStats.shot || 0);
    animateNumber(statShotted, playerStats.shotted || 0);
    animateNumber(statKills, playerStats.kills_dealt || 0);
    animateNumber(statIncaps, playerStats.incaps_dealt || 0);
}

// Hàm hỗ trợ hiệu ứng nhảy số
function animateNumber(element, targetValue) {
    const duration = 500; // ms
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

// Khởi chạy
loadData();
