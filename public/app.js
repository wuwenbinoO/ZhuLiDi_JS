const socket = io();
const logContainer = document.getElementById('log-container');
const btnChrome = document.getElementById('btn-chrome');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const configEditor = document.getElementById('config-editor');
const btnSave = document.getElementById('btn-save');
const botStatusIndicator = document.getElementById('bot-status-indicator');
const botStatusText = document.getElementById('bot-status-text');

// Scrape Info Elements
const latestScrapeTimeHeader = document.getElementById('latest-scrape-time-header');
const scrapedItemsList = document.getElementById('scraped-items-list');
const matchedTargetsList = document.getElementById('matched-targets-list');
const scrapeCountEl = document.getElementById('scrape-count');
let totalScrapedCount = 0;

// Load history on startup
// fetch('/api/history')
//     .then(res => res.json())
//     .then(data => {
//         if (data && data.items && data.items.length > 0) {
//             matchedTargetsList.innerHTML = ''; // Clear default message
//             data.items.forEach(title => {
//                 const li = document.createElement('li');
//                 li.textContent = `[历史] ${title}`;
//                 matchedTargetsList.appendChild(li);
//             });
//         }
//     })
//     .catch(err => console.error('Failed to load history:', err));

function startNewRound() {
    // Clear Scraped Items List
    scrapedItemsList.innerHTML = '<li style="color: #999; padding: 5px 0;">等待数据...</li>';
    totalScrapedCount = 0;
    if (scrapeCountEl) scrapeCountEl.textContent = totalScrapedCount;
}

socket.on('new-round', () => {
    startNewRound();
    
    // Log
    const div = document.createElement('div');
    div.textContent = `[${new Date().toLocaleTimeString()}] --- 新一轮数据开始 ---`;
    div.style.color = '#888';
    div.style.fontStyle = 'italic';
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
});

socket.on('latest-scrape', (data) => {
    // Update Header Time
    latestScrapeTimeHeader.textContent = `(${data.date})`;

    // Update Count
    totalScrapedCount++;
    if (scrapeCountEl) scrapeCountEl.textContent = totalScrapedCount;

    // Update Scraped Items List
    if (scrapedItemsList.firstChild && scrapedItemsList.firstChild.textContent === '等待数据...') {
        scrapedItemsList.innerHTML = '';
    }

    const li = document.createElement('li');
    li.style.padding = '5px 0';
    li.style.borderBottom = '1px dashed #eee';
    li.style.fontSize = '0.9rem';

    const targetBadge = data.is_target 
        ? '<span style="color: white; background: green; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-right: 5px;">目标</span>' 
        : '';
    
    // Display Format: [Series] Product Name
    li.innerHTML = `${targetBadge}<span style="color: #666; margin-right: 5px;">[${data.caption}]</span><span style="color: #333;">${data.title}</span>`;
    
    // Prepend to show newest on top
    scrapedItemsList.prepend(li);
    
    if (data.is_target) {
        // Add to matched list if target
        if (matchedTargetsList.querySelector('li') && matchedTargetsList.querySelector('li').textContent === '暂无匹配') {
            matchedTargetsList.innerHTML = '';
        }

        // Check for duplicates
        const existingItems = Array.from(matchedTargetsList.querySelectorAll('li'));
        const isDuplicate = existingItems.some(item => {
            // item.textContent format: "[10:00:11] Product Title"
            // We want to match the "Product Title" part
            const text = item.textContent;
            const match = text.match(/^\[.*?\]\s+(.*)$/);
            return match && match[1] === data.title;
        });
        
        if (!isDuplicate) {
            const matchedLi = document.createElement('li');
            matchedLi.textContent = `[${data.date.split(' ')[1]}] ${data.title}`;
            matchedLi.style.color = 'green';
            matchedLi.style.fontWeight = 'bold';
            matchedTargetsList.prepend(matchedLi); 
        }
    }
});

// --- Log Handling ---
socket.on('log', (msg) => {
    // Fallback: Check for start of new round via log message (if server.js wasn't restarted)
    if (typeof msg === 'string' && msg.includes('--- 开始爬取商品信息 ---')) {
        startNewRound();
    }

    const div = document.createElement('div');
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
});

// --- Status Handling ---
socket.on('bot-status', (status) => {
    updateStatus(status);
});

function updateStatus(status) {
    if (status === 'running') {
        botStatusIndicator.className = 'status-indicator status-running';
        botStatusText.textContent = '运行中';
        btnStart.disabled = true;
        btnStop.disabled = false;
    } else {
        botStatusIndicator.className = 'status-indicator status-stopped';
        botStatusText.textContent = '未运行';
        btnStart.disabled = false;
        btnStop.disabled = true;
    }
}

// --- API Calls ---

// Start Chrome
btnChrome.addEventListener('click', async () => {
    try {
        await fetch('/api/start-chrome', { method: 'POST' });
    } catch (e) {
        alert('Failed to start Chrome: ' + e.message);
    }
});

// Start Bot
btnStart.addEventListener('click', async () => {
    try {
        await fetch('/api/start-bot', { method: 'POST' });
    } catch (e) {
        alert('Failed to start Bot: ' + e.message);
    }
});

// Stop Bot
btnStop.addEventListener('click', async () => {
    try {
        await fetch('/api/stop-bot', { method: 'POST' });
    } catch (e) {
        alert('Failed to stop Bot: ' + e.message);
    }
});

// Load Config
async function loadConfig() {
    try {
        const res = await fetch('/api/targets');
        const data = await res.json();
        if (Array.isArray(data)) {
            configEditor.value = data.join('\n');
        }
    } catch (e) {
        console.error('Failed to load config', e);
    }
}

// Save Config
btnSave.addEventListener('click', async () => {
    const text = configEditor.value;
    const items = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    const statusEl = document.getElementById('save-status');
    
    try {
        const res = await fetch('/api/targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });
        const result = await res.json();
        if (result.success) {
            statusEl.textContent = '✅ 配置已保存！';
            statusEl.style.color = 'green';
            statusEl.style.opacity = 1;
            setTimeout(() => { statusEl.style.opacity = 0; }, 2000);
        } else {
            statusEl.textContent = '❌ 保存失败: ' + result.error;
            statusEl.style.color = 'red';
            statusEl.style.opacity = 1;
        }
    } catch (e) {
        statusEl.textContent = '❌ 保存出错: ' + e.message;
        statusEl.style.color = 'red';
        statusEl.style.opacity = 1;
    }
});

// Initial Load
loadConfig();

// --- Mail Config ---
const mailServiceEl = document.getElementById('mail-service');
const mailUserEl = document.getElementById('mail-user');
const mailPassEl = document.getElementById('mail-pass');
const mailToEl = document.getElementById('mail-to');
const btnSaveMail = document.getElementById('btn-save-mail');
const mailSaveStatus = document.getElementById('mail-save-status');

async function loadMailConfig() {
    try {
        const res = await fetch('/api/mail-config');
        const data = await res.json();
        if (data) {
            mailServiceEl.value = data.service || 'qq';
            mailUserEl.value = data.user || '';
            mailPassEl.value = data.pass || '';
            mailToEl.value = data.to || '';

            // If configured (has user), collapse by default to save space
            if (data.user) {
                toggleMailConfig(false);
            }
        }
    } catch (e) {
        console.error('Failed to load mail config', e);
    }
}

// Toggle Mail Config
window.toggleMailConfig = function(forceState) {
    const content = document.getElementById('mail-config-content');
    const icon = document.getElementById('mail-config-toggle-icon');
    
    if (!content || !icon) return;

    const isHidden = content.style.display === 'none';
    // If forceState is provided, use it (true=show, false=hide). Otherwise toggle.
    const shouldShow = forceState !== undefined ? forceState : isHidden;
    
    if (shouldShow) {
        content.style.display = 'block';
        icon.style.transform = 'rotate(0deg)';
    } else {
        content.style.display = 'none';
        icon.style.transform = 'rotate(-90deg)';
    }
};

btnSaveMail.addEventListener('click', async () => {
    const config = {
        service: mailServiceEl.value.trim(),
        user: mailUserEl.value.trim(),
        pass: mailPassEl.value.trim(),
        to: mailToEl.value.trim()
    };
    
    try {
        const res = await fetch('/api/mail-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const result = await res.json();
        if (result.success) {
            mailSaveStatus.textContent = '✅ 配置已保存！';
            mailSaveStatus.style.color = 'green';
            mailSaveStatus.style.opacity = 1;
            setTimeout(() => { mailSaveStatus.style.opacity = 0; }, 2000);
        } else {
            mailSaveStatus.textContent = '❌ 保存失败: ' + result.error;
            mailSaveStatus.style.color = 'red';
            mailSaveStatus.style.opacity = 1;
        }
    } catch (e) {
        mailSaveStatus.textContent = '❌ 保存出错: ' + e.message;
        mailSaveStatus.style.color = 'red';
        mailSaveStatus.style.opacity = 1;
    }
});

loadMailConfig();
