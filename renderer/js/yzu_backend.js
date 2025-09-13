const crypto = require('crypto');
const request = require("request")
const { default: Axios } = require("axios")
const NodeRSA = require('node-rsa');
const moment = require("moment")
const fs = require("fs")
const https = require('https');
const http = require('http');

// Import the new modules
const { PuppeteerManager, loadPuppeteer } = require('./yzu_puppeteer.js');
const { CourseQueryManager } = require('./yzu_course_query.js');

// 配置 axios 以處理自簽名證書和網路問題
Axios.defaults.httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 30000
});

Axios.defaults.timeout = 30000;
Axios.defaults.maxRedirects = 5;

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

        // Initialize the new managers
        this.puppeteerManager = new PuppeteerManager();
        this.courseQueryManager = new CourseQueryManager();

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
                            if (typeof this._updateCookiesFromResponse === 'function') {
                                this._updateCookiesFromResponse(res);
                            }
                            resolve({ statusCode: status, headers: res.headers, body });
                        });
                    });

                    req.on('error', (e) => {
                        reject(e);
                    });

                    req.end();
                } catch (e) {
                    reject(e);
                }
            });
        };

        // Cookie 管理方法
        this.cookieStore = new Map();
    }

    _updateCookiesFromResponse(response) {
        const setCookie = response.headers['set-cookie'];
        if (!setCookie || !Array.isArray(setCookie)) return;
        
        setCookie.forEach(cookie => {
            const eq = cookie.indexOf('=');
            if (eq > 0) {
                const name = cookie.substring(0, eq);
                this.cookieStore.set(name, cookie);
            }
        });
    }

    _getCookieHeader() {
        const entries = Array.from(this.cookieStore.values());
        if (!entries.length) return '';
        return entries.map(cookie => cookie.split(';')[0]).join('; ');
    }

    // 🔧 POST方法，支援cookie和重導向
    _httpPost(urlString, data, headers = {}, redirectCount = 0) {
        return new Promise((resolve, reject) => {
            try {
                const url = new URL(urlString);
                const isHttps = url.protocol === 'https:';
                const mod = isHttps ? https : http;
                
                let mergedHeaders = { ...headers };
                const cookieHeader = this._getCookieHeader();
                if (cookieHeader) mergedHeaders['Cookie'] = cookieHeader;
                
                const postData = typeof data === 'string' ? data : 
                    Object.keys(data).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`).join('&');
                
                mergedHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
                mergedHeaders['Content-Length'] = Buffer.byteLength(postData);
                
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
                    // 處理 3xx 重導向
                    if (status >= 300 && status < 400 && res.headers.location) {
                        if (redirectCount >= 5) return reject(new Error('Too many redirects'));
                        const next = new URL(res.headers.location, urlString).toString();
                        res.resume();
                        return resolve(this._httpPost(next, data, headers, redirectCount + 1));
                    }

                    this._updateCookiesFromResponse(res);
                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                    res.on('end', () => {
                        const respBody = Buffer.concat(chunks).toString('utf8');
                        resolve({ statusCode: status, headers: res.headers, body: respBody });
                    });
                });

                req.on('error', (e) => {
                    reject(e);
                });

                req.write(postData);
                req.end();
            } catch (e) {
                reject(e);
            }
        });
    }

    // 🧹 處理教師姓名（清理重複和格式問題）
    processTeacherName(teacherText) {
        return this.courseQueryManager.processTeacherName(teacherText);
    }

    // 🔐 登入服務
    loginService(sid, spwd) {
        var that = this;

        return new Promise(function (resolve, reject) {
            that._setSidSpwd(sid, spwd);

            that._getRSAKey()
                .then(function () {
                    return that._getUserAccessToken();
                })
                .then(function () {
                    console.log("登入完成");
                    return resolve(that);
                })
                .catch(function (err) {
                    console.error("登入失敗:", err.message);
                    return reject(err);
                });
        });
    }

    // 🔧 設定帳號密碼
    _setSidSpwd(sid, spwd) {
        this.ALLDATA["account"] = sid;
        this.ALLDATA["password"] = spwd;
        
        // 保存原始帳號密碼（未加密）
        this.ALLDATA["original_account"] = sid;
        this.ALLDATA["original_password"] = spwd;
    }

    // 🔑 獲取RSA金鑰
    _getRSAKey() {
        var that = this;
        const url = this.root_url + this.urls.getRSAAPIKeyByAPPIDUrl;

        const requestData = {
            "AppID": this.ALLDATA["AppId"],
            "APIkey": this.ALLDATA["APIkey"],
            "Password": this.ALLDATA["Password"]
        };

        console.log("正在獲取RSA金鑰...");

        return new Promise(function (resolve, reject) {
            Axios.post(url, requestData)
                .then(function (response) {
                    console.log("RSA金鑰獲取成功");
                    
                    if (response.data && response.data["PublicKeyXml"]) {
                        that.ALLDATA["PublicKeyXml"] = response.data["PublicKeyXml"];
                        console.log("PublicKeyXml已設定");
                        return resolve(that);
                    } else {
                        return reject(new Error("回應中沒有PublicKeyXml"));
                    }
                })
                .catch(function (error) {
                    console.error("RSA金鑰獲取失敗:", error.message);
                    
                    if (error.response) {
                        console.error("伺服器回應狀態:", error.response.status);
                        console.error("伺服器回應資料:", error.response.data);
                    }
                    
                    return reject(error);
                });
        });
    }

    // 🔐 加密資料
    _encryptData(account, password) {
        try {
            console.log("正在加密帳號密碼...");
            
            const key = new NodeRSA();
            key.importKey(this.ALLDATA["PublicKeyXml"], 'pkcs1-public-xml');
            
            const encryptedAccount = key.encrypt(account, 'base64');
            const encryptedPassword = key.encrypt(password, 'base64');
            
            console.log("帳號密碼加密完成");
            
            return {
                account: encryptedAccount,
                password: encryptedPassword
            };
        } catch (error) {
            console.error("加密失敗:", error.message);
            throw new Error("資料加密失敗: " + error.message);
        }
    }

    // 🎫 獲取使用者存取令牌
    _getUserAccessToken() {
        var that = this;
        const url = this.root_url + this.urls.getUserAccessTokenUrl;

        return new Promise(function (resolve, reject) {
            try {
                // 加密帳號密碼
                const encryptedData = that._encryptData(
                    that.ALLDATA["original_account"], 
                    that.ALLDATA["original_password"]
                );
                
                const requestData = {
                    "account": encryptedData.account,
                    "password": encryptedData.password,
                    "AppID": that.ALLDATA["AppId"],
                    "BackUID": that.ALLDATA["BackUID"],
                    "DeviceSerial": that.ALLDATA["DeviceSerial"],
                    "APIkey": that.ALLDATA["APIkey"],
                    "Password": that.ALLDATA["Password"]
                };

                console.log("正在獲取存取令牌...");

                Axios.post(url, requestData)
                    .then(function (response) {
                        console.log("存取令牌請求完成");
                        
                        // 檢查回應是否包含失敗訊息
                        if (response.data.Result && response.data.Result.includes("失敗")) {
                            console.error("登入失敗:", response.data.Result);
                            return reject(new Error("登入失敗: " + response.data.Result));
                        }

                        that.login_infomation = response.data;
                        
                        // 尋找 Token
                        if (response.data["Token"]) {
                            that.ALLDATA["Token"] = response.data["Token"];
                            console.log("Token獲取成功");
                        } else {
                            // 嘗試其他可能的token欄位名稱
                            const possibleTokenFields = ["token", "ACCESS_TOKEN", "AccessToken", "access_token"];
                            for (const field of possibleTokenFields) {
                                if (response.data[field]) {
                                    that.ALLDATA["Token"] = response.data[field];
                                    console.log(`Token從 ${field} 欄位獲取成功`);
                                    break;
                                }
                            }
                        }
                        
                        // 設定使用者狀態
                        if (response.data["UserStatus"]) {
                            that.ALLDATA["UserStatus"] = response.data["UserStatus"];
                            console.log("UserStatus已設定:", response.data["UserStatus"]);
                        }

                        return resolve(that);
                    })
                    .catch(function (error) {
                        console.error("存取令牌獲取失敗:", error.message);
                        return reject(error);
                    });
            } catch (encryptError) {
                return reject(encryptError);
            }
        });
    }

    // 🎯 獲取課表資料 (使用Puppeteer)
    getCourseSchedule(year, smtr) {
        console.log(`🎯 開始獲取課表: ${year}年第${smtr}學期`);
        
        // 🎯 懶加載 Puppeteer
        const puppeteerInstance = loadPuppeteer();
        if (!puppeteerInstance) {
            console.error("❌ Puppeteer 不可用，請安裝 puppeteer-core");
            this.setEmptyPersonalSchedule("Puppeteer 不可用，請安裝 puppeteer-core");
            return Promise.resolve(this);
        }

        if (!this.ALLDATA["original_account"] || !this.ALLDATA["original_password"]) {
            console.error("❌ 缺少登入憑證");
            this.setEmptyPersonalSchedule("缺少登入憑證");
            return Promise.resolve(this);
        }

        return new Promise(async (resolve, reject) => {
            try {
                // 使用新的 loginService 進行認證
                const result = await this.loginService(this.ALLDATA["original_account"], this.ALLDATA["original_password"]);
                if (result.success) {
                    console.log("✅ 後端認證成功，開始Puppeteer流程");
                } else {
                    console.log("⚠️ 後端認證未成功，但繼續Puppeteer流程");
                }

                // 執行Puppeteer課表獲取
                const scheduleResult = await this.puppeteerGetScheduleWithRetry(year, smtr);
                resolve(scheduleResult);

            } catch (error) {
                console.error("❌ 課表獲取過程發生錯誤:", error.message);
                this.setEmptyPersonalSchedule(`課表獲取失敗: ${error.message}`);
                resolve(this);
            }
        });
    }

    // 🔄 Puppeteer課表獲取（含重試機制）
    async puppeteerGetScheduleWithRetry(year, smtr, maxRetries = 3) {
        let browser = null;
        let page = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`🔄 第${attempt}次嘗試獲取課表...`);
            
            try {
                // 🎯 懶加載檢查
                const puppeteerInstance = loadPuppeteer();
                if (!puppeteerInstance) {
                    throw new Error("Puppeteer 不可用");
                }

                // 啟動瀏覽器
                console.log("📱 啟動瀏覽器...");
                browser = await this.puppeteerManager.launchPuppeteerBrowser();
                page = await browser.newPage();
                
                // 設置用戶代理
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

                // 登入
                const loginResult = await this.puppeteerManager.puppeteerLogin(
                    page,
                    this.ALLDATA["original_account"], 
                    this.ALLDATA["original_password"]
                );
                
                if (!loginResult.success) {
                    throw new Error(`登入失敗: ${loginResult.message}`);
                }

                console.log("✅ Puppeteer登入成功");

                // 獲取課表
                const scheduleResult = await this.puppeteerManager.puppeteerGetCompleteSchedule(page, year, smtr);
                
                if (!scheduleResult.success) {
                    throw new Error(`課表獲取失敗: ${scheduleResult.message}`);
                }

                // 處理課表資料
                const parseResult = this.puppeteerManager.processScheduleDataFromComplete(scheduleResult);
                
                if (parseResult && parseResult.length > 0) {
                    console.log(`✅ 成功獲取並解析課表，共 ${parseResult.length} 門課程`);
                    
                    // 生成HTML格式的課表
                    const scheduleHTML = this.generateScheduleTableHTML(parseResult);
                    
                    // 設定課表資料
                    this.course_schedule_data = {
                        course_list: parseResult,
                        schedule_table_html: scheduleHTML,
                        year: year,
                        semester: smtr,
                        last_updated: new Date().toISOString()
                    };
                    
                    this.personal_schedule_message = `✅ 課表載入成功 (${parseResult.length} 門課程)`;
                    
                    return this;
                } else {
                    throw new Error("課表解析結果為空");
                }

            } catch (error) {
                console.error(`❌ 第${attempt}次嘗試失敗:`, error.message);
                
                if (attempt === maxRetries) {
                    // 最後一次嘗試失敗
                    this.setEmptyPersonalSchedule(`課表獲取失敗 (嘗試${maxRetries}次): ${error.message}`);
                    return this;
                } else {
                    // 等待後重試
                    console.log(`⏳ 等待 ${attempt * 2} 秒後重試...`);
                    await new Promise(resolve => setTimeout(resolve, attempt * 2000));
                }
                
            } finally {
                // 清理資源
                if (browser) {
                    try {
                        await this.puppeteerManager.cleanupPuppeteerResources(browser);
                    } catch (cleanupError) {
                        console.warn("⚠️ 清理瀏覽器資源時發生錯誤:", cleanupError.message);
                    }
                }
            }
        }
        
        return this;
    }

    // 🎯 設定空的個人課表
    setEmptyPersonalSchedule(errorMessage) {
        console.warn("⚠️ 設定空的個人課表:", errorMessage);
        
        this.course_schedule_data = {
            course_list: [],
            schedule_table_html: this.generateScheduleTableHTML([]),
            year: null,
            semester: null,
            last_updated: new Date().toISOString()
        };
        
        this.personal_schedule_message = errorMessage || "課表資料不可用";
    }

    // 📊 解析課表HTML並提取詳細資料
    parseScheduleHTMLWithDetails(htmlContent) {
        const courseList = [];
        
        try {
            console.log("📊 開始解析課表HTML...");
            
            // 尋找主要的課表Table
            const tableMatch = htmlContent.match(/<table[^>]*Table1[^>]*>([\s\S]*?)<\/table>/i);
            if (!tableMatch) {
                console.log("找不到 Table1 課表");
                return courseList;
            }

            const tableContent = tableMatch[1];
            console.log("✅ 找到課表Table1");
            
            // 解析表格行
            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let rowMatch;
            let rowIndex = 0;
            
            while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
                rowIndex++;
                const rowContent = rowMatch[1];
                
                // 跳過表頭行
                if (rowContent.includes('時間') || rowContent.includes('Mon') || rowContent.includes('週一')) {
                    console.log(`跳過表頭行 ${rowIndex}`);
                    continue;
                }

                // 解析每個儲存格
                const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                let cellMatch;
                const cells = [];
                
                while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
                    cells.push(cellMatch[1]);
                }
                
                if (cells.length > 1) {
                    // 從每個時間儲存格中提取課程資訊
                    for (let dayIndex = 1; dayIndex < cells.length; dayIndex++) {
                        const courseInfo = this.extractCourseInfoFromTable1(cells);
                        if (courseInfo) {
                            courseList.push(courseInfo);
                        }
                    }
                }
            }
            
            console.log(`✅ 課表HTML解析完成，提取到 ${courseList.length} 門課程`);
            
        } catch (error) {
            console.error("❌ 課表HTML解析失敗:", error.message);
        }
        
        return courseList;
    }

    // 記錄HTML結構（用於調試）
    logHtmlStructure(htmlContent) {
        console.log("📋 HTML內容概覽:");
        console.log("- 總長度:", htmlContent.length, "字元");
        console.log("- 包含Table1:", htmlContent.includes('Table1'));
        console.log("- 包含課程相關關鍵字:", htmlContent.includes('課程') || htmlContent.includes('course'));
        console.log("- Table數量:", (htmlContent.match(/<table/gi) || []).length);
        
        // 尋找所有表格ID
        const tableIds = htmlContent.match(/<table[^>]*id\s*=\s*["']([^"']+)["']/gi);
        if (tableIds) {
            console.log("- 發現的表格ID:");
            tableIds.forEach((match, index) => {
                const id = match.match(/id\s*=\s*["']([^"']+)["']/i);
                if (id) console.log(`  ${index + 1}. ${id[1]}`);
            });
        }
    }

    // 🎯 從Table1提取課程資訊
    extractCourseInfoFromTable1(cells) {
        try {
            if (!cells || cells.length < 6) return null;
            
            // 清理HTML標籤
            const cleanCells = cells.map(cell => 
                cell.replace(/<[^>]*>/g, '').trim()
            );
            
            const courseInfo = {
                course_id: this.extractCourseId(cleanCells),
                name: cleanCells[2] || '未知課程',
                teacher_name: this.processTeacherName(cleanCells[5] || '未知教師'),
                time_slot: cleanCells[4] || '未知時間',
                credit: this.extractCredit(cleanCells[6])
            };
            
            // 驗證課程資訊
            if (this.isValidCourseInfo(courseInfo)) {
                return courseInfo;
            }
            
            return null;
            
        } catch (error) {
            console.warn("提取課程資訊時發生錯誤:", error.message);
            return null;
        }
    }

    // 🔍 驗證課程資訊是否有效
    isValidCourseInfo(courseInfo) {
        // 基本檢查
        if (!courseInfo.name || courseInfo.name.length < 2) {
            return false;
        }
        
        // 檢查是否為測試或無效資料
        const invalidPatterns = [
            '測試', 'test', '範例', 'example', 
            '空白', 'blank', '無資料', 'no data'
        ];
        
        for (const pattern of invalidPatterns) {
            if (courseInfo.name.includes(pattern)) {
                return false;
            }
        }
        
        // 檢查課程ID是否合理
        if (courseInfo.course_id === 'UNKNOWN' && courseInfo.name.length < 3) {
            return false;
        }
        
        return true;
    }

    // ⏰ 解析時間格式
    parseTimeSlot(timeText) {
        const timeSlots = [];
        
        try {
            const cleanTime = timeText.replace(/[^\d\-週一二三四五六日]/g, '');
            
            // 匹配格式如 "週一1-2" 或 "一34"
            const dayMap = {
                '週一': 1, '一': 1, '週二': 2, '二': 2, '週三': 3, '三': 3,
                '週四': 4, '四': 4, '週五': 5, '五': 5, '週六': 6, '六': 6,
                '週日': 7, '日': 7
            };
            
            // 解析時間段
            const periodRegex = /([週一二三四五六日])(\d+)(?:-(\d+))?/g;
            let periodMatch;
            
            while ((periodMatch = periodRegex.exec(cleanTime)) !== null) {
                const day = dayMap[periodMatch[1]];
                const startPeriod = parseInt(periodMatch[2]);
                const endPeriod = parseInt(periodMatch[3]) || startPeriod;
                
                for (let period = startPeriod; period <= endPeriod; period++) {
                    timeSlots.push({ day, period });
                }
            }
            
        } catch (error) {
            console.warn("時間解析失敗:", error.message);
        }
        
        return timeSlots;
    }

    // 📚 提取學分數
    extractCredit(creditText) {
        if (!creditText) return 'N/A';
        const match = creditText.match(/(\d+)/);
        return match ? match[1] : 'N/A';
    }

    // 🔤 提取課程ID
    extractCourseId(cells) {
        for (const cell of cells) {
            // 匹配課程代碼格式 (例: EE101, CS201)
            const match = cell.match(/([A-Z]{2,3}\d{3}[A-Z]?)/);
            if (match) {
                return match[1];
            }
        }
        return 'UNKNOWN';
    }

    // 🎯 獲取學生帳戶資訊
    _getAppLoginccount() {
        // 取得學生帳戶資訊的函數
        // 由於原始 API 可能不可用，我們使用已有的登入資訊來建立基本的帳戶資訊
        console.log("正在建立學生帳戶資訊...");
        
        try {
            // 從登入資訊中提取學生資料
            const studentInfo = {
                "Name": "學生", // 預設名稱，實際應從 API 取得
                "StudentID": this.ALLDATA["original_account"] || "未知學號", // 使用原始帳號 (未加密)
                "Department": this.ALLDATA["UserStatus"] ? this.ALLDATA["UserStatus"].split('_')[2] : "未知系所",
                "Status": this.ALLDATA["UserStatus"] || "未知狀態",
                "LoginTime": new Date().toLocaleString()
            };

            // 如果有更多登入資訊，可以進一步解析
            if (this.login_infomation && this.login_infomation["UserStatus"]) {
                const statusParts = this.login_infomation["UserStatus"].split('_');
                if (statusParts.length >= 3) {
                    studentInfo["Department"] = statusParts[2];
                }
                if (statusParts.length >= 1) {
                    studentInfo["Status"] = statusParts[0];
                }
            }

            this.std_account_infomation = [studentInfo];
            
            var that = this;
            return new Promise(function (resolve, reject) {
                console.log("學生帳戶資訊建立完成:", studentInfo);
                return resolve(that);
            });
            
        } catch (error) {
            console.error("建立學生帳戶資訊時發生錯誤:", error);
            
            // 提供備用的基本資訊
            this.std_account_infomation = [{
                "Name": "使用者",
                "StudentID": this.ALLDATA["original_account"] || "未知",
                "Department": "未知系所",
                "Status": "登入成功",
                "LoginTime": new Date().toLocaleString()
            }];
            
            var that = this;
            return new Promise(function (resolve, reject) {
                return resolve(that);
            });
        }
    }

    // 🎯 獲取課表HTML格式
    getScheduleTableHTML() {
        console.log("🎯 前端請求課表HTML格式...");
        
        if (!this.course_schedule_data) {
            console.warn("⚠️ 尚未載入課表數據");
            return null;
        }
        
        // 如果已經有生成好的HTML，直接返回
        if (this.course_schedule_data.schedule_table_html) {
            console.log("✅ 返回已生成的課表HTML");
            return this.course_schedule_data.schedule_table_html;
        }
        
        // 如果沒有，重新生成
        console.log("🔄 重新生成課表HTML...");
        try {
            const scheduleHTML = this.generateScheduleTableHTML(this.course_schedule_data.course_list);
            this.course_schedule_data.schedule_table_html = scheduleHTML;
            console.log("✅ 課表HTML重新生成完成");
            return scheduleHTML;
        } catch (error) {
            console.error("❌ 生成課表HTML失敗:", error.message);
            return null;
        }
    }

    // 🎯 獲取課表摘要信息
    getScheduleSummary() {
        if (!this.course_schedule_data) {
            return {
                total_courses: 0,
                total_credits: 0,
                semester: "未設定",
                last_updated: "未知",
                message: "尚未載入課表"
            };
        }

        const courses = this.course_schedule_data.course_list || [];
        const totalCredits = courses.reduce((sum, course) => {
            const credit = parseInt(course.credit) || 0;
            return sum + credit;
        }, 0);

        return {
            total_courses: courses.length,
            total_credits: totalCredits,
            semester: `${this.course_schedule_data.year || '未知'}年第${this.course_schedule_data.semester || '未知'}學期`,
            last_updated: this.course_schedule_data.last_updated || "未知",
            message: this.personal_schedule_message || "課表載入完成"
        };
    }

    // 🎯 生成課表HTML表格
    generateScheduleTableHTML(courses = null) {
        console.log("🎯 開始生成課表HTML表格...");
        
        const coursesToUse = courses || (this.course_schedule_data ? this.course_schedule_data.course_list : []);
        
        if (!coursesToUse || coursesToUse.length === 0) {
            console.log("⚠️ 沒有課程資料，生成空白課表");
            return this.generateEmptyScheduleHTML();
        }

        console.log(`📚 使用 ${coursesToUse.length} 門課程生成課表`);

        // 建立時間段對應
        const periods = ['第1節', '第2節', '第3節', '第4節', '第5節', '第6節', '第7節', '第8節', '第9節', '第10節', '第11節', '第12節', '第13節'];
        const days = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
        
        // 建立課表網格
        const schedule = {};
        for (let day = 0; day < 7; day++) {
            schedule[day] = {};
            for (let period = 0; period < 13; period++) {
                schedule[day][period] = null;
            }
        }

        // 填入課程資料
        coursesToUse.forEach(course => {
            try {
                let dayIndex = -1;
                let periodIndex = -1;

                // 嘗試從不同欄位解析時間
                if (course.day !== undefined && course.period !== undefined) {
                    dayIndex = parseInt(course.day);
                    periodIndex = parseInt(course.period);
                } else if (course.time_slot) {
                    const timeSlots = this.parseTimeSlot(course.time_slot);
                    if (timeSlots.length > 0) {
                        dayIndex = timeSlots[0].day - 1; // 轉換為0-based index
                        periodIndex = timeSlots[0].period - 1;
                    }
                }

                if (dayIndex >= 0 && dayIndex < 7 && periodIndex >= 0 && periodIndex < 13) {
                    if (courses && courses.length > 0) {
                        let info = `<strong>${course.name || course.cos_name || '未知課程'}</strong>`;
                        if (course.room) info += `\n${course.room}`;
                        if (course.teacher) info += `\n${course.teacher}`;
                        schedule[dayIndex][periodIndex] = info;
                    }
                } else {
                    console.warn(`無效的時間資料: day=${dayIndex}, period=${periodIndex}`, course);
                }
            } catch (error) {
                console.warn("解析課程時間失敗:", error.message, course);
            }
        });

        // 生成HTML
        let html = `
        <div class="schedule-container">
            <table class="schedule-table" border="1" cellpadding="8" cellspacing="0">
                <thead>
                    <tr>
                        <th class="time-header">時間</th>
                        ${days.map(day => `<th class="day-header">${day}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        for (let period = 0; period < 13; period++) {
            html += '<tr>';
            html += `<td class="period-cell">${periods[period]}</td>`;
            
            for (let day = 0; day < 7; day++) {
                const courseInfo = schedule[day][period];
                if (courseInfo) {
                    html += `<td class="course-cell">${courseInfo}</td>`;
                } else {
                    html += '<td class="empty-cell"></td>';
                }
            }
            
            html += '</tr>';
        }

        html += `
                </tbody>
            </table>
        </div>
        `;

        console.log("✅ 課表HTML生成完成");
        return html;
    }

    // 🎯 生成空白課表HTML
    generateEmptyScheduleHTML() {
        const periods = ['第1節', '第2節', '第3節', '第4節', '第5節', '第6節', '第7節', '第8節', '第9節', '第10節', '第11節', '第12節', '第13節'];
        const days = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

        let html = `
        <div class="schedule-container">
            <div class="empty-schedule-message">
                <p>📋 目前沒有課表資料</p>
                <p>請重新登入或聯絡系統管理員</p>
            </div>
            <table class="schedule-table empty-schedule" border="1" cellpadding="8" cellspacing="0">
                <thead>
                    <tr>
                        <th class="time-header">時間</th>
                        ${days.map(day => `<th class="day-header">${day}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        for (let period = 0; period < 13; period++) {
            html += '<tr>';
            html += `<td class="period-cell">${periods[period]}</td>`;
            
            for (let day = 0; day < 7; day++) {
                html += '<td class="empty-cell"></td>';
            }
            
            html += '</tr>';
        }

        html += `
                </tbody>
            </table>
        </div>
        `;

        return html;
    }

    // 🎯 從 portalfun.yzu.edu.tw 獲取系所和學期選項
    async getCourseListFromPortalFun() {
        const result = await this.courseQueryManager.getCourseListFromPortalFun();
        
        // Store dept_options for use in queries
        this.dept_options = result.dept_options;
        this.courseQueryManager.dept_options = result.dept_options;
        
        return result;
    }

    // Delegate course query methods to CourseQueryManager
    async queryCourseByDept(ddl_ym, ddl_dept, ddl_degree = "0") {
        this.courseQueryManager.dept_options = this.dept_options;
        return await this.courseQueryManager.queryCourseByDept(ddl_ym, ddl_dept, ddl_degree);
    }

    async queryCourseByName(ddl_ym, ddl_dept, ddl_degree, cos_name) {
        return await this.courseQueryManager.queryCourseByName(ddl_ym, ddl_dept, ddl_degree, cos_name);
    }

    async queryCourseByTeacher(ddl_ym, teacher_name) {
        return await this.courseQueryManager.queryCourseByTeacher(ddl_ym, teacher_name);
    }

    async queryCourseByTime(ddl_ym, ddl_dept, ddl_degree, ctl216) {
        return await this.courseQueryManager.queryCourseByTime(ddl_ym, ddl_dept, ddl_degree, ctl216);
    }
}

module.exports = { BackendService };