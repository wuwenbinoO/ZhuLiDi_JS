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
fetch('/api/history')
    .then(res => res.json())
    .then(data => {
        if (data && data.items && data.items.length > 0) {
            matchedTargetsList.innerHTML = ''; // Clear default message
            data.items.forEach(title => {
                const li = document.createElement('li');
                li.textContent = `[历史] ${title}`;
                matchedTargetsList.appendChild(li);
            });
        }
    })
    .catch(err => console.error('Failed to load history:', err));

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
        
        const matchedLi = document.createElement('li');
        matchedLi.textContent = `[${data.date.split(' ')[1]}] ${data.title}`;
        matchedLi.style.color = 'green';
        matchedLi.style.fontWeight = 'bold';
        matchedTargetsList.prepend(matchedLi); 
    }
});

// --- Log Handling ---
socket.on('log', (msg) => {
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
    
    try {
        const res = await fetch('/api/targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });
        const result = await res.json();
        if (result.success) {
            alert('配置已保存！');
        } else {
            alert('保存失败: ' + result.error);
        }
    } catch (e) {
        alert('保存出错: ' + e.message);
    }
});

// Initial Load
loadConfig();
