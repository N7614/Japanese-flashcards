let vocabData = [];
let queue = [];
let currentWord = null;
let isAnimating = false;
let studiedCount = 0;
let isCounterRevealed = false;
let currentSortState = 'default';
const sortStates = ['default', 'score-desc', 'score-asc'];
const sortLabels = ['Sắp xếp: Thứ tự gốc', 'Sắp xếp: Điểm giảm dần', 'Sắp xếp: Điểm tăng dần'];

const viewLearn = document.getElementById('view-learn');
const viewList = document.getElementById('view-list');
const btnLearn = document.getElementById('btn-learn');
const btnList = document.getElementById('btn-list');
const flashcard = document.getElementById('flashcard');
const cardContainer = document.querySelector('.card-container');

document.addEventListener('DOMContentLoaded', () => {
    if (window.pywebview) {
        initLibrary();
    } else {
        window.addEventListener('pywebviewready', initLibrary);
        // Fallback nếu không chạy trong app Desktop
        setTimeout(() => {
            if (!window.pywebview) initLibrary();
        }, 1500); // Tăng thời gian chờ lên 1.5s
    }
});

// Tùy chọn: Điền nếu chạy Web trên custom domain (mặc định sẽ tự động nhận diện nếu chạy trên *.github.io)
const GITHUB_REPO_CONFIG = {
    owner: '', // ví dụ: 'your-username'
    repo: ''   // ví dụ: 'Japanese-Vocab'
};

function getGitHubRepoInfo() {
    if (GITHUB_REPO_CONFIG.owner && GITHUB_REPO_CONFIG.repo) {
        return GITHUB_REPO_CONFIG;
    }
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    if (hostname.endsWith('.github.io')) {
        const owner = hostname.split('.')[0];
        const segments = pathname.split('/').filter(Boolean);
        const repo = segments.length > 0 ? segments[0] : '';
        return { owner, repo };
    }
    return null;
}

async function fetchManifestFromGitHub(owner, repo) {
    try {
        let res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`);
        if (!res.ok) {
            res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`);
        }
        if (!res.ok) return null;

        const data = await res.json();
        if (!data.tree || !Array.isArray(data.tree)) return null;

        // Lọc các file .json bên trong thư mục data/ (bỏ qua manifest.json nếu có)
        const jsonFiles = data.tree.filter(item =>
            item.type === 'blob' &&
            item.path.startsWith('data/') &&
            item.path.endsWith('.json') &&
            !item.path.endsWith('manifest.json')
        );

        const folderMap = {};
        for (const item of jsonFiles) {
            const relDataPath = item.path.slice('data/'.length);
            const parts = relDataPath.split('/');
            const fileName = parts.pop();
            const fileNameWithoutExt = fileName.replace(/\.json$/i, '');
            const relDir = parts.join('/');

            let folderId, folderDisplay;
            if (!relDir) {
                folderId = "root";
                folderDisplay = "Thư mục gốc";
            } else {
                folderId = relDir.replace(/\//g, '_');
                folderDisplay = relDir.replace(/\//g, ' / ');
            }

            if (!folderMap[folderId]) {
                folderMap[folderId] = {
                    folder: folderId,
                    name: `Thư mục: ${folderDisplay}`,
                    files: []
                };
            }

            folderMap[folderId].files.push({
                id: `${folderId}_${fileNameWithoutExt}`,
                name: fileNameWithoutExt.replace(/_/g, ' '),
                path: item.path
            });
        }

        return Object.values(folderMap);
    } catch (error) {
        console.warn("Lỗi khi gọi GitHub API:", error);
        return null;
    }
}

async function initLibrary() {
    let dataManifest = [];
    // Nếu mở trên phần mềm máy tính (Electron)
    if (window.electronAPI) {
        dataManifest = await window.electronAPI.getVocabManifest();
    } else if (window.pywebview && window.pywebview.api) {
        // Nếu mở bằng ứng dụng Python
        dataManifest = await window.pywebview.api.getVocabManifest();
    } else {
        // Nếu mở trên trình duyệt web / điện thoại: Tự động quét qua GitHub API
        const ghInfo = getGitHubRepoInfo();
        if (ghInfo && ghInfo.owner && ghInfo.repo) {
            const ghManifest = await fetchManifestFromGitHub(ghInfo.owner, ghInfo.repo);
            if (ghManifest && ghManifest.length > 0) {
                dataManifest = ghManifest;
            }
        }

        // Fallback: nếu không kết nối được GitHub API (offline hoặc dùng file manifest sẵn có)
        if (dataManifest.length === 0) {
            try {
                const response = await fetch('data/manifest.json?v=' + new Date().getTime());
                if (response.ok) {
                    dataManifest = await response.json();
                }
            } catch (error) {
                console.error("Lỗi khi tải manifest dự phòng:", error);
            }
        }
    }

    const treeContainer = document.getElementById('library-tree');

    // Cảnh báo nếu không tìm thấy dữ liệu
    if (dataManifest.length === 0) {
        treeContainer.innerHTML = `
            <div style="text-align: center; color: #ff5252; padding: 1rem;">
                <h3 style="margin-top: 0;">❌ Không tìm thấy dữ liệu!</h3>
                <p>Nếu dùng Desktop (.exe): Đặt thư mục <strong>data</strong> cùng cấp file .exe.<br>
                Nếu dùng trên GitHub Pages: Kiểm tra quyền truy cập repository hoặc đường dẫn.</p>
            </div>`;
        return;
    }

    let html = '<ul>';
    dataManifest.forEach(folder => {
        html += `
            <li>
                <input type="checkbox" id="folder-${folder.folder}" class="folder-checkbox" data-folder="${folder.folder}">
                <label for="folder-${folder.folder}"><strong>${folder.name}</strong></label>
                <ul>
        `;
        folder.files.forEach(file => {
            html += `
                    <li>
                        <input type="checkbox" id="file-${file.id}" class="file-checkbox" value="${file.path}" data-id="${file.id}" data-folder="${folder.folder}" data-name="${file.name}">
                        <label for="file-${file.id}">${file.name}</label>
                    </li>
            `;
        });
        html += `</ul></li>`;
    });
    html += '</ul>';
    treeContainer.innerHTML = html;

    // Tự động chọn/bỏ chọn checkbox con khi ấn checkbox thư mục
    document.querySelectorAll('.folder-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            document.querySelectorAll(`.file-checkbox[data-folder="${e.target.dataset.folder}"]`).forEach(child => child.checked = e.target.checked);
        });
    });

    document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const folder = e.target.dataset.folder;
            const all = document.querySelectorAll(`.file-checkbox[data-folder="${folder}"]`);
            const checked = document.querySelectorAll(`.file-checkbox[data-folder="${folder}"]:checked`);
            const folderCb = document.querySelector(`.folder-checkbox[data-folder="${folder}"]`);
            if (folderCb) {
                folderCb.checked = all.length === checked.length;
                folderCb.indeterminate = checked.length > 0 && checked.length < all.length;
            }
        });
    });

    document.getElementById('btn-load').onclick = loadSelectedPacks;
}

async function loadSelectedPacks() {
    const selected = Array.from(document.querySelectorAll('.file-checkbox:checked'));
    if (selected.length === 0) return alert("Vui lòng chọn ít nhất 1 gói từ vựng!");

    document.getElementById('btn-load').innerText = "Đang tải...";
    vocabData = [];

    let fileDataMap = {};
    const pathsToLoad = selected.map(cb => cb.value);

    studiedCount = 0;
    isCounterRevealed = false;
    document.getElementById('btn-counter').innerText = "Số thẻ đã học";
    let globalIndexCount = 0; // Biến đánh số thứ tự liên tục

    if (window.electronAPI) {
        fileDataMap = await window.electronAPI.loadFiles(pathsToLoad);
    } else if (window.pywebview && window.pywebview.api) {
        fileDataMap = await window.pywebview.api.loadFiles(pathsToLoad);
    }

    for (let cb of selected) {
        try {
            let data = null;

            if (window.electronAPI || (window.pywebview && window.pywebview.api)) {
                const content = fileDataMap[cb.value];
                if (content) data = JSON.parse(content);
            } else {
                // Thêm tham số thời gian để luôn tải nội dung bài học mới nhất
                const response = await fetch(cb.value + '?v=' + new Date().getTime());
                if (!response.ok) throw new Error('Network error');
                data = await response.json();
            }

            if (data) {
                const sourceId = cb.dataset.id;
                const saved = localStorage.getItem('vocabProgress_' + sourceId);
                const scores = saved ? JSON.parse(saved) : {};
                const savedFlags = localStorage.getItem('vocabFlags_' + sourceId);
                const flags = savedFlags ? JSON.parse(savedFlags) : {};

                vocabData = vocabData.concat(data.map((item, index) => ({
                    ...item,
                    originalIndex: index,
                    displayIndex: globalIndexCount++,
                    sourceId: sourceId,
                    sourceName: cb.dataset.name,
                    score: scores[index] !== undefined ? scores[index] : 0,
                    flagged: flags[index] === true
                })));
            }
        } catch (error) {
            console.error('Lỗi xử lý file ' + cb.value, error);
        }
    }

    document.getElementById('btn-load').innerText = "Tải & Bắt Đầu Học";
    if (vocabData.length === 0) return alert("Không thể tải file! Vui lòng kiểm tra lại.");

    initQueue();
    showNextCard();
    switchView('learn');
}

function saveProgress() {
    const progress = {};
    const flags = {};
    vocabData.forEach(w => {
        if (!progress[w.sourceId]) progress[w.sourceId] = {};
        if (!flags[w.sourceId]) flags[w.sourceId] = {};
        progress[w.sourceId][w.originalIndex] = w.score;
        if (w.flagged) {
            flags[w.sourceId][w.originalIndex] = true;
        }
    });
    for (let sourceId in progress) {
        localStorage.setItem('vocabProgress_' + sourceId, JSON.stringify(progress[sourceId]));
    }
    for (let sourceId in flags) {
        localStorage.setItem('vocabFlags_' + sourceId, JSON.stringify(flags[sourceId]));
    }
    triggerAutoSync();
}

function initQueue() {
    if (vocabData.length === 0) {
        queue = [];
        return;
    }

    const wordCountEl = document.getElementById('select-word-count');
    const orderModeEl = document.getElementById('select-order-mode');
    const filterModeEl = document.getElementById('select-filter-mode');

    const countVal = wordCountEl ? wordCountEl.value : 'all';
    const orderMode = orderModeEl ? orderModeEl.value : 'sequential';
    const filterMode = filterModeEl ? filterModeEl.value : 'all';

    // 1. Lọc theo điểm / trạng thái học
    let pool = [...vocabData];
    if (filterMode === 'unlearned') {
        pool = pool.filter(w => w.score <= 0);
    } else if (filterMode === 'low-score') {
        pool = pool.filter(w => w.score < 3);
    }

    if (pool.length === 0) {
        alert("Không tìm thấy từ nào thỏa mãn bộ lọc đã chọn! Tự động chuyển về 'Tất cả từ'.");
        if (filterModeEl) filterModeEl.value = 'all';
        pool = [...vocabData];
    }

    // 2. Thứ tự / Xáo trộn
    if (orderMode === 'random') {
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
    } else {
        // Theo thứ tự gốc của bài học
        pool.sort((a, b) => a.displayIndex - b.displayIndex);
    }

    // 3. Giới hạn số lượng từ trong phiên
    if (countVal !== 'all') {
        const limit = parseInt(countVal, 10);
        if (!isNaN(limit) && limit > 0) {
            pool = pool.slice(0, limit);
        }
    }

    queue = pool;
    updateSessionBadge();
}

function updateSessionBadge() {
    const badgeEl = document.getElementById('session-info-badge');
    if (!badgeEl) return;
    const countVal = document.getElementById('select-word-count') ? document.getElementById('select-word-count').value : 'all';
    const orderMode = document.getElementById('select-order-mode') ? document.getElementById('select-order-mode').value : 'sequential';
    const countText = countVal === 'all' ? `Tất cả (${queue.length} từ)` : `${queue.length} từ`;
    const orderText = orderMode === 'random' ? 'Ngẫu nhiên' : 'Thứ tự gốc';
    badgeEl.innerText = `Đang học: ${countText} • ${orderText}`;
}

function getNextWord() {
    if (queue.length === 0) return null;

    let attempts = 0;
    while (attempts < queue.length * 2) {
        let word = queue.shift();
        let show = false;

        if (word.score < 0) {
            show = true; // Điểm âm luôn hiển thị ngay lập tức
        } else if (word.score > 9) {
            show = Math.random() < 0.1; // Điểm 10 trở lên luôn có 10% xác suất xuất hiện
        } else {
            // Từ 0 đến 9: Xác suất hiển thị là 100% - 10% * điểm
            show = Math.random() < (1 - 0.1 * word.score);
        }

        if (show) {
            return word;
        } else {
            queue.push(word); // Chuyển về cuối hàng chờ
        }
        attempts++;
    }
    // Fallback (Tránh vòng lặp vô hạn), lấy thẻ tiếp theo
    return queue.shift();
}

// --- Hệ thống Text-To-Speech (Phát âm tiếng Nhật) --- //
function speakJapanese(text) {
    if (!('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel(); // Dừng phát âm trước đó
        const cleanText = text.replace(/\[.*?\]|\(.*?\)|_/g, '').trim();
        if (!cleanText) return;

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.85; // Tốc độ vừa phải, rõ ràng cho người học

        const voices = window.speechSynthesis.getVoices();
        const jaVoice = voices.find(v => v.lang.startsWith('ja') || v.lang === 'ja_JP');
        if (jaVoice) {
            utterance.voice = jaVoice;
        }
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn("Lỗi phát âm TTS:", e);
    }
}

function speakCurrentWord() {
    if (!currentWord) return;
    const textToSpeak = currentWord.kanji || currentWord.name;
    speakJapanese(textToSpeak);
}

window.speakJapanese = speakJapanese;
window.speakCurrentWord = speakCurrentWord;

// Tải trước danh sách voice của trình duyệt
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

function showNextCard() {
    currentWord = getNextWord();
    if (!currentWord) {
        document.getElementById('card-front').innerHTML = '<div class="card-mean" style="color:#2e7d32;">🎉 Đã hoàn thành lượt học!</div>';
        document.getElementById('card-back').innerHTML = '<div class="card-kana">Nhấn <strong>Làm mới phiên học</strong> để tiếp tục ôn tập</div>';
        return;
    }

    // Tắt hiệu ứng lật tạm thời để thẻ úp lại ngay lập tức (không bị lộ chữ)
    flashcard.style.transition = 'none';
    flashcard.classList.remove('is-flipped'); // Loại bỏ trạng thái lật nếu đang lật

    const displayMode = document.getElementById('select-display-mode') ? document.getElementById('select-display-mode').value : 'ja-vi';
    const furiganaMode = document.getElementById('select-furigana-mode') ? document.getElementById('select-furigana-mode').value : 'always';

    let isReverse = false;
    if (displayMode === 'vi-ja') {
        isReverse = true;
    } else if (displayMode === 'mixed') {
        isReverse = Math.random() < 0.5; // Ngẫu nhiên 50/50 chiều hiển thị
    }

    const hasKanji = currentWord.kanji && currentWord.kanji.trim() !== '';
    const mainJaText = hasKanji ? currentWord.kanji : currentWord.name;
    const kanaReading = currentWord.name; // Cách đọc Hiragana
    const ttsBtnHtml = `<button class="btn-tts" title="Nghe phát âm (Phím S)" onclick="event.stopPropagation(); speakCurrentWord();" onmousedown="event.stopPropagation();" ontouchstart="event.stopPropagation();">🔊 Nghe</button>`;

    // Xây dựng khối Tiếng Nhật
    let jaHtmlParts = [];
    if (hasKanji) {
        jaHtmlParts.push(`<div class="card-kanji">${mainJaText.split('_').join('<br>')}</div>`);
        // Nếu chọn luôn hiện hoặc khi đang ở mặt sau của chế độ dịch Việt -> Nhật
        if (furiganaMode === 'always' || (isReverse && furiganaMode === 'back-only')) {
            jaHtmlParts.push(`<div class="card-sub-kana">${kanaReading.split('_').join('<br>')}</div>`);
        }
    } else {
        // Từ chỉ có Hiragana
        jaHtmlParts.push(`<div class="card-kanji">${mainJaText.split('_').join('<br>')}</div>`);
    }
    jaHtmlParts.push(ttsBtnHtml);

    const japaneseBlock = `
        <div class="card-content">
            <span class="card-tag-direction">🇯🇵 Tiếng Nhật</span>
            ${jaHtmlParts.join('')}
        </div>
    `;

    // Xây dựng khối Tiếng Việt
    let viHtmlParts = [];
    viHtmlParts.push(`<div class="card-mean">${currentWord.mean}</div>`);

    // Nếu chọn 'Chỉ hiện khi lật thẻ' trong chiều Nhật -> Việt, hiển thị Hiragana ở mặt sau
    if (hasKanji && furiganaMode === 'back-only' && !isReverse) {
        viHtmlParts.push(`<div class="card-sub-kana" style="margin-top: 0.8rem;">💡 Cách đọc: <strong>${kanaReading.split('_').join(' ')}</strong></div>`);
    }

    const vietnameseBlock = `
        <div class="card-content">
            <span class="card-tag-direction">🇻🇳 Tiếng Việt</span>
            ${viHtmlParts.join('')}
        </div>
    `;

    if (isReverse) {
        document.getElementById('card-front').innerHTML = vietnameseBlock;
        document.getElementById('card-back').innerHTML = japaneseBlock;
    } else {
        document.getElementById('card-front').innerHTML = japaneseBlock;
        document.getElementById('card-back').innerHTML = vietnameseBlock;
    }

    // Ép trình duyệt cập nhật thay đổi ngay lập tức, sau đó khôi phục hiệu ứng lật
    void flashcard.offsetWidth;
    flashcard.style.transition = '';

    // Tự động phát âm nếu bật chế độ auto (khi mặt trước là tiếng Nhật)
    const ttsMode = document.getElementById('select-tts-mode') ? document.getElementById('select-tts-mode').value : 'manual';
    if (ttsMode === 'auto' && !isReverse) {
        speakCurrentWord();
    }

    // Cập nhật trạng thái nút cờ báo lỗi trên giao diện học
    const btnFlag = document.getElementById('btn-report-flag');
    if (btnFlag) {
        if (currentWord.flagged) {
            btnFlag.classList.add('flagged-active');
            btnFlag.innerHTML = '🚩 Đã báo lỗi';
            btnFlag.title = 'Nhấn để bỏ báo lỗi từ này';
        } else {
            btnFlag.classList.remove('flagged-active');
            btnFlag.innerHTML = '🚩 Báo lỗi từ này';
            btnFlag.title = 'Đánh dấu từ này cần sửa lỗi';
        }
    }

    saveProgress();
    renderList();
}

// Xử lý nút Báo lỗi từ vựng
const btnReportFlag = document.getElementById('btn-report-flag');
if (btnReportFlag) {
    btnReportFlag.addEventListener('click', () => {
        if (!currentWord) return;
        currentWord.flagged = !currentWord.flagged;
        saveProgress();
        if (currentWord.flagged) {
            btnReportFlag.classList.add('flagged-active');
            btnReportFlag.innerHTML = '🚩 Đã báo lỗi';
            btnReportFlag.title = 'Nhấn để bỏ báo lỗi từ này';
        } else {
            btnReportFlag.classList.remove('flagged-active');
            btnReportFlag.innerHTML = '🚩 Báo lỗi từ này';
            btnReportFlag.title = 'Đánh dấu từ này cần sửa lỗi';
        }
        if (viewList.classList.contains('active-view')) {
            renderList();
        }
    });
}

// Xử lý Xáo trộn các từ đang học trong phiên
function shuffleCurrentQueue() {
    if (vocabData.length === 0) return;

    let allCurrentWords = [...queue];
    if (currentWord) {
        allCurrentWords.push(currentWord);
    }

    if (allCurrentWords.length === 0) return;

    // Thuật toán xáo trộn Fisher-Yates
    for (let i = allCurrentWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allCurrentWords[i], allCurrentWords[j]] = [allCurrentWords[j], allCurrentWords[i]];
    }

    queue = allCurrentWords;
    showNextCard();

    const btnShuffle = document.getElementById('btn-shuffle-queue');
    if (btnShuffle) {
        btnShuffle.innerText = '🔀 Đã xáo trộn!';
        btnShuffle.style.background = '#e8f5e9';
        btnShuffle.style.borderColor = '#4caf50';
        btnShuffle.style.color = '#2e7d32';
        setTimeout(() => {
            btnShuffle.innerText = '🔀 Xáo trộn từ';
            btnShuffle.style.background = '';
            btnShuffle.style.borderColor = '';
            btnShuffle.style.color = '';
        }, 1200);
    }
}

const btnShuffleQueue = document.getElementById('btn-shuffle-queue');
if (btnShuffleQueue) {
    btnShuffleQueue.addEventListener('click', shuffleCurrentQueue);
}

// --- Xử lý sự kiện Giao diện --- //
document.getElementById('btn-library').addEventListener('click', () => switchView('library'));
btnLearn.addEventListener('click', () => switchView('learn'));
btnList.addEventListener('click', () => switchView('list'));

// Nút làm mới phiên học
const btnRefreshSession = document.getElementById('btn-refresh-session');
if (btnRefreshSession) {
    btnRefreshSession.addEventListener('click', () => {
        if (vocabData.length === 0) return alert("Vui lòng chọn và tải gói từ vựng từ Thư Viện trước!");
        studiedCount = 0;
        if (isCounterRevealed) {
            document.getElementById('btn-counter').innerText = `Đã học: 0 thẻ`;
        } else {
            document.getElementById('btn-counter').innerText = `Số thẻ đã học`;
        }
        initQueue();
        showNextCard();
    });
}

function switchView(viewName) {
    if ((viewName === 'learn' || viewName === 'list') && vocabData.length === 0) {
        return alert("Vui lòng chọn và tải ít nhất 1 gói từ vựng từ Thư Viện trước!");
    }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById('view-' + viewName).classList.add('active-view');
    document.getElementById('btn-' + viewName).classList.add('active');

    if (viewName === 'list') renderList();
}

document.getElementById('btn-forget').addEventListener('click', (e) => {
    e.stopPropagation();
    animateAndHandleAction(-1);
});

document.getElementById('btn-remember').addEventListener('click', (e) => {
    e.stopPropagation();
    animateAndHandleAction(1);
});

function handleAction(scoreChange) {
    if (!currentWord) return;
    currentWord.score += scoreChange;
    studiedCount++;
    if (isCounterRevealed) {
        document.getElementById('btn-counter').innerText = `Đã học: ${studiedCount} thẻ`;
    }
    queue.push(currentWord); // Trả lời xong sẽ đưa thẻ về cuối hàng chờ

    // Đặt lại vị trí thẻ ngay lập tức không có hiệu ứng (ngăn thẻ trượt lùi về)
    cardContainer.classList.add('dragging');
    resetCardPosition();
    void cardContainer.offsetWidth; // Ép trình duyệt cập nhật DOM
    cardContainer.classList.remove('dragging');

    showNextCard();
}

async function animateAndHandleAction(scoreChange) {
    if (!currentWord || isAnimating) return;
    isAnimating = true; // Bắt đầu hoạt ảnh

    try {
        // Thêm hiệu ứng chuyển động và màu sắc mượt mà
        cardContainer.classList.remove('dragging');
        flashcard.style.transition = 'transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1), box-shadow 0.2s ease';

        if (scoreChange > 0) {
            cardContainer.style.transform = `translateX(50px) rotate(5deg)`;
            flashcard.style.boxShadow = `0 8px 16px rgba(0,0,0,0.1), 0 0 30px rgba(76, 175, 80, 0.8)`;
        } else {
            cardContainer.style.transform = `translateX(-50px) rotate(-5deg)`;
            flashcard.style.boxShadow = `0 8px 16px rgba(0,0,0,0.1), 0 0 30px rgba(255, 82, 82, 0.8)`;
        }

        // Chờ 200ms để người dùng kịp nhìn thấy thẻ đổi màu và nhích đi
        await new Promise(resolve => setTimeout(resolve, 200));

        // Trả lại trạng thái transition gốc cho thẻ
        flashcard.style.transition = '';

        handleAction(scoreChange);
    } catch (err) {
        console.error("Lỗi trong animateAndHandleAction:", err);
    } finally {
        isAnimating = false; // Luôn đảm bảo kết thúc hoạt ảnh
    }
}

// --- Xử lý Vuốt / Kéo chuột (Swipe) --- //
let startX = 0;
let isDragging = false;
let currentX = 0;
let isSwiping = false; // Thêm cờ để phân biệt chạm và vuốt

function startDrag(x) {
    if (isAnimating) return; // Không cho phép kéo khi đang chạy animation của nút
    startX = x;
    currentX = x; // Reset lại vị trí
    isDragging = true;
    isSwiping = false; // Mặc định là đang chạm (chưa vuốt)
    cardContainer.classList.add('dragging');
}

function moveDrag(x) {
    if (!isDragging) return;
    currentX = x;
    let deltaX = currentX - startX;

    if (Math.abs(deltaX) > 15) {
        isSwiping = true; // Nếu trượt tay quá 15px thì tính là đang vuốt
    }

    let rotate = deltaX * 0.05;

    cardContainer.style.transform = `translateX(${deltaX}px) rotate(${rotate}deg)`;

    // Hiệu ứng màu sắc: Kéo trái (Đỏ) - Kéo phải (Xanh)
    if (deltaX > 0) {
        let opacity = Math.min(deltaX / 100, 1);
        flashcard.style.boxShadow = `0 8px 16px rgba(0,0,0,0.1), 0 0 30px rgba(76, 175, 80, ${opacity})`;
    } else if (deltaX < 0) {
        let opacity = Math.min(Math.abs(deltaX) / 100, 1);
        flashcard.style.boxShadow = `0 8px 16px rgba(0,0,0,0.1), 0 0 30px rgba(255, 82, 82, ${opacity})`;
    } else {
        flashcard.style.boxShadow = '';
    }
}

function endDrag(x) {
    if (!isDragging) return;
    isDragging = false;
    cardContainer.classList.remove('dragging');

    let deltaX = x !== undefined ? x - startX : currentX - startX;
    const threshold = 80; // Quãng đường kéo (px) tối thiểu để kích hoạt

    if (deltaX < -threshold) {
        handleAction(-1); // Vuốt trái
    } else if (deltaX > threshold) {
        handleAction(1); // Vuốt phải
    } else {
        if (!isSwiping) {
            flashcard.classList.toggle('is-flipped'); // Chạm/Click bình thường
        }
        resetCardPosition(); // Trượt về vị trí cũ
    }
}

function resetCardPosition() {
    cardContainer.style.transform = '';
    flashcard.style.boxShadow = '';
}

let lastTouchTime = 0;

// Sự kiện hỗ trợ cảm ứng (Mobile)
flashcard.addEventListener('touchstart', e => {
    if (e.target.closest('.btn-tts') || e.target.closest('button')) return;
    lastTouchTime = Date.now();
    startDrag(e.touches[0].clientX);
}, { passive: true });
flashcard.addEventListener('touchmove', e => {
    if (!isDragging) return;
    moveDrag(e.touches[0].clientX);
}, { passive: true });
flashcard.addEventListener('touchend', e => {
    if (!isDragging) return;
    endDrag(e.changedTouches[0].clientX);
});

// Sự kiện kéo (Desktop)
flashcard.addEventListener('mousedown', e => {
    if (e.target.closest('.btn-tts') || e.target.closest('button')) return;
    if (Date.now() - lastTouchTime < 500) return; // Chặn "click ảo" của chuột khi vừa chạm ngón tay
    startDrag(e.clientX);
});
document.addEventListener('mousemove', e => {
    if (isDragging) moveDrag(e.clientX);
});
document.addEventListener('mouseup', e => {
    if (isDragging) endDrag(e.clientX);
});
// --- Phím tắt Bàn phím --- //
document.addEventListener('keydown', (e) => {
    // Bỏ qua khi đang nhập liệu trong thẻ input hoặc textarea
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;

    // Chỉ kích hoạt phím tắt khi đang ở màn hình học từ vựng
    if (!viewLearn.classList.contains('active-view')) return;

    const code = e.code;
    const key = e.key ? e.key.toLowerCase() : '';

    const isLeft = code === 'ArrowLeft' || code === 'KeyA' || key === 'arrowleft' || key === 'a' || key === 'à' || key === 'á' || key === 'ả' || key === 'ã' || key === 'ạ' || key === 'â' || key === 'ă';
    const isRight = code === 'ArrowRight' || code === 'KeyD' || key === 'arrowright' || key === 'd' || key === 'đ';
    const isFlip = code === 'ArrowUp' || code === 'ArrowDown' || code === 'Space' || code === 'KeyW' || key === 'arrowup' || key === 'arrowdown' || key === ' ' || key === 'spacebar' || key === 'w';
    const isSound = code === 'KeyS' || code === 'KeyV' || key === 's' || key === 'v';
    const isShuffle = code === 'KeyR' || key === 'r';

    if (isLeft) {
        e.preventDefault();
        animateAndHandleAction(-1);
    } else if (isRight) {
        e.preventDefault();
        animateAndHandleAction(1);
    } else if (isFlip) {
        e.preventDefault(); // Tránh cuộn trang
        flashcard.classList.toggle('is-flipped');
    } else if (isSound) {
        e.preventDefault();
        speakCurrentWord();
    } else if (isShuffle) {
        e.preventDefault();
        shuffleCurrentQueue();
    }
});

// --- Chức năng Danh Sách Từ Vựng --- //
document.getElementById('btn-counter').addEventListener('click', (e) => {
    isCounterRevealed = !isCounterRevealed;
    if (isCounterRevealed) {
        e.target.innerText = `Đã học: ${studiedCount} thẻ`;
        e.target.style.background = '#e3f2fd';
    } else {
        e.target.innerText = 'Số thẻ đã học';
        e.target.style.background = 'transparent';
    }
});

document.getElementById('btn-find-list').addEventListener('click', () => {
    if (!currentWord) return;

    // Tự động bỏ bộ lọc nếu từ hiện tại không khớp (để chắc chắn từ này hiện ra trong bảng)
    const filterVal = document.getElementById('filter-select').value;
    if ((filterVal === 'positive' && currentWord.score <= 0) ||
        (filterVal === 'negative' && currentWord.score >= 0)) {
        document.getElementById('filter-select').value = 'all';
    }

    switchView('list');

    setTimeout(() => {
        const row = document.getElementById(`row-word-${currentWord.displayIndex}`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.transition = 'background-color 0.5s';
            row.style.backgroundColor = '#fff3cd'; // Nhấp nháy màu vàng
            setTimeout(() => row.style.backgroundColor = '', 2000);
        }
    }, 100);
});

document.getElementById('btn-sort').addEventListener('click', (e) => {
    let idx = sortStates.indexOf(currentSortState);
    idx = (idx + 1) % sortStates.length;
    currentSortState = sortStates[idx];
    e.target.innerText = sortLabels[idx];
    renderList();
});
document.getElementById('filter-select').addEventListener('change', renderList);

document.getElementById('btn-reset').addEventListener('click', () => {
    const filterVal = document.getElementById('filter-select').value;
    let targetWords = vocabData.filter(word => {
        if (filterVal === 'positive') return word.score > 0;
        if (filterVal === 'negative') return word.score < 0;
        return true;
    });

    if (targetWords.length === 0) return alert("Không có thẻ nào để đặt lại điểm!");

    if (confirm(`Bạn có chắc chắn muốn đặt lại điểm của ${targetWords.length} thẻ đang hiển thị về 0?`)) {
        targetWords.forEach(w => w.score = 0);
        saveProgress();
        renderList();
    }
});

function renderList() {
    const tbody = document.getElementById('vocab-tbody');
    const filterVal = document.getElementById('filter-select').value;

    // Bộ Lọc
    let filtered = vocabData.filter(word => {
        if (filterVal === 'positive') return word.score > 0;
        if (filterVal === 'negative') return word.score < 0;
        if (filterVal === 'flagged') return word.flagged === true;
        return true;
    });

    // Sắp xếp
    filtered.sort((a, b) => {
        if (currentSortState === 'score-asc') return a.score - b.score;
        if (currentSortState === 'score-desc') return b.score - a.score;
        return a.displayIndex - b.displayIndex;
    });

    // Hiển thị ra bảng
    tbody.innerHTML = '';
    filtered.forEach((word) => {
        const hasKanji = word.kanji && word.kanji.trim() !== '';
        const mainJa = hasKanji ? word.kanji : word.name;
        const subKana = hasKanji ? `<div style="color: #007bff; font-size: 0.88rem; margin-top: 2px;">${word.name.split('_').join(' ')}</div>` : '';
        const speechText = (word.kanji || word.name).replace(/'/g, "\\'");

        let scoreClass = 'neutral';
        if (word.score > 0) scoreClass = 'positive';
        else if (word.score < 0) scoreClass = 'negative';

        const tr = document.createElement('tr');
        tr.id = `row-word-${word.displayIndex}`;
        tr.innerHTML = `
            <td style="text-align:center;">${word.displayIndex + 1}</td>
            <td>
                <div style="font-weight: bold; font-size: 1.05rem; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span>${mainJa.split('_').join('<br>')}</span>
                    <button style="border:none; background:transparent; cursor:pointer; font-size:1.05rem; padding:0 2px; border-radius:4px;" title="Nghe phát âm" onclick="speakJapanese('${speechText}')">🔊</button>
                    <button class="btn-flag-row ${word.flagged ? 'is-flagged' : ''}" title="${word.flagged ? 'Bỏ đánh dấu cần sửa' : 'Đánh dấu từ này cần sửa'}" onclick="toggleWordFlag(${word.displayIndex})">🚩</button>
                </div>
                ${subKana}
            </td>
            <td>${word.mean}</td>
            <td><span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem;">${word.sourceName}</span></td>
            <td style="text-align:center; padding: 4px;">
                <input type="number" 
                       class="score-input ${scoreClass}" 
                       value="${word.score}" 
                       data-index="${word.displayIndex}" 
                       onchange="handleScoreInputChange(this, ${word.displayIndex})" 
                       onfocus="this.select()" 
                       title="Nhấp vào để sửa điểm số" />
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Hàm Bật/Tắt cờ Báo lỗi trong bảng danh sách
window.toggleWordFlag = function (displayIndex) {
    const word = vocabData.find(w => w.displayIndex === displayIndex);
    if (!word) return;
    word.flagged = !word.flagged;
    saveProgress();

    // Cập nhật nút cờ trên màn hình học nếu đang học chính từ này
    if (currentWord && currentWord.displayIndex === displayIndex) {
        const btnFlag = document.getElementById('btn-report-flag');
        if (btnFlag) {
            if (word.flagged) {
                btnFlag.classList.add('flagged-active');
                btnFlag.innerHTML = '🚩 Đã báo lỗi';
                btnFlag.title = 'Nhấn để bỏ báo lỗi từ này';
            } else {
                btnFlag.classList.remove('flagged-active');
                btnFlag.innerHTML = '🚩 Báo lỗi từ này';
                btnFlag.title = 'Đánh dấu từ này cần sửa lỗi';
            }
        }
    }

    const filterVal = document.getElementById('filter-select').value;
    if (filterVal === 'flagged') {
        renderList();
    } else {
        const row = document.getElementById(`row-word-${displayIndex}`);
        if (row) {
            const flagBtn = row.querySelector('.btn-flag-row');
            if (flagBtn) {
                flagBtn.classList.toggle('is-flagged', word.flagged);
                flagBtn.title = word.flagged ? 'Bỏ đánh dấu cần sửa' : 'Đánh dấu từ này cần sửa';
            }
        }
    }
};

// Hàm Xử lý khi người dùng chỉnh sửa điểm trực tiếp trong ô nhập liệu
window.handleScoreInputChange = function (inputEl, displayIndex) {
    const word = vocabData.find(w => w.displayIndex === displayIndex);
    if (!word) return;

    let newScore = parseInt(inputEl.value, 10);
    if (isNaN(newScore)) newScore = 0;

    word.score = newScore;
    inputEl.value = newScore;

    inputEl.classList.remove('positive', 'negative', 'neutral');
    if (newScore > 0) inputEl.classList.add('positive');
    else if (newScore < 0) inputEl.classList.add('negative');
    else inputEl.classList.add('neutral');

    saveProgress();
};

// ========================================== //
// --- HỆ THỐNG ĐỒNG BỘ GITHUB GIST & SAO LƯU TIẾN ĐỘ --- //
// ========================================== //

const GIST_FILENAME = 'japanese_flashcard_progress.json';
const GIST_DESCRIPTION = 'Tiến độ học tiếng Nhật (Japanese Flashcard App)';
let autoSyncTimer = null;

function getAllProgressData() {
    const progress = {};
    const flags = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
            if (key.startsWith('vocabProgress_')) {
                try {
                    progress[key] = JSON.parse(localStorage.getItem(key));
                } catch (e) {
                    console.warn("Lỗi đọc key:", key, e);
                }
            } else if (key.startsWith('vocabFlags_')) {
                try {
                    flags[key] = JSON.parse(localStorage.getItem(key));
                } catch (e) {
                    console.warn("Lỗi đọc flag key:", key, e);
                }
            }
        }
    }
    return {
        version: 2,
        appName: 'JapaneseVocabApp',
        updatedAt: new Date().toISOString(),
        totalPacks: Object.keys(progress).length,
        progress: progress,
        flags: flags
    };
}

function restoreAllProgressData(remoteData) {
    if (!remoteData || !remoteData.progress || typeof remoteData.progress !== 'object') {
        return false;
    }

    const progress = remoteData.progress;
    for (const key in progress) {
        if (key.startsWith('vocabProgress_')) {
            localStorage.setItem(key, JSON.stringify(progress[key]));
        }
    }

    if (remoteData.flags && typeof remoteData.flags === 'object') {
        for (const key in remoteData.flags) {
            if (key.startsWith('vocabFlags_')) {
                localStorage.setItem(key, JSON.stringify(remoteData.flags[key]));
            }
        }
    }

    // Cập nhật lại điểm số & flag trong vocabData nếu đang mở bài học
    if (vocabData && vocabData.length > 0) {
        vocabData.forEach(w => {
            const saved = localStorage.getItem('vocabProgress_' + w.sourceId);
            if (saved) {
                try {
                    const scores = JSON.parse(saved);
                    if (scores[w.originalIndex] !== undefined) {
                        w.score = scores[w.originalIndex];
                    }
                } catch (e) { }
            }
            const savedFlags = localStorage.getItem('vocabFlags_' + w.sourceId);
            if (savedFlags) {
                try {
                    const flags = JSON.parse(savedFlags);
                    w.flagged = flags[w.originalIndex] === true;
                } catch (e) { }
            }
        });
        if (viewList.classList.contains('active-view')) {
            renderList();
        }
    }

    return true;
}

function updateSyncStatusUI(message, type = 'success') {
    const statusEl = document.getElementById('sync-status-msg');
    if (!statusEl) return;
    statusEl.className = `sync-status-msg active ${type}`;
    statusEl.innerText = message;
}

async function uploadToGist(showToast = true) {
    const tokenInput = document.getElementById('github-token-input');
    const gistIdInput = document.getElementById('github-gist-id-input');

    let token = (tokenInput ? tokenInput.value : localStorage.getItem('github_sync_token') || '').trim();
    let gistId = (gistIdInput ? gistIdInput.value : localStorage.getItem('github_sync_gist_id') || '').trim();

    if (!token) {
        if (showToast) {
            updateSyncStatusUI("⚠️ Vui lòng nhập GitHub Token (PAT có quyền 'gist') trước!", "warning");
        }
        return false;
    }

    localStorage.setItem('github_sync_token', token);
    updateSyncStatusUI("⏳ Đang tải điểm lên GitHub Gist...", "loading");

    const payload = getAllProgressData();

    try {
        const headers = {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28'
        };

        // Nếu chưa có Gist ID, thử tự động tìm Gist tiến độ đã có trên GitHub
        if (!gistId) {
            try {
                const listRes = await fetch('https://api.github.com/gists?per_page=50', { headers });
                if (listRes.ok) {
                    const gists = await listRes.json();
                    const existingGist = gists.find(g => g.files && (g.files[GIST_FILENAME] || g.description === GIST_DESCRIPTION));
                    if (existingGist) {
                        gistId = existingGist.id;
                        localStorage.setItem('github_sync_gist_id', gistId);
                        if (gistIdInput) gistIdInput.value = gistId;
                    }
                }
            } catch (e) {
                console.warn("Không thể tìm danh sách Gist cũ:", e);
            }
        }

        let response;
        if (gistId) {
            response = await fetch(`https://api.github.com/gists/${gistId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    description: GIST_DESCRIPTION,
                    files: {
                        [GIST_FILENAME]: {
                            content: JSON.stringify(payload, null, 2)
                        }
                    }
                })
            });
        } else {
            response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    description: GIST_DESCRIPTION,
                    public: false,
                    files: {
                        [GIST_FILENAME]: {
                            content: JSON.stringify(payload, null, 2)
                        }
                    }
                })
            });
        }

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error("Token GitHub không hợp lệ hoặc đã hết hạn");
            } else if (response.status === 403) {
                throw new Error("Token bị thiếu quyền 'gist' hoặc đã vượt giới hạn API GitHub");
            } else if (response.status === 404) {
                localStorage.removeItem('github_sync_gist_id');
                if (gistIdInput) gistIdInput.value = '';
                throw new Error("Không tìm thấy Gist ID này trên GitHub (đã đặt lại để tạo mới)");
            }
            throw new Error(`Mã phản hồi HTTP ${response.status}`);
        }

        const data = await response.json();
        gistId = data.id;
        localStorage.setItem('github_sync_gist_id', gistId);
        if (gistIdInput) gistIdInput.value = gistId;

        const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        localStorage.setItem('last_synced_time', new Date().toISOString());
        updateSyncStatusUI(`✅ Đã lưu lên GitHub Gist thành công lúc ${nowStr}! (${payload.totalPacks} gói bài)`, "success");
        return true;
    } catch (err) {
        console.error("Lỗi tải lên Gist:", err);
        updateSyncStatusUI(`❌ ${err.message || "Không thể kết nối GitHub Gist"}. Vui lòng kiểm tra lại!`, "error");
        return false;
    }
}

async function downloadFromGist(showToast = true) {
    const tokenInput = document.getElementById('github-token-input');
    const gistIdInput = document.getElementById('github-gist-id-input');

    let token = (tokenInput ? tokenInput.value : localStorage.getItem('github_sync_token') || '').trim();
    let gistId = (gistIdInput ? gistIdInput.value : localStorage.getItem('github_sync_gist_id') || '').trim();

    if (!token && !gistId) {
        if (showToast) {
            updateSyncStatusUI("⚠️ Vui lòng nhập GitHub Token hoặc Gist ID để tải điểm về!", "warning");
        }
        return false;
    }

    if (token) localStorage.setItem('github_sync_token', token);
    if (gistId) localStorage.setItem('github_sync_gist_id', gistId);

    updateSyncStatusUI("⏳ Đang tải điểm từ GitHub Gist về...", "loading");

    try {
        const headers = {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Nếu chưa có Gist ID nhưng có Token, tìm Gist tự động
        if (!gistId && token) {
            const listRes = await fetch('https://api.github.com/gists?per_page=50', { headers });
            if (listRes.ok) {
                const gists = await listRes.json();
                const existingGist = gists.find(g => g.files && (g.files[GIST_FILENAME] || g.description === GIST_DESCRIPTION));
                if (existingGist) {
                    gistId = existingGist.id;
                    localStorage.setItem('github_sync_gist_id', gistId);
                    if (gistIdInput) gistIdInput.value = gistId;
                }
            }
        }

        if (!gistId) {
            updateSyncStatusUI("⚠️ Không tìm thấy Gist ID. Hãy bấm 'Tải lên Gist' từ thiết bị trước!", "warning");
            return false;
        }

        const response = await fetch(`https://api.github.com/gists/${gistId}?v=${Date.now()}`, { headers });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error("Token GitHub không hợp lệ");
            } else if (response.status === 404) {
                throw new Error("Không tìm thấy Gist ID này trên GitHub");
            }
            throw new Error(`Mã phản hồi HTTP ${response.status}`);
        }

        const data = await response.json();
        let contentStr = null;
        if (data.files && data.files[GIST_FILENAME] && data.files[GIST_FILENAME].content) {
            contentStr = data.files[GIST_FILENAME].content;
        } else if (data.files) {
            for (let f in data.files) {
                if (f.endsWith('.json') && data.files[f].content) {
                    contentStr = data.files[f].content;
                    break;
                }
            }
        }

        if (!contentStr) {
            updateSyncStatusUI("⚠️ File dữ liệu trên Gist trống hoặc không tìm thấy!", "warning");
            return false;
        }

        const remoteData = JSON.parse(contentStr);
        const success = restoreAllProgressData(remoteData);
        if (success) {
            const dateStr = remoteData.updatedAt ? new Date(remoteData.updatedAt).toLocaleString('vi-VN') : 'vừa rồi';
            localStorage.setItem('last_synced_time', new Date().toISOString());
            updateSyncStatusUI(`✅ Đã đồng bộ điểm từ GitHub Gist về máy thành công! (Bản lưu từ: ${dateStr})`, "success");
            return true;
        } else {
            updateSyncStatusUI("❌ Dữ liệu trên Gist không đúng định dạng!", "error");
            return false;
        }
    } catch (err) {
        console.error("Lỗi tải về từ Gist:", err);
        updateSyncStatusUI(`❌ ${err.message || "Không thể kết nối GitHub Gist"}. Vui lòng kiểm tra lại!`, "error");
        return false;
    }
}

function triggerAutoSync() {
    const chkAuto = document.getElementById('chk-auto-sync');
    const isAutoSync = chkAuto ? chkAuto.checked : (localStorage.getItem('auto_sync_enabled') !== 'false');
    const token = (localStorage.getItem('github_sync_token') || '').trim();
    if (!isAutoSync || !token) return;

    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
        uploadToGist(false);
    }, 4500); // Tự động đồng bộ lên Gist sau 4.5s
}

function exportProgressFile() {
    const data = getAllProgressData();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

    const a = document.createElement('a');
    a.href = url;
    a.download = `tiengnhat_tien_do_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateSyncStatusUI("✅ Đã xuất file sao lưu thành công!", "success");
}

function importProgressFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.progress) {
                throw new Error("File không đúng cấu trúc điểm số!");
            }
            restoreAllProgressData(data);
            updateSyncStatusUI(`✅ Đã khôi phục thành công điểm từ file: ${file.name}`, "success");
        } catch (err) {
            console.error("Lỗi đọc file:", err);
            updateSyncStatusUI("❌ File sao lưu không hợp lệ hoặc bị lỗi!", "error");
        }
    };
    reader.readAsText(file);
}

function initSyncSystem() {
    const modalSync = document.getElementById('modal-sync');
    const btnOpenSync = document.getElementById('btn-open-sync');
    const btnCloseSync = document.getElementById('btn-close-sync');
    const tokenInput = document.getElementById('github-token-input');
    const btnToggleToken = document.getElementById('btn-toggle-token');
    const gistIdInput = document.getElementById('github-gist-id-input');
    const btnCopyGistId = document.getElementById('btn-copy-gist-id');
    const btnGistUpload = document.getElementById('btn-gist-upload');
    const btnGistDownload = document.getElementById('btn-gist-download');
    const chkAutoSync = document.getElementById('chk-auto-sync');
    const btnExportFile = document.getElementById('btn-export-file');
    const btnImportTrigger = document.getElementById('btn-import-file-trigger');
    const inputImportFile = document.getElementById('input-import-file');

    // Nạp dữ liệu Token & Gist ID đã lưu
    const savedToken = localStorage.getItem('github_sync_token') || '';
    const savedGistId = localStorage.getItem('github_sync_gist_id') || '';
    if (tokenInput && savedToken) tokenInput.value = savedToken;
    if (gistIdInput && savedGistId) gistIdInput.value = savedGistId;

    // Nạp cài đặt Auto Sync
    const savedAutoSync = localStorage.getItem('auto_sync_enabled');
    if (chkAutoSync) {
        chkAutoSync.checked = savedAutoSync !== 'false';
        chkAutoSync.addEventListener('change', () => {
            localStorage.setItem('auto_sync_enabled', chkAutoSync.checked);
        });
    }

    // Sự kiện mở/đóng Modal
    if (btnOpenSync && modalSync) {
        btnOpenSync.addEventListener('click', () => {
            modalSync.classList.add('active');
            const lastSync = localStorage.getItem('last_synced_time');
            if (lastSync) {
                const dateStr = new Date(lastSync).toLocaleString('vi-VN');
                updateSyncStatusUI(`ℹ️ Lần đồng bộ gần nhất: ${dateStr}`, "loading");
            }
        });
    }

    if (btnCloseSync && modalSync) {
        btnCloseSync.addEventListener('click', () => modalSync.classList.remove('active'));
    }

    if (modalSync) {
        modalSync.addEventListener('click', (e) => {
            if (e.target === modalSync) modalSync.classList.remove('active');
        });
    }

    // Ẩn/Hiện Token
    if (btnToggleToken && tokenInput) {
        btnToggleToken.addEventListener('click', () => {
            if (tokenInput.type === 'password') {
                tokenInput.type = 'text';
                btnToggleToken.innerText = '🙈';
            } else {
                tokenInput.type = 'password';
                btnToggleToken.innerText = '👁️';
            }
        });
    }

    // Lưu Token khi thay đổi
    if (tokenInput) {
        tokenInput.addEventListener('input', () => {
            localStorage.setItem('github_sync_token', tokenInput.value.trim());
        });
    }

    // Lưu Gist ID khi thay đổi
    if (gistIdInput) {
        gistIdInput.addEventListener('input', () => {
            localStorage.setItem('github_sync_gist_id', gistIdInput.value.trim());
        });
    }

    // Sao chép Gist ID
    if (btnCopyGistId && gistIdInput) {
        btnCopyGistId.addEventListener('click', () => {
            const val = gistIdInput.value.trim();
            if (!val) {
                updateSyncStatusUI("⚠️ Chưa có Gist ID để sao chép!", "warning");
                return;
            }
            navigator.clipboard.writeText(val).then(() => {
                const originalText = btnCopyGistId.innerText;
                btnCopyGistId.innerText = '✅ Đã chép!';
                setTimeout(() => { btnCopyGistId.innerText = originalText; }, 2000);
            }).catch(() => {
                gistIdInput.select();
                document.execCommand('copy');
                btnCopyGistId.innerText = '✅ Đã chép!';
                setTimeout(() => { btnCopyGistId.innerText = '📋 Sao chép'; }, 2000);
            });
        });
    }

    // Nút Upload / Download Gist
    if (btnGistUpload) {
        btnGistUpload.addEventListener('click', () => uploadToGist(true));
    }
    if (btnGistDownload) {
        btnGistDownload.addEventListener('click', () => downloadFromGist(true));
    }

    // Nút Export / Import File
    if (btnExportFile) {
        btnExportFile.addEventListener('click', exportProgressFile);
    }
    if (btnImportTrigger && inputImportFile) {
        btnImportTrigger.addEventListener('click', () => inputImportFile.click());
        inputImportFile.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                importProgressFile(e.target.files[0]);
                inputImportFile.value = '';
            }
        });
    }

    // Tự động tải điểm mới nhất từ Gist khi khởi động (nếu đã có Token và Gist ID)
    if (savedToken && savedGistId) {
        downloadFromGist(false);
    }
}

// Khởi chạy hệ thống đồng bộ khi nạp trang
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSyncSystem);
} else {
    initSyncSystem();
}

