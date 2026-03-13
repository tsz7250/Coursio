/**
 * main_puppeteer.js — Main Process 的 Puppeteer/Browserless 管理模組
 * 
 * 所有 headless 瀏覽器操作（登入、課表載入/解析）皆在此模組中執行，
 * 透過 IPC 與 Renderer Process 通訊，避免 UI 卡頓。
 */

const { ipcMain } = require('electron');
const configManager = require('./config_manager');
const { getBackend } = require('./backend_provider');
const { createLogger } = require('./logger');
const { CHANNELS } = require('./ipc/contracts/channels');
const { validateIpcSender } = require('./ipc/security_utils');

const logger = createLogger('main_puppeteer');

// Main Process 專用的 BackendService 單例
let backendInstance = null;

// 當前 Puppeteer session（跨 IPC 呼叫共用）
let currentBrowser = null;

// 每個功能使用獨立 page，避免並發衝突
// 同一 browser context 下各 page 自動共用 cookie（無需重新登入）
const pageMap = { schedule: null, grades: null };

// Promise 鎖：確保同一 page 不被並發呼叫
const pageLocks = { schedule: null, grades: null };

/**
 * 取得或建立指定功能的 page，並確保同一時間只有一個操作在進行
 * @param {'schedule'|'grades'} key
 * @param {string} [initialUrl] - 新建 page 時要導航到的 URL（可選）
 * @returns {Promise<{page: import('puppeteer-core').Page, release: Function}>}
 */
async function acquirePage(key, initialUrl) {
    // 等待前一個操作完成（鏈式 Promise）
    if (pageLocks[key]) {
        await pageLocks[key].catch(() => {});
    }

    let releaseLock;
    pageLocks[key] = new Promise(resolve => { releaseLock = resolve; });

    // 建立或復用 page
    if (!pageMap[key] || pageMap[key].isClosed()) {
        if (!currentBrowser) throw new Error('尚未建立 browser context，請先登入');
        logger.info('建立新的 page', { key });
        pageMap[key] = await currentBrowser.newPage();
        await pageMap[key].setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );
        if (initialUrl) {
            logger.info('新 page 導航', { key, initialUrl });
            await pageMap[key].goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => {
                logger.warn('初始導航失敗', { key, error: e.message });
            });
        }
    }

    return { page: pageMap[key], release: releaseLock };
}

// 主視窗參考（用於推送進度）
let mainWindow = null;

/**
 * 向 Renderer 推送進度文字
 * @param {string} step - 進度步驟文字
 */
function sendProgress(step) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(CHANNELS.PUPPETEER.PROGRESS, step);
    }
}

/**
 * 清理當前 Puppeteer session
 */
async function cleanupSession() {
    // 釋放所有 page
    for (const key of Object.keys(pageMap)) {
        if (pageMap[key]) {
            try { await pageMap[key].close(); } catch { /* 忽略 */ }
            pageMap[key] = null;
        }
        pageLocks[key] = null;
    }
    if (currentBrowser) {
        try {
            await backendInstance.cleanupPuppeteerBrowser(currentBrowser);
        } catch (e) {
            logger.warn('清理 Puppeteer session 時出錯', { error: e.message });
        }
        currentBrowser = null;
    }
}

/**
 * 初始化模組並註冊所有 IPC handlers
 * @param {BrowserWindow} win - 主視窗
 */
function init(win) {
    mainWindow = win;
    backendInstance = getBackend();

    // ========== IPC: 登入 ==========
    ipcMain.handle(CHANNELS.PUPPETEER.LOGIN, async (event, { sid, spwd }) => {
        try {
            if (!validateIpcSender(event)) throw new Error('未授權的 IPC sender');
            // 清理前一次 session
            await cleanupSession();

            // 設定帳密
            backendInstance.setCredentials(sid, spwd);

            // 啟動瀏覽器
            sendProgress('正在啟動瀏覽器...');

            // 優先使用預熱的 context
            if (backendInstance.hasValidPrewarmedBrowser()) {
                console.log('🔥 使用預熱的 Browserless context');
                currentBrowser = backendInstance.consumePrewarmedBrowser();
            } else {
                currentBrowser = await backendInstance.launchPuppeteerBrowser();
            }

            // 登入用 schedule page（登入後此 page 坐落在 portal 主頁）
            const loginPage = await currentBrowser.newPage();
            await loginPage.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            );
            pageMap.schedule = loginPage;

            // 執行登入
            sendProgress('正在載入登入頁面...');
            const loginResult = await backendInstance.puppeteerLogin(loginPage);

            if (!loginResult || !loginResult.success) {
                await cleanupSession();
                return {
                    success: false,
                    message: (loginResult && loginResult.message) || '登入失敗'
                };
            }

            sendProgress('登入成功！');
            return { success: true };
        } catch (error) {
            logger.error('puppeteer:login 錯誤', { error: error.message });
            await cleanupSession();
            return { success: false, message: error.message };
        }
    });

    // ========== IPC: 取得課表（含載入 + 解析） ==========
    ipcMain.handle(CHANNELS.PUPPETEER.GET_SCHEDULE, async (event) => {
        let release;
        try {
            if (!validateIpcSender(event)) throw new Error('未授權的 IPC sender');
            if (!currentBrowser) {
                return { success: false, message: '尚未登入，無 Puppeteer session' };
            }

            // 取得 schedule 專用 page（若同時有另一個 schedule 操作在進行，會在此等待）
            let _page;
            ({ page: _page, release } = await acquirePage('schedule'));
            const page = _page;

            sendProgress('正在等待頁面載入...');

            // 等待網路穩定後交由 puppeteerLoadSchedule 進行更完整的元素偵測
            // （移除原本嚴格 8s waitForFunction，避免 Portal 頁稍慢時就提前失敗）
            await backendInstance.waitForNetworkIdle(page, 300, 5000).catch(() => {});

            // 載入課表
            sendProgress('正在讀取課表...');
            const scheduleResult = await backendInstance.puppeteerLoadSchedule(page);
            if (!scheduleResult.success) {
                return { success: false, message: `課表載入失敗: ${scheduleResult.message}` };
            }

            // 解析課表（Main Process 內完成所有正則解析）
            sendProgress('正在解析課表資料...');
            const parseResult = await backendInstance.puppeteerParseSchedule(page);
            if (!parseResult.success) {
                return { success: false, message: `課表解析失敗: ${parseResult.message}` };
            }

            // 只回傳解析後的 JSON，不傳原始 HTML（大幅減少 IPC payload）
            const data = parseResult.data;
            return {
                success: true,
                data: {
                    label1: data.label1 || '',
                    course_list: data.course_list || [],
                    is_personal: true,
                    source: data.source || 'Main Process Puppeteer',
                    extraction_time: data.extraction_time || new Date().toISOString()
                }
            };
        } catch (error) {
            logger.error('puppeteer:getSchedule 錯誤', { error: error.message });
            return { success: false, message: error.message };
        } finally {
            if (release) release();
        }
    });

    // ========== IPC: 完整課表獲取（獨立流程：登入 → 載入 → 解析 → 關閉） ==========
    ipcMain.handle(CHANNELS.PUPPETEER.GET_COMPLETE_SCHEDULE, async (event, { sid, spwd, year, smtr }) => {
        try {
            if (!validateIpcSender(event)) throw new Error('未授權的 IPC sender');
            backendInstance.setCredentials(sid, spwd);
            const result = await backendInstance.getCompleteScheduleData(year, smtr);
            if (result.success && result.data) {
                return {
                    success: true,
                    data: {
                        label1: result.data.label1 || '',
                        course_list: result.data.course_list || [],
                        is_personal: true,
                        source: result.data.source || 'Main Process getCompleteScheduleData',
                        extraction_time: result.data.extraction_time || new Date().toISOString()
                    }
                };
            }
            return { success: false, message: result.message || '課表獲取失敗' };
        } catch (error) {
            console.error('❌ puppeteer:getCompleteSchedule 錯誤:', error.message);
            return { success: false, message: error.message };
        }
    });

    // ========== IPC: 成績查詢 ==========
    ipcMain.handle(CHANNELS.PUPPETEER.GET_GRADES, async (event, { type, year, smtr }) => {
        let release;
        try {
            if (!validateIpcSender(event)) throw new Error('未授權的 IPC sender');
            if (!currentBrowser) {
                return { success: false, message: '尚未登入，無 Puppeteer session' };
            }

            sendProgress('正在查詢成績資料...');

            // 取得 grades 專用 page
            // 若 grades page 尚未存在，新建並導航至 portal（共用 cookie，無需重新登入）
            const portalUrl = 'https://portalx.yzu.edu.tw/PortalSocialVB/FMain/DefaultPage.aspx';
            let _page;
            ({ page: _page, release } = await acquirePage('grades', portalUrl));
            const page = _page;

            await backendInstance.waitForNetworkIdle(page, 300, 4000).catch(() => {});

            // H-04: 偵測 session 過期（被重導向至登入頁）
            const currentUrl = page.url();
            if (currentUrl.includes('Login') || currentUrl.includes('login')) {
                logger.warn('grades session 已過期，嘗試自動重登');
                sendProgress('登入 session 已過期，正在重新登入...');
                const creds = await configManager.readAccounts();
                if (!creds.account || !creds.password) {
                    return { success: false, message: 'Session 已過期且無儲存的憑證，請重新登入' };
                }
                backendInstance.setCredentials(creds.account, creds.password);
                const reloginResult = await backendInstance.puppeteerLogin(page);
                if (!reloginResult || !reloginResult.success) {
                    return { success: false, message: 'Session 過期後自動重登失敗，請手動重新登入' };
                }
                sendProgress('重登成功，繼續查詢成績...');
                // 重新導航至 portal 主頁
                await page.goto(portalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
                await backendInstance.waitForNetworkIdle(page, 300, 4000).catch(() => {});
            }

            sendProgress(`正在載入${type === 'semester' ? '學期成績' : type === 'history' ? '歷年成績' : '排名資料'}...`);
            const result = await backendInstance.puppeteerGetGrades(page, type, year, smtr);

            if (!result.success) {
                return { success: false, message: result.message || '成績查詢失敗' };
            }

            sendProgress('成績資料載入完成！');
            return { success: true, data: result.data };
        } catch (error) {
            logger.error('puppeteer:getGrades 錯誤', { error: error.message });
            return { success: false, message: error.message };
        } finally {
            if (release) release();
        }
    });

    // ========== IPC: 關閉當前 session ==========
    ipcMain.handle(CHANNELS.PUPPETEER.CLEANUP, async (event) => {
        if (!validateIpcSender(event)) throw new Error('未授權的 IPC sender');
        await cleanupSession();
        return { success: true };
    });

    logger.info('Main Process Puppeteer IPC handlers 已註冊');
}

/**
 * 預熱 Browserless（延遲呼叫，避免與 App 啟動搶 CPU）
 */
async function prewarm() {
    if (!backendInstance) return;
    try {
        logger.info('Main Process 開始預熱 Browserless');
        await backendInstance.prewarmBrowser();
        logger.info('Main Process 預熱完成');
    } catch (e) {
        logger.warn('Main Process 預熱失敗（不影響正常登入）', { error: e.message });
    }
}

module.exports = { init, prewarm, cleanupSession };
