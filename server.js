const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const TARGETS_PATH = path.join(__dirname, 'targets.json');
const MAIL_CONFIG_PATH = path.join(__dirname, 'mail_config.json');

app.use(express.static('public'));
app.use(bodyParser.json());

let botProcess = null;

const MATCHED_HISTORY_FILE = path.join(__dirname, 'matched_history.json');

// --- Routes ---

// 0. Get/Save Mail Config
app.get('/api/mail-config', (req, res) => {
    if (fs.existsSync(MAIL_CONFIG_PATH)) {
        try {
            const data = fs.readFileSync(MAIL_CONFIG_PATH, 'utf8');
            res.json(JSON.parse(data));
        } catch (e) {
            res.status(500).json({ error: 'Failed to read mail config' });
        }
    } else {
        // Default
        res.json({ service: 'qq', user: '', pass: '', to: '' });
    }
});

app.post('/api/mail-config', (req, res) => {
    try {
        fs.writeFileSync(MAIL_CONFIG_PATH, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Matched History
app.get('/api/history', (req, res) => {
    if (fs.existsSync(MATCHED_HISTORY_FILE)) {
        try {
            const data = fs.readFileSync(MATCHED_HISTORY_FILE, 'utf8');
            res.json(JSON.parse(data));
        } catch (e) {
            console.error('Error reading matched_history.json:', e);
            res.status(500).json({ error: 'Failed to read matched history' });
        }
    } else {
        res.json({ date: new Date().toLocaleDateString(), items: [] });
    }
});

// 1. Get Targets
app.get('/api/targets', (req, res) => {
    try {
        if (fs.existsSync(TARGETS_PATH)) {
            const data = fs.readFileSync(TARGETS_PATH, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.json([]);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Update Targets
app.post('/api/targets', (req, res) => {
    try {
        const newTargets = req.body;
        if (!Array.isArray(newTargets)) {
            return res.status(400).json({ error: 'Data must be an array of strings.' });
        }
        fs.writeFileSync(TARGETS_PATH, JSON.stringify(newTargets, null, 2), 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Start Chrome
app.post('/api/start-chrome', (req, res) => {
    console.log('Starting Chrome Debug...');
    io.emit('log', '>>> 正在启动 Chrome 调试模式...');
    
    // 使用 PowerShell 启动脚本
    const ps = spawn('powershell.exe', [
        '-ExecutionPolicy', 'Bypass', 
        '-File', path.join(__dirname, 'start_debug_chrome.ps1')
    ]);

    ps.stdout.on('data', (data) => {
        const msg = data.toString();
        console.log(`Chrome: ${msg}`);
        io.emit('log', `Chrome: ${msg}`);
    });

    ps.stderr.on('data', (data) => {
        const msg = data.toString();
        console.error(`Chrome Err: ${msg}`);
        io.emit('log', `Chrome Err: ${msg}`);
    });

    ps.on('close', (code) => {
        console.log(`Chrome process exited with code ${code}`);
        io.emit('log', `Chrome 启动脚本已退出 (Code: ${code})。如果 Chrome 窗口已打开，则说明启动成功。`);
    });

    res.json({ success: true, message: 'Chrome start command issued.' });
});

// 4. Start Bot
app.post('/api/start-bot', (req, res) => {
    if (botProcess) {
        return res.status(400).json({ error: 'Bot is already running.' });
    }

    console.log('Starting Bot...');
    io.emit('log', '>>> 正在启动机器人脚本 (login_bot.js)...');
    io.emit('bot-status', 'running');

    botProcess = spawn('node', ['login_bot.js'], { cwd: __dirname });

    botProcess.stdout.on('data', (data) => {
        const msg = data.toString();
        process.stdout.write(msg); // Output to server console too
        io.emit('log', msg);

        // Check for JSON_DATA
        const lines = msg.split('\n');
        lines.forEach(line => {
            if (line.trim().startsWith('JSON_DATA:')) {
                try {
                    const jsonStr = line.trim().replace('JSON_DATA:', '');
                    const jsonData = JSON.parse(jsonStr);
                    if (jsonData.type === 'scraped_item') {
                        io.emit('latest-scrape', jsonData);
                    } else if (jsonData.type === 'new_round') {
                        io.emit('new-round', jsonData);
                    } else if (jsonData.type === 'matched_item') {
                        io.emit('matched-item', jsonData);
                    }
                } catch (e) {
                    console.error('Error parsing JSON_DATA:', e);
                }
            }
        });
    });

    botProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        process.stderr.write(msg);
        io.emit('log', `Error: ${msg}`);
    });

    botProcess.on('close', (code) => {
        console.log(`Bot process exited with code ${code}`);
        io.emit('log', `<<< 机器人脚本已停止 (Code: ${code})`);
        io.emit('bot-status', 'stopped');
        botProcess = null;
    });

    res.json({ success: true });
});

// 5. Stop Bot
app.post('/api/stop-bot', (req, res) => {
    if (botProcess) {
        io.emit('log', '>>> 正在停止机器人脚本...');
        botProcess.kill(); // Default SIGTERM
        botProcess = null;
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Bot is not running.' });
    }
});

// Socket.io connection
io.on('connection', (socket) => {
    console.log('Frontend connected');
    socket.emit('log', '已连接到后端服务器。');
    if (botProcess) {
        socket.emit('bot-status', 'running');
    } else {
        socket.emit('bot-status', 'stopped');
    }
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
