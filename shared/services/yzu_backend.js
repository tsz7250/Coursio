
const { default: Axios } = require("axios");


const https = require('https');

// 引入重構後的分層模組
const HttpClient = require('./core/http_client');
const PuppeteerService = require('./core/puppeteer_service');
const browserWaitHelpers = require('./core/browser_wait_helpers');
const ScheduleParser = require('./parsers/schedule_parser');
const ScheduleService = require('./schedule_service');
const CourseQueryService = require('./course_query_service');
const GradesService = require('./grades_service');
const LoginService = require('./login_service');

// Browserless for production-grade browser control (懶加載)
let createBrowser = null;
let browserlessRoot = null; // 單例根瀏覽器管理器
let browserlessLoaded = false;
let puppeteerModule = null;

// H-11: 僅對 yzu.edu.tw 域名停用 TLS 驗證（該校使用自簽憑證）
// 不再全域覆蓋 Axios.defaults.httpsAgent，改用 request interceptor
var isNodeEnv = typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined';
if (isNodeEnv) {
    const _yzuHttpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, timeout: 30000 });
    Axios.interceptors.request.use((config) => {
        try {
            const hostname = new URL(config.url || '').hostname;
            if (hostname === 'yzu.edu.tw' || hostname.endsWith('.yzu.edu.tw')) {
                config.httpsAgent = _yzuHttpsAgent;
            }
        } catch { /* 忽略無效 URL */ }
        return config;
    });
}

Axios.defaults.timeout = 30000;
Axios.defaults.maxRedirects = 3; // 減少重定向次數，避免重定向循環

 

// 🎯 懶加載 Browserless
function loadBrowserless() {
    if (!browserlessLoaded) {
        try {
            createBrowser = require('browserless');
            browserlessLoaded = true;
            if (!browserlessRoot) {
                browserlessRoot = createBrowser();
            }
            console.log("✅ Browserless 已載入");
        } catch {
            console.warn("⚠️ Browserless 未安裝或載入失敗");
            createBrowser = null;
            browserlessRoot = null;
        }
    }
    return browserlessRoot;
}

function loadPuppeteer() {
    if (!puppeteerModule) {
        // 延遲載入，避免主程序啟動時過早初始化
        puppeteerModule = require('puppeteer');
    }
    return puppeteerModule;
}

class BackendService {
    constructor(sid, spwd) {
        this.root_url = "https://portalx.yzu.edu.tw/NewPortal/"

        this.urls = {
            getUserAccessTokenUrl: "api/Auth/UserAccessToken",
            getRSAAPIKeyByAPPIDUrl: "api/Auth/RSAkeybyAppID",
        }

        this.ALLDATA = {
            // User Data
            "account": "",
            "password": "",
            // App Data
            "AppId": "XamPrismYzu20180206",
            "BackUID": "",
            "DeviceSerial": "123", // JBAXB7616580PZJ
            "APIkey": "YzuAppCall",
            "Password": "!@#$_YzuApp_IS5201",

            "PublicKeyXml": "",

            // Header
            "Accept": "application/json"
        }

        this.sid = sid;
        this.spwd = spwd;

        // 建構子階段先直接寫入憑證，避免委派服務尚未初始化
        this.ALLDATA["account"] = sid;
        this.ALLDATA["password"] = spwd;
        this.ALLDATA["original_account"] = sid;
        this.ALLDATA["original_password"] = spwd;


        // 建立並綁定重構後的 HttpClient
        this.httpClient = new HttpClient();
        
        // 保留舊有方法名稱以向下相容 (綁定至 httpClient)
        this._httpGet = this.httpClient.get.bind(this.httpClient);
        this._httpPostForm = this.httpClient.postForm.bind(this.httpClient);
        
        // 相容舊的 _cookieStore 參考
        Object.defineProperty(this, '_cookieStore', {
            get: () => this.httpClient._cookieStore,
            set: (val) => { this.httpClient._cookieStore = val; }
        });
        
        // 提供存取內部方法的接口 (某些舊程式碼可能會呼叫 _updateCookiesFromResponse)
        this._updateCookiesFromResponse = (res, _urlString) => {
            if (typeof this.httpClient._updateCookiesFromResponse === 'function') {
                this.httpClient._updateCookiesFromResponse(res);
            }
        };
        this._getCookieHeader = () => this.httpClient._getCookieHeader();

        // 預熱瀏覽器快取
        this._prewarmed = null; // { browser, page, expiresAt }
        this._prewarmPromise = null;
        this._prewarmTtlMs = 2 * 60 * 1000; // 2 分鐘 TTL

        // 建立 PuppeteerService 實例 (委派瀏覽器自動化邏輯)
        this.puppeteerService = new PuppeteerService(this);

        // 建立課程查詢服務與成績服務
        this.scheduleService = new ScheduleService(this);
        this.courseQueryService = new CourseQueryService(this);
        this.gradesService = new GradesService(this);
        this.loginServiceLayer = new LoginService(this);
    }

    // ==================== Browser 啟動 / 預熱 ====================

    async _launchBrowserlessInternal() {
        // 預設使用 Puppeteer；僅在明確開啟旗標時嘗試 Browserless
        const useBrowserless = process.env.COURSIO_USE_BROWSERLESS === '1';
        if (useBrowserless) {
            const root = loadBrowserless();
            if (root) {
                try {
                    const context = await root.createContext();
                    const browser = {
                        _browserless: true,
                        _context: context,
                        async newPage() {
                            if (context && typeof context.newPage === 'function') {
                                return context.newPage();
                            }
                            if (context && context.browser && typeof context.browser.newPage === 'function') {
                                return context.browser.newPage();
                            }
                            throw new Error('Browserless context does not provide newPage()');
                        },
                        async close() {
                            if (context && typeof context.close === 'function') {
                                return context.close();
                            }
                            if (context && context.browser && typeof context.browser.close === 'function') {
                                return context.browser.close();
                            }
                        },
                        isConnected() {
                            return true;
                        }
                    };
                    return browser;
                } catch (error) {
                    console.warn('⚠️ Browserless 啟動失敗，回退 Puppeteer:', error.message);
                }
            }
        }

        const puppeteer = loadPuppeteer();
        return puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }

    async launchPuppeteerBrowser() {
        // 兼容舊呼叫端命名
        return this._launchBrowserlessInternal();
    }

    async prewarmBrowser() {
        if (this._prewarmed && this._prewarmed.expiresAt > Date.now()) {
            return true;
        }

        if (this._prewarmPromise) {
            return this._prewarmPromise;
        }

        this._prewarmPromise = (async () => {
            const browser = await this._launchBrowserlessInternal();
            let page = null;

            try {
                page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                await page.goto('https://portalx.yzu.edu.tw/PortalSocialVB/Login.aspx', {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                }).catch(() => {});
            } finally {
                if (page && typeof page.close === 'function') {
                    await page.close().catch(() => {});
                }
            }

            this._prewarmed = {
                browser,
                expiresAt: Date.now() + this._prewarmTtlMs
            };

            return true;
        })();

        try {
            return await this._prewarmPromise;
        } finally {
            this._prewarmPromise = null;
        }
    }

    hasValidPrewarmedBrowser() {
        return !!(this._prewarmed && this._prewarmed.expiresAt > Date.now());
    }

    consumePrewarmedBrowser() {
        if (!this.hasValidPrewarmedBrowser()) return null;
        const browser = this._prewarmed.browser;
        this._prewarmed = null;
        return browser;
    }

    setCredentials(sid, spwd) {
        return this._setSidSpwd(sid, spwd);
    }

    /**
     * 處理教師名稱 (向下相容，轉發至 ScheduleParser)
     * @param {string} teacherText - 原始教師名稱
     * @returns {string} - 處理後的教師名稱
     */
    processTeacherName(teacherText) {
        return ScheduleParser.processTeacherName(teacherText);
    }

    // ==================== 課表相關委派 (實作移至 ScheduleService) ====================

    getCourseSchedule(year, smtr) { return this.scheduleService.getCourseSchedule(year, smtr); }
    async getCompleteScheduleData(year = "114", smtr = "1") { return this.puppeteerService.getCompleteScheduleData(year, smtr); }
    parseScheduleHTMLWithDetails(htmlContent) { return this.scheduleService.parseScheduleHTMLWithDetails(htmlContent); }
    setEmptyPersonalSchedule(errorMessage) { return this.scheduleService.setEmptyPersonalSchedule(errorMessage); }
    async puppeteerLogin(page) { return this.scheduleService.puppeteerLogin(page); }
    async handleScheduleIframe(page) { return this.scheduleService.handleScheduleIframe(page); }
    async puppeteerLoadSchedule(page) { return this.scheduleService.puppeteerLoadSchedule(page); }
    async puppeteerParseSchedule(page) { return this.scheduleService.puppeteerParseSchedule(page); }
    processScheduleDataFromComplete(rawData) { return this.scheduleService.processScheduleDataFromComplete(rawData); }
    parseCourseInfoFromCell(cellText, cellHTML, timeInfo, dayIndex) { return this.scheduleService.parseCourseInfoFromCell(cellText, cellHTML, timeInfo, dayIndex); }
    processPuppeteerScheduleData(rawData) { return this.scheduleService.processPuppeteerScheduleData(rawData); }
    extractCourseIdFromText(text) { return this.scheduleService.extractCourseIdFromText(text); }
    extractCourseNameFromText(text) { return this.scheduleService.extractCourseNameFromText(text); }
    extractTeacherFromText(text) { return this.scheduleService.extractTeacherFromText(text); }
    extractRoomFromText(text) { return this.scheduleService.extractRoomFromText(text); }
    extractTimeFromText(text) { return this.scheduleService.extractTimeFromText(text); }
    extractDayFromText(text) { return this.scheduleService.extractDayFromText(text); }
    extractPeriodFromText(text) { return this.scheduleService.extractPeriodFromText(text); }
    extractCreditFromText(text) { return this.scheduleService.extractCreditFromText(text); }

    // ==================== 通用等待輔助方法 ====================
    
    /**
     * 等待目標 frame（使用 Puppeteer 原生 page.frames() 遞迴搜尋所有層級）
     *
     * 相較於 page.$$('iframe') + contentFrame()，page.frames() 能遍歷所有已建立的
     * frame（包含嵌套 iframe），且不受跨域限制影響，更為可靠。
     *
     * @param {import('puppeteer-core').Page} page
     * @param {string[]} includePatterns  URL 需包含的關鍵字（任一符合即可）
     * @param {string[]} [excludePatterns]  URL 需排除的關鍵字（中介頁面）
     * @param {number} [timeout]  最長等待毫秒數，預設 15000
     * @returns {Promise<import('puppeteer-core').Frame|null>}
     */
    async _waitForTargetFrame(page, includePatterns, excludePatterns = ['iframesub', 'iframeright', 'clickmenulog', 'about:blank'], timeout = 15000) {
        const frame = await browserWaitHelpers.waitForTargetFrame(page, includePatterns, excludePatterns, timeout);
        if (frame) {
            console.log(`✅ _waitForTargetFrame 找到目標 frame: ${frame.url()}`);
        } else {
            console.warn(`⚠️ _waitForTargetFrame 超時（${timeout}ms），patterns: [${includePatterns.join(', ')}]`);
        }
        return frame;
    }

    /**
     * 等待網路空閒：連續 idleMs 期間沒有進行中的請求，或 timeoutMs 超時
     * @param {import('puppeteer-core').Page} page
     * @param {number} idleMs 連續空閒毫秒數
     * @param {number} timeoutMs 總超時毫秒數
     */
    async waitForNetworkIdle(page, idleMs = 600, timeoutMs = 8000) {
        return browserWaitHelpers.waitForNetworkIdle(page, idleMs, timeoutMs);
    }
    // 課表表格生成委派
    generateScheduleTableHTML(courses = null) { return this.scheduleService.generateScheduleTableHTML(courses); }

    // 🧹 清理瀏覽器（相容 Browserless 與 Puppeteer）
    async cleanupPuppeteerBrowser(browser) {
        try {
            console.log("🧹 正在清理瀏覽器資源...");
            
            // Browserless 轉接器
            if (browser && browser._browserless) {
                // 檢查連接是否仍然有效
                if (browser.isConnected && browser.isConnected()) {
                    await browser.close();
                }
                console.log("✅ Browserless 上下文已銷毀");
                return;
            }

            // Puppeteer：關閉所有頁面與瀏覽器
            if (browser && typeof browser.pages === 'function') {
                try {
                    const pages = await browser.pages();
                    await Promise.all(pages.map(page => page.close().catch(() => {})));
                } catch (error) {
                    console.warn("⚠️ 關閉頁面時出現錯誤:", error.message);
                }
            }
            if (browser && typeof browser.close === 'function') {
                try {
                    await browser.close();
                } catch (error) {
                    console.warn("⚠️ 關閉瀏覽器時出現錯誤:", error.message);
                }
            }
            
            console.log("✅ 瀏覽器資源清理完成");
            
        } catch (error) {
            console.warn("⚠️ 清理瀏覽器資源時發生錯誤:", error.message);
            
            // 強制終止瀏覽器進程
            try {
                await browser.disconnect();
            } catch {
                console.warn("⚠️ 無法正常斷開瀏覽器連接");
            }
        }
    }
    // ==================== 課程查詢委派 (實作移至 CourseQueryService) ====================
    // 最末定義覆蓋上方的舊版實作，確保委派生效

    // ==================== 登入委派 (實作移至 LoginService) ====================
    loginService(sid, spwd) { return this.loginServiceLayer.loginService(sid, spwd); }
    _setSidSpwd(sid, spwd) { return this.loginServiceLayer._setSidSpwd(sid, spwd); }
    _getRSAKey() { return this.loginServiceLayer._getRSAKey(); }
    _encryptData(account, password) { return this.loginServiceLayer._encryptData(account, password); }

    async getCourseListFromYZUApi(year, smtr) { return this.courseQueryService.getCourseListFromYZUApi(year, smtr); }
    clearDeptSemesterCache(year = null, smtr = null) { return this.courseQueryService.clearDeptSemesterCache(year, smtr); }
    async getCourseCredit(year, smtr, cos_id, cos_class) { return this.courseQueryService.getCourseCredit(year, smtr, cos_id, cos_class); }
    parseCourseTable(html) { return this.courseQueryService.parseCourseTable(html); }
    async queryCourseByDept(ddl_ym, ddl_dept, ddl_degree) { return this.courseQueryService.queryCourseByDept(ddl_ym, ddl_dept, ddl_degree); }
    async queryCourseByName(ddl_ym, cos_name) { return this.courseQueryService.queryCourseByName(ddl_ym, cos_name); }
    async queryCourseByTeacher(ddl_ym, teacher_name) { return this.courseQueryService.queryCourseByTeacher(ddl_ym, teacher_name); }
    async queryCourseByTime(ddl_ym, ctl216) { return this.courseQueryService.queryCourseByTime(ddl_ym, ctl216); }

    // ==================== 成績查詢委派 (實作移至 GradesService) ====================
    async puppeteerGetGrades(page, type = 'semester', year, smtr) { return this.gradesService.puppeteerGetGrades(page, type, year, smtr); }
}

module.exports = { BackendService };




