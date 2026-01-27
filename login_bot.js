const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const http = require('http');

const nodemailer = require('nodemailer');

puppeteer.use(StealthPlugin());

const COOKIES_PATH = path.join(__dirname, 'cookies.json');
const TARGETS_PATH = path.join(__dirname, 'targets.json');
const HISTORY_PATH = path.join(__dirname, 'matched_history.json');
const MAIL_CONFIG_PATH = path.join(__dirname, 'mail_config.json');
const USER_DATA_DIR = process.env.CHROME_USER_DATA_DIR || path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\User Data');
const TARGET_URL = 'https://jumpshop-online.com/account';
const EXECUTABLE_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ACCEPT_LANGUAGE = 'ja,en-US;q=0.9,en;q=0.8';

// --- 全局状态 ---
let lastRoundItems = new Map(); // Key: title, Value: caption
let lastEmailDate = '';

// --- 邮件发送函数 ---
async function sendEmail(currentItemsMap, newItems, matchedItemsList, isFirstRun) {
    if (!fs.existsSync(MAIL_CONFIG_PATH)) {
        console.log('未找到邮件配置文件，跳过邮件发送。');
        return;
    }
    
    let config;
    try {
        config = JSON.parse(fs.readFileSync(MAIL_CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.error('读取邮件配置失败:', e);
        return;
    }

    if (!config.pass) {
        console.log('邮件配置缺少授权码(pass)，跳过发送。');
        return;
    }

    const transporter = nodemailer.createTransport({
        service: config.service || 'qq',
        auth: {
            user: config.user,
            pass: config.pass
        }
    });

    // 构建邮件内容
    let htmlContent = `<h2>当前再贩列表 (总数: ${currentItemsMap.size})</h2><ul>`;
    
    // 1. 当前再贩列表 (标注新增)
    for (const [title, caption] of currentItemsMap) {
        // 如果是每日首次运行，则不标记 NEW；否则检查是否在 newItems 中
        const isNew = !isFirstRun && newItems.some(item => item.title === title);
        const style = isNew ? 'color: red; font-weight: bold;' : '';
        const tag = isNew ? ' [NEW]' : '';
        htmlContent += `<li style="${style}">【${caption}】${title}${tag}</li>`;
    }
    htmlContent += '</ul>';

    // 2. 今日已匹配
    htmlContent += '<h2>今日已匹配目标</h2><ul>';
    if (matchedItemsList.length > 0) {
        matchedItemsList.forEach(item => {
            let title, caption;
            if (typeof item === 'string') {
                title = item;
                caption = currentItemsMap.get(title) || '未知IP';
            } else {
                title = item.title;
                caption = item.caption || currentItemsMap.get(title) || '未知IP';
            }
            htmlContent += `<li><span style="color: green;">【${caption}】${title}</span></li>`;
        });
    } else {
        htmlContent += '<li>暂无匹配</li>';
    }
    htmlContent += '</ul>';

    const mailOptions = {
        from: config.user,
        to: config.to,
        subject: `JumpShop 再贩通知 - ${new Date().toLocaleString()}`,
        html: htmlContent
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('📧 邮件发送成功:', info.messageId);
    } catch (error) {
        console.error('❌ 邮件发送失败:', error);
    }
}

// --- 辅助函数 ---

function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_PATH)) {
            const data = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
            const today = getTodayDate();
            if (data.date === today) {
                const items = data.items || [];
                const titles = new Set();
                items.forEach(item => {
                    if (typeof item === 'string') titles.add(item);
                    else if (item && item.title) titles.add(item.title);
                });
                return titles;
            }
        }
    } catch (e) {
        console.error('读取历史记录失败:', e);
    }
    return new Set();
}

function saveHistory(item) {
    try {
        const today = getTodayDate();
        let currentItems = [];
        if (fs.existsSync(HISTORY_PATH)) {
            const data = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
            if (data.date === today) {
                currentItems = data.items || [];
            }
        }
        
        // item is { title, caption }
        // Check duplicates
        const exists = currentItems.some(i => i.title === item.title);
        if (!exists) {
            currentItems.push(item);
            fs.writeFileSync(HISTORY_PATH, JSON.stringify({
                date: today,
                items: currentItems
            }, null, 2));
        }
    } catch (e) {
        console.error('保存历史记录失败:', e);
    }
}

async function isElementVisible(el) {
    return await el.evaluate(e => {
        const style = window.getComputedStyle(e);
        return style.display !== 'none' && style.visibility !== 'hidden' && e.offsetParent !== null;
    });
}

// --- 核心逻辑 ---

async function executeAddToCart(page, title) {
    console.log('正在执行添加购物车流程...');
    
    // 1. 设置数量
    const quantityInputSelector = 'input[name="quantity"]';
    try {
       await page.waitForSelector(quantityInputSelector, { timeout: 10000 });
       const maxQuantity = await page.$eval(quantityInputSelector, el => el.max || 1);
       console.log(`检测到最大购买数量: ${maxQuantity}`);
       await page.$eval(quantityInputSelector, (el, max) => {
           el.value = max;
           el.dispatchEvent(new Event('input', { bubbles: true }));
           el.dispatchEvent(new Event('change', { bubbles: true }));
       }, maxQuantity);
       console.log(`已将购买数量设置为: ${maxQuantity}`);
    } catch (e) {
        console.log('未找到数量输入框，尝试直接添加...');
    }

   // 2. 点击加入购物车
   console.log('正在查找并点击"加入购物车"按钮...');
   const addToCartSelectors = [
       'button.product-form__submit[type="button"]',
       'button.product-form__submit:not([hidden])',
       '//button[contains(text(), "カートに追加")]',
       'button[name="add"]'
   ];
   let addToCartBtn = null;
   for (const selector of addToCartSelectors) {
       try {
           if (selector.startsWith('//')) {
               const [el] = await page.$$( 'xpath/' + selector);
               if (el && await el.evaluate(e => e.offsetParent !== null && !e.disabled)) {
                   addToCartBtn = el; break;
               }
           } else {
               const els = await page.$$(selector);
               for (const el of els) {
                   if (await el.evaluate(e => e.offsetParent !== null && !e.disabled && window.getComputedStyle(e).display !== 'none')) {
                       addToCartBtn = el; break;
                   }
               }
               if (addToCartBtn) break;
           }
       } catch (e) {}
   }

   if (addToCartBtn) {
       await addToCartBtn.evaluate(el => el.scrollIntoView({block: 'center'}));
       await new Promise(r => setTimeout(r, 500));
       try { await addToCartBtn.click(); } catch (e) { await addToCartBtn.evaluate(el => el.click()); }
       await new Promise(r => setTimeout(r, 2000));
       console.log('✅ 已点击加入购物车按钮。');
   } else {
       throw new Error('未找到可点击的"加入购物车"按钮');
   }
}

async function runScrapeTask(page) {
    // 1. 跳转到首页
    console.log('正在跳转到首页...');
    await page.goto('https://jumpshop-online.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ 已跳转到首页');

    // 2. 跳转到“再入荷アイテム”
    console.log('正在查找“再入荷アイテム”...');
    const restockLinkXPath = '//h2[contains(text(), "再入荷アイテム")]/following-sibling::a';
    try {
        const linkElement = await page.waitForSelector('xpath/' + restockLinkXPath, { timeout: 5000 });
        if (linkElement) {
            const href = await page.evaluate(el => el.href, linkElement);
            console.log(`找到链接地址: ${href}，准备跳转...`);
            if (href) {
                await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 60000 });
                console.log('✅ 已跳转到“再入荷アイテム”页面');
            } else {
                throw new Error('Link element has no href');
            }
        } else {
             throw new Error('Link element not found after wait');
        }
    } catch (e) {
        console.warn('“再入荷アイテム”链接查找失败，停止本轮爬取。', e.message);
        return;
    }

    // 加载目标清单
    let targets = [];
    try {
        if (fs.existsSync(TARGETS_PATH)) {
            targets = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf8'));
            console.log(`加载了 ${targets.length} 个目标商品。`);
        }
    } catch (err) {
        console.error('Error reading targets.json:', err);
    }

    // --- 爬取逻辑 ---
    console.log('--- 开始爬取商品信息 ---');
    console.log('JSON_DATA:' + JSON.stringify({ type: 'new_round' }));
    
    let hasNextPage = true;
    let pageCount = 1;
    const visitedUrls = new Set();
    visitedUrls.add(page.url());

    // 本轮收集的商品
    let currentRoundItems = new Map();

    while (hasNextPage) {
        console.log(`正在爬取第 ${pageCount} 页...`);
        
        try {
            await page.waitForSelector('.card-information__wrapper', { timeout: 5000 });
        } catch (e) {
            console.log('未检测到商品信息，可能是空页面或加载失败');
            break;
        }

        const products = await page.evaluate(() => {
            const items = [];
            const wrappers = document.querySelectorAll('.card-information__wrapper');
            wrappers.forEach(wrapper => {
                const captionEl = wrapper.querySelector('.caption-with-letter-spacing.light');
                const titleEl = wrapper.querySelector('.card-information__text.h5');
                if (captionEl && titleEl) {
                    const caption = captionEl.innerText.trim();
                    const title = titleEl.innerText.trim();
                    const linkEl = wrapper.closest('a');
                    const href = linkEl ? linkEl.href : '';
                    items.push({ caption, title, href });
                }
            });
            return items;
        });

        const matchedHistory = loadHistory();
        const currentListPageUrl = page.url();

        for (let i = 0; i < products.length; i++) {
            const p = products[i];
            
            // --- 发送结构化数据 ---
            const logData = {
                type: 'scraped_item',
                date: new Date().toLocaleString('zh-CN', { hour12: false }),
                caption: p.caption,
                title: p.title,
                is_target: targets.includes(p.title)
            };
            console.log('JSON_DATA:' + JSON.stringify(logData));
            // ---------------------

            console.log(`[P${pageCount}-${i + 1}] 【IP】：『${p.caption}』【商品名称】：『${p.title}』`);
            
            // 收集商品信息到本轮 Map
            currentRoundItems.set(p.title, p.caption);

            if (targets.includes(p.title)) {
                 console.log(`\n🎉 发现目标商品: ${p.title}`);
                 
                 // Emit matched item event
                 console.log('JSON_DATA:' + JSON.stringify({ type: 'matched_item', title: p.title, caption: p.caption }));

                 if (matchedHistory.has(p.title)) {
                     console.log('⚠️ 该商品今日已匹配过，跳过处理。');
                     continue;
                 }

                 if (p.href) {
                     console.log(`准备跳转到: ${p.href}`);
                     await page.goto(p.href, { waitUntil: 'domcontentloaded' });
                     
                     try {
                         await executeAddToCart(page, p.title);
                         saveHistory({ title: p.title, caption: p.caption });
                         console.log('📝 已记录到今日匹配历史。');
                         
                         console.log('⏳ 等待 5 秒...');
                         await new Promise(r => setTimeout(r, 5000));
                         
                         console.log('🔙 返回商品列表页...');
                         await page.goto(currentListPageUrl, { waitUntil: 'domcontentloaded' });
                         
                     } catch (cartErr) {
                         console.error('❌ 添加购物车流程出错:', cartErr);
                         try { await page.goto(currentListPageUrl, { waitUntil: 'domcontentloaded' }); } catch(e) {}
                     }
                 } else {
                     console.log('❌ 未找到该商品的链接，无法跳转。');
                 }
            }
        }

        // 下一页逻辑
        const nextButtonSelectors = [
            'a[aria-label="次のページ"]',
            '//a[@aria-label="次のページ"]',
            '//a[contains(text(), "次へ")]'
        ];
        let nextButton = null;
        for (const selector of nextButtonSelectors) {
             try {
                if (selector.startsWith('//')) {
                    const [el] = await page.$$( 'xpath/' + selector);
                    if (el && await isElementVisible(el)) { nextButton = el; break; }
                } else {
                    const el = await page.$(selector);
                    if (el && await isElementVisible(el)) { nextButton = el; break; }
                }
            } catch (e) {}
        }

        if (nextButton) {
            console.log('找到下一页按钮，准备跳转...');
            const nextUrl = await page.evaluate(el => el.href, nextButton);
            if (nextUrl && !visitedUrls.has(nextUrl) && nextUrl !== page.url()) {
                await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                visitedUrls.add(nextUrl);
                pageCount++;
                await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
            } else {
                 console.log('下一页 URL 无效或已访问，停止爬取。');
                 hasNextPage = false;
            }
        } else {
            console.log('未找到下一页按钮，本轮爬取结束。');
            hasNextPage = false;
        }
    }

    // --- 邮件发送逻辑 ---
    try {
        const today = getTodayDate();
        const isFirstRun = lastEmailDate !== today;
        
        // 找出新增项
        const newItems = [];
        for (const [title, caption] of currentRoundItems) {
            if (!lastRoundItems.has(title)) {
                newItems.push({ title, caption });
            }
        }

        console.log(`本轮统计: 总数 ${currentRoundItems.size}, 新增 ${newItems.length}, 每日首次: ${isFirstRun}`);

        if (isFirstRun || newItems.length > 0) {
            console.log('准备发送邮件通知...');
            
            // 获取今日匹配历史
            let matchedItems = [];
            try {
                if (fs.existsSync(HISTORY_PATH)) {
                    const hData = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
                    if (hData.date === today) {
                        matchedItems = hData.items || [];
                    }
                }
            } catch (e) { console.error('读取历史出错', e); }

            await sendEmail(currentRoundItems, newItems, matchedItems, isFirstRun);
            
            lastEmailDate = today;
        } else {
            console.log('无新增商品且非每日首次，跳过发送邮件。');
        }

        // 更新上一轮数据
        lastRoundItems = currentRoundItems;

    } catch (mailErr) {
        console.error('邮件逻辑执行出错:', mailErr);
    }
}

// --- Main ---

(async () => {
    let browser;
    try {
        console.log('尝试连接已运行的 Chrome...');
        for (let i = 0; i < 5; i++) {
            try {
                await new Promise((resolve, reject) => {
                    const req = http.get('http://127.0.0.1:9223/json/version', (res) => {
                        if (res.statusCode === 200) resolve();
                        else reject(new Error('Status code: ' + res.statusCode));
                    });
                    req.on('error', reject);
                    req.end();
                });

                browser = await puppeteer.connect({
                    browserURL: 'http://127.0.0.1:9223',
                    defaultViewport: null
                });
                console.log('✅ 成功连接到现有 Chrome！');
                break;
            } catch (err) {
                if (i === 4) throw err;
                console.log(`连接尝试 ${i + 1}/5 失败，1秒后重试...`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    } catch (e) {
        console.log('❌ 连接 Chrome 失败。请先运行 start_debug_chrome.ps1');
        return; // 必须连接到 Chrome 才能继续
    }

    const pages = await browser.pages();
    let page = pages.length > 0 ? pages[0] : await browser.newPage();
    
    // 验证页面是否可用
    try {
        await page.evaluate(() => 1);
    } catch (e) {
        console.log('⚠️ 初始页面不可用，正在创建新页面...');
        page = await browser.newPage();
    }

    await page.setExtraHTTPHeaders({ 'Accept-Language': ACCEPT_LANGUAGE });

    // 1. Load cookies
    if (fs.existsSync(COOKIES_PATH)) {
        console.log('检测到本地 Cookie，正在加载...');
        try {
            const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
            if (cookies.length > 0) {
                await page.setCookie(...cookies);
                console.log('Cookie 加载完成');
            }
        } catch (error) { 
            console.error('Cookie 加载失败:', error);
            // 如果是因为页面关闭导致的错误，尝试恢复
            if (error.message && (error.message.includes('Target closed') || error.message.includes('Protocol error'))) {
                console.log('⚠️ 页面连接已断开，正在重新创建页面并重试...');
                try {
                    // 尝试创建新页面
                    page = await browser.newPage();
                    await page.setExtraHTTPHeaders({ 'Accept-Language': ACCEPT_LANGUAGE });
                    
                    // 重试加载 Cookie
                    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH));
                    if (cookies.length > 0) {
                        await page.setCookie(...cookies);
                        console.log('Cookie 重新加载完成');
                    }
                } catch (retryError) {
                    console.error('Cookie 重试加载失败，将继续以无 Cookie 模式运行:', retryError);
                }
            }
        }
    }

    console.log('等待用户操作，请手动访问目标网站并登录...');
    while (true) {
        let isLoggedIn = false;
        try {
            isLoggedIn = await page.evaluate(() => {
                const href = window.location.href;
                const url = new URL(href);
                if (!url.hostname.includes('jumpshop-online.com')) return false;
                const text = document.body ? document.body.innerText : '';
                const hasError = text.includes('Captcha failed') || text.includes('問題が発生しました');
                if (url.pathname === '/account' && !hasError) return true;
                if (text.includes('ログアウト') && !url.pathname.includes('/login')) return true;
                return false;
            });
        } catch (err) {}

        if (isLoggedIn) {
            console.log('✅ 检测到已登录状态！');
            console.log(`当前 URL: ${page.url()}`);
            const cookies = await page.cookies();
            fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
            console.log(`💾 Cookie 已更新至: ${COOKIES_PATH}`);
            break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    // --- 主循环 ---
    while (true) {
        try {
            console.log('\n--- 开始新一轮任务循环 ---');
            await runScrapeTask(page);
            console.log('✅ 本轮任务结束。');
            console.log('⏳ 1分钟后开始下一轮...');
            
            // 简单的倒计时日志
            for(let m=1; m>0; m--) {
                await new Promise(r => setTimeout(r, 60 * 1000));
            }

        } catch (err) {
            console.error('❌ 本轮循环发生错误:', err);
            await new Promise(r => setTimeout(r, 60 * 1000));
        }
    }

})().catch(err => {
    console.error('Fatal error:', err);
});
