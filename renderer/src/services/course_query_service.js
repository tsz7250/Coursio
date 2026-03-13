/**
 * CourseQueryService — 課程查詢專責服務
 *
 * 從 BackendService 中提取的課程查詢邏輯。
 * 包含：系所列表取得、4 種查詢方式（系所/課程名稱/教師/時間）、
 * 學分查詢，以及相關的表單輔助方法。
 *
 * @param {object} backend - BackendService 實例
 */

const cheerio = require('cheerio');
const CourseParser = require('./parsers/course_parser');
const queryFormHelper = require('./helpers/query_form_helper');

class CourseQueryService {
    constructor(backend) {
        this.backend = backend;
        this.dept_options = null;
        this.cachedDeptSemesterData = {};
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

            const $ = cheerio.load(res.body);

            const dept_list = [];
            const deptOptions = $("#DDL_Dept option");
            deptOptions.each((index, element) => {
                const value = $(element).attr('value');
                const html = $(element).html() || "";
                const text = html
                    .replace(/&nbsp;/g, ' ')
                    .replace(/<[^>]*>/g, '')
                    .replace(/\s+$/g, '');
                if (value && text && value !== "") {
                    dept_list.push({ value, text, dept_name: text });
                }
            });

            const semester_list = [];
            const semesterOptions = $("#DDL_YM option");
            semesterOptions.each((index, element) => {
                const value = $(element).attr('value');
                const text = $(element).text().trim();
                if (value && text && value !== "") {
                    semester_list.push({ value, text });
                }
            });

            console.log(`成功取得 ${dept_list.length} 個系所選項和 ${semester_list.length} 個學期選項`);
            this.dept_options = dept_list;

            const result = {
                course_list: [],
                dept_list: dept_list.map(dept => dept.dept_name),
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

    // ==================== 課程查詢（4 種方式）====================

    async queryCourseByDept(ddl_ym, ddl_dept, ddl_degree) {
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

        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";
        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
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
                DDL_YM: ddl_ym,
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
    }

    async queryCourseByName(ddl_ym, cos_name) {
        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";
        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
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
                DDL_YM: ddl_ym,
                DDL_Dept: "300",
                DDL_Degree: "1",
            });

            const r2 = await this.backend._httpPostForm(BASE, step1Form, defaultHeaders);
            let response = r2;
            if (r2.status >= 300 && r2.status < 400 && r2.headers.location) {
                response = await this.backend._httpGet(r2.headers.location, defaultHeaders);
            }

            hidden = this.parseHiddenFields(response.body);

            const step2Form = this.buildForm(hidden, {
                Q: "RadioButton2",
                DDL_YM2: ddl_ym,
                Txt_Cos_Name: cos_name,
                Button2: "確定",
            });

            const r3 = await this.backend._httpPostForm(BASE, step2Form, defaultHeaders);
            let finalResponse = r3;
            if (r3.status >= 300 && r3.status < 400 && r3.headers.location) {
                finalResponse = await this.backend._httpGet(r3.headers.location, defaultHeaders);
            }

            return this.parseCourseTable(finalResponse.body);
        } catch (err) {
            throw new Error(`課程名稱查詢失敗: ${err.message}`, { cause: err });
        }
    }

    async queryCourseByTeacher(ddl_ym, teacher_name) {
        const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";
        const defaultHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
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
                DDL_YM: ddl_ym,
            });

            const r2 = await this.backend._httpPostForm(BASE, step1Form, defaultHeaders);
            hidden = this.parseHiddenFields(r2.body);

            const step2Form = this.buildForm(hidden, {
                Q: "RadioButton3",
                DDL_YM3: ddl_ym,
                Txt_teacher_Name: teacher_name,
                Button3: "確定",
            });

            const r3 = await this.backend._httpPostForm(BASE, step2Form, defaultHeaders);
            return this.parseCourseTable(r3.body);
        } catch (err) {
            throw new Error(`教師姓名查詢失敗: ${err.message}`, { cause: err });
        }
    }

    async queryCourseByTime(ddl_ym, ctl216) {
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
            const step1Url = `${BASE}/cosSelect/index.aspx?D=G`;
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
                DDL_YM: ddl_ym,
                DDL_Dept: "300",
                DDL_Degree: "1",
            });

            const r2 = await this.backend._httpPostForm(urlStep2, step2Form, {
                ...defaultHeaders,
                Referer: step1Url
            });

            this.assertNotRedirectLoop(r2);

            let response2 = r2;
            if (r2.status >= 300 && r2.status < 400 && r2.headers.location) {
                response2 = await this.backend._httpGet(r2.headers.location, defaultHeaders);
            }

            const { data: hidden2, action: action2 } = this.parseHiddenFieldsComplete(response2.body);
            const urlStep3 = this.buildFullUrl(response2.config?.url || step1Url, action2);

            const step3Form = this.buildForm(hidden2, {
                __EVENTTARGET: "",
                __EVENTARGUMENT: "",
                __LASTFOCUS: "",
                Q: "RadioButton4",
                DDL_YM4: ddl_ym,
                ctl216: ctl216,
            });

            const finalUrl = urlStep3.includes("Q=") ? urlStep3 : `${BASE}/cosSelect/index.aspx?Q=${ctl216}`;

            const r3 = await this.backend._httpPostForm(finalUrl, step3Form, {
                ...defaultHeaders,
                Referer: `${BASE}/cosSelect/index.aspx?D=G`
            });

            this.assertNotRedirectLoop(r3);

            let finalResponse = r3;
            if (r3.status >= 300 && r3.status < 400 && r3.headers.location) {
                finalResponse = await this.backend._httpGet(r3.headers.location, defaultHeaders);
            }

            return this.parseCourseTable(finalResponse.body);
        } catch (err) {
            throw new Error(`時間查詢失敗: ${err.message}`, { cause: err });
        }
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
}

module.exports = CourseQueryService;
