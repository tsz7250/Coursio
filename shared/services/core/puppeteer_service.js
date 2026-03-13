/**
 * PuppeteerService - 瀏覽器自動化專責服務
 * 
 * 從 BackendService 中提取的 Puppeteer 流程編排層。
 * 所有實際的瀏覽器操作皆委派給 BackendService 上的原始方法，
 * PuppeteerService 僅負責完整課表獲取的流程控制。
 * 
 * @param {BackendService} backend - 主要後端服務實例
 */

class PuppeteerService {
    /**
     * @param {object} backend - BackendService 實例
     */
    constructor(backend) {
        this.backend = backend;

        // 預熱瀏覽器快取
        this._prewarmed = null;   // { browser, page, expiresAt }
        this._prewarmPromise = null;
        this._prewarmTtlMs = 2 * 60 * 1000; // 2 分鐘 TTL
    }

    // ==================== 瀏覽器生命週期 ====================

    async launchBrowser() {
        return this.backend._launchBrowserlessInternal();
    }

    // ==================== 完整課表獲取流程 ====================

    async getCompleteScheduleData(year = "114", smtr = "1") {
        let browser = null;
        let page = null; // eslint-disable-line no-useless-assignment

        try {
            console.log("🚀 開始完整課表獲取流程...");
            console.log(`👤 學號: ${this.backend.ALLDATA["original_account"]}`);
            console.log(`📚 學期: ${year}年第${smtr}學期`);

            if (this._prewarmed && this._prewarmed.expiresAt > Date.now()) {
                console.log("🔥 使用預熱的 Browserless context");
                browser = this._prewarmed.browser;
                page = await browser.newPage();
                this._prewarmed = null;
            } else {
                console.log("📱 啟動瀏覽器...");
                browser = await this.launchBrowser();
                page = await browser.newPage();
            }

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

            const loginResult = await this.backend.puppeteerLogin(page);
            if (!loginResult.success) {
                throw new Error(`登入失敗: ${loginResult.message}`);
            }

            console.log("🔄 確保頁面元素完全載入...");
            await this.backend.waitForNetworkIdle(page, 600, 8000).catch(() => {});

            const scheduleResult = await this.backend.puppeteerLoadSchedule(page);
            if (!scheduleResult.success) {
                throw new Error(`課表載入失敗: ${scheduleResult.message}`);
            }

            const parseResult = await this.backend.puppeteerParseSchedule(page);
            if (!parseResult.success) {
                throw new Error(`課表解析失敗: ${parseResult.message}`);
            }

            console.log("🎉 完整課表獲取成功！");

            const result = {
                success: true,
                data: parseResult.data,
                cookies: await page.cookies().catch(() => []),
                message: "課表獲取成功"
            };

            return result;
        } catch (error) {
            console.error("❌ 課表獲取流程失敗:", error.message);
            return { success: false, message: error.message, error };
        } finally {
            if (browser) {
                try {
                    await this.backend.cleanupPuppeteerBrowser(browser);
                } catch (cleanupError) {
                    console.warn("⚠️ 瀏覽器清理過程中出現錯誤:", cleanupError.message);
                }
            }
        }
    }

    // ==================== 委派給 BackendService 的 Facade 方法 ====================

    async puppeteerLogin(page) {
        return this.backend.puppeteerLogin(page);
    }

    async puppeteerLoadSchedule(page) {
        return this.backend.puppeteerLoadSchedule(page);
    }

    async puppeteerParseSchedule(page) {
        return this.backend.puppeteerParseSchedule(page);
    }

    async waitForNetworkIdle(page, idleMs, timeoutMs) {
        return this.backend.waitForNetworkIdle(page, idleMs, timeoutMs);
    }

    async cleanupBrowser(browser) {
        return this.backend.cleanupPuppeteerBrowser(browser);
    }

    async handleScheduleIframe(page) {
        return this.backend.handleScheduleIframe(page);
    }
}

module.exports = PuppeteerService;
