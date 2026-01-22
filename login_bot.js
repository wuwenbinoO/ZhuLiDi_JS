const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const http = require('http');

puppeteer.use(StealthPlugin());

const COOKIES_PATH = path.join(__dirname, 'cookies.json');
const TARGETS_PATH = path.join(__dirname, 'targets.json');
const HISTORY_PATH = path.join(__dirname, 'matched_history.json');
// 修改：默认尝试使用本地 Chrome 的 User Data 目录（需要用户确认路径是否正确）
// 注意：userDataDir 需要指向 "User Data" 这一层，而不是 "User Data\Default"
// Puppeteer 会自己找 Default 或者你指定的 Profile
const USER_DATA_DIR = process.env.CHROME_USER_DATA_DIR || path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\User Data');
const TARGET_URL = 'https://jumpshop-online.com/account';
const EXECUTABLE_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ACCEPT_LANGUAGE = 'ja,en-US;q=0.9,en;q=0.8';

function randomDelay(minMs, maxMs) {
    const delay = minMs + Math.random() * (maxMs - minMs);
    return new Promise((resolve) => setTimeout(resolve, delay));
}

// 历史记录管理
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
                return new Set(data.items || []);
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
        let currentItems = new Set();
        
        // 读取现有
        if (fs.existsSync(HISTORY_PATH)) {
            const data = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
            if (data.date === today) {
                currentItems = new Set(data.items || []);
            }
        }
        
        currentItems.add(item);
        
        fs.writeFileSync(HISTORY_PATH, JSON.stringify({
            date: today,
            items: Array.from(currentItems)
        }, null, 2));
    } catch (e) {
        console.error('保存历史记录失败:', e);
    }
}

(async () => {
    let browser;
    try {
        // 尝试连接已打开的 Chrome 调试端口（需先手动启动 Chrome）
        // 启动命令: "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\Users\许先生\AppData\Local\Google\Chrome\User Data"
        console.log('尝试连接已运行的 Chrome...');
        // 增加重试机制，等待 Chrome 调试接口就绪
        for (let i = 0; i < 5; i++) {
            try {
                // 使用原生 http 模块检测端口，兼容性更好
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
        console.log('❌ 连接已运行的 Chrome 失败。');
        console.log('原因:', e.message);
        console.log('提示：请先运行 start_debug_chrome.ps1 来启动浏览器。');
        console.log('正在尝试启动新实例（如果上一步失败，这一步通常也会失败，因为文件被占用）...');
        console.log('启动浏览器...');
        browser = await puppeteer.launch({
            headless: false,
            executablePath: EXECUTABLE_PATH,
            userDataDir: USER_DATA_DIR,
            defaultViewport: {
                width: 1366,
                height: 768
            },
            args: [
                '--start-maximized',
                '--no-default-browser-check',
                '--disable-default-apps', 
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process', 
                '--profile-directory=Default' 
            ],
            ignoreDefaultArgs: ['--enable-automation'] 
        });
    }

    // const page = await browser.newPage(); // 连接模式下通常不需要新建页面，而是获取当前页面
    // 但为了逻辑统一，我们获取当前所有页面，取第一个或新建
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    
    // 应用 Stealth 后，仍建议设置 UA 和语言
    // await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({
        'Accept-Language': ACCEPT_LANGUAGE
    });

    // 1. Load cookies if they exist
    if (fs.existsSync(COOKIES_PATH)) {
        console.log('检测到本地 Cookie，正在加载...');
        try {
            const cookiesString = fs.readFileSync(COOKIES_PATH);
            const cookies = JSON.parse(cookiesString);
            if (cookies.length > 0) {
                await page.setCookie(...cookies);
                console.log('Cookie 加载完成');
            }
        } catch (error) {
            console.error('Cookie 加载失败:', error);
        }
    } else {
        console.log('未检测到本地 Cookie，将进行首次登录');
    }

    // 增加：先访问主页，积累信任度，避免直接访问登录页被风控
    // console.log('正在预热浏览器（访问主页）...');
    // await page.goto('https://jumpshop-online.com/', { waitUntil: 'networkidle2' });
    // await randomDelay(1500, 3000);

    // console.log(`正在访问: ${TARGET_URL}`);
    // await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

    console.log('等待用户操作，请手动访问目标网站并登录...');

    // 循环检测登录状态
    while (true) {
        let isLoggedIn = false;
        try {
            isLoggedIn = await page.evaluate(() => {
                const href = window.location.href;
                let url;
                try {
                    url = new URL(href);
                } catch (e) {
                    return false;
                }
                const path = url.pathname || '';
                const hostname = url.hostname || '';
                
                // 必须在目标域名下
                if (!hostname.includes('jumpshop-online.com')) return false;

                // const search = url.search || ''; // 未使用
                const text = document.body ? document.body.innerText : '';

                const hasError =
                    text.includes('Captcha failed') ||
                    text.includes('問題が発生しました') ||
                    text.includes('エラーが発生しました');

                // 宽松检测：路径为 /account 且无错误，或者页面包含“ログアウト”
                if (path === '/account' && !hasError) return true;
                if (text.includes('ログアウト') && !path.includes('/login')) return true;

                return false;
            });
        } catch (err) {
            // 忽略页面跳转导致的执行上下文销毁错误，等待下一次检测
            if (!err.message.includes('Execution context was destroyed')) {
                console.log('检测中发生轻微错误（通常可忽略）:', err.message);
            }
        }

        if (isLoggedIn) {
            console.log('✅ 检测到已登录状态！');
            const currentUrl = page.url();
            console.log(`当前 URL: ${currentUrl}`);
            
            // 保存最新的 Cookie
            const cookies = await page.cookies();
            fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
            console.log(`💾 Cookie 已更新至: ${COOKIES_PATH}`);
            
            break; // 退出循环
        }

        // 等待一秒后再次检测
        await new Promise(r => setTimeout(r, 1000));
    }

    // --- 导航逻辑开始 ---
    try {
        // 1. 跳转到首页
        console.log('正在跳转到首页...');
        // 直接跳转，比点击更稳定
        await page.goto('https://jumpshop-online.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('✅ 已跳转到首页');

        /* 原点击逻辑备份
        // 等待 "ホーム" (Home) 链接出现
        const homeSelector = 'a[href="/"].header__menu-item';
        try {
            console.log(`等待选择器: ${homeSelector}`);
            await page.waitForSelector(homeSelector, { timeout: 5000 });
            console.log('找到首页链接，准备点击...');
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
                page.click(homeSelector)
            ]);
        } catch (e) {
            console.warn('首页链接点击失败或超时，尝试直接跳转...', e.message);
            await page.goto('https://jumpshop-online.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        }
        */

        // 2. 查找并跳转到“再入荷アイテム” (Restocked Items)
        console.log('正在查找“再入荷アイテム”...');
        // 使用 XPath 查找包含 "再入荷アイテム" 标题下方的链接
        const restockLinkXPath = '//h2[contains(text(), "再入荷アイテム")]/following-sibling::a';
        try {
            const linkElement = await page.waitForSelector('xpath/' + restockLinkXPath, { timeout: 5000 });
            
            if (linkElement) {
                // 获取链接地址直接跳转，避免点击失败
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
            console.warn('“再入荷アイテム”链接点击失败，尝试直接跳转...', e.message);
            // 这里我们不知道具体的 URL，只能打印错误
            // 如果知道 URL 可以 goto，例如 /collections/restock
             console.error('❌ 无法自动跳转到再入荷页面，请手动检查。');
        }
        console.log(`当前最终 URL: ${page.url()}`);

        // 加载目标清单
        let targets = [];
        try {
            if (fs.existsSync(TARGETS_PATH)) {
                targets = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf8'));
                console.log(`加载了 ${targets.length} 个目标商品。`);
            } else {
                console.log('未找到 targets.json，将只进行爬取。');
            }
        } catch (err) {
            console.error('Error reading targets.json:', err);
        }

        // --- 爬取逻辑开始 ---
        console.log('--- 开始爬取商品信息 ---');
        
        let hasNextPage = true;
        let pageCount = 1;
        const allProducts = [];
        const visitedUrls = new Set();
        visitedUrls.add(page.url());

        while (hasNextPage) {
            console.log(`正在爬取第 ${pageCount} 页...`);
            
            // 等待商品列表加载
            try {
                await page.waitForSelector('.card-information__wrapper', { timeout: 5000 });
            } catch (e) {
                console.log('未检测到商品信息，可能是空页面或加载失败');
                break;
            }

            // 爬取当前页数据
            const products = await page.evaluate(() => {
                const items = [];
                const wrappers = document.querySelectorAll('.card-information__wrapper');
                
                wrappers.forEach(wrapper => {
                    const captionEl = wrapper.querySelector('.caption-with-letter-spacing.light');
                    const titleEl = wrapper.querySelector('.card-information__text.h5');
                    
                    if (captionEl && titleEl) {
                        const caption = captionEl.innerText.trim();
                        const title = titleEl.innerText.trim();
                        // 获取链接: 向上查找最近的 a 标签
                        const linkEl = wrapper.closest('a');
                        const href = linkEl ? linkEl.href : '';
                        items.push({ caption, title, href });
                    }
                });
                return items;
            });

            // 打印当前页数据并检查匹配
            // 加载今日历史记录
            const matchedHistory = loadHistory();
            const currentListPageUrl = page.url();

            let foundTarget = false;
            for (let i = 0; i < products.length; i++) {
                const p = products[i];
                console.log(`[P${pageCount}-${i + 1}] 【IP】：『${p.caption}』【商品名称】：『${p.title}』`);
                
                if (targets.includes(p.title)) {
                     console.log(`\n🎉 发现目标商品: ${p.title}`);
                     
                     if (matchedHistory.has(p.title)) {
                         console.log('⚠️ 该商品今日已匹配过，跳过处理。');
                         continue;
                     }

                     if (p.href) {
                         console.log(`准备跳转到: ${p.href}`);
                         await page.goto(p.href, { waitUntil: 'domcontentloaded' });
                         console.log('✅ 已跳转到商品详情页。');

                         // --- 添加购物车逻辑 ---
                         try {
                             console.log('正在执行添加购物车流程...');
                             
                             // 1. 等待并获取数量输入框
                             const quantityInputSelector = 'input[name="quantity"]';
                             await page.waitForSelector(quantityInputSelector, { timeout: 10000 });
                             
                             // 获取最大购买数量
                             const maxQuantity = await page.$eval(quantityInputSelector, el => el.max || 1);
                             console.log(`检测到最大购买数量: ${maxQuantity}`);
                             
                             // 修改数量为最大值
                             await page.$eval(quantityInputSelector, (el, max) => {
                                 el.value = max;
                                 el.dispatchEvent(new Event('input', { bubbles: true }));
                                 el.dispatchEvent(new Event('change', { bubbles: true }));
                             }, maxQuantity);
                             console.log(`已将购买数量设置为: ${maxQuantity}`);
                             
                            // 2. 点击加入购物车按钮
                            console.log('正在查找并点击"加入购物车"按钮...');
                            
                            // 尝试找到可见的“加入购物车”按钮
                            // 页面上可能存在隐藏的 submit 按钮，导致 Puppeteer 尝试点击隐藏元素而报错
                            const addToCartSelectors = [
                                'button.product-form__submit[type="button"]', // 显式 type="button" 的可见按钮
                                'button.product-form__submit:not([hidden])',  // 没有 hidden 属性的按钮
                                '//button[contains(text(), "カートに追加")]',   // 根据文本查找
                                'button[name="add"]' // 最后的备选
                            ];

                            let addToCartBtn = null;
                            for (const selector of addToCartSelectors) {
                                try {
                                    if (selector.startsWith('//')) {
                                        const [el] = await page.$$( 'xpath/' + selector);
                                        if (el && await el.evaluate(e => e.offsetParent !== null && !e.disabled)) {
                                            addToCartBtn = el;
                                            console.log(`找到加入购物车按钮: ${selector}`);
                                            break;
                                        }
                                    } else {
                                        const els = await page.$$(selector);
                                        for (const el of els) {
                                            if (await el.evaluate(e => e.offsetParent !== null && !e.disabled && window.getComputedStyle(e).display !== 'none')) {
                                                addToCartBtn = el;
                                                console.log(`找到加入购物车按钮: ${selector}`);
                                                break;
                                            }
                                        }
                                        if (addToCartBtn) break;
                                    }
                                } catch (e) {}
                            }

                            if (addToCartBtn) {
                                console.log('正在点击"加入购物车"按钮...');
                                // 滚动到视图中
                                await addToCartBtn.evaluate(el => el.scrollIntoView({block: 'center'}));
                                await new Promise(r => setTimeout(r, 500)); // 等待滚动结束
                                
                                // 尝试常规点击
                                try {
                                    await addToCartBtn.click();
                                } catch (e) {
                                    console.log('常规点击失败，尝试使用 JS 点击...', e.message);
                                    await addToCartBtn.evaluate(el => el.click());
                                }
                                
                                // 简单的等待，确保点击生效
                                await new Promise(r => setTimeout(r, 2000));
                                
                                console.log('✅ 已点击加入购物车按钮。');
                                
                                // 记录历史
                                saveHistory(p.title);
                                console.log('📝 已记录到今日匹配历史。');
                                
                                // 等待 5 秒
                                console.log('⏳ 等待 5 秒...');
                                await new Promise(r => setTimeout(r, 5000));
                                
                                // 返回列表页继续
                                console.log('🔙 返回商品列表页...');
                                await page.goto(currentListPageUrl, { waitUntil: 'domcontentloaded' });
                                console.log('✅ 已返回列表页，继续检查后续商品...');
                                
                            } else {
                                console.error('❌ 未找到可点击的"加入购物车"按钮');
                            }
                             
                         } catch (cartErr) {
                             console.error('❌ 添加购物车流程出错:', cartErr);
                             // 出错也要尝试返回，否则循环会卡在详情页
                             try {
                                 await page.goto(currentListPageUrl, { waitUntil: 'domcontentloaded' });
                             } catch(e) {}
                         }
                         // --- 添加购物车逻辑结束 ---

                         // foundTarget = true; // 不再停止
                         // break; // 不再退出循环
                     } else {
                         console.log('❌ 未找到该商品的链接，无法跳转。');
                     }
                }
            }
            
            // if (foundTarget) {
            //    hasNextPage = false;
            //    break;
            // }

            allProducts.push(...products);

            // 检查并点击下一页
            // 常见的 Shopify 分页选择器增强版
            // 修正：移除 generic class 选择器，因为该站点 class 命名混乱（.pagination__item--next 实际上是 Previous 按钮）
            // 严格依赖 aria-label="次のページ" 或明确的文本
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
                        if (el) {
                            // 验证是否可见
                            const isVisible = await el.evaluate(e => {
                                const style = window.getComputedStyle(e);
                                return style.display !== 'none' && style.visibility !== 'hidden' && e.offsetParent !== null;
                            });
                            if (isVisible) {
                                console.log(`通过 XPath 找到下一页按钮: ${selector}`);
                                nextButton = el;
                                break;
                            }
                        }
                    } else {
                        const el = await page.$(selector);
                        if (el) {
                             const isVisible = await el.evaluate(e => {
                                const style = window.getComputedStyle(e);
                                return style.display !== 'none' && style.visibility !== 'hidden' && e.offsetParent !== null;
                            });
                            if (isVisible) {
                                console.log(`通过 CSS 选择器找到下一页按钮: ${selector}`);
                                nextButton = el;
                                break;
                            }
                        }
                    }
                } catch (e) {}
            }

            if (nextButton) {
                console.log('找到下一页按钮，准备跳转...');
                // 获取 href 直接跳转通常比 click 更稳定
                const nextUrl = await page.evaluate(el => el.href, nextButton);
                
                // 检查 URL 是否有效且未访问过
                if (nextUrl && !visitedUrls.has(nextUrl) && nextUrl !== page.url()) {
                    await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    visitedUrls.add(nextUrl);
                    pageCount++;
                    // 随机延迟，避免爬虫检测
                    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
                } else {
                     console.log(`下一页 URL (${nextUrl}) 无效或已访问过，尝试点击...`);
                     if (nextUrl && (visitedUrls.has(nextUrl) || nextUrl === page.url())) {
                        console.log('检测到循环或重复访问，停止爬取。');
                        hasNextPage = false;
                     } else {
                         // 如果没有 href，或者是其他情况，尝试点击
                         // 但如果已经检测到循环风险，最好还是谨慎
                         await Promise.all([
                            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
                            nextButton.click()
                         ]);
                         const newUrl = page.url();
                         if (visitedUrls.has(newUrl)) {
                             console.log('点击后跳转到了已访问页面，停止爬取。');
                             hasNextPage = false;
                         } else {
                            visitedUrls.add(newUrl);
                            pageCount++;
                         }
                     }
                }
            } else {
                console.log('未找到下一页按钮，爬取结束。');
                hasNextPage = false;
            }
        }

        console.log(`--- 爬取完成，共爬取 ${allProducts.length} 个商品 ---`);
        // --- 爬取逻辑结束 ---

    } catch (err) {
        console.error('❌ 导航过程中发生错误:', err);
    }
    // --- 导航逻辑结束 ---

    // Keep browser open for a while or until closed manually
    console.log('脚本任务完成。浏览器连接保持中...');
    
    // 保持脚本运行不退出
    await new Promise(() => {});
})().catch(err => {
    console.error('Fatal error:', err);
});
