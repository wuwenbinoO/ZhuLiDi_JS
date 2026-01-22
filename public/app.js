const socket = io();
const logContainer = document.getElementById('log-container');
const btnChrome = document.getElementById('btn-chrome');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const configEditor = document.getElementById('config-editor');
const btnSave = document.getElementById('btn-save');
const botStatusIndicator = document.getElementById('bot-status-indicator');
const botStatusText = document.getElementById('bot-status-text');

// --- Scrape Info Handling ---
const scrapeTime = document.getElementById('scrape-time');
const scrapeTitle = document.getElementById('scrape-title');
const scrapeCaption = document.getElementById('scrape-caption');
const scrapeIsTarget = document.getElementById('scrape-is-target');
const matchedTargetsList = document.getElementById('matched-targets-list');

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
    scrapeTime.textContent = data.date;
    scrapeTitle.textContent = data.title;
    scrapeCaption.textContent = data.caption;
    
    if (data.is_target) {
        scrapeIsTarget.textContent = '是';
        scrapeIsTarget.style.color = 'green';
        scrapeIsTarget.style.fontWeight = 'bold';
        
        // Add to list if target
        if (matchedTargetsList.querySelector('li').textContent === '暂无匹配') {
            matchedTargetsList.innerHTML = '';
        }
        
        // Check for duplicates in the visual list (optional, but good for UI)
        // Since we want to show "results", maybe duplicates are fine if they are re-scraped?
        // But the user said "today's matched items", usually unique items.
        // However, matched_history.json prevents duplicate processing, so `is_target` might be true,
        // but it might be skipped by logic.
        // Wait, `login_bot.js` logic:
        // If matched and not in history -> add to history -> log.
        // If matched and in history -> log?
        // Let's assume we just log what the bot says is a target.
        
        const li = document.createElement('li');
        li.textContent = `[${data.date.split(' ')[1]}] ${data.title}`;
        li.style.color = 'green';
        li.style.fontWeight = 'bold';
        matchedTargetsList.prepend(li); // Newest on top? Or append? User said "result", usually list. Let's prepend.
        
    } else {
        scrapeIsTarget.textContent = '否';
        scrapeIsTarget.style.color = '#666';
        scrapeIsTarget.style.fontWeight = 'normal';
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
