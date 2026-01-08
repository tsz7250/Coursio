const crypto = require('crypto');
const { default: Axios } = require("axios")
const NodeRSA = require('node-rsa');
const moment = require("moment")
const fs = require("fs")
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');

 

// Browserless for production-grade browser control (懶加載)
let createBrowser = null;
let browserlessRoot = null; // 單例根瀏覽器管理器
let browserlessLoaded = false;

// 配置 axios 以處理自簽名證書和網路問題
// 只在 Node.js 環境中設置 httpsAgent（瀏覽器環境中無效）
var isNodeEnv = typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined';
if (isNodeEnv) {
    Axios.defaults.httpsAgent = new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true,
        timeout: 30000
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
        } catch (error) {
            console.warn("⚠️ Browserless 未安裝或載入失敗");
            createBrowser = null;
            browserlessRoot = null;
        }
    }
    return browserlessRoot;
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

        // 設置帳號密碼
        this._setSidSpwd(sid, spwd);


        // 簡易 GET：使用 Node https/http 並支援重導向
        this._httpGet = function(urlString, headers = {}, redirectCount = 0) {
            return new Promise((resolve, reject) => {
                try {
                    const url = new URL(urlString);
                    const isHttps = url.protocol === 'https:';
                    const mod = isHttps ? https : http;
                    const req = mod.request({
                        protocol: url.protocol,
                        hostname: url.hostname,
                        port: url.port || (isHttps ? 443 : 80),
                        path: url.pathname + (url.search || ''),
                        method: 'GET',
                        headers: headers || {},
                        rejectUnauthorized: false,
                    }, (res) => {
                        const status = res.statusCode || 0;
                        // 處理 3xx 重導向
                        if (status >= 300 && status < 400 && res.headers.location) {
                            if (redirectCount >= 5) return reject(new Error('Too many redirects'));
                            const next = new URL(res.headers.location, urlString).toString();
                            res.resume();
                            return resolve(this._httpGet(next, headers, redirectCount + 1));
                        }

                        const chunks = [];
                        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                        res.on('end', () => {
                            const body = Buffer.concat(chunks).toString('utf8');
                            // 更新 Cookie 儲存
                            if (typeof this._updateCookiesFromResponse === 'function') {
                                this._updateCookiesFromResponse(res, urlString);
                            }
                            resolve({ statusCode: status, headers: res.headers, body });
                        });
                    });
                    req.on('error', reject);
                    req.end();
                } catch (e) {
                    reject(e);
                }
            });
        }

        // 簡單 Cookie 管理
        this._cookieStore = {};
        this._updateCookiesFromResponse = function(res, urlString) {
            const setCookie = res.headers['set-cookie'];
            if (!setCookie || !Array.isArray(setCookie)) return;
            setCookie.forEach((cookieStr) => {
                const pair = String(cookieStr).split(';')[0];
                const eq = pair.indexOf('=');
                if (eq > 0) {
                    const name = pair.substring(0, eq).trim();
                    const value = pair.substring(eq + 1).trim();
                    this._cookieStore[name] = value;
                }
            });
        }
        this._getCookieHeader = function() {
            const entries = Object.entries(this._cookieStore || {});
            if (!entries.length) return '';
            return entries.map(([k, v]) => `${k}=${v}`).join('; ');
        }

        // 預熱瀏覽器快取
        this._prewarmed = null; // { browser, page, expiresAt }
        this._prewarmPromise = null;
        this._prewarmTtlMs = 2 * 60 * 1000; // 2 分鐘 TTL
        this._httpPostForm = function(urlString, form, headers = {}, redirectCount = 0) {
            return new Promise((resolve, reject) => {
                try {
                    const url = new URL(urlString);
                    const isHttps = url.protocol === 'https:';
                    const mod = isHttps ? https : http;
                    const body = new URLSearchParams(form || {}).toString();

                    const mergedHeaders = Object.assign({
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(body),
                    }, headers || {});

                    const cookieHeader = this._getCookieHeader();
                    if (cookieHeader) mergedHeaders['Cookie'] = cookieHeader;

                    const req = mod.request({
                        protocol: url.protocol,
                        hostname: url.hostname,
                        port: url.port || (isHttps ? 443 : 80),
                        path: url.pathname + (url.search || ''),
                        method: 'POST',
                        headers: mergedHeaders,
                        rejectUnauthorized: false,
                    }, (res) => {
                        const status = res.statusCode || 0;
                        // 更新 cookies
                        this._updateCookiesFromResponse(res, urlString);

                        // 處理 3xx 重導向
                        if (status >= 300 && status < 400 && res.headers.location) {
                            if (redirectCount >= 5) return reject(new Error('Too many redirects'));
                            const next = new URL(res.headers.location, urlString).toString();
                            res.resume();
                            // 重導後使用 GET 取得最終頁面
                            return resolve(this._httpGet(next, headers, redirectCount + 1));
                        }

                        const chunks = [];
                        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                        res.on('end', () => {
                            const respBody = Buffer.concat(chunks).toString('utf8');
                            resolve({ statusCode: status, headers: res.headers, body: respBody });
                        });
                    });
                    req.on('error', reject);
                    req.write(body);
                    req.end();
                } catch (e) {
                    reject(e);
                }
            });
        }
    }

    /**
     * 處理教師名稱，移除空的括號和重複內容
     * @param {string} teacherText - 原始教師名稱
     * @returns {string} - 處理後的教師名稱
     */
    processTeacherName(teacherText) {
        if (!teacherText) return '';
        
        
        // 先清理和標準化輸入
        let cleanText = teacherText.trim();
        
        // 處理缺少開頭括號的情況，例如: "廖建勛Chien-Shiun Liao)" -> "廖建勛(Chien-Shiun Liao)"
        // 匹配模式: 中文姓名 + 英文姓名 + 結尾括號
        const missingBracketPattern = /^([\u4e00-\u9fff]+)([A-Za-z\s,]+)\)$/;
        const missingBracketMatch = cleanText.match(missingBracketPattern);
        if (missingBracketMatch) {
            const chineseName = missingBracketMatch[1];
            const englishName = missingBracketMatch[2].trim();
            cleanText = `${chineseName}(${englishName})`;
            return cleanText;
        }
        
        // 處理重複的括號內容，例如: "師德霖Sterling Thomas Swallow)(Sterling Thomas Swallow)" 
        // 先檢查是否有這種模式: 中文姓名 + 英文姓名 + 結尾括號 + 開頭括號 + 重複英文姓名 + 結尾括號
        const duplicatePattern = /^([\u4e00-\u9fff]+)([A-Za-z\s,]+)\)\(([A-Za-z\s,]+)\)$/;
        const duplicateMatch = cleanText.match(duplicatePattern);
        if (duplicateMatch) {
            const chineseName = duplicateMatch[1];
            const englishName = duplicateMatch[2].trim();
            const duplicateEnglishName = duplicateMatch[3].trim();
            
            // 如果英文姓名相同，只保留一個
            if (englishName === duplicateEnglishName) {
                cleanText = `${chineseName}(${englishName})`;
            } else {
                // 如果不同，保留兩個
                cleanText = `${chineseName}(${englishName})(${duplicateEnglishName})`;
            }
            return cleanText;
        }
        
        // 如果包含括號，檢查括號內是否有內容
        if (cleanText.includes('(')) {
            const parts = cleanText.split('(');
            const name = parts[0].trim();
            const bracketContent = parts.slice(1).join('(').trim();
            
            // 如果括號內沒有內容，只返回姓名部分
            if (!bracketContent || bracketContent === ')') {
                return name;
            }
            
            // 檢查是否已經是正確格式（只有一個括號且格式正確）
            const correctFormatPattern = /^[\u4e00-\u9fff]+\([A-Za-z\s,\-]+\)$/;
            if (correctFormatPattern.test(cleanText)) {
                // 在括號前添加換行符，讓英文名字換行顯示
                const result = cleanText.replace('(', '\n(');
                return result;
            }
            
            // 處理重複的括號內容
            let cleanBracketContent = bracketContent;
            
            // 檢查是否有重複的括號內容
            // 使用更簡單的方法：檢查是否包含 ")((" 模式
            if (bracketContent.includes(')(')) {
                
                // 分割並去重
                const parts = bracketContent.split(')(');
                const uniqueParts = new Set();
                const resultParts = [];
                
                for (const part of parts) {
                    const cleanPart = part.replace(/^\(|\)$/g, '').trim().replace(/\s+/g, ' ');
                    if (cleanPart && !uniqueParts.has(cleanPart)) {
                        uniqueParts.add(cleanPart);
                        resultParts.push(cleanPart);
                    }
                }
                
                if (resultParts.length > 0) {
                    const result = name + '\n(' + resultParts.join(')(') + ')';
                    return result;
                }
            }
            
            // 檢查是否有重複的括號內容
            const bracketPattern = /\(([^)]+)\)/g;
            const matches = bracketContent.match(bracketPattern);
            
            if (matches && matches.length > 1) {
                // 檢查是否有重複的內容
                const uniqueContents = new Set();
                const uniqueMatches = [];
                
                for (const match of matches) {
                    const content = match.slice(1, -1).trim(); // 移除括號並清理空白
                    if (!uniqueContents.has(content)) {
                        uniqueContents.add(content);
                        uniqueMatches.push(match);
                    }
                }
                // 如果找到重複，使用去重後的內容
                if (uniqueMatches.length < matches.length) {
                    cleanBracketContent = uniqueMatches.join('');
                    const result = name + '\n' + cleanBracketContent;
                    return result;
                }
            }
            
            const result = name + '\n' + cleanBracketContent;
            return result;
        }
        
        return cleanText;
    }




    // 保留基本登入功能 (使用 NewPortal API)
    loginService(sid, spwd) {
        this._setSidSpwd(sid, spwd)
        
        return this._getRSAKey()
            .then((service) => {
                return service._encryptData(sid, spwd)
            })
            .then((service) => {
                console.log("登入成功");
                return service;
            })
            .catch((error) => {
                console.error("登入失敗:", error.message);
                throw error;
            });
    }

    _setSidSpwd(sid, spwd) {
        this.ALLDATA["account"] = sid;
        this.ALLDATA["password"] = spwd;
        // 保存原始的學號和密碼（未加密）供後續使用
        this.ALLDATA["original_account"] = sid;
        this.ALLDATA["original_password"] = spwd;
    }

    _getRSAKey() {
        var url = "https://portalx.yzu.edu.tw/NewPortal/" + "api/Auth/RSAkeybyAppID"
        var ss = this.ALLDATA["APIkey"] + ":" + this.ALLDATA["Password"]

        var payload = {
            "AppId": this.ALLDATA["AppId"],
            "Content-Type": "application/x-www-form-urlencoded",
        }
        // 注意：在瀏覽器 / Electron 渲染進程中，某些 header（例如 User-Agent, Origin, Referer）
        // 無法由程式碼手動設定，會被視為「unsafe header」而被瀏覽器拒絕。
        // 這裡只設置允許的 header，其餘交由瀏覽器自動處理。
        var headers = {
            "Accept": "application/json",
            "Authorization": "Basic " + Buffer.from(ss).toString('base64'),
            "Content-Type": "application/x-www-form-urlencoded"
        }

        // 存起來 以後就不用再算了
        this.ALLDATA["Authorization"] = headers["Authorization"]
        this.ALLDATA["Accept"] = headers["Accept"]

        var params = new URLSearchParams()
        params.append("AppId", this.ALLDATA["AppId"])
        params.append("Content-Type", "application/x-www-form-urlencoded")

        var that = this

        // 在 Electron 渲染進程中，axios 使用瀏覽器適配器（XMLHttpRequest）
        // 注意：瀏覽器環境中無法設置 User-Agent header（會被拒絕）
        // 禁用自動重定向跟隨，避免重定向循環
        var axiosConfig = {
            headers: headers,
            timeout: 30000,
            maxRedirects: 0, // 禁用自動重定向，避免 ERR_TOO_MANY_REDIRECTS
            validateStatus: function (status) {
                // 接受所有狀態碼，包括重定向，以便手動處理
                return status >= 200 && status < 500;
            }
        }

        // 在 Electron 渲染進程中，httpsAgent 無效（使用瀏覽器適配器）
        // 不設置 httpsAgent，讓瀏覽器處理 HTTPS

        return Axios.post(url, params, axiosConfig).then((response) => {
            // 檢查是否為重定向回應
            if (response.status >= 300 && response.status < 400) {
                var location = response.headers.location || response.headers.Location;
                console.warn("收到重定向回應，狀態碼:", response.status);
                console.warn("重定向位置:", location);
                
                // 如果重定向到登入頁面，可能是認證問題
                if (location && (location.includes('Login') || location.includes('login'))) {
                    throw new Error('伺服器要求重新登入，請檢查 API 認證資訊');
                }
                
                // 如果是相對路徑，構建完整 URL
                if (location && !location.startsWith('http')) {
                    var baseUrl = url.substring(0, url.indexOf('/NewPortal/') + '/NewPortal/'.length);
                    location = baseUrl + location;
                }
                
                // 嘗試跟隨重定向（只跟隨一次）
                if (location) {
                    console.log("嘗試跟隨重定向到:", location);
                    // 更新 Referer header
                    var redirectHeaders = Object.assign({}, headers);
                    redirectHeaders["Referer"] = url;
                    
                    return Axios.post(location, params, {
                        headers: redirectHeaders,
                        timeout: 30000,
                        maxRedirects: 0,
                        validateStatus: function (status) {
                            return status >= 200 && status < 500;
                        }
                    }).then((redirectResponse) => {
                        // 處理重定向後的回應
                        if (redirectResponse.status >= 200 && redirectResponse.status < 300) {
                            that.ALLDATA["PublicKeyXml"] = redirectResponse.data["RSAkey"]
                            that.ALLDATA["Modulus"] = redirectResponse.data["Modulus"]
                            that.ALLDATA["Exponent"] = redirectResponse.data["Exponent"]
                            return that;
                        } else if (redirectResponse.status >= 300 && redirectResponse.status < 400) {
                            throw new Error('重定向循環：收到第二次重定向回應');
                        } else {
                            throw new Error(`重定向後收到意外的回應狀態碼: ${redirectResponse.status}`);
                        }
                    });
                } else {
                    throw new Error('收到重定向回應但沒有 Location header');
                }
            }
            
            // 正常回應（200-299）
            if (response.status >= 200 && response.status < 300) {
                that.ALLDATA["PublicKeyXml"] = response.data["RSAkey"]
                that.ALLDATA["Modulus"] = response.data["Modulus"]
                that.ALLDATA["Exponent"] = response.data["Exponent"]

                return new Promise(function (resolve, reject) {
                    return resolve(that)
                })
            } else {
                throw new Error(`意外的回應狀態碼: ${response.status}`);
            }

        }).catch((error) => {
            console.error("RSA Key 取得失敗:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            if (error.response) {
                console.error("回應狀態:", error.response.status);
                console.error("回應資料:", error.response.data);
                console.error("回應標頭:", error.response.headers);
            } else if (error.request) {
                console.error("請求配置:", error.config);
                console.error("沒有收到回應，請求詳情:", error.request);
            }
            return Promise.reject(error);
        })
    }

    _encryptData(account, password) {
        console.log("---------- Login")

        this._setSidSpwd(account, password)

        var key = new NodeRSA()
        key.setOptions({ encryptionScheme: "pkcs1" });

        key.importKey({
            n: Buffer.from(this.ALLDATA["Modulus"], "base64"),
            e: 65537,
        }, 'components-public');

        this.ALLDATA["account"] = key.encrypt(Buffer.from(account, "ascii"), "base64")
        this.ALLDATA["password"] = key.encrypt(Buffer.from(password, "ascii"), "base64")

        var that = this
        return new Promise(function (resolve, reject) {
            return resolve(that)
        })
    }


    getCourseSchedule(year, smtr) {
        console.log("🚀 使用改進版 Puppeteer 完全自動化課表獲取...");
        
        if (!this.ALLDATA["original_account"] || !this.ALLDATA["original_password"]) {
            console.error("❌ 缺少登入憑證");
            this.setEmptyPersonalSchedule("缺少登入憑證");
            return Promise.resolve(this);
        }
        
        // 🎯 執行改進版 Puppeteer 自動化課表獲取
        return this.getCompleteScheduleData(year, smtr)
            .then((result) => {
                if (result.success) {
                    console.log("✅ 改進版 Puppeteer 課表獲取成功");
                    console.log(`📝 Label1: ${result.data.label1 ? '✅' : '❌'}`);
                    console.log(`📋 Table1: ${result.data.table1 ? '✅' : '❌'}`);
                    
                    // 設置課表數據
                    this.course_schedule_data = {
                        course_list: result.data.course_list || [], // 🎯 使用解析出的課程列表
                        is_personal: true,
                        source: "改進版 Puppeteer 課表獲取",
                        warning: null,
                        message: `成功獲取個人課表 (${result.data.course_list?.length || 0} 門課程)`,
                        label1_info: result.data.label1,
                        raw_table_html: result.data.table1,
                        extraction_time: result.data.extraction_time,
                        puppeteer_success: true
                    };
                    
                    return Promise.resolve(this);
                } else {
                    console.error("❌ 改進版 Puppeteer 課表獲取失敗:", result.message);
                    this.setEmptyPersonalSchedule(`改進版 Puppeteer 失敗: ${result.message}`);
                    return Promise.resolve(this);
                }
            })
            .catch((error) => {
                // 檢查是否是因為清理過程導致的錯誤，但實際課表獲取成功
                if (error.message && error.message.includes('Target closed') && this.course_schedule_data) {
                    console.warn("⚠️ 檢測到清理過程錯誤，但課表數據已成功獲取，忽略此錯誤");
                    return Promise.resolve(this);
                }
                
                console.error("❌ 改進版 Puppeteer 課表獲取異常:", error.message);
                this.setEmptyPersonalSchedule(`系統錯誤: ${error.message}`);
                return Promise.resolve(this);
            });
    }

    // 課表獲取流程
    async getCompleteScheduleData(year = "114", smtr = "1") {
        let browser = null;
        let page = null;
        
        try {
            console.log("🚀 開始完整課表獲取流程...");
            console.log(`👤 學號: ${this.ALLDATA["original_account"]}`);
            console.log(`📚 學期: ${year}年第${smtr}學期`);

            // 優先重用預熱資源（僅 context，當前才建立 page）
            if (this._prewarmed && this._prewarmed.expiresAt > Date.now()) {
                console.log("🔥 使用預熱的 Browserless context");
                browser = this._prewarmed.browser;
                // 於實際使用時才開新頁面
                page = await browser.newPage();
                // 使用後清空快取，避免被重複佔用
                this._prewarmed = null;
            } else {
                // 啟動瀏覽器
                console.log("📱 啟動瀏覽器...");
                browser = await this.launchPuppeteerBrowser();
                page = await browser.newPage();
            }
            
            // 設置用戶代理
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

            // 步驟1: 執行登入
            const loginResult = await this.puppeteerLogin(page);
            if (!loginResult.success) {
                throw new Error(`登入失敗: ${loginResult.message}`);
            }

            // 以網路空閒取代固定等待，確保頁面元素載入完成
            console.log("🔄 確保頁面元素完全載入...");
            await this.waitForNetworkIdle(page, 600, 8000).catch(() => {});

            // 步驟2: 載入課表數據
            const scheduleResult = await this.puppeteerLoadSchedule(page);
            if (!scheduleResult.success) {
                throw new Error(`課表載入失敗: ${scheduleResult.message}`);
            }

            // 步驟3: 解析課表數據
            const parseResult = await this.puppeteerParseSchedule(page);
            if (!parseResult.success) {
                throw new Error(`課表解析失敗: ${parseResult.message}`);
            }

            console.log("🎉 完整課表獲取成功！");
            console.log(`📝 Label1: ${parseResult.data.label1 ? '✅' : '❌'}`);
            console.log(`📋 Table1: ${parseResult.data.table1 ? '✅' : '❌'}`);
            
            // 在清理瀏覽器之前先保存結果
            const result = {
                success: true,
                data: parseResult.data,
                cookies: await page.cookies().catch(() => []), // 安全地獲取 cookies
                message: "課表獲取成功"
            };
            
            return result;

        } catch (error) {
            console.error("❌ 課表獲取流程失敗:", error.message);
            return {
                success: false,
                message: error.message,
                error: error
            };
        } finally {
            // 清理資源 - 使用 try-catch 避免清理錯誤影響主要結果
            if (browser) {
                try {
                    await this.cleanupPuppeteerBrowser(browser);
                } catch (cleanupError) {
                    console.warn("⚠️ 瀏覽器清理過程中出現錯誤，但不影響主要結果:", cleanupError.message);
                }
            }
        }
    }

    // 解析課表 HTML，提取 label1 與 table1 並回傳詳細資訊
    parseScheduleHTMLWithDetails(htmlContent) {
        try {
            console.log("開始解析課表 HTML，尋找 label1 和 table1...");
            console.log("HTML 內容大小:", htmlContent.length, "字元");
            
            const courses = [];
            
            // 1. 提取 label1 內容
            const label1Match = htmlContent.match(/<label[^>]*id\s*=\s*["']label1["'][^>]*>([\s\S]*?)<\/label>/i);
            let label1Content = '';
            if (label1Match) {
                label1Content = label1Match[1].replace(/<[^>]*>/g, '').trim();
                console.log("✅ 找到 label1 內容:", label1Content);
            } else {
                console.log("⚠️ 未找到 label1 元素");
            }
            
            // 2. 提取 table1 內容
            const table1Match = htmlContent.match(/<table[^>]*id\s*=\s*["']table1["'][^>]*>([\s\S]*?)<\/table>/i);
            
            if (table1Match) {
                console.log("✅ 找到 table1，開始解析課表資料...");
                const tableContent = table1Match[1];
                console.log("table1 內容大小:", tableContent.length, "字元");
                
                // 解析 table1 中的課程資料
                const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                let rowMatch;
                let rowCount = 0;
                
                while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
                    rowCount++;
                    const rowContent = rowMatch[1];
                    
                    // 提取該行的所有單元格
                    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                    const cells = [];
                    let cellMatch;
                    
                    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
                        // 移除 HTML 標籤，保留純文字
                        const cellText = cellMatch[1].replace(/<[^>]*>/g, '').trim();
                        if (cellText && cellText !== '&nbsp;') {
                            cells.push(cellText);
                        }
                    }
                    
                    // 如果這一行包含課程資訊，嘗試解析
                    if (cells.length >= 3) {
                        console.log(`第 ${rowCount} 行，包含 ${cells.length} 個單元格:`, cells);
                        const courseInfo = this.extractCourseInfoFromTable1(cells);
                        if (courseInfo) {
                            courses.push(courseInfo);
                            console.log("✅ 解析到課程:", courseInfo.name);
                        }
                    }
                }
                
                console.log(`從 table1 解析完成，處理了 ${rowCount} 行，找到 ${courses.length} 門課程`);
            } else {
                console.log("⚠️ 未找到 table1 元素");
                // 如果找不到 table1，嘗試尋找其他可能的課表格式
                console.log("嘗試尋找其他課表格式...");
                this.logHtmlStructure(htmlContent);
            }
            
            return {
                courses: courses,
                label1Content: label1Content,
                found_table1: !!table1Match,
                found_label1: !!label1Match
            };
            
        } catch (error) {
            console.error("解析課表 HTML 失敗:", error);
            return {
                courses: [],
                label1Content: '',
                found_table1: false,
                found_label1: false,
                error: error.message
            };
        }
    }

    // 輔助方法：記錄 HTML 結構以便調試
    logHtmlStructure(htmlContent) {
        try {
            console.log("分析 HTML 結構...");
            
            // 尋找所有 table 元素
            const allTables = htmlContent.match(/<table[^>]*>/gi) || [];
            console.log("找到的 table 元素:", allTables.length);
            allTables.forEach((table, index) => {
                console.log(`Table ${index + 1}:`, table);
            });
            
            // 尋找所有 label 元素
            const allLabels = htmlContent.match(/<label[^>]*>/gi) || [];
            console.log("找到的 label 元素:", allLabels.length);
            allLabels.forEach((label, index) => {
                console.log(`Label ${index + 1}:`, label);
            });
            
            // 尋找所有有 id 屬性的元素
            const elementsWithId = htmlContent.match(/<[^>]*id\s*=\s*["'][^"']*["'][^>]*>/gi) || [];
            console.log("有 id 屬性的元素:", elementsWithId.length);
            elementsWithId.slice(0, 10).forEach((element, index) => {
                console.log(`ID Element ${index + 1}:`, element);
            });
            
        } catch (error) {
            console.warn("分析 HTML 結構時發生錯誤:", error);
        }
    }

    // 輔助方法：從 table1 的表格單元格提取課程資訊
    extractCourseInfoFromTable1(cells) {
        try {
            console.log("解析 table1 單元格:", cells);
            
            // 根據 table1 的實際結構調整欄位映射
            // 通常個人課表的欄位可能包括：課程代號、課程名稱、學分、時間、教室、教師等
            const courseInfo = {
                course_id: cells[0] || 'UNKNOWN',
                name: cells[1] || cells[0] || '未知課程', // 如果第二欄是課程名稱
                credit: this.extractCredit(cells[2] || '0'),
                time: this.parseTimeSlot(cells[3] || ''),
                room: cells[4] || '未知教室',
                teacher_name: this.processTeacherName(cells[5] || '未知教師'),
                dept_name: '個人課程', // 從個人課表來的都標記為個人課程
                is_selected: true,
                source: "官方個人課表 HTML (table1)"
            };
            
            // 驗證課程資訊的有效性
            if (this.isValidCourseInfo(courseInfo)) {
                return courseInfo;
            }
            
            return null;
            
        } catch (error) {
            console.warn("從 table1 提取課程資訊失敗:", error);
            return null;
        }
    }

    // 輔助方法：驗證課程資訊是否有效
    isValidCourseInfo(courseInfo) {
        // 檢查課程名稱是否有效
        if (!courseInfo.name || courseInfo.name.length < 2) {
            return false;
        }
        
        // 過濾掉明顯不是課程的內容
        const invalidPatterns = [
            '&nbsp;', '　', 'undefined', 'null', '未知課程',
            '課程代號', '課程名稱', '學分', '時間', '教室', '教師', // 表頭
            '合計', '小計', '總計', '備註', '說明' // 統計行
        ];
        
        for (const pattern of invalidPatterns) {
            if (courseInfo.name.includes(pattern)) {
                return false;
            }
        }
        
        // 檢查課程代號是否合理（通常是英數字組合）
        if (courseInfo.course_id === 'UNKNOWN' && courseInfo.name.length < 3) {
            return false;
        }
        
        return true;
    }

    // 輔助方法：解析時間格式
    parseTimeSlot(timeText) {
        try {
            // 將時間文字轉換為標準格式
            // 例如 "週一第1,2節" -> "112"
            if (!timeText || timeText.trim() === '') {
                return "時間待確認";
            }
            
            // 移除多餘的空白和特殊字符
            const cleanTime = timeText.replace(/\s+/g, '').replace(/[（）()]/g, '');
            
            // 嘗試提取週幾和節次資訊
            const dayMapping = {
                '一': '1', '二': '2', '三': '3', '四': '4', 
                '五': '5', '六': '6', '日': '7', '天': '7'
            };
            
            let result = [];
            
            // 尋找週幾
            for (const [chinese, number] of Object.entries(dayMapping)) {
                if (cleanTime.includes('週' + chinese) || cleanTime.includes('星期' + chinese)) {
                    // 尋找節次
                    const periodRegex = /第?([0-9,，、]+)節?/g;
                    let periodMatch;
                    
                    while ((periodMatch = periodRegex.exec(cleanTime)) !== null) {
                        const periods = periodMatch[1].split(/[,，、]/).map(p => p.trim()).filter(p => p);
                        for (const period of periods) {
                            if (period && period.length <= 2) {
                                result.push(number + period.padStart(2, '0'));
                            }
                        }
                    }
                }
            }
            
            return result.length > 0 ? result.join(',') : timeText;
            
        } catch (error) {
            console.warn("解析時間格式失敗:", error);
            return timeText || "時間待確認";
        }
    }

    // 輔助方法：提取學分數
    extractCredit(creditText) {
        try {
            const match = creditText.match(/(\d+)/);
            return match ? parseInt(match[1]) : 0;
        } catch (error) {
            return 0;
        }
    }

    // 輔助方法：提取課程代碼
    extractCourseId(cells) {
        try {
            // 在各個單元格中尋找看起來像課程代碼的文字
            for (const cell of cells) {
                // 課程代碼通常是數字和字母的組合
                const match = cell.match(/[A-Z0-9]{6,}/);
                if (match) {
                    return match[0];
                }
            }
            return 'UNKNOWN';
        } catch (error) {
            return 'UNKNOWN';
        }
    }

    // 新增：設定空白個人課表
    setEmptyPersonalSchedule(errorMessage) {
        console.log("設定空白個人課表，原因:", errorMessage);
            
            this.course_schedule_data = {
                course_list: [],
            is_personal: true,
            source: "個人課表（空白）",
            warning: errorMessage,
            message: "個人課表無資料",
            empty_reason: errorMessage
        };
        
        return Promise.resolve(this);
    }

 

    // 🔧 啟動瀏覽器
    async launchPuppeteerBrowser() {
        try {
            console.log("🚀 以 Browserless 啟動上下文...");
            const root = loadBrowserless();
            if (!root) throw new Error("Browserless 不可用");

            // 建立 browserless context
            const browserless = await root.createContext();

            // 輕量 Browser 介面轉接器，與現有呼叫相容（newPage/pages/close）
            const adapter = {
                _browserless: browserless,
                async newPage() {
                    return await browserless.page();
                },
                async pages() {
                    // browserless 不提供列舉頁面的API，回傳空陣列以符合清理流程
                    return [];
                },
                async close() {
                    if (typeof browserless.destroyContext === 'function') {
                        await browserless.destroyContext();
                    } else if (typeof browserless.destroy === 'function') {
                        await browserless.destroy();
                    }
                }
            };

            return adapter;
            
        } catch (error) {
            console.error("❌ 瀏覽器啟動失敗:", error.message);
            
            // 🎯 解決問題5: Chrome不存在的fallback
            if (error.message.includes("找不到Chrome")) {
                console.log("💡 建議: 請安裝Google Chrome瀏覽器");
                console.log("💡 下載地址: https://www.google.com/chrome/");
            }
            
            throw error;
        }
    }

    // 預熱 Browserless（只建立 context，不自動開頁或導向）
    async prewarmBrowser() {
        try {
            // 已有且未過期，直接回傳
            if (this._prewarmed && this._prewarmed.expiresAt > Date.now()) {
                return this._prewarmed;
            }
            // 進行中的預熱，等待完成
            if (this._prewarmPromise) {
                return await this._prewarmPromise;
            }

            console.log("🧊 開始預熱 Browserless context...");
            this._prewarmPromise = (async () => {
                const browser = await this.launchPuppeteerBrowser();

                this._prewarmed = {
                    browser,
                    page: null,
                    expiresAt: Date.now() + this._prewarmTtlMs
                };
                console.log("✅ 預熱完成");
                return this._prewarmed;
            })();

            return await this._prewarmPromise;
        } catch (e) {
            // 預熱失敗不影響後續登入
            this._prewarmed = null;
            throw e;
        } finally {
            this._prewarmPromise = null;
        }
    }

    // 登入流程
    async puppeteerLogin(page) {
        try {
            console.log("🔐 開始Puppeteer登入流程...");

            // 監聽原生 alert/confirm 對話框以偵測登入失敗
            let loginFailedByDialog = false;
            const onDialog = async (dialog) => {
                try {
                    const msg = dialog && dialog.message ? (dialog.message() || '') : '';
                    if (msg.includes('Login Failed') || msg.includes('登入失敗')) {
                        loginFailedByDialog = true;
                        await dialog.accept().catch(() => {});
                    } else {
                        await dialog.dismiss().catch(() => {});
                    }
                } catch (_) {}
            };
            try { page.on('dialog', onDialog); } catch (_) {}

            let cleaned = false;
            const cleanup = () => {
                if (cleaned) return;
                cleaned = true;
                try { page.off('dialog', onDialog); } catch (_) {}
            };

            // 前往登入頁面
            await page.goto('https://portalx.yzu.edu.tw/PortalSocialVB/Login.aspx', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 等待表單元素載入
            await page.waitForSelector('#Txt_UserID', { timeout: 10000 });

            // 填入帳號密碼
            console.log("📝 填入登入資訊...");
            // 確保帳號和密碼是字符串
            const accountStr = String(this.ALLDATA["original_account"] || '');
            const passwordStr = String(this.ALLDATA["original_password"] || '');
            await page.type('#Txt_UserID', accountStr);
            await page.type('#Txt_Password', passwordStr);

            // 等待reCaptcha token生成
            console.log("🔒 等待reCaptcha驗證...");
            await page.waitForFunction(() => {
                const hidToken = document.getElementById('hidToken');
                return hidToken && hidToken.value && hidToken.value.length > 10;
            }, { timeout: 10000 });

            console.log("✅ reCaptcha驗證完成");

            // 點擊登入按鈕
            await page.click('#ibnSubmit');

            // 等待登入成功或對話框失敗（擇一先發生）
            console.log("⏱️ 等待登入完成...");
            const successWait = page.waitForFunction(() => {
                try {
                    const bodyText = document.body && document.body.innerText ? String(document.body.innerText) : '';
                    return window.location.href.includes('DefaultPage.aspx') ||
                           bodyText.includes('個人portal');
                } catch (e) {
                    return false;
                }
            }, { timeout: 20000 }).then(() => 'SUCCESS');

            // 掃描主頁與所有 iframe 的失敗訊息或模態選擇器
            const failurePoll = async () => {
                const hasFailInFrame = async (f) => {
                    try {
                        return await f.evaluate(() => {
                            try {
                                const bodyText = document.body && document.body.innerText ? String(document.body.innerText) : '';
                                if (bodyText.includes('Login Failed') || bodyText.includes('登入失敗')) return true;
                                // 常見 UI 框架的容器
                                const selectors = ['.swal2-container', '.swal2-popup', '.modal', '.sweet-alert', '#errorBox'];
                                return selectors.some(sel => document.querySelector(sel));
                            } catch (e) {
                                return false;
                            }
                        });
                    } catch (e) {
                        return false;
                    }
                };

                // 檢查主頁
                try {
                    if (await hasFailInFrame(page.mainFrame())) return true;
                } catch (_) {}

                // 檢查所有子 frame（確保 frames 是數組或可迭代對象）
                try {
                    const frames = page.frames();
                    if (frames) {
                        // 確保 frames 是可迭代的數組
                        let framesArray = [];
                        if (Array.isArray(frames)) {
                            framesArray = frames;
                        } else if (frames && typeof frames[Symbol.iterator] === 'function') {
                            // 如果是可迭代對象，轉換為數組
                            try {
                                framesArray = Array.from(frames);
                            } catch (e) {
                                throw e;
                            }
                        } else if (typeof frames.length === 'number') {
                            // 如果是類數組對象，轉換為數組
                            try {
                                framesArray = Array.from(frames);
                            } catch (e) {
                                throw e;
                            }
                        }
                        
                        for (const f of framesArray) {
                            if (!f || f === page.mainFrame()) continue;
                            try {
                                if (await hasFailInFrame(f)) return true;
                            } catch (e) {
                                // 忽略單個 frame 的錯誤
                            }
                        }
                    }
                } catch (e) {
                    console.warn("檢查 frames 時出錯:", e);
                }
                
                return false;
            };

            const dialogOrDomWait = new Promise((resolve) => {
                const tick = async () => {
                    if (loginFailedByDialog) return resolve('DIALOG_FAILED');
                    try {
                        const failed = await failurePoll();
                        if (failed) return resolve('DOM_FAILED');
                    } catch (_) {}
                    setTimeout(tick, 150);
                };
                tick();
            });

            const outcome = await Promise.race([successWait, dialogOrDomWait]);

            // 安全地獲取 URL 和頁面內容
            let currentUrl = '';
            let pageContent = '';
            try {
                currentUrl = String(page.url() || '');
            } catch (e) {
                console.warn("無法獲取當前 URL:", e);
            }
            try {
                pageContent = String(await page.content() || '');
            } catch (e) {
                console.warn("無法獲取頁面內容:", e);
            }

            if (outcome === 'SUCCESS' || 
                (currentUrl && currentUrl.includes('DefaultPage.aspx')) || 
                (pageContent && pageContent.includes('個人portal'))) {
                console.log("✅ 登入成功！");
                // 登入成功後立即返回，頁面載入在背景進行
                cleanup();
                return { success: true };
            } else {
                console.error("❌ 登入失敗");
                const message = loginFailedByDialog ? "登入失敗（對話框）" : "登入失敗，可能是帳號密碼錯誤";
                cleanup();
                return { success: false, message };
            }

        } catch (error) {
            console.error("❌ 登入過程出錯:", error.message);
            return { success: false, message: error.message };
        } finally {
            // 確保釋放監聽器
            try { page.removeAllListeners && page.removeAllListeners('dialog'); } catch (_) {}
        }
    }

    // 處理 iframe 中的課表內容
    async handleScheduleIframe(page) {
        try {
            console.log("🔍 尋找課表iframe...");

            // 檢查是否有iframe
            const iframes = await page.$$('iframe');
            console.log(`找到 ${iframes.length} 個iframe`);

            if (iframes.length > 0) {
                // 尋找可能包含課表的iframe
            for (let i = 0; i < iframes.length; i++) {
                const iframe = iframes[i];
                    
                    // 獲取iframe的src屬性
                const src = await iframe.evaluate(el => el.src);
                    console.log(`iframe ${i}: ${src}`);

                    // 檢查是否是課表相關的iframe
                    if (src && (src.includes('IFrameSub') || src.includes('Schedule') || src.includes('portalfun'))) {
                        console.log(`✅ 找到課表iframe: ${src}`);
                        
                        // 等待 iframe 可取得內容或目標URL
                        let frame = await iframe.contentFrame();
                        if (!frame) {
                            await page.waitForFunction((el) => !!el && !!el.contentWindow, { timeout: 6000 }, iframe).catch(() => {});
                            frame = await iframe.contentFrame();
                        }
                        
                        // 嘗試獲取iframe內容
                    try {
                        if (frame) {
                            
                                // 等待iframe內容載入
                                await frame.waitForSelector('body', { timeout: 10000 });
                            
                                // 檢查iframe中的URL
                            const frameUrl = await frame.url();
                                
                                // 如果iframe已經導向portalfun的課表頁面，直接獲取內容
                                if (frameUrl.includes('portalfun') && frameUrl.includes('Schedule')) {
                                    // iframe已導向真正的課表頁面
                                    
                                    // 從iframe中提取課表數據
                                    const iframeScheduleData = await frame.evaluate(() => {
                    const result = {
                        label1_info: '',
                        schedule_table: '',
                        course_list: [],
                        current_url: window.location.href
                    };
                    
                                        // 尋找Label1 (注意大寫)
                                        const label1 = document.getElementById('Label1');
                    if (label1) {
                                            result.label1_info = label1.innerHTML || label1.textContent || label1.innerText || '';
                    }
                    
                                        // 尋找Table1 (注意大寫)
                                        const table1 = document.getElementById('Table1');
                    if (table1) {
                        result.schedule_table = table1.outerHTML;
                    }
                    
                    // 尋找所有課表相關表格
                    const tables = document.querySelectorAll('table');
                    for (const table of tables) {
                        const tableText = table.textContent || table.innerText || '';
                        if (tableText.includes('課程') || tableText.includes('時間') || tableText.includes('星期')) {
                            if (!result.schedule_table) {
                                result.schedule_table = table.outerHTML;
                            }
                            
                            // 解析課程信息
                            const rows = table.querySelectorAll('tr');
                            rows.forEach((row, index) => {
                                const cells = row.querySelectorAll('td, th');
                                if (cells.length > 1) {
                                    const rowText = Array.from(cells).map(cell => 
                                        (cell.textContent || cell.innerText || '').trim()
                                    ).join(' ').trim();
                                    
                                    if (rowText && !rowText.includes('星期') && rowText.length > 5) {
                                        result.course_list.push({
                                            row_index: index,
                                            course_text: rowText,
                                            is_selected: true
                                        });
                                    }
                                }
                            });
                        }
                    }
                    
                    return result;
                });

                                    if (iframeScheduleData.schedule_table || iframeScheduleData.label1_info) {
                                        // 將iframe數據存儲起來供後續使用
                                        this.iframeScheduleData = iframeScheduleData;
                                        console.log("✅ 成功從iframe提取課表數據");
                                        return { success: true, data: iframeScheduleData };
                }
            } else {
                                    console.log("⏱️ iframe尚未導向課表頁面，等待網路空閒...");
                                    await this.waitForNetworkIdle(page, 600, 8000).catch(() => {});
                                    
                                    // 再次檢查URL
                                    const newFrameUrl = await frame.url();
                                    console.log("📍 iframe新URL:", newFrameUrl);
                                }
                                
                            } else {
                                console.log("⚠️ 無法訪問iframe內容 (跨域限制)");
                            }
                        } catch (iframeError) {
                            console.log("⚠️ iframe訪問錯誤:", iframeError.message);
                        }
                        
                        break; // 只處理第一個相關的iframe
                    }
                }
            } else {
                console.log("⚠️ 未找到任何iframe");
            }

            console.log("✅ iframe處理完成");
            return { success: false, message: "未找到有效的課表iframe" };

        } catch (error) {
            console.log("⚠️ iframe處理過程中發生錯誤:", error.message);
            return { success: false, message: error.message };
        }
    }

    // 載入課表
    async puppeteerLoadSchedule(page) {
        try {
            console.log("📋 開始載入課表...");

            // 等待主頁面可互動（存在課表選單或相關 onclick）
            await page.waitForFunction(() => {
                return document.getElementById('tdS14') || Array.from(document.querySelectorAll('*[onclick]')).some(el => {
                    const text = (el.textContent || el.innerText || '').trim();
                    const onclick = el.getAttribute('onclick') || '';
                    return (text.includes('課表') && onclick.includes('S5')) || onclick.includes("GoToURL('App_','S5')");
                });
            }, { timeout: 12000 }).catch(() => {});

            // 🎯 直接點擊課表菜單項
            const currentUrl = page.url();
            console.log("📍 當前頁面URL:", currentUrl);
            console.log("🔍 尋找課表菜單項...");

            // 等待頁面完全載入，確保菜單元素出現
            await page.waitForFunction(() => {
                return document.getElementById('tdS14') || 
                       document.querySelector('*[onclick*="S5"]') ||
                       document.querySelector('*[onclick*="GoToURL"]');
            }, { timeout: 10000 }).catch(() => {
                console.warn("⚠️ 等待菜單元素超時，繼續嘗試...");
            });

            // 多種方式尋找課表菜單
            const scheduleMenuFound = await page.evaluate(() => {
                // 開始尋找課表菜單
                let scheduleElement = document.getElementById('tdS14');
                console.log("🔍 檢查 tdS14 元素:", !!scheduleElement);
                
                // 方法2: 尋找包含"課表"文字且onclick包含S5的元素
                if (!scheduleElement) {
                    const elements = document.querySelectorAll('*[onclick*="S5"]');
                    console.log("🔍 找到", elements.length, "個包含S5的元素");
                    for (const el of elements) {
                        const text = el.textContent || el.innerText || '';
                        const onclick = el.getAttribute('onclick') || '';
                        if (text.includes('課表') && onclick.includes('S5')) {
                            scheduleElement = el;
                            console.log("✅ 找到課表菜單元素:", text.trim());
                            break;
                        }
                    }
                    
                    // 如果還沒找到，遍歷所有包含"課表"文字的元素
                    if (!scheduleElement) {
                        const allElements = document.querySelectorAll('*');
                        for (const el of allElements) {
                            const text = el.textContent || el.innerText || '';
                            const onclick = el.getAttribute('onclick') || '';
                            if (text.trim() === '課表' && onclick.includes('S5')) {
                                scheduleElement = el;
                                break;
                            }
                        }
                    }
                }
                
                // 方法3: 尋找包含GoToURL('App_','S5')的元素
                if (!scheduleElement) {
                    const allElements = document.querySelectorAll('*[onclick]');
                    for (const el of allElements) {
                        const onclick = el.getAttribute('onclick') || '';
                        if (onclick.includes("GoToURL('App_','S5')")) {
                            scheduleElement = el;
                            break;
                        }
                    }
                }
                
                if (scheduleElement) {
                return {
                        found: true,
                        id: scheduleElement.id,
                        text: scheduleElement.textContent || scheduleElement.innerText,
                        onclick: scheduleElement.getAttribute('onclick')
                    };
                }
                
                return { found: false };
            });

            if (scheduleMenuFound.found) {
                // 監聽可能的頁面導航
                const navigationPromise = new Promise((resolve) => {
                    let navigationCompleted = false;
                    
                    // 監聽頁面變化
                    page.on('framenavigated', (frame) => {
                        if (frame === page.mainFrame() && !navigationCompleted) {
                            navigationCompleted = true;
                            console.log("✅ 檢測到頁面導航完成");
                            resolve();
                        }
                    });
                    
                    // 監聽AJAX請求
                    page.on('response', async (response) => {
                        if ((response.url().includes('portalfun') || 
                             response.url().includes('Schedule') || 
                             response.url().includes('FFB_Login')) && !navigationCompleted) {
                            navigationCompleted = true;
                            console.log("✅ 檢測到課表相關請求完成");
                            resolve();
                        }
                    });
                    
                    // 設置超時
                    setTimeout(() => {
                        if (!navigationCompleted) {
                            console.log("⏰ 導航請求超時，繼續執行...");
                            resolve();
                        }
                    }, 15000);
                });

                // 點擊課表菜單
                console.log("🖱️ 點擊課表菜單...");
                await page.evaluate((menuInfo) => {
                    const element = document.getElementById(menuInfo.id) || 
                                  document.querySelector(`*[onclick*="GoToURL('App_','S5')"]`);
                    
                    if (element) {
                        element.click();
                        
                        // 如果點擊沒有效果，嘗試直接調用onclick函數
                        if (element.onclick) {
                            element.onclick();
                        } else if (typeof GoToURL === 'function') {
                            GoToURL('App_', 'S5');
                        }
                    }
                }, scheduleMenuFound);

                // 等待導航或AJAX完成
                console.log("⏱️ 等待課表頁面載入...");
                await navigationPromise;
                await this.waitForNetworkIdle(page, 600, 12000).catch(() => {});

                // 🎯 檢查並處理iframe中的課表內容
                console.log("🔍 檢查iframe中的課表內容...");
                const iframeResult = await this.handleScheduleIframe(page);
                
                if (iframeResult.success) {
                    return { success: true };
                }

                return { success: true }; // 即使iframe失敗也繼續，可能主頁面有數據
            } else {
                console.log("⚠️ 未找到課表菜單，嘗試其他方法...");
                
                // 嘗試直接訪問課表頁面
                console.log("🔄 嘗試直接訪問課表頁面...");
                try {
                    await page.goto('https://portalfun.yzu.edu.tw/VC2/Student/console/My_Schedule_XP.aspx', {
                        waitUntil: 'networkidle2',
                        timeout: 15000
                    });
                    
                    const scheduleUrl = page.url();
                    if (!scheduleUrl.includes('chrome-error') && !scheduleUrl.includes('login1.htm')) {
                                return { success: true };
                    }
                } catch (directError) {
                    console.log("❌ 直接訪問失敗:", directError.message);
                }

                return { success: false, message: "無法載入課表數據" };
            }

        } catch (error) {
            console.error("❌ 載入課表失敗:", error.message);
            return { success: false, message: error.message };
        }
    }

    // 解析課表數據
    async puppeteerParseSchedule(page) {
        try {
            console.log("📊 解析課表數據...");

            // 🎯 優先使用iframe中的課表數據
            if (this.iframeScheduleData) {
                console.log("🎯 使用iframe中預存的課表數據...");
                const processedData = this.processScheduleDataFromComplete({
                    label1_info: this.iframeScheduleData.label1_info,
                    schedule_table: this.iframeScheduleData.schedule_table
                });

                return {
                    success: true,
                    data: processedData
                };
            }

            // 等待可能的頁面載入（Label1 或 Table1 出現）
            await page.waitForFunction(() => !!document.getElementById('Label1') || !!document.getElementById('Table1'), { timeout: 10000 }).catch(() => {
                console.warn("⚠️ 等待課表元素超時，嘗試繼續解析...");
            });

            // 只抓取 Label1 與 Table1
            const scheduleData = await page.evaluate(() => {
                    const result = {
                        label1_info: '',
                    schedule_table: ''
                };

                const label1Element = document.getElementById('Label1');
                if (label1Element) {
                    result.label1_info = label1Element.innerHTML || label1Element.textContent || label1Element.innerText || '';
                }

                const table1Element = document.getElementById('Table1');
                if (table1Element) {
                    result.schedule_table = table1Element.outerHTML;
                    }
                    
                    return result;
                });

            // 檢查是否成功獲取數據
            if (scheduleData.label1_info || scheduleData.schedule_table) {
                const processedData = this.processScheduleDataFromComplete(scheduleData);
                    
                    return {
                        success: true,
                        data: processedData
                    };
            } else {
                // 嘗試檢查頁面是否有其他課表相關元素
                const pageContent = await page.evaluate(() => {
                    const bodyText = document.body.innerText || '';
                    const hasScheduleKeywords = /課表|課程|時間表|schedule/i.test(bodyText);
                    const hasTableElements = document.querySelectorAll('table').length > 0;
                    return { hasScheduleKeywords, hasTableElements, bodyText: bodyText.substring(0, 200) };
                });
                
                console.warn("⚠️ 課表解析失敗，頁面內容分析:", pageContent);
                
                return {
                    success: false,
                    message: `頁面中未找到Label1或Table1數據。頁面分析：${pageContent.hasScheduleKeywords ? '包含課表關鍵字' : '無課表關鍵字'}，${pageContent.hasTableElements ? '包含表格元素' : '無表格元素'}`
                };
            }

        } catch (error) {
            console.error("❌ 解析課表數據失敗:", error.message);
            return {
                success: false,
                message: error.message
            };
        }
    }

    // 處理並標準化課表數據
    processScheduleDataFromComplete(rawData) {
        const cleanLabel1 = (text) => {
            if (!text) return '';
            
            let t = String(text);
            
            // 如果包含 HTML 標籤，先處理 <br> 分割
            if (t.includes('<br>') || t.includes('<BR>')) {
                // 以 <br> 分割，取第一部分（中文部分）
                const parts = t.split(/<br\s*\/?>/i);
                t = parts[0].trim();
            }
            
            // 清理 HTML 標籤和多餘空格
            t = t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            
            // 直接匹配中文課表格式，限制數字長度避免匹配到 1141
            const match = t.match(/(\d{1,3}\s*學年第\s*\d{1,2}\s*學期學分小計[:：]\s*\d{1,3})/);
            if (match) {
                return match[1].replace(/\s+/g, ' ').trim();
            }
            
            // 降級處理：匹配到小計後的合理數字
            const fallbackMatch = t.match(/(.*?小計[:：]?\s*)(\d{1,3})(?:\s|$)/);
            if (fallbackMatch) {
                return (fallbackMatch[1] + fallbackMatch[2]).replace(/\s+/g, ' ').trim();
            }
            
            return t;
        };

        // 🎯 從 Table1 HTML 中提取課程列表
        const parseCourseListFromTable1 = (tableHTML) => {
            const courseList = [];
            if (!tableHTML) return courseList;

            try {
                console.log("🔍 開始從 Table1 解析課程資料...");
                
                // 使用正則表達式解析 HTML table
                const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                let rowMatch;
                let rowIndex = 0;
                
                while ((rowMatch = rowRegex.exec(tableHTML)) !== null) {
                    rowIndex++;
                    const rowHTML = rowMatch[1];
                    
                    // 跳過表頭行（通常包含 Mon, Tue, Wed 等）
                    if (rowHTML.includes('Mon') || rowHTML.includes('週一') || rowHTML.includes('時間')) {
                        continue;
                    }
                    
                    // 解析該行的所有 cell
                    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                    let cellMatch;
                    let cellIndex = 0;
                    let timeInfo = '';
                    
                    while ((cellMatch = cellRegex.exec(rowHTML)) !== null) {
                        const cellHTML = cellMatch[1];
                        const cellText = cellHTML.replace(/<[^>]*>/g, '').trim();
                        
                        if (cellIndex === 0) {
                            // 第一個 cell 是時間資訊
                            timeInfo = cellText;
                            cellIndex++;
                            continue;
                        }
                        
                        // 檢查是否有課程內容（包含連結或足夠的文字）
                        if (cellHTML.includes('<a') && cellHTML.includes('href') && cellText.length > 5) {
                            console.log(`📚 發現課程: ${cellText.substring(0, 50)}...`);
                            
                            // 解析課程資訊
                            const courseInfo = this.parseCourseInfoFromCell(cellText, cellHTML, timeInfo, cellIndex);
                            if (courseInfo) {
                                courseList.push(courseInfo);
                            }
                        }
                        
                        cellIndex++;
                    }
                }
                
                console.log(`✅ 從 Table1 解析完成，找到 ${courseList.length} 門課程`);
                return courseList;
                
            } catch (error) {
                console.error("❌ 解析 Table1 課程時出錯:", error);
                return courseList;
            }
        };

        const courseList = parseCourseListFromTable1(rawData.schedule_table);

        const processed = {
            label1: cleanLabel1(rawData.label1_info || ''),
            table1: rawData.schedule_table || '',
            course_list: courseList, // 🎯 重要：加入解析出的課程列表
            is_personal: true,
            source: "Puppeteer 改進版課表獲取",
            extraction_time: new Date().toISOString()
        };

        console.log("🔄 課表數據處理完成（complete_schedule 風格）:");
        console.log(`  - Label1: ${processed.label1 ? '✅' : '❌'}`);
        console.log(`  - Table1: ${processed.table1 ? '✅' : '❌'}`);
        console.log(`  - 課程數量: ${processed.course_list.length}`);

        return processed;
    }

    // 🎯 解析單個課程資訊
    parseCourseInfoFromCell(cellText, cellHTML, timeInfo, dayIndex) {
        try {
            // 解析課程文字，通常格式是：
            // CS678 (3)
            // 圖論
            // R1401B
            const lines = cellText.split('\n').map(line => line.trim()).filter(line => line);
            
            if (lines.length < 2) {
                return null; // 需要至少有課程代碼和名稱
            }
            
            let courseId = 'UNKNOWN';
            let courseName = '未知課程';
            let room = '未知教室';
            let credit = 0;
            let teacher = '未知教師';
            
            // 第一行：課程代碼和學分 (例如: CS678 (3))
            const firstLine = lines[0];
            const codeMatch = firstLine.match(/([A-Z]{2,3}\d{3,4})/);
            const creditMatch = firstLine.match(/\((\d+)\)/);
            
            if (codeMatch) courseId = codeMatch[1];
            if (creditMatch) credit = parseInt(creditMatch[1]);
            
            // 第二行：課程名稱
            if (lines[1]) courseName = lines[1];
            
            // 第三行：教室
            if (lines[2]) room = lines[2];
            
            // 第四行：教師（如果有）
            if (lines[3]) teacher = lines[3];
            
            // 解析時間資訊
            const periodMatch = timeInfo.match(/第\s*(\d+)\s*節/);
            const period = periodMatch ? parseInt(periodMatch[1]) : null;
            
            // 計算星期幾 (cellIndex - 1，因為第一個cell是時間)
            const dayNum = dayIndex; // 1=週一, 2=週二, ..., 7=週日
            
            const courseInfo = {
                course_id: courseId,
                name: courseName,
                teacher_name: this.processTeacherName(teacher),
                room: room,
                time: timeInfo,
                day: dayNum,
                period: period,
                dept_name: '個人課程',
                credit: credit,
                is_selected: true,
                source: "Table1 HTML解析",
                raw_text: cellText,
                raw_html: cellHTML
            };
            
            console.log(`  ✅ 課程解析: ${courseId} - ${courseName} (第${period}節, 星期${dayNum})`);
            
            return courseInfo;

        } catch (error) {
            console.warn("⚠️ 解析課程資訊時出錯:", error);
            return null;
        }
    }

    // 處理從課表頁面抓取的數據（相容既有資料結構）
    processPuppeteerScheduleData(rawData) {
        const processed = {
            is_personal: true,
            label1_info: rawData.label1_info || '',
            course_list: [],
            raw_table_html: rawData.schedule_table || '',
            extraction_time: new Date().toISOString()
        };

        // 處理課程列表
        if (rawData.course_list && rawData.course_list.length > 0) {
            rawData.course_list.forEach(course => {
                const courseText = course.course_text || '';
                
                if (courseText && courseText.length > 5) {
                    // 🎯 解析課程信息（CS678 (3)\n圖論\nR1401B 格式）
                    const lines = courseText.split('\n').map(line => line.trim()).filter(line => line);
                    
                    let courseId = 'UNKNOWN';
                    let courseName = '未知課程';
                    let room = '未知教室';
                    let credit = 0;
                    
                    if (lines.length >= 3) {
                        // 第一行：CS678 (3)
                        const firstLine = lines[0];
                        const codeMatch = firstLine.match(/([A-Z]{2,3}\d{3,4})/);
                        const creditMatch = firstLine.match(/\((\d+)\)/);
                        
                        if (codeMatch) courseId = codeMatch[1];
                        if (creditMatch) credit = parseInt(creditMatch[1]);
                        
                        // 第二行：課程名稱
                        courseName = lines[1] || '未知課程';
                        
                        // 第三行：教室
                        room = lines[2] || '未知教室';
                    } else {
                        // 備用解析
                        courseId = this.extractCourseIdFromText(courseText);
                        courseName = this.extractCourseNameFromText(courseText);
                        room = this.extractRoomFromText(courseText);
                        credit = this.extractCreditFromText(courseText);
                    }
                    
                    const courseData = {
                        course_id: courseId,
                        name: courseName,
                        teacher_name: this.processTeacherName('待查詢'), // 從HTML中可能需要進一步解析
                        room: room,
                        time: course.time_text || `第${course.period}節`,
                        days: course.day ? [course.day] : [],
                        periods: course.period ? [course.period] : [],
                        dept_name: '個人課程',
                        credit: credit,
                        is_selected: true,
                        source: "Puppeteer Table1 精確解析",
                        raw_text: courseText,
                        raw_html: course.raw_html || '',
                        position: course.position || {}
                    };
                    
                    processed.course_list.push(courseData);
                }
            });
        }

        console.log("🔄 Puppeteer數據處理完成:");
        console.log(`  - 個人課表: ${processed.is_personal ? '是' : '否'}`);
        console.log(`  - 課程數量: ${processed.course_list.length}`);
        console.log(`  - 標籤信息: ${processed.label1_info ? '有' : '無'}`);

        return processed;
    }

    // 輔助方法：從文字中提取課程資訊
    extractCourseIdFromText(text) {
        const match = text.match(/([A-Z]{2,3}\d{3,4})/);
        return match ? match[1] : 'UNKNOWN';
    }

    extractCourseNameFromText(text) {
        // 尋找課程代碼後的課程名稱
        const parts = text.split(/\s+/);
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].match(/[A-Z]{2,3}\d{3,4}/)) {
                // 找到課程代碼，下一部分可能是課程名稱
                if (i + 1 < parts.length) {
                    return parts[i + 1] || '未知課程';
                }
            }
        }
        return parts[0] || '未知課程';
    }

    extractTeacherFromText(text) {
        // 這裡可以添加更複雜的教師名稱提取邏輯
        return '未知教師';
    }

    extractRoomFromText(text) {
        const match = text.match(/([A-Z]?\d{4}[A-Z]?)/);
        return match ? match[1] : '未知教室';
    }

    extractTimeFromText(text) {
        // 提取時間資訊 - 改進版本
        const timeMatches = [];
        
        // 確保 text 是字符串
        const textStr = String(text || '');
        
        // 匹配 "第X節" 格式
        const periodMatch = textStr.match(/第\s*(\d+)\s*節/g);
        if (periodMatch && Array.isArray(periodMatch)) {
            periodMatch.forEach(match => {
                const periodNum = match.match(/\d+/);
                if (periodNum && periodNum[0]) {
                    timeMatches.push(`第${periodNum[0]}節`);
                }
            });
        }
        
        // 匹配具體時間格式 "XX:XX-XX:XX"
        const timeRangeMatch = textStr.match(/\d{1,2}:\d{2}\s*[-~]\s*\d{1,2}:\d{2}/g);
        if (timeRangeMatch && Array.isArray(timeRangeMatch)) {
            timeMatches.push(...timeRangeMatch);
        }
        
        return timeMatches.length > 0 ? timeMatches.join(', ') : '時間待確認';
    }

    extractDayFromText(text) {
        // 提取星期資訊
        const dayMapping = {
            '週一': 1, '周一': 1, '一': 1, 'Mon': 1, 'Monday': 1,
            '週二': 2, '周二': 2, '二': 2, 'Tue': 2, 'Tuesday': 2,
            '週三': 3, '周三': 3, '三': 3, 'Wed': 3, 'Wednesday': 3,
            '週四': 4, '周四': 4, '四': 4, 'Thu': 4, 'Thursday': 4,
            '週五': 5, '周五': 5, '五': 5, 'Fri': 5, 'Friday': 5,
            '週六': 6, '周六': 6, '六': 6, 'Sat': 6, 'Saturday': 6,
            '週日': 7, '周日': 7, '日': 7, '天': 7, 'Sun': 7, 'Sunday': 7
        };
        
        const days = [];
        for (const [dayStr, dayNum] of Object.entries(dayMapping)) {
            if (text.includes(dayStr)) {
                days.push(dayNum);
            }
        }
        
        return days.length > 0 ? days : [];
    }

    extractPeriodFromText(text) {
        // 提取具體的節次數字
        const periods = [];
        const periodMatches = text.match(/第\s*(\d+)\s*節/g);
        
        if (periodMatches) {
            periodMatches.forEach(match => {
                const periodNum = parseInt(match.match(/\d+/)[0]);
                if (periodNum >= 1 && periodNum <= 13) {
                    periods.push(periodNum);
                }
            });
        }
        
        return periods;
    }

    extractCreditFromText(text) {
        const match = text.match(/\((\d+)\)/);
        return match ? parseInt(match[1]) : 0;
    }

    // ==================== 通用等待輔助方法 ====================
    
    /**
     * 等待網路空閒：連續 idleMs 期間沒有進行中的請求，或 timeoutMs 超時
     * @param {import('puppeteer-core').Page} page
     * @param {number} idleMs 連續空閒毫秒數
     * @param {number} timeoutMs 總超時毫秒數
     */
    async waitForNetworkIdle(page, idleMs = 600, timeoutMs = 8000) {
        let inflightRequests = 0;
        let idleTimer = null;
        let resolved = false;

        const cleanup = () => {
            try {
                page.off('request', onRequestStarted);
                page.off('requestfinished', onRequestCompleted);
                page.off('requestfailed', onRequestCompleted);
            } catch (_) {}
            if (idleTimer) clearTimeout(idleTimer);
        };

        const onRequestStarted = () => {
            inflightRequests++;
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
        };

        const onRequestCompleted = () => {
            inflightRequests = Math.max(0, inflightRequests - 1);
            if (inflightRequests === 0 && !resolved) {
                idleTimer = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        cleanup();
                        resolver();
                    }
                }, idleMs);
            }
        };

        page.on('request', onRequestStarted);
        page.on('requestfinished', onRequestCompleted);
        page.on('requestfailed', onRequestCompleted);

        let resolver;
        const idlePromise = new Promise((resolve) => { resolver = resolve; });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error('network idle timeout'));
            }
        }, timeoutMs));

        try {
            await Promise.race([idlePromise, timeoutPromise]);
        } finally {
            cleanup();
        }
    }

    // 🎯 生成標準課表HTML
    generateScheduleTableHTML(courses = null) {
        console.log("🎯 開始生成課表HTML...");
        
        // 如果沒有傳入課程，使用當前的課程數據
        const courseList = courses || this.course_schedule_data?.course_list || [];
        
        console.log(`📚 準備生成 ${courseList.length} 門課程的課表`);
        
        // 初始化課表格子 [時段][星期] - 13個時段，7天
        const schedule = Array(13).fill(null).map(() => Array(7).fill(null));
        
        // 定義時段時間
        const periodTimes = [
            "第1節\n08:10-09:00", "第2節\n09:10-10:00", "第3節\n10:10-11:00", "第4節\n11:10-12:00",
            "第5節\n12:10-13:00", "第6節\n13:10-14:00", "第7節\n14:10-15:00", "第8節\n15:10-16:00",
            "第9節\n16:10-17:00", "第10節\n17:10-18:00", "第11節\n18:30-19:20", "第12節\n19:25-20:15",
            "第13節\n20:20-21:10"
        ];
        
        // 將課程安排到對應的時段
        courseList.forEach((course, courseIndex) => {
            console.log(`📋 處理課程 ${courseIndex + 1}: ${course.name} (${course.raw_text?.substring(0, 50)}...)`);
            
            const days = course.days || [];
            const periods = course.periods || [];
            
            console.log(`  - 星期: ${days.join(', ')} (${days.length}天)`);
            console.log(`  - 時段: ${periods.join(', ')} (${periods.length}節)`);
            
            // 如果沒有明確的時段和星期，嘗試從raw_text中解析
            if (days.length === 0 || periods.length === 0) {
                const rawText = course.raw_text || '';
                const extractedDays = this.extractDayFromText(rawText);
                const extractedPeriods = this.extractPeriodFromText(rawText);
                
                if (extractedDays.length > 0) days.push(...extractedDays);
                if (extractedPeriods.length > 0) periods.push(...extractedPeriods);
                
                console.log(`  - 重新解析後 - 星期: ${days.join(', ')}, 時段: ${periods.join(', ')}`);
            }
            
            // 將課程安排到課表中
            days.forEach(day => {
                periods.forEach(period => {
                    if (day >= 1 && day <= 7 && period >= 1 && period <= 13) {
                        const dayIndex = day - 1; // 轉換為0-based索引
                        const periodIndex = period - 1; // 轉換為0-based索引
                        
                        if (!schedule[periodIndex][dayIndex]) {
                            schedule[periodIndex][dayIndex] = [];
                        }
                        
                        schedule[periodIndex][dayIndex].push({
                            name: course.name || '未知課程',
                            room: course.room || '',
                            teacher: course.teacher_name || '',
                            course_id: course.course_id || '',
                            raw_text: course.raw_text
                        });
                        
                        console.log(`  ✅ 已安排到: 星期${day} 第${period}節`);
                    }
                });
            });
        });
        
        // 生成HTML
        let html = `<table class="schedule-table">
<thead>
    <tr>
        <th>時間</th>
        <th>週一</th>
        <th>週二</th>
        <th>週三</th>
        <th>週四</th>
        <th>週五</th>
        <th>週六</th>
        <th>週日</th>
    </tr>
</thead>
<tbody id="schedule-tbody">`;
        
        // 生成每個時段的HTML
        for (let period = 0; period < 13; period++) {
            html += `\n    <tr>`;
            
            // 時間欄
            html += `<td style="background-color: rgb(248, 249, 250); font-weight: bold; white-space: pre-line; text-align: center;">${periodTimes[period]}</td>`;
            
            // 每天的課程
            for (let day = 0; day < 7; day++) {
                const courses = schedule[period][day];
                
                if (courses && courses.length > 0) {
                    // 有課程
                    const courseInfo = courses.map(course => {
                        let info = course.name;
                        if (course.room) info += `\n${course.room}`;
                        if (course.teacher) info += `\n${course.teacher}`;
                        return info;
                    }).join('\n---\n');
                    
                    html += `<td class="schedule-cell">
                        <div class="course-slot" style="padding: 8px; text-align: center; background-color: #e3f2fd; color: #1976d2; border-radius: 4px; font-size: 12px; line-height: 1.4;">${courseInfo}</div>
                    </td>`;
                } else {
                    // 沒有課程
                    html += `<td class="schedule-cell">
                        <div class="course-slot" style="padding: 8px; text-align: center; color: #999;">-</div>
                    </td>`;
                }
            }
            
            html += `</tr>`;
        }
        
        html += `\n</tbody>\n</table>`;
        
        console.log("✅ 課表HTML生成完成");
        
        // 統計已安排的課程
        let totalArranged = 0;
        schedule.forEach(row => {
            row.forEach(cell => {
                if (cell && cell.length > 0) {
                    totalArranged += cell.length;
                }
            });
        });
        
        console.log(`📊 課表統計: 共${courseList.length}門課程，已安排${totalArranged}個時段`);
        
        return html;
    }

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
            } catch (disconnectError) {
                console.warn("⚠️ 無法正常斷開瀏覽器連接");
            }
        }
    }




    /**
     * 從 portalfun.yzu.edu.tw 取得系所清單和學期選項 (基於 query_course_tbl_view1_byDept.js)
     * @param {string} year 學年，ex: 114
     * @param {string} smtr 學期，ex: 1, 2
     */
    async getCourseListFromYZUApi(year, smtr) {
        const cheerio = require("cheerio");

        // 檢查快取
        const cacheKey = `dept_semester_${year}_${smtr}`;
        if (this.cachedDeptSemesterData && this.cachedDeptSemesterData[cacheKey]) {
            console.log("使用快取的系所和學期選項");
            const cachedData = this.cachedDeptSemesterData[cacheKey];
            // 確保 dept_options 也被設定
            this.dept_options = cachedData.dept_options;
            return cachedData;
        }

        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/index.aspx?D=G";

        try {
            console.log("正在從 portalfun.yzu.edu.tw 取得系所和學期選項...");

            // 使用 Electron net 發送 GET
            const res = await this._httpGet(BASE, {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            });

            if (res.statusCode >= 300) {
                throw new Error(`HTTP ${res.statusCode}`);
            }

            const $ = cheerio.load(res.body);

            // 2) 解析系所選項 (DDL_Dept)
            const dept_list = [];
            const deptOptions = $("#DDL_Dept option");
            deptOptions.each((index, element) => {
                const value = $(element).attr('value');
                const html = $(element).html() || "";
                // 保留縮排格式，將HTML實體轉換為實際字符
                const text = html
                    .replace(/&nbsp;/g, ' ')  // 將 &nbsp; 轉換為空格
                    .replace(/<[^>]*>/g, '')   // 移除HTML標籤
                    .replace(/\s+$/g, '');     // 只移除尾端空白，保留前端縮排
                if (value && text && value !== "") {
                    dept_list.push({
                        value: value,
                        text: text,
                        dept_name: text // 相容性欄位
                    });
                }
            });

            // 3) 解析學期選項 (DDL_YM)
            const semester_list = [];
            const semesterOptions = $("#DDL_YM option");
            semesterOptions.each((index, element) => {
                const value = $(element).attr('value');
                const text = $(element).text().trim();
                if (value && text && value !== "") {
                    semester_list.push({
                        value: value,
                        text: text
                    });
                }
            });

            console.log(`成功取得 ${dept_list.length} 個系所選項和 ${semester_list.length} 個學期選項`);

            // 將 dept_options 儲存到全域變數以供查詢方法使用
            this.dept_options = dept_list;

            // 4) 返回相容的格式
            const result = {
                course_list: [], // 保持相容性，實際課程查詢使用專門的方法
                dept_list: dept_list.map(dept => dept.dept_name), // 提取系所名稱陣列以保持相容性
                dept_options: dept_list, // 完整的系所選項資料
                semester_list: semester_list,
                source: "portalfun.yzu.edu.tw",
                message: `成功取得 ${dept_list.length} 個系所選項`
            };

            // 儲存到快取
            if (!this.cachedDeptSemesterData) {
                this.cachedDeptSemesterData = {};
            }
            this.cachedDeptSemesterData[cacheKey] = result;

            return result;

        } catch (err) {
            console.error("從 portalfun.yzu.edu.tw 取得選項失敗:", err.message);
            throw new Error(`選項取得失敗: ${err.message}`);
        }
    }

    /**
     * 清除系所和學期選項的快取
     * @param {string} year 學年，ex: 114 (可選，不提供則清除所有快取)
     * @param {string} smtr 學期，ex: 1, 2 (可選，不提供則清除所有快取)
     */
    clearDeptSemesterCache(year = null, smtr = null) {
        if (!this.cachedDeptSemesterData) {
            return;
        }

        if (year && smtr) {
            // 清除特定學年學期的快取
            const cacheKey = `dept_semester_${year}_${smtr}`;
            delete this.cachedDeptSemesterData[cacheKey];
            console.log(`已清除 ${year} 學年第 ${smtr} 學期的快取`);
        } else {
            // 清除所有快取
            this.cachedDeptSemesterData = {};
            console.log("已清除所有系所和學期選項的快取");
        }
    }

    /**
     * 從課程詳細頁面取得學分數
     * @param {string} year - 學年
     * @param {string} smtr - 學期
     * @param {string} cos_id - 課程代號
     * @param {string} cos_class - 班級
     * @returns {Promise<number>} 學分數
     */
    async getCourseCredit(year, smtr, cos_id, cos_class) {
        try {
            const url = `https://portalfun.yzu.edu.tw/cosSelect/Cos_Plan.aspx?y=${year}&s=${smtr}&id=${cos_id}&c=${cos_class}`;
            console.log(`正在取得課程學分數: ${url}`);
            
            const response = await this._httpGet(url, {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            });
            
            if (response.statusCode >= 300) {
                throw new Error(`HTTP ${response.statusCode}`);
            }
            
            // 使用cheerio解析HTML
            const cheerio = require("cheerio");
            const $ = cheerio.load(response.body);
            
            // 尋找包含學分數的td元素
            const creditCell = $('td.record[title*="授課時數"]');
            if (creditCell.length > 0) {
                // 先嘗試從td的內容中取得學分數
                const cellText = creditCell.text().trim();
                if (cellText && cellText !== '') {
                    const credit = parseInt(cellText);
                    if (!isNaN(credit) && credit > 0) {
                        console.log(`成功從td內容取得學分數: ${credit}`);
                        return credit;
                    }
                }
                
                // 如果td內容為空，再嘗試從title屬性取得
                const title = creditCell.attr('title');
                if (title) {
                    const creditMatch = title.match(/授課時數:(\d+)/);
                    if (creditMatch) {
                        const credit = parseInt(creditMatch[1]);
                        console.log(`成功從title屬性取得學分數: ${credit}`);
                        return credit;
                    }
                }
            }
            
            // 如果找不到，嘗試其他可能的選擇器
            const alternativeSelectors = [
                'td.record',
                'td[title*="授課時數"]',
                'td[title*="時數"]',
                'td:contains("授課時數")'
            ];
            
            for (const selector of alternativeSelectors) {
                const element = $(selector);
                if (element.length > 0) {
                    // 優先從td內容取得
                    const cellText = element.text().trim();
                    if (cellText && cellText !== '') {
                        const credit = parseInt(cellText);
                        if (!isNaN(credit) && credit > 0) {
                            console.log(`透過備用選擇器從td內容取得學分數: ${credit}`);
                            return credit;
                        }
                    }
                    
                    // 如果td內容為空，再嘗試從title屬性取得
                    const title = element.attr('title');
                    if (title) {
                        const creditMatch = title.match(/(\d+)/);
                        if (creditMatch) {
                            const credit = parseInt(creditMatch[1]);
                            console.log(`透過備用選擇器從title屬性取得學分數: ${credit}`);
                            return credit;
                        }
                    }
                }
            }
            
            console.log(`無法從頁面中取得學分數: ${url}`);
            return 0;
            
        } catch (error) {
            console.error(`取得學分數失敗 (${cos_id}):`, error.message);
            return 0;
        }
    }

    /**
     * 共用的課程資料解析方法
     * @param {string} html - 包含課程表格的HTML內容
     * @returns {Object} 解析結果 { success, courses, message }
     */
    parseCourseTable(html) {
        const cheerio = require("cheerio");
        const $ = cheerio.load(html);
        const table1 = $("#Table1");

        if (table1.length) {
            const courses = [];
            const rows = table1.find("tr").toArray();
            
            for (let i = 1; i < rows.length; i += 2) { // 從第2行開始，每2行為一組
                const row = $(rows[i]);
                const cells = row.find("td");
                
                if (cells.length >= 7) { // 課程資料行有7列
                    // 從課號班別欄位提取課程ID和班級
                    const courseIdCell = $(cells[1]).find("a").text().trim() || $(cells[1]).text().trim();
                    const courseIdMatch = courseIdCell.match(/^(\w+)\s+([A-Z])$/);
                    
                    let cos_id = courseIdCell;
                    let cos_class = "";
                    if (courseIdMatch) {
                        cos_id = courseIdMatch[1];
                        cos_class = courseIdMatch[2];
                    }
                    
                    // 從課程名稱欄位提取完整文字，保留換行格式
                    const courseNameHtml = $(cells[3]).html() || "";
                    // 將 <br> 標籤轉換為換行符號，保留完整格式
                    const cos_name = courseNameHtml
                        .replace(/<br\s*\/?>/gi, '\n')  // 將 <br> 轉換為換行
                        .replace(/<[^>]*>/g, '')        // 移除其他HTML標籤
                        .replace(/^\s+|\s+$/g, '')      // 只移除首尾空白
                        .replace(/\n\s+/g, '\n')        // 移除換行後的多餘空白
                        .replace(/\s+\n/g, '\n');       // 移除換行前的多餘空白
                    
                    // 從授課教師欄位提取教師姓名
                    const rawTeacherText = $(cells[6]).find("a").text().trim() || $(cells[6]).text().trim();
                    const teacherText = this.processTeacherName(rawTeacherText);
                    
                    courses.push({
                        cos_id: cos_id.trim(),
                        cos_class: cos_class.trim(),
                        cos_name: cos_name,
                        type: $(cells[4]).text().trim(), // 選別
                        time_room: $(cells[5]).html()
                            .replace(/<br\s*\/?>/gi, '\n')  // 將 <br> 轉換為換行
                            .replace(/<[^>]*>/g, '')        // 移除其他HTML標籤
                            .replace(/^\s+|\s+$/g, '')      // 只移除首尾空白
                            .replace(/\n\s+/g, '\n')        // 移除換行後的多餘空白
                            .replace(/\s+\n/g, '\n'),       // 移除換行前的多餘空白
                        teacher: teacherText, // 授課教師
                        credits: "", // 學分數在這個結構中不直接顯示
                        dept_level: $(cells[2]).text().replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() // 開課系級
                    });
                }
            }

            return {
                success: true,
                courses: courses,
                message: `找到 ${courses.length} 門課程`
            };
        } else {
            return {
                success: false,
                courses: [],
                message: "未找到課程資料"
            };
        }
    }

    /**
     * 查詢課程 - 使用系所查詢方式 (基於 query_course_byDept.js)
     * @param {string} ddl_ym - 學年學期，格式如 "114,1  " (注意尾端兩個空白)
     * @param {string} ddl_dept - 系所名稱 (會自動轉換為對應的 option value)
     * @param {string} ddl_degree - 年級 (0=全部, 1-4=對應年級)
     */
    async queryCourseByDept(ddl_ym, ddl_dept, ddl_degree) {
        // 將系所名稱轉換為對應的 option value
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

        const cheerio = require("cheerio");
        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";

        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        };

        // 生成隨機 CheckCode

        // 尋找提交按鈕
        function findSubmitButton(html) {
            const $ = cheerio.load(html);
            let btnName = null;
            let btnValue = null;
            let btnIsImage = false;

            // 尋找「確定/送出/查詢」按鈕
            $("input[type=submit], input[type=image], button").each((_, element) => {
                const $el = $(element);
                const text = ($el.attr("value") || $el.text() || "").trim();
                
                if (text.includes("確定") || text.includes("送出") || text.includes("查詢")) {
                    btnName = $el.attr("name");
                    btnValue = $el.attr("value") || text;
                    btnIsImage = $el.attr("type") === "image";
                    return false; // 找到就停止
                }
            });

            return { btnName, btnValue, btnIsImage };
        }

        try {
            // 確保有 CheckCode cookie (使用現有的 cookie 存儲機制)
            if (!this._cookieStore) this._cookieStore = {};
            if (!this._cookieStore["CheckCode"]) {
                this._cookieStore["CheckCode"] = this.generateCheckCode();
            }

            // 1) 先 GET 取得 cookies + 隱藏欄位
            const r1 = await this._httpGet(BASE, defaultHeaders);
            let hidden = this.parseHiddenFields(r1.body);

            // 防呆：檢查必要的隱藏欄位
            const requiredFields = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"];
            const missingFields = requiredFields.filter(field => !hidden[field]);
            if (missingFields.length > 0) {
                throw new Error(`抓不到隱藏欄位: ${missingFields.join(", ")}`);
            }

            // 2) 第一段 POST：切換系所
            const step1Form = this.buildForm(hidden, {
                __EVENTTARGET: "DDL_Dept",
                __EVENTARGUMENT: "",
                __LASTFOCUS: "",
                DDL_Dept: dept_value,
            });

            const r2 = await this._httpPostForm(BASE, step1Form, {
                ...defaultHeaders,
                Origin: "https://portalfun.yzu.edu.tw",
                Referer: BASE,
            });

            // 更新隱藏欄位（切換系所後會更新）
            hidden = this.parseHiddenFields(r2.body);

            // 3) 第二段 POST：送出查詢（按下「確定」）
            const { btnName, btnValue, btnIsImage } = findSubmitButton(r2.body);
            
            const step2Form = this.buildForm(hidden, {
                __EVENTTARGET: "",
                __EVENTARGUMENT: "",
                __LASTFOCUS: "",
                Q: "RadioButton1",
                DDL_YM: ddl_ym,
                DDL_Dept: dept_value,
                DDL_Degree: ddl_degree,
            });

            // 加入按鈕資訊
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

            const r3 = await this._httpPostForm(BASE, step2Form, {
                ...defaultHeaders,
                Origin: "https://portalfun.yzu.edu.tw",
                Referer: BASE,
            });

            const html = r3.body;

            // 4) 使用共用的課程資料解析方法
            return this.parseCourseTable(html);
        } catch (err) {
            throw new Error(`系所查詢失敗: ${err.message}`);
        }
    }

    /**
     * 查詢課程 - 使用課程名稱查詢方式 (基於 query_course_byName.js)
     * @param {string} ddl_ym - 學年學期，格式如 "114,1  "
     * @param {string} cos_name - 課程名稱關鍵字
     */
    async queryCourseByName(ddl_ym, cos_name) {
        const cheerio = require("cheerio");

        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";

        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            Origin: "https://portalfun.yzu.edu.tw",
            Referer: BASE,
        };

        try {
            // 1) 先 GET 取得 cookies + 隱藏欄位
            const r1 = await this._httpGet(BASE, defaultHeaders);
            this.ensureCheckCodeCookie(this);
            let hidden = this.parseHiddenFields(r1.body);

            // 2) 第一段 POST：切換查詢模式到「以科目名稱查詢」
            const step1Form = this.buildForm(hidden, {
                Q: "RadioButton2",
                DDL_YM: ddl_ym,
                DDL_Dept: "300", // 使用固定值，課程名稱查詢不需要特定系所
                DDL_Degree: "1", // 使用固定值，課程名稱查詢不需要特定年級
            });

            const r2 = await this._httpPostForm(BASE, step1Form, defaultHeaders);
            
            // 檢查重導向
            let response = r2;
            if (r2.status >= 300 && r2.status < 400 && r2.headers.location) {
                response = await this._httpGet(r2.headers.location, defaultHeaders);
            }

            hidden = this.parseHiddenFields(response.body);

            // 3) 第二段 POST：送出查詢（按下「確定」）
            const step2Form = this.buildForm(hidden, {
                Q: "RadioButton2",
                DDL_YM2: ddl_ym,
                Txt_Cos_Name: cos_name,
                Button2: "確定",
            });

            const r3 = await this._httpPostForm(BASE, step2Form, defaultHeaders);
            
            // 檢查重導向
            let finalResponse = r3;
            if (r3.status >= 300 && r3.status < 400 && r3.headers.location) {
                finalResponse = await this._httpGet(r3.headers.location, defaultHeaders);
            }

            const html = finalResponse.body;

            // 4) 使用共用的課程資料解析方法
            return this.parseCourseTable(html);
        } catch (err) {
            throw new Error(`課程名稱查詢失敗: ${err.message}`);
        }
    }

    /**
     * 查詢課程 - 使用教師姓名查詢方式 (基於 query_course_byTeacher.js)
     * @param {string} ddl_ym - 學年學期
     * @param {string} teacher_name - 教師姓名
     */
    async queryCourseByTeacher(ddl_ym, teacher_name) {
        const cheerio = require("cheerio");

        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";
        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            Origin: "https://portalfun.yzu.edu.tw",
            Referer: BASE,
        };

        try {
            const r1 = await this._httpGet(BASE, defaultHeaders);
            this.ensureCheckCodeCookie(this);
            let hidden = this.parseHiddenFields(r1.body);

            const requiredFields = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"];
            const missingFields = requiredFields.filter(field => !hidden[field]);
            if (missingFields.length > 0) {
                throw new Error(`抓不到隱藏欄位: ${missingFields.join(", ")}`);
            }

            // 切換查詢模式到「以教師姓名查詢」
            const step1Form = this.buildForm(hidden, {
                Q: "RadioButton3",
                DDL_YM: ddl_ym,
            });

            const r2 = await this._httpPostForm(BASE, step1Form, defaultHeaders);
            hidden = this.parseHiddenFields(r2.body);

            // 送出查詢
            const step2Form = this.buildForm(hidden, {
                Q: "RadioButton3",
                DDL_YM3: ddl_ym,
                Txt_teacher_Name: teacher_name,
                Button3: "確定",
            });

            const r3 = await this._httpPostForm(BASE, step2Form, defaultHeaders);
            const html = r3.body;

            // 使用共用的課程資料解析方法
            return this.parseCourseTable(html);
        } catch (err) {
            throw new Error(`教師姓名查詢失敗: ${err.message}`);
        }
    }

    /**
     * 查詢課程 - 使用時間查詢方式 (基於 query_course_byTime.js)
     * @param {string} ddl_ym - 學年學期
     * @param {string} ctl216 - 時間代碼，格式如 "111" (星期一第1節)
     */
    async queryCourseByTime(ddl_ym, ctl216) {
        const cheerio = require("cheerio");

        const BASE = "https://portalfun.yzu.edu.tw";
        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh-HK;q=0.8,zh;q=0.6,en-US;q=0.4,en;q=0.2",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Upgrade-Insecure-Requests": "1",
            DNT: "1",
            "Sec-GPC": "1",
            Connection: "keep-alive",
            Origin: BASE,
        };


        try {
            // Step 1: GET 首頁（D=G）
            const step1Url = `${BASE}/cosSelect/index.aspx?D=G`;
            const r1 = await this._httpGet(step1Url, defaultHeaders);
            this.ensureCheckCodeCookie(this);
            
            const { data: hidden1, action: action1 } = this.parseHiddenFieldsComplete(r1.body);
            const urlStep2 = this.buildFullUrl(step1Url, action1);
            
            const requiredFields = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"];
            const missingFields = requiredFields.filter(field => !hidden1[field]);
            if (missingFields.length > 0) {
                throw new Error(`抓不到隱藏欄位: ${missingFields.join(", ")}`);
            }

            // Step 2: POST 切換 RadioButton4
            const step2Form = this.buildForm(hidden1, {
                __EVENTTARGET: "RadioButton4",
                __EVENTARGUMENT: "",
                __LASTFOCUS: "",
                Q: "RadioButton4",
                DDL_YM: ddl_ym,
                DDL_Dept: "300", // 時間查詢固定使用300，用戶無法選擇系所
                DDL_Degree: "1",
            });

            const r2 = await this._httpPostForm(urlStep2, step2Form, {
                ...defaultHeaders,
                Referer: step1Url
            });

            this.assertNotRedirectLoop(r2);

            let response2 = r2;
            if (r2.status >= 300 && r2.status < 400 && r2.headers.location) {
                response2 = await this._httpGet(r2.headers.location, defaultHeaders);
            }

            const { data: hidden2, action: action2 } = this.parseHiddenFieldsComplete(response2.body);
            const urlStep3 = this.buildFullUrl(response2.config?.url || step1Url, action2);

            // Step 3: POST 送出實查（Q=111）
            const step3Form = this.buildForm(hidden2, {
                __EVENTTARGET: "",
                __EVENTARGUMENT: "",
                __LASTFOCUS: "",
                Q: "RadioButton4",
                DDL_YM4: ddl_ym,
                ctl216: ctl216,
            });

            const finalUrl = urlStep3.includes("Q=") ? urlStep3 : `${BASE}/cosSelect/index.aspx?Q=${ctl216}`;

            const r3 = await this._httpPostForm(finalUrl, step3Form, {
                ...defaultHeaders,
                Referer: `${BASE}/cosSelect/index.aspx?D=G`
            });

            this.assertNotRedirectLoop(r3);

            let finalResponse = r3;
            if (r3.status >= 300 && r3.status < 400 && r3.headers.location) {
                finalResponse = await this._httpGet(r3.headers.location, defaultHeaders);
            }

            const html = finalResponse.body;

            // 使用共用的課程資料解析方法
            return this.parseCourseTable(html);
        } catch (err) {
            throw new Error(`時間查詢失敗: ${err.message}`);
        }
    }

    // ==================== 通用輔助方法 ====================
    
    /**
     * 生成隨機驗證碼
     * @returns {string} 4位隨機字串
     */
    generateCheckCode() {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < 4; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * 確保有 CheckCode cookie
     * @param {Object} ctx - 上下文物件
     */
    ensureCheckCodeCookie(ctx) {
        if (!ctx._cookieStore || !ctx._cookieStore["CheckCode"]) {
            const checkCode = this.generateCheckCode();
            ctx._cookieStore["CheckCode"] = checkCode;
        }
    }

    /**
     * 解析隱藏欄位（標準版本）
     * @param {string} html - HTML內容
     * @returns {Object} 隱藏欄位物件
     */
    parseHiddenFields(html) {
        const $ = cheerio.load(html);
        
        const pick = (name) => {
            const element = $(`input[name="${name}"]`);
            return element.val() || "";
        };

        return {
            __EVENTTARGET: "",
            __EVENTARGUMENT: "",
            __LASTFOCUS: "",
            __VIEWSTATE: pick("__VIEWSTATE"),
            __VIEWSTATEGENERATOR: pick("__VIEWSTATEGENERATOR"),
            __EVENTVALIDATION: pick("__EVENTVALIDATION"),
        };
    }

    /**
     * 解析隱藏欄位（完整版本，用於時間查詢）
     * @param {string} html - HTML內容
     * @returns {Object} {data: 隱藏欄位物件, action: 表單action}
     */
    parseHiddenFieldsComplete(html) {
        const $ = cheerio.load(html);
        const form = $("#form1");
        
        if (form.length === 0) {
            throw new Error("找不到 form1");
        }
        
        const data = {};
        
        form.find("input[type='hidden']").each((_, element) => {
            const name = $(element).attr("name");
            if (name) {
                data[name] = $(element).attr("value") || "";
            }
        });
        
        form.find("select").each((_, element) => {
            const name = $(element).attr("name");
            if (name) {
                const selected = $(element).find("option[selected]").first();
                if (selected.length > 0) {
                    data[name] = selected.attr("value") || "";
                }
            }
        });
        
        const action = form.attr("action") || "./index.aspx?D=G";
        return { data, action };
    }

    /**
     * 檢查是否為重導向迴圈
     * @param {Object} response - HTTP回應物件
     */
    assertNotRedirectLoop(response) {
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.location || "";
            if (location.includes("cosSelect/Index.aspx?D=G") || location.includes("cosSelect/index.aspx?D=G")) {
                throw new Error("伺服器重導回查詢首頁，通常是缺少 CheckCode 或隱藏欄位不正確造成。");
            }
        }
    }

    /**
     * 建立表單資料
     * @param {Object} hiddenFields - 隱藏欄位
     * @param {Object} additionalFields - 額外欄位
     * @returns {URLSearchParams} 表單資料
     */
    buildForm(hiddenFields, additionalFields = {}) {
        const form = new URLSearchParams();
        
        // 隱藏欄位
        for (const [key, value] of Object.entries(hiddenFields)) {
            form.set(key, value);
        }
        
        // 額外欄位
        for (const [key, value] of Object.entries(additionalFields)) {
            form.set(key, value);
        }
        
        return form;
    }

    /**
     * 建立完整URL
     * @param {string} baseUrl - 基礎URL
     * @param {string} action - 動作路徑
     * @returns {string} 完整URL
     */
    buildFullUrl(baseUrl, action) {
        if (action.startsWith("http")) {
            return action;
        }
        if (action.startsWith("/")) {
            return new URL(action, baseUrl).href;
        }
        return new URL(action, baseUrl).href;
    }
}

module.exports = { BackendService };
