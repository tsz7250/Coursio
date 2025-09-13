const { default: Axios } = require("axios");
const https = require('https');
const http = require('http');

// 配置 axios 以處理自簽名證書和網路問題
Axios.defaults.httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 30000
});

class CourseQueryManager {
    constructor() {
        this.dept_options = null; // 系所選項將由主類別設置
        this.cookieStore = new Map(); // Cookie storage
    }

    // Cookie management methods
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

    // HTTP methods with cookie support  
    async _httpPost(urlString, data, headers = {}, redirectCount = 0) {
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
                    // Handle 3xx redirects
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

    async _httpGet(urlString, headers = {}, redirectCount = 0) {
        return new Promise((resolve, reject) => {
            try {
                const url = new URL(urlString);
                const isHttps = url.protocol === 'https:';
                const mod = isHttps ? https : http;
                
                let mergedHeaders = { ...headers };
                const cookieHeader = this._getCookieHeader();
                if (cookieHeader) mergedHeaders['Cookie'] = cookieHeader;
                
                const req = mod.request({
                    protocol: url.protocol,
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname + (url.search || ''),
                    method: 'GET',
                    headers: mergedHeaders,
                    rejectUnauthorized: false,
                }, (res) => {
                    const status = res.statusCode || 0;
                    if (status >= 300 && status < 400 && res.headers.location) {
                        if (redirectCount >= 5) return reject(new Error('Too many redirects'));
                        const next = new URL(res.headers.location, urlString).toString();
                        res.resume();
                        return resolve(this._httpGet(next, headers, redirectCount + 1));
                    }

                    this._updateCookiesFromResponse(res);
                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                    res.on('end', () => {
                        const body = Buffer.concat(chunks).toString('utf8');
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
    }

    // 🎯 從 portalfun.yzu.edu.tw 獲取系所和學期選項 (基於 query_course_tbl_view1_byDept.js)
    async getCourseListFromPortalFun() {
        try {
            console.log("🌐 從 portalfun.yzu.edu.tw 獲取選項...");

            // 1) 首先訪問主頁以建立 session
            const mainPageUrl = "https://portalfun.yzu.edu.tw/cosSelect/index.aspx?D=G";
            const mainResponse = await this._httpGet(mainPageUrl, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            });

            if (mainResponse.statusCode !== 200) {
                throw new Error(`無法存取主頁，HTTP ${mainResponse.statusCode}`);
            }

            console.log("✅ 成功訪問主頁並建立 session");

            // 2) 解析系所選項 (#DDL_Dept)
            const dept_list = [];
            const deptRegex = /<option value="([^"]*)"[^>]*>([^<]+)<\/option>/gi;
            let deptMatch;
            
            while ((deptMatch = deptRegex.exec(mainResponse.body)) !== null) {
                const value = deptMatch[1].trim();
                const text = deptMatch[2].trim();
                
                // 跳過空值和 "系所" 標題選項
                if (value && text && text !== "系所") {
                    dept_list.push({ 
                        value: value,
                        dept_name: text,
                        text: text
                    });
                }
            }

            // 3) 解析學期選項 (#DDL_YM)
            const semester_list = [];
            const semesterRegex = /<select[^>]*name="DDL_YM"[^>]*>([\s\S]*?)<\/select>/i;
            const semesterMatch = semesterRegex.exec(mainResponse.body);
            
            if (semesterMatch) {
                const semesterOptions = semesterMatch[1];
                const optionRegex = /<option value="([^"]*)"[^>]*>([^<]+)<\/option>/gi;
                let optionMatch;
                
                while ((optionMatch = optionRegex.exec(semesterOptions)) !== null) {
                    const value = optionMatch[1].trim();
                    const text = optionMatch[2].trim();
                    
                    if (value && text && text !== "學年學期") {
                        semester_list.push({
                            value: value,
                            text: text
                        });
                    }
                }
            }

            console.log(`✅ 成功解析 ${dept_list.length} 個系所選項`);
            console.log(`✅ 成功解析 ${semester_list.length} 個學期選項`);

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

        try {
            console.log(`🔍 開始系所查詢: 學期=${ddl_ym}, 系所=${ddl_dept}(${dept_value}), 年級=${ddl_degree}`);

            // 第一階段：訪問主頁面並設定系所
            const mainUrl = "https://portalfun.yzu.edu.tw/cosSelect/query_course_byDept.aspx";
            const mainResponse = await this._httpGet(mainUrl, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            });

            if (mainResponse.statusCode !== 200) {
                throw new Error(`主頁面訪問失敗，HTTP ${mainResponse.statusCode}`);
            }

            // 解析隱藏欄位
            const hiddenFields = this.parseHiddenFields(mainResponse.body);
            console.log("✅ 解析到隱藏欄位:", Object.keys(hiddenFields));

            // 第二階段：POST切換系所
            const deptChangeData = {
                ...hiddenFields,
                "DDL_Dept": dept_value,
                "DDL_YM": ddl_ym,
                "DDL_Degree": ddl_degree,
                "__EVENTTARGET": "DDL_Dept",
                "__EVENTARGUMENT": ""
            };

            console.log("🔄 提交系所切換請求...");
            const deptResponse = await this._httpPost(mainUrl, deptChangeData, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': mainUrl
            });

            if (deptResponse.statusCode !== 200) {
                throw new Error(`系所切換失敗，HTTP ${deptResponse.statusCode}`);
            }

            // 解析切換後的隱藏欄位
            const updatedHiddenFields = this.parseHiddenFields(deptResponse.body);
            console.log("✅ 系所切換成功，取得更新的隱藏欄位");

            // 第三階段：提交最終查詢
            const queryData = {
                ...updatedHiddenFields,
                "DDL_Dept": dept_value,
                "DDL_YM": ddl_ym,
                "DDL_Degree": ddl_degree,
                "btnQuery": "查詢"
            };

            console.log("🔍 提交最終查詢請求...");
            const queryResponse = await this._httpPost(mainUrl, queryData, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': mainUrl
            });

            if (queryResponse.statusCode !== 200) {
                throw new Error(`查詢請求失敗，HTTP ${queryResponse.statusCode}`);
            }

            // 解析查詢結果
            console.log("📋 解析查詢結果...");
            const courses = this.parseQueryResponse(queryResponse.body);
            
            console.log(`✅ 系所查詢完成，找到 ${courses.length} 門課程`);
            return {
                success: true,
                courses: courses,
                message: `找到 ${courses.length} 門課程`
            };

        } catch (err) {
            console.error("系所查詢失敗:", err.message);
            throw new Error(`系所查詢失敗: ${err.message}`);
        }
    }

    /**
     * 查詢課程 - 使用課程名稱查詢 (基於 query_course_byName.js)
     * @param {string} ddl_ym - 學年學期
     * @param {string} ddl_dept - 系所 (固定為 "300" 以查詢全部)
     * @param {string} ddl_degree - 年級 (固定為 "0" 以查詢全部)
     * @param {string} cos_name - 課程名稱關鍵字
     */
    async queryCourseByName(ddl_ym, ddl_dept, ddl_degree, cos_name) {
        try {
            console.log(`🔍 開始課程名稱查詢: 學期=${ddl_ym}, 課程名稱=${cos_name}`);

            // 訪問查詢頁面
            const mainUrl = "https://portalfun.yzu.edu.tw/cosSelect/query_course_byName.aspx";
            const mainResponse = await this._httpGet(mainUrl, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            });

            if (mainResponse.statusCode !== 200) {
                throw new Error(`頁面訪問失敗，HTTP ${mainResponse.statusCode}`);
            }

            // 解析隱藏欄位
            const hiddenFields = this.parseHiddenFields(mainResponse.body);

            // 提交查詢
            const queryData = {
                ...hiddenFields,
                "DDL_YM": ddl_ym,
                "DDL_Dept": "300", // 固定值以查詢所有系所
                "DDL_Degree": "0", // 固定值以查詢所有年級
                "txtCos_Name": cos_name,
                "btnQuery": "查詢"
            };

            console.log("🔍 提交課程名稱查詢...");
            const queryResponse = await this._httpPost(mainUrl, queryData, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': mainUrl
            });

            if (queryResponse.statusCode !== 200) {
                throw new Error(`查詢請求失敗，HTTP ${queryResponse.statusCode}`);
            }

            // 解析結果
            const courses = this.parseQueryResponse(queryResponse.body);
            
            console.log(`✅ 課程名稱查詢完成，找到 ${courses.length} 門課程`);
            return {
                success: true,
                courses: courses,
                message: `找到 ${courses.length} 門課程`
            };

        } catch (err) {
            console.error("課程名稱查詢失敗:", err.message);
            throw new Error(`課程名稱查詢失敗: ${err.message}`);
        }
    }

    /**
     * 查詢課程 - 使用教師姓名查詢 (基於 query_course_byTeacher.js)
     * @param {string} ddl_ym - 學年學期
     * @param {string} teacher_name - 教師姓名
     */
    async queryCourseByTeacher(ddl_ym, teacher_name) {
        try {
            console.log(`🔍 開始教師查詢: 學期=${ddl_ym}, 教師=${teacher_name}`);

            // 訪問查詢頁面
            const mainUrl = "https://portalfun.yzu.edu.tw/cosSelect/query_course_byTeacher.aspx";
            const mainResponse = await this._httpGet(mainUrl, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            });

            if (mainResponse.statusCode !== 200) {
                throw new Error(`頁面訪問失敗，HTTP ${mainResponse.statusCode}`);
            }

            // 解析隱藏欄位
            const hiddenFields = this.parseHiddenFields(mainResponse.body);

            // 提交查詢
            const queryData = {
                ...hiddenFields,
                "DDL_YM": ddl_ym,
                "txtTeacher": teacher_name,
                "btnQuery": "查詢"
            };

            console.log("🔍 提交教師查詢...");
            const queryResponse = await this._httpPost(mainUrl, queryData, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': mainUrl
            });

            if (queryResponse.statusCode !== 200) {
                throw new Error(`查詢請求失敗，HTTP ${queryResponse.statusCode}`);
            }

            // 解析結果
            const courses = this.parseQueryResponse(queryResponse.body);
            
            console.log(`✅ 教師查詢完成，找到 ${courses.length} 門課程`);
            return {
                success: true,
                courses: courses,
                message: `找到 ${courses.length} 門課程`
            };

        } catch (err) {
            console.error("教師查詢失敗:", err.message);
            throw new Error(`教師查詢失敗: ${err.message}`);
        }
    }

    /**
     * 查詢課程 - 使用時間查詢 (基於 query_course_byTime.js)
     * @param {string} ddl_ym - 學年學期
     * @param {string} ddl_dept - 系所 (固定為 "300")
     * @param {string} ddl_degree - 年級 (固定為 "0") 
     * @param {string} ctl216 - 時間代碼，格式如 "101" (星期1第1節)
     */
    async queryCourseByTime(ddl_ym, ddl_dept, ddl_degree, ctl216) {
        try {
            console.log(`🔍 開始時間查詢: 學期=${ddl_ym}, 時間=${ctl216}`);

            // 訪問查詢頁面  
            const mainUrl = "https://portalfun.yzu.edu.tw/cosSelect/query_course_byTime.aspx";
            const mainResponse = await this._httpGet(mainUrl, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            });

            if (mainResponse.statusCode !== 200) {
                throw new Error(`頁面訪問失敗，HTTP ${mainResponse.statusCode}`);
            }

            // 解析隱藏欄位和表單
            const hiddenFields = this.parseHiddenFields(mainResponse.body);
            
            // 檢查 form1 是否存在
            if (!mainResponse.body.includes('form1')) {
                throw new Error('找不到 form1');
            }

            // 提交查詢
            const queryData = {
                ...hiddenFields,
                "DDL_YM": ddl_ym,
                "DDL_Dept": "300",
                "DDL_Degree": "0", 
                "ctl216": ctl216,
                "btnQuery": "查詢"
            };

            console.log("🔍 提交時間查詢...");
            const queryResponse = await this._httpPost(mainUrl, queryData, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': mainUrl
            });

            if (queryResponse.statusCode !== 200) {
                throw new Error(`查詢請求失敗，HTTP ${queryResponse.statusCode}`);
            }

            // 解析結果
            const courses = this.parseQueryResponse(queryResponse.body);
            
            console.log(`✅ 時間查詢完成，找到 ${courses.length} 門課程`);
            return {
                success: true,
                courses: courses,
                message: `找到 ${courses.length} 門課程`
            };

        } catch (err) {
            console.error("時間查詢失敗:", err.message);
            throw new Error(`時間查詢失敗: ${err.message}`);
        }
    }

    // 🔧 解析隱藏欄位
    parseHiddenFields(html) {
        const hiddenFields = {};
        const regex = /<input[^>]*type=["']hidden["'][^>]*>/gi;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            const input = match[0];
            const nameMatch = input.match(/name=["']([^"']+)["']/);
            const valueMatch = input.match(/value=["']([^"']*)["']/);
            
            if (nameMatch) {
                const name = nameMatch[1];
                const value = valueMatch ? valueMatch[1] : '';
                hiddenFields[name] = value;
            }
        }
        
        return hiddenFields;
    }

    // 📋 解析查詢回應
    parseQueryResponse(html) {
        const courses = [];
        
        try {
            // 尋找主要的課程表格
            const tableMatch = html.match(/<table[^>]*DataGrid1[^>]*>([\s\S]*?)<\/table>/i);
            if (!tableMatch) {
                console.log("找不到 DataGrid1 表格");
                return courses;
            }

            const tableContent = tableMatch[1];
            
            // 使用正則表達式解析表格行（處理 2 行結構）
            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let rowMatch;
            let isDataRow = false;
            let tempCourse = null;

            while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
                const rowContent = rowMatch[1];
                
                // 跳過表頭
                if (rowContent.includes('課號班別') || rowContent.includes('開課系級')) {
                    isDataRow = true;
                    continue;
                }
                
                if (!isDataRow) continue;

                // 解析儲存格
                const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                const cells = [];
                let cellMatch;
                
                while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
                    let cellText = cellMatch[1]
                        .replace(/<[^>]*>/g, '') // 移除 HTML 標籤
                        .replace(/\s+/g, ' ')    // 合併空白字元
                        .trim();
                    cells.push(cellText);
                }

                // 檢查是否為課程資料行（第一行：包含課程基本資訊）
                if (cells.length >= 6 && cells[0]) {
                    const courseIdMatch = cells[0].match(/([A-Z]{2,3}\d{3}[A-Z]?)/);
                    
                    if (courseIdMatch) {
                        tempCourse = {
                            cos_id: courseIdMatch[1] || '',
                            cos_class: cells[0].replace(courseIdMatch[1], '').trim() || '',
                            dept_grade: cells[1] || '',
                            cos_name: cells[2] || '',
                            cos_type: cells[3] || '',
                            cos_time: cells[4] || '',
                            teacher_name: this.processTeacherName(cells[5] || ''),
                            cos_credit: cells[6] || ''
                        };
                    }
                } 
                // 第二行：選課訊息（如果有tempCourse等待配對）
                else if (tempCourse && cells.length >= 1) {
                    // 第二行通常包含選課人數等訊息，可以擴展處理
                    tempCourse.selection_info = cells[0] || '';
                    
                    courses.push(tempCourse);
                    tempCourse = null;
                }
            }
            
            // 處理最後一個未配對的課程
            if (tempCourse) {
                courses.push(tempCourse);
            }

            console.log(`📋 成功解析 ${courses.length} 門課程`);
            return courses;

        } catch (error) {
            console.error("解析查詢回應失敗:", error.message);
            return [];
        }
    }

    // 🧹 處理教師姓名（清理重複和格式問題）
    processTeacherName(teacherText) {
        if (!teacherText) return '';
        
        let cleanText = String(teacherText).trim();
        
        // 移除多餘的空白字元
        cleanText = cleanText.replace(/\s+/g, ' ');
        
        // 處理缺少左括號的情況 (例: "陳小明英文名)")
        const missingBracketMatch = cleanText.match(/^([^()]+)([^()]*\))$/);
        if (missingBracketMatch) {
            cleanText = `${missingBracketMatch[1]}(${missingBracketMatch[2]}`;
        }
        
        // 處理重複的教師姓名 (例: "陳小明(English Name) 陳小明(English Name)")
        const duplicateMatch = cleanText.match(/^(.+?)\s+\1$/);
        if (duplicateMatch) {
            return duplicateMatch[1].trim();
        }
        
        // 處理重複但英文名稱相同的情況
        const duplicateEnglishMatch = cleanText.match(/^(.+?)\(([^)]+)\)\s+(.+?)\(\2\)$/);
        if (duplicateEnglishMatch) {
            const [, firstName, englishName, secondName] = duplicateEnglishMatch;
            if (firstName.trim() === secondName.trim()) {
                return `${firstName.trim()}(${englishName})`;
            }
        }
        
        // 檢查是否包含括號但格式正確
        if (cleanText.includes('(')) {
            // 移除不完整的括號
            const incompleteMatch = cleanText.match(/^([^()]+)\(([^)]*)\)(.*)$/);
            if (incompleteMatch) {
                const [, chineseName, englishName, remainder] = incompleteMatch;
                if (!remainder || remainder === ')') {
                    return `${chineseName.trim()}(${englishName.trim()})`;
                }
            }
            
            // 檢查格式是否正確 (中文名(英文名))
            const correctFormatPattern = /^[^()]+\([^()]+\)$/;
            if (correctFormatPattern.test(cleanText)) {
                return cleanText;
            }
            
            // 處理多個括號的情況
            const multipleBrackets = cleanText.match(/\([^)]*\)/g);
            if (multipleBrackets && multipleBrackets.length > 1) {
                // 提取所有括號內容
                const contents = multipleBrackets.map(match => match.slice(1, -1).trim());
                const mainName = cleanText.split('(')[0].trim();
                
                // 使用 Set 去除重複的英文名稱
                const uniqueContents = new Set();
                for (const content of contents) {
                    if (content && !uniqueContents.has(content)) {
                        uniqueContents.add(content);
                    }
                }
                
                if (uniqueContents.size > 0) {
                    const resultParts = Array.from(uniqueContents);
                    if (resultParts.length > 0) {
                        return `${mainName}(${resultParts[0]})`;
                    }
                }
            }
            
            // 處理連續重複的括號內容
            const repeatedPattern = /^(.+?)\(([^)]+)\)(?:\s*\(\2\))*(.*)$/;
            const matches = cleanText.match(repeatedPattern);
            if (matches && matches.length > 1) {
                const [, name, englishName, remainder] = matches;
                
                // 檢查剩餘部分是否為重複
                const duplicateMatches = remainder.match(/\(([^)]+)\)/g);
                if (duplicateMatches) {
                    const uniqueMatches = [...new Set(duplicateMatches.map(match => match.slice(1, -1)))];
                    for (const match of duplicateMatches) {
                        const content = match.slice(1, -1);
                        if (!uniqueContents.has(content)) {
                            uniqueContents.add(content);
                        }
                    }
                    
                    if (uniqueMatches.length < duplicateMatches.length) {
                        return `${name.trim()}(${englishName})`;
                    }
                }
            }
        }
        
        return cleanText;
    }
}

// Always make available globally in browser context
if (typeof window !== 'undefined') {
    window.CourseQueryManager = CourseQueryManager;
}

// Export for CommonJS (Node.js)
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { CourseQueryManager };
}