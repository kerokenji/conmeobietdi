let namesData = {};
let statsData = {};

const searchInput = document.getElementById('search-input');
const autocompleteList = document.getElementById('autocomplete-list');
const playerProfile = document.getElementById('player-profile');
const playerNameEl = document.getElementById('player-name');
const playerIdEl = document.getElementById('player-id');
const weekInfoEl = document.getElementById('week-info');

// Elements hiển thị chỉ số
const statShot = document.getElementById('stat-shot');
const statShotted = document.getElementById('stat-shotted');
const statKills = document.getElementById('stat-kills');
const statIncaps = document.getElementById('stat-incaps');

// 1. Tải dữ liệu từ 2 file JSON trong thư mục data/
async function loadData() {
    try {
        const [namesRes, statsRes] = await Promise.all([
            fetch('./mappings.json'),
            fetch('./data/ff_stats_current.json')
        ]);

        namesData = await namesRes.json();
        const fullStats = await statsRes.json();
        
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

    // Lọc danh sách các tên khớp ký tự nhập vào
    const matchedNames = Object.keys(namesData).filter(name => 
        name.toLowerCase().includes(query)
    );

    if (matchedNames.length === 0) {
        const noResultItem = document.createElement('li');
        noResultItem.className = 'px-5 py-3 text-gray-500 text-sm italic';
        noResultItem.textContent = 'Không tìm thấy người chơi...';
        autocompleteList.appendChild(noResultItem);
    } else {
        matchedNames.forEach(name => {
            const li = document.createElement('li');
            li.className = 'px-5 py-3 cursor-pointer hover:bg-indigo-600/30 transition-colors flex justify-between items-center';
            
            // Highlight phần từ khóa khớp
            const reg = new RegExp(`(${query})`, 'gi');
            const highlightedName = name.replace(reg, '<span class="text-indigo-400 font-bold">$1</span>');

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

    const playerId = namesData[name];
    const playerStats = statsData[playerId] || {
        shot: 0,
        shotted: 0,
        kills_dealt: 0,
        incaps_dealt: 0
    };

    // Render thông tin người chơi
    playerNameEl.textContent = name;
    playerIdEl.textContent = `ID: ${playerId}`;
    playerProfile.classList.remove('hidden');

    // Animate đếm số mượt mà
    animateNumber(statShot, playerStats.shot || 0);
    animateNumber(statShotted, playerStats.shotted || 0);
    animateNumber(statKills, playerStats.kills_dealt || 0);
    animateNumber(statIncaps, playerStats.incaps_dealt || 0);
}

// Hàm hỗ trợ hiệu ứng nhảy số
function animateNumber(element, targetValue) {
    let startValue = 0;
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
