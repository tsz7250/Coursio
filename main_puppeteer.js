/**
 * main_puppeteer.js — Main Process 的 Puppeteer/Browserless 管理模組
 * 
 * 所有 headless 瀏覽器操作（登入、課表載入/解析）皆在此模組中執行，
 * 透過 IPC 與 Renderer Process 通訊，避免 UI 卡頓。
 */

const { ipcMain } = require('electron');
const { BackendService } = require('./renderer/js/yzu_backend');

// Main Process 專用的 BackendService 單例
let backendInstance = null;

// 當前 Puppeteer session（跨 IPC 呼叫共用）
let currentBrowser = null;
let currentPage = null;

// 主視窗參考（用於推送進度）
let mainWindow = null;

/**
 * 向 Renderer 推送進度文字
 * @param {string} step - 進度步驟文字
 */
function sendProgress(step) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('puppeteer:progress', step);
    }
}

/**
 * 清理當前 Puppeteer session
 */
async function cleanupSession() {
    if (currentBrowser) {
        try {
            await backendInstance.cleanupPuppeteerBrowser(currentBrowser);
        } catch (e) {
            console.warn('⚠️ 清理 Puppeteer session 時出錯:', e.message);
        }
        currentBrowser = null;
        currentPage = null;
    }
}

/**
 * 初始化模組並註冊所有 IPC handlers
 * @param {BrowserWindow} win - 主視窗
 */
function init(win) {
    mainWindow = win;
    backendInstance = new BackendService();

    // ========== IPC: 登入 ==========
    ipcMain.handle('puppeteer:login', async (_event, { sid, spwd }) => {
        try {
            // 清理前一次 session
            await cleanupSession();

            // 設定帳密
            backendInstance._setSidSpwd(sid, spwd);

            // 啟動瀏覽器
            sendProgress('正在啟動瀏覽器...');

            // 優先使用預熱的 context
            if (backendInstance._prewarmed && backendInstance._prewarmed.expiresAt > Date.now()) {
                console.log('🔥 使用預熱的 Browserless context');
                currentBrowser = backendInstance._prewarmed.browser;
                backendInstance._prewarmed = null;
            } else {
                currentBrowser = await backendInstance.launchPuppeteerBrowser();
            }

            currentPage = await currentBrowser.newPage();
            await currentPage.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            );

            // 執行登入
            sendProgress('正在載入登入頁面...');
            const loginResult = await backendInstance.puppeteerLogin(currentPage);

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
            console.error('❌ puppeteer:login 錯誤:', error.message);
            await cleanupSession();
            return { success: false, message: error.message };
        }
    });

    // ========== IPC: 取得課表（含載入 + 解析） ==========
    ipcMain.handle('puppeteer:getSchedule', async () => {
        try {
            if (!currentPage) {
                return { success: false, message: '尚未登入，無 Puppeteer page' };
            }

            sendProgress('正在等待頁面載入...');

            // 等待頁面元素可互動
            await backendInstance.waitForNetworkIdle(currentPage, 300, 4000).catch(() => {});
            await currentPage.waitForFunction(() => {
                return document.getElementById('tdS14') || Array.from(document.querySelectorAll('*[onclick]')).some(el => {
                    const text = (el.textContent || el.innerText || '').trim();
                    const onclick = el.getAttribute('onclick') || '';
                    return text.includes('課表') && onclick.includes('S5');
                });
            }, { timeout: 8000 }).catch(() => {});

            // 載入課表
            sendProgress('正在讀取課表...');
            const scheduleResult = await backendInstance.puppeteerLoadSchedule(currentPage);
            if (!scheduleResult.success) {
                return { success: false, message: `課表載入失敗: ${scheduleResult.message}` };
            }

            // 解析課表（Main Process 內完成所有正則解析）
            sendProgress('正在解析課表資料...');
            const parseResult = await backendInstance.puppeteerParseSchedule(currentPage);
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
            console.error('❌ puppeteer:getSchedule 錯誤:', error.message);
            return { success: false, message: error.message };
        }
    });

    // ========== IPC: 完整課表獲取（獨立流程：登入 → 載入 → 解析 → 關閉） ==========
    ipcMain.handle('puppeteer:getCompleteSchedule', async (_event, { sid, spwd, year, smtr }) => {
        try {
            backendInstance._setSidSpwd(sid, spwd);
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

    // ========== IPC: 關閉當前 session ==========
    ipcMain.handle('puppeteer:cleanup', async () => {
        await cleanupSession();
        return { success: true };
    });

    console.log('✅ Main Process Puppeteer IPC handlers 已註冊');
}

/**
 * 預熱 Browserless（延遲呼叫，避免與 App 啟動搶 CPU）
 */
async function prewarm() {
    if (!backendInstance) return;
    try {
        console.log('🧊 Main Process 開始預熱 Browserless...');
        await backendInstance.prewarmBrowser();
        console.log('✅ Main Process 預熱完成');
    } catch (e) {
        console.warn('⚠️ Main Process 預熱失敗（不影響正常登入）:', e.message);
    }
}

module.exports = { init, prewarm, cleanupSession };
