const crypto = require('crypto');
const request = require("request")
const { default: Axios } = require("axios")
const NodeRSA = require('node-rsa');
const moment = require("moment")
const fs = require("fs")
const https = require('https');

// Puppeteer for automated browser actions (懶加載)
let puppeteer = null;
let puppeteerLoaded = false;

// 配置 axios 以處理自簽名證書和網路問題
Axios.defaults.httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 30000
});

Axios.defaults.timeout = 30000;
Axios.defaults.maxRedirects = 5;

// 🎯 懶加載 Puppeteer
function loadPuppeteer() {
    if (!puppeteerLoaded) {
        try {
            puppeteer = require('puppeteer-core');
            puppeteerLoaded = true;
            console.log("✅ Puppeteer-core 已載入，支援完全自動化課表獲取");
        } catch (error) {
            console.warn("⚠️ Puppeteer-core 未安裝，將使用傳統HTTP方法");
            puppeteer = null;
        }
    }
    return puppeteer;
}

class BackendService {
    constructor(sid, spwd) {
        this.root_url = "https://portalx.yzu.edu.tw/NewPortal/"
        this.openDataAPIurl = "https://portalx.yzu.edu.tw/OpenData/"

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

        this.openDataAPIurl = "https://portalx.yzu.edu.tw/OpenData/"
        this.openDataAPI = {
            "News": "api/Open/YzuNews",
            "CosList": "api/Open/CosList?year=%s&smtr=%s",
            "CosListByTeacher": "api/Open/CosListByTeacher?TeacherName=%s",
            "ActBetweenDate": "api/Open/ActBetweenDate?startDate=%s&endDate=%s",
            "CalContent": "api/Open/CalContent/%s",
            "LibKeyword": "api/Open/LibKeyword?Scope=%s&QueryStr=%s",
            "LibHolding": "api/Open/LibHolding/%s"
        };
    }

    // 新增：使用 OpenData API 取得課程清單
    async getCourseListFromOpenDataAPI(year, smtr) {
        try {
            const url = `${this.openDataAPIurl}api/Open/CosList?year=${year}&smtr=${smtr}`;
            console.log("正在呼叫 OpenData API:", url);
            
            const response = await Axios.get(url, {
                timeout: 15000
            });

            if (response.data && Array.isArray(response.data)) {
                console.log(`OpenData API 成功取得 ${response.data.length} 門課程`);
                
                // 轉換為標準格式
                const courses = response.data.map(course => ({
                    course_id: course.cos_id || 'N/A',
                    course_name: course.cos_name || '未知課程',
                    teacher: course.teacher || '未知教師',
                    dept_name: course.dept_name || '未知系所',
                    credits: parseInt(course.cos_credit) || 0,
                    time_slots: course.WeekandRoom ? course.WeekandRoom.split(',') : [],
                    is_selected: false, // OpenData 是公開資料，非個人選課
                    source: "OpenData API",
                    year: year,
                    semester: smtr
                }));

                return {
                    success: true,
                    courses: courses,
                    message: `成功從 OpenData API 取得 ${courses.length} 門課程`
                };
            } else {
                throw new Error("API 回應格式錯誤");
            }
        } catch (error) {
            console.error("OpenData API 呼叫失敗:", error.message);
            return {
                success: false,
                courses: [],
                message: `OpenData API 失敗: ${error.message}`
            };
        }
    }

    // 新增：取得校園新聞
    async getNewsFromOpenDataAPI() {
        try {
            const url = `${this.openDataAPIurl}${this.openDataAPI.News}`;
            console.log("正在取得校園新聞:", url);
            
            const response = await Axios.get(url, {
                timeout: 10000
            });

            if (response.data) {
                console.log("校園新聞取得成功");
                return {
                    success: true,
                    news: response.data,
                    message: "校園新聞取得成功"
                };
            } else {
                throw new Error("新聞資料為空");
            }
        } catch (error) {
            console.error("校園新聞取得失敗:", error.message);
            return {
                success: false,
                news: [],
                message: `校園新聞取得失敗: ${error.message}`
            };
        }
    }

    async testOpenDataEndpoints() {
        console.log("正在測試 OpenData API 端點可用性...");
        
        const testResults = {
            openData: {},
            availableEndpoints: [],
            recommendations: []
        };

        // 測試 OpenData API 端點
        const openDataUrls = {
            news: `${this.openDataAPIurl}${this.openDataAPI.News}`,
            courseList: `${this.openDataAPIurl}api/Open/CosList?year=114&smtr=1`
        };
        
        // 測試新聞端點
        try {
            const newsResponse = await Axios.get(openDataUrls.news, {
                timeout: 10000
            });
            testResults.openData.news = {
                status: newsResponse.status,
                available: newsResponse.status === 200,
                note: "校園新聞端點"
            };
            testResults.availableEndpoints.push("YzuNews");
            console.log("✅ OpenData 新聞端點可用");
        } catch (error) {
            testResults.openData.news = {
                status: error.response?.status || "無回應",
                available: false,
                error: error.message
            };
            console.log("❌ OpenData 新聞端點無法連接:", error.message);
        }

        // 測試課程清單端點
        try {
            const courseResponse = await Axios.get(openDataUrls.courseList, {
                timeout: 10000
            });
            testResults.openData.courseList = {
                status: courseResponse.status,
                available: courseResponse.status === 200,
                note: "課程清單端點"
            };
            testResults.availableEndpoints.push("CosList");
            console.log("✅ OpenData 課程清單端點可用");
        } catch (error) {
            testResults.openData.courseList = {
                status: error.response?.status || "無回應",
                available: false,
                error: error.message
            };
            console.log("❌ OpenData 課程清單端點無法連接:", error.message);
        }

        // 生成建議
        if (testResults.availableEndpoints.length > 0) {
            testResults.recommendations.push(`可用的 OpenData 端點: ${testResults.availableEndpoints.join(', ')}`);
        } else {
            testResults.recommendations.push("所有 OpenData 端點都無法使用");
        }

        console.log("OpenData 端點測試完成:", testResults);
        return testResults;
    }

    // 保留基本登入功能 (使用 NewPortal API)
    loginService(sid, spwd) {
        this._setSidSpwd(sid, spwd)
        
        return this._getRSAKey()
            .then((service) => {
                return service._encryptData(sid, spwd)
            })
            .then((service) => {
                return service._getUserAccessToken()
            })
            .then((service) => {
                console.log("登入成功，但請注意只有 OpenData API 可用");
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

        return Axios.post(url, params, {
            headers: headers,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }),
            timeout: 30000
        }).then((respones) => {
            console.log("---------- RSA")
            that.ALLDATA["PublicKeyXml"] = respones.data["RSAkey"]
            that.ALLDATA["Modulus"] = respones.data["Modulus"]
            that.ALLDATA["Exponent"] = respones.data["Exponent"]

            return new Promise(function (resolve, reject) {
                return resolve(that)
            })

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

    _getUserAccessToken() {
        console.log("---------- getUserAccessToken");

        var url = "https://portalx.yzu.edu.tw/NewPortal/" + "api/Auth/UserAccessToken"

        var payload = new URLSearchParams()
        payload.append("AppId", this.ALLDATA["AppId"])
        payload.append("account", this.ALLDATA["account"])
        payload.append("password", this.ALLDATA["password"])
        payload.append("BackUID", this.ALLDATA["BackUID"])
        payload.append("DeviceSerial", this.ALLDATA["DeviceSerial"])

        var headers = {
            "Accept": this.ALLDATA["Accept"],
            "Authorization": this.ALLDATA["Authorization"],
            "Content-Type": "application/x-www-form-urlencoded"
        }

        var that = this

        return Axios.post(url, payload, {
            headers: headers,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }),
            timeout: 30000
        }).then((response) => {

            console.log("完整登入回應:", response.data);

            if (response.data.Result && response.data.Result.includes("失敗")) {
                return Promise.reject(new Error("登入失敗: " + response.data.Result))
            }

            this.login_infomation = response.data;
            
            // 檢查回應中的 Token 欄位
            if (response.data["Token"]) {
                this.ALLDATA["Token"] = response.data["Token"];
                console.log("成功取得 Token:", this.ALLDATA["Token"]);
            } else if (response.data["token"]) {
                this.ALLDATA["Token"] = response.data["token"];
                console.log("成功取得 Token (小寫):", this.ALLDATA["Token"]);
            } else {
                console.warn("回應中找不到 Token，回應內容:", Object.keys(response.data));
                // 嘗試從其他可能的欄位取得 Token
                const possibleTokenFields = ['AccessToken', 'access_token', 'UserToken', 'authToken'];
                for (const field of possibleTokenFields) {
                    if (response.data[field]) {
                        this.ALLDATA["Token"] = response.data[field];
                        console.log(`從 ${field} 欄位取得 Token:`, this.ALLDATA["Token"]);
                        break;
                    }
                }
            }
            
            // 處理用戶狀態
            if (response.data["UserStatus"]) {
                this.ALLDATA["UserStatus"] = response.data["UserStatus"];
                this.login_infomation["dept"] = response.data["UserStatus"].split('_')[2] || "未知系所";
                console.log("用戶狀態:", this.ALLDATA["UserStatus"]);
            } else {
                console.warn("回應中找不到 UserStatus");
            }

            var that = this;
            // 繼續 promise 的 chain
            return new Promise(function (resolve, reject) {
                return resolve(that)
            })

        }).catch((error) => {
            console.error("取得存取權杖失敗:", error);
            return Promise.reject(error);
        })
    }

    getCourseSchedule(year, smtr) {
        console.log("🚀 使用改進版 Puppeteer 完全自動化課表獲取...");
        
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
                console.error("❌ 改進版 Puppeteer 課表獲取異常:", error.message);
                this.setEmptyPersonalSchedule(`系統錯誤: ${error.message}`);
                return Promise.resolve(this);
            });
    }

    // 🎯 完整的課表獲取流程（基於 complete_schedule.js）
    async getCompleteScheduleData(year = "114", smtr = "1") {
        let browser = null;
        let page = null;
        
        try {
            console.log("🚀 開始完整課表獲取流程...");
            console.log(`👤 學號: ${this.ALLDATA["original_account"]}`);
            console.log(`📚 學期: ${year}年第${smtr}學期`);

            // 確保 Puppeteer 已載入
            const puppeteerInstance = loadPuppeteer();
            if (!puppeteerInstance) {
                throw new Error("Puppeteer 不可用");
            }

            // 啟動瀏覽器
            console.log("📱 啟動瀏覽器...");
            browser = await this.launchPuppeteerBrowser();
            page = await browser.newPage();
            
            // 設置用戶代理
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

            // 步驟1: 執行登入
            const loginResult = await this.puppeteerLogin(page);
            if (!loginResult.success) {
                throw new Error(`登入失敗: ${loginResult.message}`);
            }

            // 額外等待時間確保頁面元素完全載入
            console.log("🔄 確保頁面元素完全載入...");
            await new Promise(resolve => setTimeout(resolve, 1500));

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
            
            return {
                success: true,
                data: parseResult.data,
                cookies: await page.cookies(),
                message: "課表獲取成功"
            };

        } catch (error) {
            console.error("❌ 課表獲取流程失敗:", error.message);
            return {
                success: false,
                message: error.message,
                error: error
            };
        } finally {
            // 清理資源
            if (browser) {
                await this.cleanupPuppeteerBrowser(browser);
            }
        }
    }

    // 新增：解析課表 HTML，專門提取 label1 和 table1，返回詳細資訊
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
                teacher_name: cells[5] || '未知教師',
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

    // 🎯 新增：Puppeteer完全自動化課表獲取方法
    async getPuppeteerSchedule(year = "114", smtr = "1") {
        const puppeteerInstance = loadPuppeteer();
        if (!puppeteerInstance) {
            throw new Error("Puppeteer 不可用");
        }

        let browser = null;
        let page = null;
        
        try {
            console.log("🚀 啟動 Puppeteer 自動化課表獲取...");
            console.log(`📚 目標學期: ${year}年第${smtr}學期`);
            console.log(`👤 使用帳號: ${this.ALLDATA["original_account"]}`);

            // 🔧 啟動瀏覽器
            browser = await this.launchPuppeteerBrowser();
            page = await browser.newPage();
            
            // 設置用戶代理
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

            // 🔐 執行登入
            const loginResult = await this.puppeteerLogin(page);
            if (!loginResult.success) {
                throw new Error(`登入失敗: ${loginResult.message}`);
            }

            // 📋 載入課表
            const scheduleResult = await this.puppeteerLoadSchedule(page);
            if (!scheduleResult.success) {
                throw new Error(`課表載入失敗: ${scheduleResult.message}`);
            }

            // 📊 解析課表數據
            const parseResult = await this.puppeteerParseSchedule(page);
            if (!parseResult.success) {
                throw new Error(`課表解析失敗: ${parseResult.message}`);
            }

            // ✅ 設置課表數據
            this.course_schedule_data = {
                course_list: parseResult.data.course_list,
                is_personal: true,
                source: "Puppeteer 完全自動化課表獲取",
                warning: null,
                message: `成功從 Puppeteer 載入 ${parseResult.data.course_list.length} 門個人課程`,
                label1_info: parseResult.data.label1_info,
                raw_table_html: parseResult.data.raw_table_html,
                extraction_time: parseResult.data.extraction_time,
                puppeteer_success: true
            };

            // 🎯 生成標準課表HTML
            try {
                const scheduleHTML = this.generateScheduleTableHTML(parseResult.data.course_list);
                this.course_schedule_data.schedule_table_html = scheduleHTML;
                console.log("✅ 課表HTML已生成並保存");
            } catch (htmlError) {
                console.warn("⚠️ 生成課表HTML時發生錯誤:", htmlError.message);
                this.course_schedule_data.schedule_table_html = null;
            }

            console.log("🎉 Puppeteer 課表獲取完全成功！");
            return { success: true, message: "Puppeteer 課表獲取成功" };

        } catch (error) {
            console.error("❌ Puppeteer 課表獲取失敗:", error.message);
            return { success: false, error: error.message };
        } finally {
            // 🧹 清理資源
            if (browser) {
                await this.cleanupPuppeteerBrowser(browser);
            }
        }
    }

    // 🔧 啟動Puppeteer瀏覽器（處理各種瀏覽器問題）
    async launchPuppeteerBrowser() {
        try {
            console.log("🔍 尋找Chrome瀏覽器...");
            
            // 🎯 解決問題1: Chrome路徑檢測
            const chromePath = this.findChromePath();
            if (!chromePath) {
                throw new Error("找不到Chrome瀏覽器，請確保已安裝Chrome");
            }
            
            console.log("✅ 找到Chrome:", chromePath);
            
            // 🎯 解決問題2: 瀏覽器啟動參數（避免權限和安全問題）
            const launchOptions = {
                executablePath: chromePath,
                headless: true, // 🎯 解決問題4: 生產環境使用headless
                defaultViewport: null,
                args: [
                    '--no-sandbox',                    // 避免沙盒權限問題
                    '--disable-setuid-sandbox',       // 避免setuid沙盒問題
                    '--disable-dev-shm-usage',        // 避免/dev/shm空間不足
                    '--disable-web-security',         // 允許跨域請求
                    '--disable-features=VizDisplayCompositor',
                    '--disable-gpu',                  // 避免GPU相關問題
                    '--disable-extensions',           // 禁用擴展避免干擾
                    '--disable-plugins',              // 禁用插件
                    '--disable-images',               // 加速載入
                    '--disable-javascript-harmony-shipping',
                    '--disable-background-timer-throttling',
                    '--disable-renderer-backgrounding',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-ipc-flooding-protection',
                    '--window-size=1280,720'          // 固定視窗大小
                ],
                // 🎯 解決問題3: 超時和資源管理
                timeout: 60000,
                handleSIGINT: false,
                handleSIGTERM: false,
                handleSIGHUP: false
            };

            console.log("🚀 啟動瀏覽器...");
            const puppeteerInstance = loadPuppeteer(); // 確保已載入
            const browser = await puppeteerInstance.launch(launchOptions);
            
            // 🎯 解決問題3: 設置瀏覽器事件監聽
            browser.on('disconnected', () => {
                console.log("🔄 瀏覽器連接已斷開");
            });

            return browser;
            
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

    // 🔍 Chrome路徑檢測（跨平台支援）
    findChromePath() {
        const possiblePaths = [
            // Windows 路徑
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
            
            // macOS 路徑
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            
            // Linux 路徑
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium'
        ];

        for (const path of possiblePaths) {
            try {
                if (fs.existsSync(path)) {
                    console.log("✅ 找到Chrome路徑:", path);
                    return path;
                }
            } catch (error) {
                // 繼續檢查下一個路徑
            }
        }

        // 🎯 嘗試系統環境變數
        const envPaths = [
            process.env.CHROME_BIN,
            process.env.GOOGLE_CHROME_BIN
        ].filter(Boolean);

        for (const path of envPaths) {
            try {
                if (fs.existsSync(path)) {
                    console.log("✅ 從環境變數找到Chrome:", path);
                    return path;
                }
            } catch (error) {
                // 繼續檢查
            }
        }

        console.error("❌ 找不到Chrome瀏覽器");
        return null;
    }

    // 🔐 Puppeteer登入流程（改進版，基於 complete_schedule.js）
    async puppeteerLogin(page) {
        try {
            console.log("🔐 開始Puppeteer登入流程...");

            // 前往登入頁面
            await page.goto('https://portalx.yzu.edu.tw/PortalSocialVB/Login.aspx', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 等待表單元素載入
            await page.waitForSelector('#Txt_UserID', { timeout: 10000 });
            await new Promise(resolve => setTimeout(resolve, 800)); // 等待reCaptcha初始化

            // 填入帳號密碼
            console.log("📝 填入登入資訊...");
            await page.type('#Txt_UserID', this.ALLDATA["original_account"]);
            await new Promise(resolve => setTimeout(resolve, 50));
            await page.type('#Txt_Password', this.ALLDATA["original_password"]);
            await new Promise(resolve => setTimeout(resolve, 50));

            // 等待reCaptcha token生成
            console.log("🔒 等待reCaptcha驗證...");
            await page.waitForFunction(() => {
                const hidToken = document.getElementById('hidToken');
                return hidToken && hidToken.value && hidToken.value.length > 10;
            }, { timeout: 10000 });

            console.log("✅ reCaptcha驗證完成");

            // 點擊登入按鈕
            await page.click('#ibnSubmit');

            // 等待登入完成
            console.log("⏱️ 等待登入完成...");
            await page.waitForFunction(() => {
                return window.location.href.includes('DefaultPage.aspx') || 
                       document.body.innerText.includes('個人portal') ||
                       document.body.innerText.includes('登入失敗');
            }, { timeout: 15000 });

            const currentUrl = page.url();
            const pageContent = await page.content();

            if (currentUrl.includes('DefaultPage.aspx') || pageContent.includes('個人portal')) {
                console.log("✅ 登入成功！");
                console.log("⏱️ 等待頁面完全載入...");
                await new Promise(resolve => setTimeout(resolve, 1000)); // 等待頁面完全載入
                return { success: true };
            } else {
                console.error("❌ 登入失敗");
                return { success: false, message: "登入失敗，可能是帳號密碼錯誤" };
            }

        } catch (error) {
            console.error("❌ 登入過程出錯:", error.message);
            return { success: false, message: error.message };
        }
    }

    // 🎯 處理iframe中的課表內容（基於 complete_schedule.js）
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
                        
                        // 等待iframe載入
                        await new Promise(resolve => setTimeout(resolve, 1500));
                        
                        // 嘗試獲取iframe內容
                    try {
                        const frame = await iframe.contentFrame();
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
                                    console.log("⏱️ iframe尚未導向課表頁面，等待更長時間...");
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                    
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

    // 📋 Puppeteer載入課表（改進版，基於 complete_schedule.js）
    async puppeteerLoadSchedule(page) {
        try {
            console.log("📋 開始載入課表...");

            // 等待頁面完全載入
            await new Promise(resolve => setTimeout(resolve, 1500));

            // 🎯 直接點擊課表菜單項
            const currentUrl = page.url();
            console.log("📍 當前頁面URL:", currentUrl);
            console.log("🔍 尋找課表菜單項...");

            // 多種方式尋找課表菜單
            const scheduleMenuFound = await page.evaluate(() => {
                // 開始尋找課表菜單
                let scheduleElement = document.getElementById('tdS14');
                
                // 方法2: 尋找包含"課表"文字且onclick包含S5的元素
                if (!scheduleElement) {
                    const elements = document.querySelectorAll('*[onclick*="S5"]');
                    for (const el of elements) {
                        const text = el.textContent || el.innerText || '';
                        const onclick = el.getAttribute('onclick') || '';
                        if (text.includes('課表') && onclick.includes('S5')) {
                            scheduleElement = el;
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
                            setTimeout(resolve, 1000);
                        }
                    });
                    
                    // 監聽AJAX請求
                    page.on('response', async (response) => {
                        if ((response.url().includes('portalfun') || 
                             response.url().includes('Schedule') || 
                             response.url().includes('FFB_Login')) && !navigationCompleted) {
                            navigationCompleted = true;
                            console.log("✅ 檢測到課表相關請求完成");
                            setTimeout(resolve, 1500);
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

    // 📊 Puppeteer解析課表數據（改進版，基於 complete_schedule.js）
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

            // 等待可能的頁面載入
            await new Promise(resolve => setTimeout(resolve, 800));

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
                return {
                    success: false,
                    message: "頁面中未找到Label1或Table1數據"
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

    // 🎯 處理並標準化課表數據 - 基於 complete_schedule.js，解析課程資料
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
                teacher_name: teacher,
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

    // 📊 處理Puppeteer課表數據（保留舊版本兼容性）
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
                        teacher_name: '待查詢', // 從HTML中可能需要進一步解析
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
        
        // 匹配 "第X節" 格式
        const periodMatch = text.match(/第\s*(\d+)\s*節/g);
        if (periodMatch) {
            periodMatch.forEach(match => {
                const periodNum = match.match(/\d+/)[0];
                timeMatches.push(`第${periodNum}節`);
            });
        }
        
        // 匹配具體時間格式 "XX:XX-XX:XX"
        const timeRangeMatch = text.match(/\d{1,2}:\d{2}\s*[-~]\s*\d{1,2}:\d{2}/g);
        if (timeRangeMatch) {
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

    // 🧹 清理Puppeteer瀏覽器
    async cleanupPuppeteerBrowser(browser) {
        try {
            console.log("🧹 正在清理瀏覽器資源...");
            
            // 關閉所有頁面
            const pages = await browser.pages();
            await Promise.all(pages.map(page => page.close().catch(() => {})));
            
            // 關閉瀏覽器
            await browser.close();
            
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
                isLoaded: false,
                courseCount: 0,
                isPersonal: false,
                source: null
            };
        }
        
        return {
            isLoaded: true,
            courseCount: this.course_schedule_data.course_list?.length || 0,
            isPersonal: this.course_schedule_data.is_personal || false,
            source: this.course_schedule_data.source || 'unknown',
            puppeteerSuccess: this.course_schedule_data.puppeteer_success || false,
            hasHTML: !!this.course_schedule_data.schedule_table_html,
            extractionTime: this.course_schedule_data.extraction_time || null
        };
    }

    getNotifyList() {
        var url = "https://portalx.yzu.edu.tw/NewPortal/api/FCM/NotifyList"

        var payload = new URLSearchParams()
        payload.append("Token", this.ALLDATA["Token"])
        payload.append("FCMToken", "")

        var headers = {
            "Accept": this.ALLDATA["Accept"],
        }

        return Axios.post(url, payload, { headers: headers }).then((response) => {
            console.log("Notify: ", response.data)
            this.notify_list = []
            var length_to_truncate = 20;
            // 針對 notify item 做處理
            response.data.forEach(element => {
                // 截短 Title
                if (element.Title.length > length_to_truncate) {
                    element.Title = element.Title.substring(0, length_to_truncate) + "...";
                } else {
                    element.Title = element.Title;
                }

                // 使用 moment 轉換格式
                element.SendDate = moment(element.SendDate).format('YYYY/MM/DD');
                this.notify_list.push(element);
            });

            var that = this;
            // 繼續 promise 的 chain
            return new Promise(function (resolve, reject) {
                return resolve(that)
            })

        })
    }

    /**
     * 從 portalfun.yzu.edu.tw 取得系所清單和學期選項 (基於 query_course_tbl_view1_byDept.js)
     * @param {string} year 學年，ex: 114
     * @param {string} smtr 學期，ex: 1, 2
     */
    async getCourseListFromYZUApi(year, smtr) {
        const axios = require("axios");
        const { wrapper } = require("axios-cookiejar-support");
        const { CookieJar } = require("tough-cookie");
        const cheerio = require("cheerio");

        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/index.aspx?D=G";

        // 建立 HTTP client
        const jar = new CookieJar();
        const client = wrapper(
            axios.create({
                jar,
                withCredentials: true,
                timeout: 30000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
                httpsAgent: undefined,
            })
        );

        try {
            console.log("正在從 portalfun.yzu.edu.tw 取得系所和學期選項...");
            
            // 1) GET 取得頁面內容和選項
            const response = await client.get(BASE);
            const $ = cheerio.load(response.data);

            // 2) 解析系所選項 (DDL_Dept)
            const dept_list = [];
            const deptOptions = $("#DDL_Dept option");
            deptOptions.each((index, element) => {
                const value = $(element).attr('value');
                const text = $(element).text().trim();
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
            return {
                course_list: [], // 保持相容性，實際課程查詢使用專門的方法
                dept_list: dept_list.map(dept => dept.dept_name), // 提取系所名稱陣列以保持相容性
                dept_options: dept_list, // 完整的系所選項資料
                semester_list: semester_list,
                source: "portalfun.yzu.edu.tw",
                message: `成功取得 ${dept_list.length} 個系所選項`
            };

        } catch (err) {
            console.error("從 portalfun.yzu.edu.tw 取得選項失敗:", err.message);
            throw new Error(`選項取得失敗: ${err.message}`);
        }
    }

    /**
     * 查詢課程 - 使用系所查詢方式 (基於 query_course_byDept.js)
     * @param {string} ddl_ym - 學年學期，格式如 "114,1  " (注意尾端兩個空白)
     * @param {string} ddl_dept - 系所名稱 (會自動轉換為對應的 option value)
     * @param {string} ddl_degree - 年級 (0=全部, 1-4=對應年級)
     */
    async queryCourseByDept(ddl_ym, ddl_dept, ddl_degree = "0") {
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
        const axios = require("axios");
        const { wrapper } = require("axios-cookiejar-support");
        const { CookieJar } = require("tough-cookie");
        const cheerio = require("cheerio");

        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/index.aspx?D=G";

        // 建立 HTTP client
        const jar = new CookieJar();
        const client = wrapper(
            axios.create({
                jar,
                withCredentials: true,
                timeout: 30000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
                httpsAgent: undefined,
            })
        );

        // 取得隱藏欄位
        async function fetchHiddenFields() {
            const r = await client.get(BASE);
            const $ = cheerio.load(r.data);
            const viewstate = $("#__VIEWSTATE").val() ?? "";
            const viewstategen = $("#__VIEWSTATEGENERATOR").val() ?? "";
            const eventvalid = $("#__EVENTVALIDATION").val() ?? "";

            if (!viewstate || !eventvalid) {
                throw new Error("無法取得必要的隱藏欄位：__VIEWSTATE 或 __EVENTVALIDATION");
            }

            return { viewstate, viewstategen, eventvalid };
        }

        // 建立表單
        function buildForm({ viewstate, viewstategen, eventvalid }) {
            const form = new URLSearchParams();
            form.set("__EVENTTARGET", "");
            form.set("__EVENTARGUMENT", "");
            form.set("__LASTFOCUS", "");
            form.set("__VIEWSTATE", viewstate);
            form.set("__VIEWSTATEGENERATOR", viewstategen);
            form.set("__EVENTVALIDATION", eventvalid);

            // 查詢條件
            form.set("Q", "RadioButton1");
            form.set("DDL_YM", ddl_ym);
            form.set("DDL_Dept", dept_value); // 使用映射後的 dept_value
            form.set("DDL_Degree", ddl_degree);
            form.set("Button1", "確定");
            
            return form;
        }

        try {
            // 1) 先 GET 取得 cookies + 隱藏欄位
            const hidden = await fetchHiddenFields();

            // 2) POST 查詢
            const form = buildForm(hidden);
            const r2 = await client.post(BASE, form, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Referer: BASE,
                },
            });

            const html = r2.data;

            // 3) 解析表格資料 (正確處理2行結構)
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
                        
                        // 從課程名稱欄位提取第一行文字作為課程名稱
                        const courseNameHtml = $(cells[3]).html() || "";
                        const courseNameMatch = courseNameHtml.match(/^([^<]+)/);
                        const cos_name = courseNameMatch ? courseNameMatch[1].trim() : $(cells[3]).text().trim();
                        
                        // 從授課教師欄位提取教師姓名
                        const teacherText = $(cells[6]).find("a").text().trim() || $(cells[6]).text().trim();
                        
                        courses.push({
                            cos_id: cos_id,
                            cos_class: cos_class,
                            cos_name: cos_name,
                            type: $(cells[4]).text().trim(), // 選別
                            time_room: $(cells[5]).text().trim(), // 時間,教室
                            teacher: teacherText, // 授課教師
                            credits: "", // 學分數在這個結構中不直接顯示
                            dept_level: $(cells[2]).text().trim() // 開課系級
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
        } catch (err) {
            throw new Error(`系所查詢失敗: ${err.message}`);
        }
    }

    /**
     * 查詢課程 - 使用課程名稱查詢方式 (基於 query_course_byName.js)
     * @param {string} ddl_ym - 學年學期，格式如 "114,1  "
     * @param {string} ddl_dept - 系所名稱 (會自動轉換為對應的 option value)
     * @param {string} ddl_degree - 年級
     * @param {string} cos_name - 課程名稱關鍵字
     */
    async queryCourseByName(ddl_ym, ddl_dept, ddl_degree, cos_name) {
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
        const axios = require("axios");
        const { wrapper } = require("axios-cookiejar-support");
        const { CookieJar } = require("tough-cookie");
        const cheerio = require("cheerio");

        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";

        const jar = new CookieJar();
        const client = wrapper(
            axios.create({
                jar,
                withCredentials: true,
                timeout: 30000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
                httpsAgent: undefined,
            })
        );

        // 生成隨機 CheckCode
        function generateCheckCode() {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            let result = "";
            for (let i = 0; i < 4; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        }

        // 確保有 CheckCode cookie
        function ensureCheckCodeCookie() {
            const cookies = jar.getCookiesSync(BASE);
            const hasCheckCode = cookies.some(cookie => cookie.key === "CheckCode");
            
            if (!hasCheckCode) {
                const checkCode = generateCheckCode();
                jar.setCookieSync(`CheckCode=${checkCode}; Domain=portalfun.yzu.edu.tw; Path=/`, BASE);
            }
        }

        // 解析隱藏欄位
        function parseHiddenFields(html) {
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

        // 建立表單資料
        function buildForm(hiddenFields, additionalFields = {}) {
            const form = new URLSearchParams();
            
            for (const [key, value] of Object.entries(hiddenFields)) {
                form.set(key, value);
            }
            
            for (const [key, value] of Object.entries(additionalFields)) {
                form.set(key, value);
            }
            
            return form;
        }

        try {
            // 1) 先 GET 取得 cookies + 隱藏欄位
            const r1 = await client.get(BASE);
            r1.data;
            
            ensureCheckCodeCookie();
            let hidden = parseHiddenFields(r1.data);

            // 2) 第一段 POST：切換查詢模式到「以科目名稱查詢」
            const step1Form = buildForm(hidden, {
                Q: "RadioButton2",
                DDL_YM: ddl_ym,
                DDL_Dept: dept_value, // 使用映射後的 dept_value
                DDL_Degree: ddl_degree,
            });

            const r2 = await client.post(BASE, step1Form, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Origin: "https://portalfun.yzu.edu.tw",
                    Referer: BASE,
                },
                maxRedirects: 0,
                validateStatus: (status) => status < 400,
            });

            let response = r2;
            if (r2.status >= 300 && r2.status < 400 && r2.headers.location) {
                response = await client.get(r2.headers.location);
            }

            response.data;
            hidden = parseHiddenFields(response.data);

            // 3) 第二段 POST：送出查詢
            const step2Form = buildForm(hidden, {
                Q: "RadioButton2",
                DDL_YM2: ddl_ym,
                Txt_Cos_Name: cos_name,
                Button2: "確定",
            });

            const r3 = await client.post(BASE, step2Form, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Origin: "https://portalfun.yzu.edu.tw",
                    Referer: BASE,
                },
                maxRedirects: 0,
                validateStatus: (status) => status < 400,
            });

            let finalResponse = r3;
            if (r3.status >= 300 && r3.status < 400 && r3.headers.location) {
                finalResponse = await client.get(r3.headers.location);
            }

            const html = finalResponse.data;

            // 4) 解析表格資料 (正確處理2行結構)
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
                        
                        // 從課程名稱欄位提取第一行文字作為課程名稱
                        const courseNameHtml = $(cells[3]).html() || "";
                        const courseNameMatch = courseNameHtml.match(/^([^<]+)/);
                        const cos_name = courseNameMatch ? courseNameMatch[1].trim() : $(cells[3]).text().trim();
                        
                        // 從授課教師欄位提取教師姓名
                        const teacherText = $(cells[6]).find("a").text().trim() || $(cells[6]).text().trim();
                        
                        courses.push({
                            cos_id: cos_id,
                            cos_class: cos_class,
                            cos_name: cos_name,
                            type: $(cells[4]).text().trim(), // 選別
                            time_room: $(cells[5]).text().trim(), // 時間,教室
                            teacher: teacherText, // 授課教師
                            credits: "", // 學分數在這個結構中不直接顯示
                            dept_level: $(cells[2]).text().trim() // 開課系級
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
        const axios = require("axios");
        const { wrapper } = require("axios-cookiejar-support");
        const { CookieJar } = require("tough-cookie");
        const cheerio = require("cheerio");

        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";

        const jar = new CookieJar();
        const client = wrapper(
            axios.create({
                jar,
                withCredentials: true,
                timeout: 30000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
                httpsAgent: undefined,
            })
        );

        // 生成隨機 CheckCode
        function generateCheckCode() {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            let result = "";
            for (let i = 0; i < 4; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        }

        function ensureCheckCodeCookie() {
            const cookies = jar.getCookiesSync(BASE);
            const hasCheckCode = cookies.some(cookie => cookie.key === "CheckCode");
            
            if (!hasCheckCode) {
                const checkCode = generateCheckCode();
                jar.setCookieSync(`CheckCode=${checkCode}; Domain=portalfun.yzu.edu.tw; Path=/`, BASE);
            }
        }

        function parseHiddenFields(html) {
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

        function buildForm(hiddenFields, additionalFields = {}) {
            const form = new URLSearchParams();
            
            for (const [key, value] of Object.entries(hiddenFields)) {
                form.set(key, value);
            }
            
            for (const [key, value] of Object.entries(additionalFields)) {
                form.set(key, value);
            }
            
            return form;
        }

        try {
            const r1 = await client.get(BASE);
            r1.data;
            
            ensureCheckCodeCookie();
            let hidden = parseHiddenFields(r1.data);

            const requiredFields = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"];
            const missingFields = requiredFields.filter(field => !hidden[field]);
            if (missingFields.length > 0) {
                throw new Error(`抓不到隱藏欄位: ${missingFields.join(", ")}`);
            }

            // 切換查詢模式到「以教師姓名查詢」
            const step1Form = buildForm(hidden, {
                Q: "RadioButton3",
                DDL_YM: ddl_ym,
            });

            const r2 = await client.post(BASE, step1Form, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Origin: "https://portalfun.yzu.edu.tw",
                    Referer: BASE,
                },
                maxRedirects: 0,
                validateStatus: (status) => status < 400,
            });

            let response = r2;
            if (r2.status >= 300 && r2.status < 400 && r2.headers.location) {
                response = await client.get(r2.headers.location);
            }

            response.data;
            hidden = parseHiddenFields(response.data);

            // 送出查詢
            const step2Form = buildForm(hidden, {
                Q: "RadioButton3",
                DDL_YM3: ddl_ym,
                Txt_teacher_Name: teacher_name,
                Button3: "確定",
            });

            const r3 = await client.post(BASE, step2Form, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Origin: "https://portalfun.yzu.edu.tw",
                    Referer: BASE,
                },
                maxRedirects: 0,
                validateStatus: (status) => status < 400,
            });

            let finalResponse = r3;
            if (r3.status >= 300 && r3.status < 400 && r3.headers.location) {
                finalResponse = await client.get(r3.headers.location);
            }

            const html = finalResponse.data;

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
                        
                        // 從課程名稱欄位提取第一行文字作為課程名稱
                        const courseNameHtml = $(cells[3]).html() || "";
                        const courseNameMatch = courseNameHtml.match(/^([^<]+)/);
                        const cos_name = courseNameMatch ? courseNameMatch[1].trim() : $(cells[3]).text().trim();
                        
                        // 從授課教師欄位提取教師姓名
                        const teacherText = $(cells[6]).find("a").text().trim() || $(cells[6]).text().trim();
                        
                        courses.push({
                            cos_id: cos_id,
                            cos_class: cos_class,
                            cos_name: cos_name,
                            type: $(cells[4]).text().trim(), // 選別
                            time_room: $(cells[5]).text().trim(), // 時間,教室
                            teacher: teacherText, // 授課教師
                            credits: "", // 學分數在這個結構中不直接顯示
                            dept_level: $(cells[2]).text().trim() // 開課系級
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
        } catch (err) {
            throw new Error(`教師姓名查詢失敗: ${err.message}`);
        }
    }

    /**
     * 查詢課程 - 使用時間查詢方式 (基於 query_course_byTime.js)
     * @param {string} ddl_ym - 學年學期
     * @param {string} ddl_dept - 系所名稱 (會自動轉換為對應的 option value)
     * @param {string} ddl_degree - 年級
     * @param {string} ctl216 - 時間代碼，格式如 "111" (星期一第1節)
     */
    async queryCourseByTime(ddl_ym, ddl_dept, ddl_degree, ctl216) {
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
        const axios = require("axios");
        const { wrapper } = require("axios-cookiejar-support");
        const { CookieJar } = require("tough-cookie");
        const cheerio = require("cheerio");

        const BASE = "https://portalfun.yzu.edu.tw";

        const jar = new CookieJar();
        const client = wrapper(
            axios.create({
                jar,
                withCredentials: true,
                timeout: 30000,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-TW,zh-HK;q=0.8,zh;q=0.6,en-US;q=0.4,en;q=0.2",
                    "Accept-Encoding": "gzip, deflate, br, zstd",
                    "Upgrade-Insecure-Requests": "1",
                    DNT: "1",
                    "Sec-GPC": "1",
                    Connection: "keep-alive",
                },
                httpsAgent: undefined,
            })
        );

        function generateCheckCode() {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            let result = "";
            for (let i = 0; i < 4; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        }

        function ensureCheckCodeCookie() {
            const cookies = jar.getCookiesSync(BASE);
            const hasCheckCode = cookies.some(cookie => cookie.key === "CheckCode");
            
            if (!hasCheckCode) {
                const checkCode = generateCheckCode();
                jar.setCookieSync(`CheckCode=${checkCode}; Domain=portalfun.yzu.edu.tw; Path=/`, BASE);
            }
        }

        function parseHiddenFields(html) {
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

        function buildForm(hiddenFields, additionalFields = {}) {
            const form = new URLSearchParams();
            
            for (const [key, value] of Object.entries(hiddenFields)) {
                form.set(key, value);
            }
            
            for (const [key, value] of Object.entries(additionalFields)) {
                form.set(key, value);
            }
            
            return form;
        }

        function buildFullUrl(baseUrl, action) {
            if (action.startsWith("http")) {
                return action;
            }
            if (action.startsWith("./")) {
                return new URL(action, baseUrl).href;
            }
            return new URL(action, baseUrl).href;
        }

        try {
            // Step 1: GET 首頁
            const step1Url = `${BASE}/cosSelect/index.aspx?D=G`;
            const r1 = await client.get(step1Url);
            r1.data;
            
            ensureCheckCodeCookie();
            
            const { data: hidden1, action: action1 } = parseHiddenFields(r1.data);
            const urlStep2 = buildFullUrl(r1.config.url, action1);
            
            const requiredFields = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"];
            const missingFields = requiredFields.filter(field => !hidden1[field]);
            if (missingFields.length > 0) {
                throw new Error(`抓不到隱藏欄位: ${missingFields.join(", ")}`);
            }

            // Step 2: POST 切換 RadioButton4
            const step2Form = buildForm(hidden1, {
                __EVENTTARGET: "RadioButton4",
                __EVENTARGUMENT: "",
                __LASTFOCUS: "",
                Q: "RadioButton4",
                DDL_YM: ddl_ym,
                DDL_Dept: dept_value, // 使用映射後的 dept_value
                DDL_Degree: ddl_degree,
            });

            const r2 = await client.post(urlStep2, step2Form, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Origin: BASE,
                    Referer: r1.config.url,
                },
                maxRedirects: 0,
                validateStatus: (status) => status < 400,
            });

            let response2 = r2;
            if (r2.status >= 300 && r2.status < 400 && r2.headers.location) {
                response2 = await client.get(r2.headers.location);
            }

            response2.data;
            const { data: hidden2, action: action2 } = parseHiddenFields(response2.data);
            const urlStep3 = buildFullUrl(response2.config.url, action2);

            // Step 3: POST 送出實查
            const step3Form = buildForm(hidden2, {
                __EVENTTARGET: "",
                __EVENTARGUMENT: "",
                __LASTFOCUS: "",
                Q: "RadioButton4",
                DDL_YM4: ddl_ym,
                ctl216: ctl216,
            });

            const finalUrl = urlStep3.includes("Q=") ? urlStep3 : `${BASE}/cosSelect/index.aspx?Q=111`;

            const r3 = await client.post(finalUrl, step3Form, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Origin: BASE,
                    Referer: `${BASE}/cosSelect/index.aspx?D=G`,
                },
                maxRedirects: 0,
                validateStatus: (status) => status < 400,
            });

            let finalResponse = r3;
            if (r3.status >= 300 && r3.status < 400 && r3.headers.location) {
                finalResponse = await client.get(r3.headers.location);
            }

            const html = finalResponse.data;

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
                        
                        // 從課程名稱欄位提取第一行文字作為課程名稱
                        const courseNameHtml = $(cells[3]).html() || "";
                        const courseNameMatch = courseNameHtml.match(/^([^<]+)/);
                        const cos_name = courseNameMatch ? courseNameMatch[1].trim() : $(cells[3]).text().trim();
                        
                        // 從授課教師欄位提取教師姓名
                        const teacherText = $(cells[6]).find("a").text().trim() || $(cells[6]).text().trim();
                        
                        courses.push({
                            cos_id: cos_id,
                            cos_class: cos_class,
                            cos_name: cos_name,
                            type: $(cells[4]).text().trim(), // 選別
                            time_room: $(cells[5]).text().trim(), // 時間,教室
                            teacher: teacherText, // 授課教師
                            credits: "", // 學分數在這個結構中不直接顯示
                            dept_level: $(cells[2]).text().trim() // 開課系級
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
        } catch (err) {
            throw new Error(`時間查詢失敗: ${err.message}`);
        }
    }
}

module.exports = { BackendService };
