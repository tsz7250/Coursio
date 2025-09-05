const crypto = require('crypto');
const request = require("request")
const { default: Axios } = require("axios")
const NodeRSA = require('node-rsa');
const moment = require("moment")
const fs = require("fs")
const https = require('https');

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
        // 使用 OpenData API 取得課程資料 (公開資料，非個人課表)
        console.log("嘗試取得課程資料 (OpenData API)...");
        
        return this.getCourseListFromOpenDataAPI(year, smtr).then((result) => {
            console.log("OpenData API 課程資料處理完成");
            
            // 轉換結果格式以相容既有介面
            this.course_schedule_data = {
                course_list: result.courses || [],
                is_personal: false, // OpenData 是公開資料，非個人課表
                source: "OpenData API",
                warning: result.success ? null : result.message,
                message: result.message,
                available_apis: ["YzuNews", "CosList", "CosListByTeacher", "ActBetweenDate", "CalContent", "LibKeyword", "LibHolding"]
            };
            
            var that = this;
            return new Promise(function (resolve, reject) {
                return resolve(that)
            })
        }).catch((error) => {
            console.error("OpenData API 課程資料取得失敗:", error);
            
            this.course_schedule_data = {
                course_list: [],
                is_personal: false,
                source: "錯誤",
                warning: "無法取得課程資料：" + error.message,
                message: "只有 OpenData API 可用，但呼叫失敗"
            };
            
            var that = this;
            return new Promise(function (resolve, reject) {
                return resolve(that)
            })
        });
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
     * 得到某一學年某學期修的課程列表 (使用 OpenData API)
     * @param {string} year 學年，ex: 108, 107
     * @param {string} smtr 學期，ex: 1, 2
     */
    getCourseListFromYZUApi(year, smtr) {
        console.log("Calling OpenData API: " + this.openDataAPIurl + this.openDataAPI["CosList"]);
        
        var url = this.openDataAPIurl + "api/Open/CosList?year=" + year + "&smtr=" + smtr
        console.log("查詢參數:", year, smtr);
        console.log("完整 URL:", url);

        return new Promise(function (resolve, reject) {
            request.get(url, function (err, response, body) {
                if (!err && response.statusCode == 200) {
                    var dept_list = []; // 所有科系名稱

                    var data = JSON.parse(body)
                    data.forEach(function(datum, index, theArray) {
                        dept_list.indexOf(datum["dept_name"]) === -1 ? dept_list.push(datum["dept_name"].trim()): "";
                        theArray[index].smtr = datum["smtr"].trim();

                        
                        var times = datum["WeekandRoom"].split(",")
                        var r = RegExp("([0-9]{3})\(([0-9a-zA-Z]*)\)", "g");

                        var datumTime = [];

                        times.forEach((time)=>{
                            if(time==""){
                                return;
                            }
                    
                            var info = time.match(r);
                            
                            if(info==null){
                                datum["time"] = "無課程資料";
                                datum["room"] = "無課程資料";
                            }else if(info.length==1){
                                datum["time"] = info[0];
                                datum["room"] = "無教室位置";
                                datumTime.push(info[0])
                            }else{
                                datum["time"] = info[0];
                                datum["room"] = info[1];
                                datumTime.push(info[0])
                            }
                        })
                        
                        if(datumTime.length > 0){
                            datum["time"] = datumTime.join(",")
                        }

                        theArray[index].hashid = crypto.createHash('md5').update(JSON.stringify(datum)).digest('hex');
                    });

                    return resolve({
                        course_list: data,
                        dept_list: dept_list,
                        source: "OpenData API",
                        message: `成功取得 ${data.length} 門課程資料`
                    })
                } else {
                    console.error("OpenData API 呼叫失敗:", err || `HTTP ${response.statusCode}`);
                    return reject(new Error("OpenData API 呼叫失敗"));
                }
            })
        })
    }

    // 移除無效的方法：
    // - selCourseInline (需要選課系統端點，已確認不存在)
    // - 所有 CourseBot 相關方法
    // - 所有選課系統 API 方法
    // - 所有學務系統 API 方法
}

module.exports = { BackendService };
