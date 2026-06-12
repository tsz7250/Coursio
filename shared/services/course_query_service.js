/**
 * CourseQueryService — 課程查詢專責服務
 *
 * 從 BackendService 中提取的課程查詢邏輯。
 * 包含：系所列表取得、4 種查詢方式（系所/課程名稱/教師/時間）、
 * 學分查詢，以及相關的表單輔助方法。
 *
 * @param {object} backend - BackendService 實例
 */

const CourseParser = require('./parsers/course_parser');
const queryFormHelper = require('./helpers/query_form_helper');

class CourseQueryService {
    constructor(backend) {
        this.backend = backend;
        this.dept_options = null;
        this.cachedDeptSemesterData = {};
        this.queryMutex = Promise.resolve();
        this.cosSelectLoggedIn = false;
        this.isLoggingIn = false;
        this.cachedBrowser = null;
        this.cachedPage = null;
        this.idleTimer = null;
    }

    async _executeInQueue(fn) {
        const nextActive = this.queryMutex.then(fn);
        this.queryMutex = nextActive.catch(() => {});
        return nextActive;
    }

    // ==================== 選項清單 ====================

    async getCourseListFromYZUApi(year, smtr) {
        const cacheKey = `dept_semester_${year}_${smtr}`;
        if (this.cachedDeptSemesterData && this.cachedDeptSemesterData[cacheKey]) {
            console.log("使用快取的系所和學期選項");
            const cachedData = this.cachedDeptSemesterData[cacheKey];
            this.dept_options = cachedData.dept_options;
            return cachedData;
        }

        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/index.aspx?D=G";

        try {
            console.log("正在從 portalfun.yzu.edu.tw 取得系所和學期選項...");

            const res = await this.backend._httpGet(BASE, {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            });

            if (res.statusCode >= 300) {
                throw new Error(`HTTP ${res.statusCode}`);
            }

            const parsed = CourseParser.parseDeptAndSemesterOptions(res.body);
            const dept_list = parsed.dept_options;
            const semester_list = parsed.semester_list;

            console.log(`成功取得 ${dept_list.length} 個系所選項和 ${semester_list.length} 個學期選項`);
            this.dept_options = dept_list;

            const result = {
                course_list: [],
                dept_list: parsed.dept_list,
                dept_options: dept_list,
                semester_list,
                source: "portalfun.yzu.edu.tw",
                message: `成功取得 ${dept_list.length} 個系所選項`
            };

            if (!this.cachedDeptSemesterData) this.cachedDeptSemesterData = {};
            this.cachedDeptSemesterData[cacheKey] = result;

            return result;
        } catch (err) {
            console.error("從 portalfun.yzu.edu.tw 取得選項失敗:", err.message);
            throw new Error(`選項取得失敗: ${err.message}`, { cause: err });
        }
    }

    clearDeptSemesterCache(year = null, smtr = null) {
        if (!this.cachedDeptSemesterData) return;

        if (year && smtr) {
            const cacheKey = `dept_semester_${year}_${smtr}`;
            delete this.cachedDeptSemesterData[cacheKey];
            console.log(`已清除 ${year} 學年第 ${smtr} 學期的快取`);
        } else {
            this.cachedDeptSemesterData = {};
            console.log("已清除所有系所和學期選項的快取");
        }
    }

    // ==================== 學分查詢 ====================

    async getCourseCredit(year, smtr, cos_id, cos_class) {
        try {
            const url = `https://portalfun.yzu.edu.tw/cosSelect/Cos_Plan.aspx?y=${year}&s=${smtr}&id=${cos_id}&c=${cos_class}`;
            console.log(`正在取得課程學分數: ${url}`);

            const response = await this.backend._httpGet(url, {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                // 問題 6：刻意帶空 Cookie 以阻止 HttpClient 自動附加 cookieStore 的 Session Cookie，
                // 避免 Cos_Plan.aspx 因 Session 不一致而重導。HttpClient 偵測到 Cookie key 存在時不附加 cookieStore。
                Cookie: ""
            });

            if (response.statusCode >= 300) {
                throw new Error(`HTTP ${response.statusCode}`);
            }

            return CourseParser.extractCreditFromHtml(response.body);
        } catch (error) {
            console.error(`取得學分數失敗 (${cos_id}):`, error.message);
            return 0;
        }
    }

    parseCourseTable(html) {
        return CourseParser.parseCourseTable(html);
    }

    async _getBrowserAndPage() {
        this._clearIdleTimer();
        if (this.cachedBrowser && this.cachedPage) {
            try {
                await this.cachedPage.url();
                return { browser: this.cachedBrowser, page: this.cachedPage };
            } catch (e) {
                console.log("[CourseQueryService] 快取的頁面失效，關閉並重新啟動...", e.message);
                await this.cleanupBrowser().catch(() => {});
            }
        }
        
        const browser = await this.backend.launchPuppeteerBrowser();
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        await page.setCacheEnabled(false);
        
        this.cachedBrowser = browser;
        this.cachedPage = page;
        return { browser, page };
    }

    _startIdleTimer() {
        this._clearIdleTimer();
        this.idleTimer = setTimeout(async () => {
            console.log("[CourseQueryService] 瀏覽器已閒置超過 2 分鐘，自動關閉以釋放記憶體...");
            await this.cleanupBrowser().catch(() => {});
        }, 2 * 60 * 1000);
    }

    _clearIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    async cleanupBrowser() {
        this._clearIdleTimer();
        // 問題 3：重置登入狀態，避免下次查詢誤判為已登入而跳過登入流程
        this.cosSelectLoggedIn = false;
        const browser = this.cachedBrowser;
        const page = this.cachedPage;
        
        this.cachedBrowser = null;
        this.cachedPage = null;
        
        if (page) {
            try {
                await page.close();
            } catch {
                // ignore
            }
        }
        if (browser) {
            console.log("[CourseQueryService] 正在關閉課程查詢背景瀏覽器...");
            try {
                await this.backend.cleanupPuppeteerBrowser(browser);
            } catch {
                // ignore
            }
        }
    }

    async prewarmBrowser() {
        return this._executeInQueue(async () => {
            if (this.cachedBrowser && this.cachedPage) {
                try {
                    await this.cachedPage.url();
                    return true;
                } catch {
                    await this.cleanupBrowser().catch(() => {});
                }
            }
            
            try {
                console.log("[CourseQueryService] 開始預熱背景課程查詢瀏覽器...");
                const { page } = await this._getBrowserAndPage();
                
                const BASE_URL = "https://portalfun.yzu.edu.tw/cosSelect/index.aspx";
                await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
                
                this._startIdleTimer();
                return true;
            } catch (error) {
                console.warn("[CourseQueryService] 背景預熱課程查詢瀏覽器失敗:", error.message);
                await this.cleanupBrowser().catch(() => {});
                return false;
            }
        });
    }

    async loginToCosSelect() {
        if (this.cosSelectLoggedIn) return true;
        if (this.isLoggingIn) return false;
        
        this.isLoggingIn = true;
        try {
            const configManager = require('../../main/config_manager');
            const accounts = await configManager.readAccounts();
            const username = accounts.account;
            const password = accounts.password;
            
            if (!username || !password) {
                console.log("[CourseQueryService] 未設定帳號密碼，使用免登入訪客模式。");
                this.cosSelectLoggedIn = false;
                this.isLoggingIn = false;
                return false;
            }

            let processedUsername = username;
            if (/^\d+$/.test(username)) {
                processedUsername = 's' + username;
                console.log(`[CourseQueryService] 檢測到純數字學號，自動轉換為電子郵件帳號: ${processedUsername}`);
            }
            
            const { page } = await this._getBrowserAndPage();
            
            let loginFailedMsg = null;
            page.removeAllListeners('dialog');
            page.on('dialog', async dialog => {
                const msg = dialog && dialog.message ? (dialog.message() || '') : '';
                console.log(`[CourseQueryService] 登入頁面 Alert 提示: ${msg}`);
                loginFailedMsg = msg;
                await dialog.accept().catch(() => {});
            });

            const currentUrl = page.url();
            const BASE_LOGIN_URL = "https://portalfun.yzu.edu.tw/cosSelect/index.aspx";
            
            // 如果當前頁面不是登入頁或首頁，才需要導航到首頁
            if (!currentUrl || (!currentUrl.includes('login.aspx') && !currentUrl.includes('index.aspx'))) {
                console.log("[CourseQueryService] 導航至登入頁面...");
                await page.goto(BASE_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
            } else {
                console.log("[CourseQueryService] 瀏覽器已在登入頁面，跳過導航");
            }

            // 取得 CheckCode 驗證碼 Cookie (使用重試機制以避免靜態資源加載的競爭條件)
            let captchaCode = '';
            for (let i = 0; i < 10; i++) {
                const cookies = await page.cookies();
                const checkCodeCookie = cookies.find(c => c.name === 'CheckCode');
                if (checkCodeCookie && checkCodeCookie.value) {
                    captchaCode = checkCodeCookie.value;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            // 如果沒有取得驗證碼且先前跳過了導航，嘗試強制重新整理頁面
            if (!captchaCode && currentUrl && (currentUrl.includes('login.aspx') || currentUrl.includes('index.aspx'))) {
                console.log("[CourseQueryService] 未找到驗證碼 Cookie，嘗試強制重新整理頁面...");
                await page.goto(BASE_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
                for (let i = 0; i < 10; i++) {
                    const cookies = await page.cookies();
                    const checkCodeCookie = cookies.find(c => c.name === 'CheckCode');
                    if (checkCodeCookie && checkCodeCookie.value) {
                        captchaCode = checkCodeCookie.value;
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            if (!captchaCode) {
                throw new Error("無法從 Cookie 取得驗證碼 CheckCode");
            }

            console.log(`[CourseQueryService] 背景取得驗證碼: ${captchaCode}，開始模擬登入...`);
            
            // 問題 2：填寫前先清空欄位，避免 idle 後重新登入時 page.type 追加舊殘值
            await page.$eval("input[name='uid']", el => el.value = '').catch(() => {});
            await page.type("input[name='uid']", processedUsername);
            await page.$eval("input[name='pwd']", el => el.value = '').catch(() => {});
            await page.type("input[name='pwd']", password);
            await page.$eval("input[name='Code']", el => el.value = '').catch(() => {});
            await page.type("input[name='Code']", captchaCode);

            // 點擊登入並等待導航
            await Promise.all([
                page.click("#Button1"),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
            ]);

            const content = await page.content();
            const hasLoginArea = content.includes("login_area") || content.includes("ImageCode.aspx");

            const isSuccessAlert = loginFailedMsg && loginFailedMsg.toLowerCase().includes("success");
            const reallyFailed = hasLoginArea || (loginFailedMsg && !isSuccessAlert);

            if (reallyFailed) {
                throw new Error(loginFailedMsg || "登入失敗，帳密錯誤或驗證碼無效。");
            }

            console.log("[CourseQueryService] Puppeteer 背景登入成功！正在同步 Cookies...");

            // 同步 Cookie 到 HttpClient 的 cookieStore
            const loggedInCookies = await page.cookies();
            
            // 先清空舊有的 CookieStore 以免殘留衝突 childhood F5 ASM Cookie
            this.backend.httpClient._cookieStore = {};

            loggedInCookies.forEach(c => {
                this.backend.httpClient._cookieStore[c.name] = {
                    value: c.value,
                    expiresAt: c.expires ? c.expires * 1000 : null
                };
            });

            console.log("[CourseQueryService] Cookie 同步完成，轉換為登入模式。");
            this.cosSelectLoggedIn = true;
            this.isLoggingIn = false;
            this._startIdleTimer();
            return true;

        } catch (error) {
            console.error("[CourseQueryService] 背景登入失敗:", error.message);
            console.error("💡 提示：元智大學「課程查詢系統」(portalfun) 使用電子郵件（LDAP）密碼登入，該密碼可能與您的 NewPortal 密碼不同。\n" +
                          "若您曾修改過 Portal 密碼但未同步至郵件密碼，請嘗試在軟體登入設定中填入您的「元智電子郵件密碼」，或手動登入該網站測試帳密一致性。");
            this.cosSelectLoggedIn = false;
            this.isLoggingIn = false;
            await this.cleanupBrowser().catch(() => {});
            return false;
        }
    }

    async runCourseQueryPuppeteer(queryType, params) {
        try {
            console.log(`[CourseQueryService] 快取複用背景瀏覽器進行課程查詢 (${queryType})...`);
            const { page } = await this._getBrowserAndPage();

            // 監聽 Alert（避免登入成功或失敗彈出的對話框阻斷執行緒）
            let loginFailedMsg = null;
            page.removeAllListeners('dialog');
            page.on('dialog', async dialog => {
                const msg = dialog && dialog.message ? (dialog.message() || '') : '';
                console.log(`[CourseQueryService] 查詢頁面 Alert 提示: ${msg}`);
                loginFailedMsg = msg;
                await dialog.accept().catch(() => {});
            });

            // 1. 先確認登入狀態
            const configManager = require('../../main/config_manager');
            const accounts = await configManager.readAccounts();
            const username = accounts.account;
            const password = accounts.password;

            let processedUsername = username;
            if (/^\d+$/.test(username)) {
                processedUsername = 's' + username;
            }

            const BASE_URL = "https://portalfun.yzu.edu.tw/cosSelect/index.aspx";
            const currentUrl = page.url();
            let needsNavigation = true;
            if (currentUrl && currentUrl.startsWith("https://portalfun.yzu.edu.tw/cosSelect/")) {
                const hasLoginArea = await page.evaluate(() => !!document.getElementById('login_area'));
                if (!hasLoginArea) {
                    needsNavigation = false;
                }
            }

            if (needsNavigation) {
                console.log("[CourseQueryService] 導航至課程查詢首頁...");
                await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
            }

            // 檢查是否需要登入（此時若 Cookie 成功運作，hasLoginArea 應為 false）
            let hasLoginArea = await page.evaluate(() => !!document.getElementById('login_area'));
            if (hasLoginArea) {
                console.log("[CourseQueryService] Cookie 無效或已過期，正在進行背景登入...");
                let captchaCode = '';
                for (let i = 0; i < 10; i++) {
                    const cookies = await page.cookies();
                    const checkCodeCookie = cookies.find(c => c.name === 'CheckCode');
                    if (checkCodeCookie && checkCodeCookie.value) {
                        captchaCode = checkCodeCookie.value;
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                
                // 如果沒有取得驗證碼且先前跳過了導航，嘗試強制重新整理頁面
                if (!captchaCode && !needsNavigation) {
                    console.log("[CourseQueryService] 未找到驗證碼 Cookie，嘗試強制重新整理頁面...");
                    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
                    for (let i = 0; i < 10; i++) {
                        const cookies = await page.cookies();
                        const checkCodeCookie = cookies.find(c => c.name === 'CheckCode');
                        if (checkCodeCookie && checkCodeCookie.value) {
                            captchaCode = checkCodeCookie.value;
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }

                if (!captchaCode) throw new Error("無法取得驗證碼 Cookie");

                await page.type("input[name='uid']", processedUsername);
                await page.type("input[name='pwd']", password);
                await page.type("input[name='Code']", captchaCode);

                await Promise.all([
                    page.click("#Button1"),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
                ]);

                // 檢查是否成功登入
                const currentContent = await page.content();
                const isSuccessAlert = loginFailedMsg && loginFailedMsg.toLowerCase().includes("success");
                const reallyFailed = currentContent.includes("login_area") || (loginFailedMsg && !isSuccessAlert);
                if (reallyFailed) {
                    throw new Error(loginFailedMsg || "背景登入失敗，帳密錯誤。");
                }
                console.log("[CourseQueryService] 背景登入成功。");
            } else {
                console.log("[CourseQueryService] 已處於登入狀態。");
            }

            // 3. 根據查詢類型進行操作
            if (queryType === 'dept') {
                // 選擇學年學期 (DDL_YM)
                if (params.ddl_ym) {
                    let ymValue = params.ddl_ym;
                    if (ymValue && !ymValue.endsWith('  ')) {
                        ymValue = ymValue.trim() + '  ';
                    }
                    await page.select('select[name="DDL_YM"]', ymValue).catch(() => {});
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {}),
                        page.evaluate(() => {
                            const select = document.getElementById('DDL_YM') || document.querySelector('select[name="DDL_YM"]');
                            if (select) select.dispatchEvent(new Event('change'));
                        })
                    ]);
                }

                // 選擇系所
                await page.select('select[name="DDL_Dept"]', params.ddl_dept);
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {}),
                    page.evaluate(() => {
                        const select = document.getElementById('DDL_Dept') || document.querySelector('select[name="DDL_Dept"]');
                        if (select) select.dispatchEvent(new Event('change'));
                    })
                ]);
                
                // 選擇學制/學位
                await page.select('select[name="DDL_Degree"]', params.ddl_degree);
                
                // 點擊確定
                await Promise.all([
                    page.click('#Button1'),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
                ]);

                // 問題 4：檢查伺服器是否以 Alert 回報錯誤（對齊 name/teacher 路徑的檢查邏輯）
                if (loginFailedMsg) {
                    const isSuccess = loginFailedMsg.toLowerCase().includes('success');
                    if (!isSuccess) throw new Error(loginFailedMsg);
                }

            } else if (queryType === 'name') {
                // 點擊 RadioButton2
                await Promise.all([
                    page.click('input[value="RadioButton2"]'),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
                ]);
                
                // 選擇學年學期 (DDL_YM2)
                if (params.ddl_ym) {
                    let ymValue = params.ddl_ym;
                    if (ymValue && !ymValue.endsWith('  ')) {
                        ymValue = ymValue.trim() + '  ';
                    }
                    await page.select('select[name="DDL_YM2"]', ymValue).catch(() => {});
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {}),
                        page.evaluate(() => {
                            const select = document.getElementById('DDL_YM2') || document.querySelector('select[name="DDL_YM2"]');
                            if (select) select.dispatchEvent(new Event('change'));
                        })
                    ]);
                }

                // 清空並輸入課名
                await page.$eval('input[name="Txt_Cos_Name"]', el => el.value = '').catch(() => {});
                await page.type('input[name="Txt_Cos_Name"]', params.cos_name);
                
                // 點擊確定
                await Promise.all([
                    page.click('input[name="Button2"]'),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
                ]);

            } else if (queryType === 'teacher') {
                // 點擊 RadioButton3
                await Promise.all([
                    page.click('input[value="RadioButton3"]'),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
                ]);
                
                // 選擇學年學期 (DDL_YM3)
                if (params.ddl_ym) {
                    let ymValue = params.ddl_ym;
                    if (ymValue && !ymValue.endsWith('  ')) {
                        ymValue = ymValue.trim() + '  ';
                    }
                    await page.select('select[name="DDL_YM3"]', ymValue).catch(() => {});
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {}),
                        page.evaluate(() => {
                            const select = document.getElementById('DDL_YM3') || document.querySelector('select[name="DDL_YM3"]');
                            if (select) select.dispatchEvent(new Event('change'));
                        })
                    ]);
                }

                // 清空並輸入教師名
                await page.$eval('input[name="Txt_teacher_Name"]', el => el.value = '').catch(() => {});
                await page.type('input[name="Txt_teacher_Name"]', params.teacher_name);
                
                // 點擊確定
                await Promise.all([
                    page.click('input[name="Button3"]'),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
                ]);

            } else if (queryType === 'time') {
                // 點擊 RadioButton4
                await Promise.all([
                    page.click('input[value="RadioButton4"]'),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
                ]);
                
                // 選擇學年學期 (DDL_YM4)
                if (params.ddl_ym) {
                    let ymValue = params.ddl_ym;
                    if (ymValue && !ymValue.endsWith('  ')) {
                        ymValue = ymValue.trim() + '  ';
                    }
                    await page.select('select[name="DDL_YM4"]', ymValue).catch(() => {});
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {}),
                        page.evaluate(() => {
                            const select = document.getElementById('DDL_YM4') || document.querySelector('select[name="DDL_YM4"]');
                            if (select) select.dispatchEvent(new Event('change'));
                        })
                    ]);
                }

                if (params.ctl216) {
                    // 直接點選對應時間格子的提交按鈕
                    await Promise.all([
                        page.click(`input[type="submit"][value="${params.ctl216}"]`),
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
                    ]);
                } else {
                    throw new Error("時間查詢缺少節次參數 ctl216");
                }
            }

            // 4. 等待結果表格載入並讀取 HTML
            await page.waitForSelector('#Table1', { timeout: 8000 }).catch(() => {});
            const finalHtml = await page.content();
            
            this._startIdleTimer();
            return this.parseCourseTable(finalHtml);

        } catch (error) {
            console.error(`[CourseQueryService] Puppeteer 查詢 (${queryType}) 失敗:`, error.message);
            await this.cleanupBrowser().catch(() => {});
            throw error;
        }
    }

    // ==================== 課程查詢（4 種方式）====================

    async queryCourseByDept(ddl_ym, ddl_dept, ddl_degree) {
        return this._executeInQueue(async () => {
            let ymValue = ddl_ym || '';
            if (ymValue && !ymValue.endsWith('  ')) {
                ymValue = ymValue.trim() + '  ';
            }
            let dept_value = ddl_dept;
            if (this.dept_options && Array.isArray(this.dept_options)) {
                const deptOption = this.dept_options.find(opt => opt.dept_name === ddl_dept || opt.text === ddl_dept);
                if (deptOption) {
                    dept_value = deptOption.value;
                    console.log(`系所名稱 "${ddl_dept}" 對應的 option value: "${dept_value}"`);
                } else {
                    console.warn(`找不到系所名稱 "${ddl_dept}" 對應的 option value，使用原值`);
                }
            }

            await this.loginToCosSelect();
            if (this.cosSelectLoggedIn) {
                return this.runCourseQueryPuppeteer('dept', { ddl_ym: ymValue, ddl_dept: dept_value, ddl_degree });
            }
            const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";
            const defaultHeaders = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
            };

            try {
                if (!this.backend._cookieStore["CheckCode"]) {
                    this.backend._cookieStore["CheckCode"] = queryFormHelper.generateCheckCode();
                }

                const r1 = await this.backend._httpGet(BASE, defaultHeaders);
                let hidden = this.parseHiddenFields(r1.body);

                const requiredFields = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"];
                const missingFields = requiredFields.filter(field => !hidden[field]);
                if (missingFields.length > 0) {
                    throw new Error(`抓不到隱藏欄位: ${missingFields.join(", ")}`);
                }

                const step1Form = this.buildForm(hidden, {
                    __EVENTTARGET: "DDL_Dept",
                    __EVENTARGUMENT: "",
                    __LASTFOCUS: "",
                    DDL_Dept: dept_value,
                });

                const r2 = await this.backend._httpPostForm(BASE, step1Form, {
                    ...defaultHeaders,
                    Origin: "https://portalfun.yzu.edu.tw",
                    Referer: BASE,
                });

                hidden = this.parseHiddenFields(r2.body);

                const { btnName, btnValue, btnIsImage } = queryFormHelper.findSubmitButton(r2.body);
                const step2Form = this.buildForm(hidden, {
                    __EVENTTARGET: "",
                    __EVENTARGUMENT: "",
                    __LASTFOCUS: "",
                    Q: "RadioButton1",
                    DDL_YM: ymValue,
                    DDL_Dept: dept_value,
                    DDL_Degree: ddl_degree,
                });

                if (btnName) {
                    if (btnIsImage) {
                        step2Form.set(btnName + ".x", "8");
                        step2Form.set(btnName + ".y", "8");
                    } else {
                        step2Form.set(btnName, btnValue || "確定");
                    }
                } else {
                    step2Form.set("Button1", "確定");
                }

                const r3 = await this.backend._httpPostForm(BASE, step2Form, {
                    ...defaultHeaders,
                    Origin: "https://portalfun.yzu.edu.tw",
                    Referer: BASE,
                });

                return this.parseCourseTable(r3.body);
            } catch (err) {
                throw new Error(`系所查詢失敗: ${err.message}`, { cause: err });
            }
        });
    }

    async queryCourseByName(ddl_ym, cos_name) {
        return this._executeInQueue(async () => {
            let ymValue = ddl_ym || '';
            if (ymValue && !ymValue.endsWith('  ')) {
                ymValue = ymValue.trim() + '  ';
            }
            await this.loginToCosSelect();
            if (this.cosSelectLoggedIn) {
                return this.runCourseQueryPuppeteer('name', { ddl_ym: ymValue, cos_name });
            }
            const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";
            const defaultHeaders = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                Origin: "https://portalfun.yzu.edu.tw",
                Referer: BASE,
            };

            try {
                const r1 = await this.backend._httpGet(BASE, defaultHeaders);
                this.ensureCheckCodeCookie();
                let hidden = this.parseHiddenFields(r1.body);

                const step1Form = this.buildForm(hidden, {
                    Q: "RadioButton2",
                    DDL_YM: ymValue,
                    DDL_Dept: "300",
                    DDL_Degree: "1",
                });

                const r2 = await this.backend._httpPostForm(BASE, step1Form, defaultHeaders);
                let response = r2;
                if (r2.statusCode >= 300 && r2.statusCode < 400 && r2.headers.location) {
                    response = await this.backend._httpGet(r2.headers.location, defaultHeaders);
                }

                const { data: hidden2, action: action2 } = this.parseHiddenFieldsComplete(response.body);
                const urlStep2 = this.buildFullUrl(BASE, action2);

                const step2Form = this.buildForm(hidden2, {
                    Q: "RadioButton2",
                    DDL_YM2: ymValue,
                    Txt_Cos_Name: cos_name,
                    Button2: "確定",
                });

                const r3 = await this.backend._httpPostForm(urlStep2, step2Form, defaultHeaders);
                let finalResponse = r3;
                if (r3.statusCode >= 300 && r3.statusCode < 400 && r3.headers.location) {
                    finalResponse = await this.backend._httpGet(r3.headers.location, defaultHeaders);
                }

                return this.parseCourseTable(finalResponse.body);
            } catch (err) {
                throw new Error(`課程名稱查詢失敗: ${err.message}`, { cause: err });
            }
        });
    }

    async queryCourseByTeacher(ddl_ym, teacher_name) {
        return this._executeInQueue(async () => {
            let ymValue = ddl_ym || '';
            if (ymValue && !ymValue.endsWith('  ')) {
                ymValue = ymValue.trim() + '  ';
            }
            await this.loginToCosSelect();
            if (this.cosSelectLoggedIn) {
                return this.runCourseQueryPuppeteer('teacher', { ddl_ym: ymValue, teacher_name });
            }
            const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";
            const defaultHeaders = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                Origin: "https://portalfun.yzu.edu.tw",
                Referer: BASE,
            };

            try {
                const r1 = await this.backend._httpGet(BASE, defaultHeaders);
                this.ensureCheckCodeCookie();
                let hidden = this.parseHiddenFields(r1.body);

                const requiredFields = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"];
                const missingFields = requiredFields.filter(field => !hidden[field]);
                if (missingFields.length > 0) {
                    throw new Error(`抓不到隱藏欄位: ${missingFields.join(", ")}`);
                }

                const step1Form = this.buildForm(hidden, {
                    Q: "RadioButton3",
                    DDL_YM: ymValue,
                });

                const r2 = await this.backend._httpPostForm(BASE, step1Form, defaultHeaders);
                let response = r2;
                if (r2.statusCode >= 300 && r2.statusCode < 400 && r2.headers.location) {
                    response = await this.backend._httpGet(r2.headers.location, defaultHeaders);
                }

                const { data: hidden2, action: action2 } = this.parseHiddenFieldsComplete(response.body);
                const urlStep2 = this.buildFullUrl(BASE, action2);

                const step2Form = this.buildForm(hidden2, {
                    Q: "RadioButton3",
                    DDL_YM3: ymValue,
                    Txt_teacher_Name: teacher_name,
                    Button3: "確定",
                });

                const r3 = await this.backend._httpPostForm(urlStep2, step2Form, defaultHeaders);
                let finalResponse = r3;
                if (r3.statusCode >= 300 && r3.statusCode < 400 && r3.headers.location) {
                    finalResponse = await this.backend._httpGet(r3.headers.location, defaultHeaders);
                }

                return this.parseCourseTable(finalResponse.body);
            } catch (err) {
                throw new Error(`教師姓名查詢失敗: ${err.message}`, { cause: err });
            }
        });
    }

    async queryCourseByTime(ddl_ym, ctl216) {
        return this._executeInQueue(async () => {
            let ymValue = ddl_ym || '';
            if (ymValue && !ymValue.endsWith('  ')) {
                ymValue = ymValue.trim() + '  ';
            }
            // 問題 5：BASE 對齊其他查詢（完整路徑）；Origin 改為 hardcode，不再依賴 BASE 變數
            const BASE = "https://portalfun.yzu.edu.tw/cosSelect/index.aspx?D=G";
            const defaultHeaders = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-TW,zh-HK;q=0.8,zh;q=0.6,en-US;q=0.4,en;q=0.2",
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Upgrade-Insecure-Requests": "1",
                DNT: "1",
                "Sec-GPC": "1",
                Connection: "keep-alive",
                Origin: "https://portalfun.yzu.edu.tw",
            };

            try {
                await this.loginToCosSelect();
                if (this.cosSelectLoggedIn) {
                    return this.runCourseQueryPuppeteer('time', { ddl_ym: ymValue, ctl216 });
                }
                const step1Url = BASE;
                const r1 = await this.backend._httpGet(step1Url, defaultHeaders);
                this.ensureCheckCodeCookie();

                const { data: hidden1, action: action1 } = this.parseHiddenFieldsComplete(r1.body);
                const urlStep2 = this.buildFullUrl(step1Url, action1);

                const requiredFields = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"];
                const missingFields = requiredFields.filter(field => !hidden1[field]);
                if (missingFields.length > 0) {
                    throw new Error(`抓不到隱藏欄位: ${missingFields.join(", ")}`);
                }

                const step2Form = this.buildForm(hidden1, {
                    __EVENTTARGET: "RadioButton4",
                    __EVENTARGUMENT: "",
                    __LASTFOCUS: "",
                    Q: "RadioButton4",
                    DDL_YM: ymValue,
                    DDL_Dept: "300",
                    DDL_Degree: "1",
                });

                const r2 = await this.backend._httpPostForm(urlStep2, step2Form, {
                    ...defaultHeaders,
                    Referer: step1Url
                });

                this.assertNotRedirectLoop(r2);

                let response2 = r2;
                if (r2.statusCode >= 300 && r2.statusCode < 400 && r2.headers.location) {
                    response2 = await this.backend._httpGet(r2.headers.location, defaultHeaders);
                }

                const { data: hidden2, action: action2 } = this.parseHiddenFieldsComplete(response2.body);
                const urlStep3 = this.buildFullUrl(response2.config?.url || step1Url, action2);

                const step3Form = this.buildForm(hidden2, {
                    __EVENTTARGET: "",
                    __EVENTARGUMENT: "",
                    __LASTFOCUS: "",
                    Q: "RadioButton4",
                    DDL_YM4: ymValue,
                    ctl216: ctl216,
                });

                const finalUrl = urlStep3.includes("Q=") ? urlStep3 : `https://portalfun.yzu.edu.tw/cosSelect/index.aspx?Q=${ctl216}`;

                const r3 = await this.backend._httpPostForm(finalUrl, step3Form, {
                    ...defaultHeaders,
                    // 問題 1：移除未定義的 suffix 變數，直接使用完整 URL
                    Referer: "https://portalfun.yzu.edu.tw/cosSelect/index.aspx"
                });

                this.assertNotRedirectLoop(r3);

                let finalResponse = r3;
                if (r3.statusCode >= 300 && r3.statusCode < 400 && r3.headers.location) {
                    finalResponse = await this.backend._httpGet(r3.headers.location, defaultHeaders);
                }

                return this.parseCourseTable(finalResponse.body);
            } catch (err) {
                throw new Error(`時間查詢失敗: ${err.message}`, { cause: err });
            }
        });
    }

    // ==================== 表單輔助方法 ====================

    generateCheckCode() {
        return queryFormHelper.generateCheckCode();
    }

    ensureCheckCodeCookie() {
        queryFormHelper.ensureCheckCodeCookie(this.backend._cookieStore);
    }

    parseHiddenFields(html) {
        return queryFormHelper.parseHiddenFields(html);
    }

    parseHiddenFieldsComplete(html) {
        return queryFormHelper.parseHiddenFieldsComplete(html);
    }

    assertNotRedirectLoop(response) {
        queryFormHelper.assertNotRedirectLoop(response);
    }

    buildForm(hiddenFields, additionalFields = {}) {
        return queryFormHelper.buildForm(hiddenFields, additionalFields);
    }

    buildFullUrl(baseUrl, action) {
        return queryFormHelper.buildFullUrl(baseUrl, action);
    }

    async getFullCourseInfo(ddl_ym, cos_name, cos_id, cos_class) {
        try {
            let cleanName = (cos_name || '')
                .split('\n')[0]
                .replace(/\(Syllabus\)/gi, '')
                .replace(/\([^)]*\)/g, '')
                .split(/\s{2,}/)[0]
                .trim();

            if (!cleanName) {
                cleanName = (cos_name || '').slice(0, 10).trim();
            }

            console.log(`[getFullCourseInfo] 清理後的查詢課程名稱: "${cleanName}"`);
            const result = await this.queryCourseByName(ddl_ym, cleanName);
            if (result && result.success && Array.isArray(result.courses)) {
                const matched = result.courses.find(c => c.cos_id === cos_id && c.cos_class === cos_class);
                if (matched) {
                    console.log(`[getFullCourseInfo] 成功找到匹配的課程:`, matched);
                    return {
                        success: true,
                        course: matched
                    };
                }
            }
            console.warn(`[getFullCourseInfo] 找不到匹配的課程 (${cos_id} ${cos_class})`);
            return {
                success: false,
                message: "找不到該課程的完整資料"
            };
        } catch (error) {
            console.error(`[getFullCourseInfo] 錯誤:`, error.message);
            return {
                success: false,
                message: error.message
            };
        }
    }
}

module.exports = CourseQueryService;
