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

                vocabData = vocabData.concat(data.map((item, index) => ({
                    ...item,
                    originalIndex: index,
                    displayIndex: globalIndexCount++,
                    sourceId: sourceId,
                    sourceName: cb.dataset.name,
                    score: scores[index] !== undefined ? scores[index] : 0
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
    vocabData.forEach(w => {
        if (!progress[w.sourceId]) progress[w.sourceId] = {};
        progress[w.sourceId][w.originalIndex] = w.score;
    });
    for (let sourceId in progress) {
        localStorage.setItem('vocabProgress_' + sourceId, JSON.stringify(progress[sourceId]));
    }
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
    const orderMode = orderModeEl ? orderModeEl.value : 'random';
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
    const orderMode = document.getElementById('select-order-mode') ? document.getElementById('select-order-mode').value : 'random';
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
    const ttsBtnHtml = `<button class="btn-tts" title="Nghe phát âm (Phím S)" onclick="event.stopPropagation(); speakCurrentWord();">🔊 Nghe</button>`;

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

    saveProgress();
    renderList();
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
    if(!currentWord) return;
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
    isAnimating = false; // Kết thúc hoạt ảnh
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
    lastTouchTime = Date.now();
    startDrag(e.touches[0].clientX);
}, {passive: true});
flashcard.addEventListener('touchmove', e => {
    moveDrag(e.touches[0].clientX);
}, {passive: true});
flashcard.addEventListener('touchend', e => {
    endDrag(e.changedTouches[0].clientX);
});

// Sự kiện kéo (Desktop)
flashcard.addEventListener('mousedown', e => {
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
    // Chỉ kích hoạt phím tắt khi đang ở màn hình học từ vựng
    if (!viewLearn.classList.contains('active-view')) return;
    
    if (e.key === 'ArrowLeft') {
        animateAndHandleAction(-1);
    } else if (e.key === 'ArrowRight') {
        animateAndHandleAction(1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault(); // Tránh cuộn trang
        flashcard.classList.toggle('is-flipped');
    } else if (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'v') {
        speakCurrentWord();
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

    if(confirm(`Bạn có chắc chắn muốn đặt lại điểm của ${targetWords.length} thẻ đang hiển thị về 0?`)) {
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
        let scoreColor = '#333';
        let bgColor = 'transparent';
        
        // Cường độ màu tăng dần từ điểm 1 đến điểm 10 (tối đa độ đậm ở mức điểm 10)
        if (word.score > 0) {
            let alpha = Math.min(word.score * 0.1, 1);
            bgColor = `rgba(46, 125, 50, ${alpha})`;
            scoreColor = alpha >= 0.5 ? '#fff' : '#1b5e20'; // Đổi màu chữ trắng nếu nền quá đậm
        } else if (word.score < 0) {
            let alpha = Math.min(Math.abs(word.score) * 0.1, 1);
            bgColor = `rgba(211, 47, 47, ${alpha})`;
            scoreColor = alpha >= 0.5 ? '#fff' : '#b71c1c';
        }

        const hasKanji = word.kanji && word.kanji.trim() !== '';
        const mainJa = hasKanji ? word.kanji : word.name;
        const subKana = hasKanji ? `<div style="color: #007bff; font-size: 0.88rem; margin-top: 2px;">${word.name.split('_').join(' ')}</div>` : '';
        const speechText = (word.kanji || word.name).replace(/'/g, "\\'");

        const tr = document.createElement('tr');
        tr.id = `row-word-${word.displayIndex}`;
        tr.innerHTML = `
            <td style="text-align:center;">${word.displayIndex + 1}</td>
            <td>
                <div style="font-weight: bold; font-size: 1.05rem; display: flex; align-items: center; gap: 6px;">
                    <span>${mainJa.split('_').join('<br>')}</span>
                    <button style="border:none; background:transparent; cursor:pointer; font-size:1.05rem; padding:0 4px; border-radius:4px;" title="Nghe phát âm" onclick="speakJapanese('${speechText}')">🔊</button>
                </div>
                ${subKana}
            </td>
            <td>${word.mean}</td>
            <td><span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem;">${word.sourceName}</span></td>
            <td style="text-align:center; font-weight:bold; color:${scoreColor}; background-color:${bgColor}; transition: background-color 0.3s;">${word.score}</td>
        `;
        tbody.appendChild(tr);
    });
}
