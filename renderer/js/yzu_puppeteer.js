const fs = require('fs');

// Puppeteer for automated browser actions (懶加載)
let puppeteer = null;
let puppeteerLoaded = false;

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

class PuppeteerManager {
    constructor() {
        // Puppeteer 相關的實例變數會由主類別傳入
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
            
            // 🎯 解決問題2: 啟動參數優化
            const launchOptions = {
                executablePath: chromePath,
                headless: false, // 改為false以避免無頭模式的問題
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1200,800',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ],
                defaultViewport: null,
                timeout: 60000, // 增加超時時間
                // 🎯 解決問題4: 避免殭屍進程
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
                // 繼續檢查
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
    async puppeteerLogin(page, account, password) {
        try {
            console.log("🔐 開始Puppeteer登入流程...");

            // 前往登入頁面
            await page.goto('https://portalx.yzu.edu.tw/PortalSocialVB/Login.aspx', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // 等待表單元素載入
            await page.waitForSelector('#txtUID', { timeout: 10000 });
            await page.waitForSelector('#txtPWD', { timeout: 10000 });

            console.log("📝 填入登入資訊...");
            
            // 清除並填入帳號
            await page.click('#txtUID', { clickCount: 3 });
            await page.type('#txtUID', account);
            
            // 清除並填入密碼
            await page.click('#txtPWD', { clickCount: 3 });
            await page.type('#txtPWD', password);

            console.log("🔍 檢查驗證碼...");
            
            // 檢查是否需要驗證碼
            const captchaExists = await page.$('#imgCaptcha');
            if (captchaExists) {
                console.log("⚠️ 發現驗證碼，需要手動處理");
                // 這裡可以加入驗證碼處理邏輯
                // 暫時等待用戶手動輸入
                await page.waitForTimeout(5000);
            }

            // 點擊登入按鈕
            console.log("🎯 點擊登入按鈕...");
            await page.click('#btnLogin');

            // 等待登入完成或錯誤訊息
            try {
                // 等待任一結果出現
                await Promise.race([
                    // 成功：進入主頁面
                    page.waitForNavigation({ 
                        waitUntil: 'networkidle2', 
                        timeout: 15000 
                    }),
                    // 失敗：錯誤訊息出現
                    page.waitForSelector('.error-message', { timeout: 15000 })
                ]);

                // 檢查當前URL確認登入狀態
                const currentUrl = page.url();
                console.log("🌐 當前URL:", currentUrl);
                
                if (currentUrl.includes('DefaultPage.aspx') || currentUrl.includes('Portal')) {
                    console.log("✅ Puppeteer登入成功");
                    return { success: true, message: "登入成功" };
                } else {
                    console.log("❌ 登入失敗 - 未重定向到主頁");
                    return { success: false, message: "登入失敗" };
                }
                
            } catch (timeoutError) {
                console.log("⏰ 登入等待超時，檢查頁面狀態...");
                
                // 超時後檢查是否有錯誤訊息
                const errorElements = await page.$$eval('[class*="error"], [id*="error"], .text-danger', 
                    elements => elements.map(el => el.textContent.trim()).filter(text => text)
                );
                
                if (errorElements.length > 0) {
                    return { success: false, message: `登入失敗: ${errorElements[0]}` };
                }
                
                // 檢查是否實際上已經登入成功
                const currentUrl = page.url();
                if (currentUrl.includes('DefaultPage.aspx') || currentUrl.includes('Portal')) {
                    return { success: true, message: "登入成功" };
                }
                
                return { success: false, message: "登入超時" };
            }

        } catch (error) {
            console.error("❌ Puppeteer登入失敗:", error.message);
            return { success: false, message: error.message };
        }
    }

    // 🎯 使用Puppeteer獲取完整課表（基於 complete_schedule.js 的成功實現）
    async puppeteerGetCompleteSchedule(page, year, smtr) {
        try {
            console.log("🎯 開始獲取完整課表資料...");
            console.log(`📚 目標學期: ${year}年第${smtr}學期`);

            // 🔄 前往課表頁面
            console.log("🔄 前往課表頁面...");
            
            // 首先嘗試直接URL導航
            const targetUrl = `https://portalx.yzu.edu.tw/PortalSocialVB/Student/Planning.aspx`;
            await page.goto(targetUrl, { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            });

            // 等待主要內容載入
            await page.waitForTimeout(2000);

            let navigationCompleted = false;
            
            // 🎯 設置frame監聽器來捕捉動態載入的內容
            page.on('frameattached', async (frame) => {
                try {
                    if (frame === page.mainFrame() && !navigationCompleted) {
                        console.log("🔍 Frame attached, 等待內容載入...");
                        setTimeout(() => {
                            navigationCompleted = true;
                        }, 3000);
                    }
                } catch (error) {
                    console.warn("Frame處理錯誤:", error.message);
                }
            });

            // 🔧 等待並處理iframe內容（如果存在）
            try {
                const frames = await page.frames();
                console.log(`📄 找到 ${frames.length} 個frame`);
                
                for (let i = 0; i < frames.length; i++) {
                    const frame = frames[i];
                    console.log(`🔍 檢查frame ${i}: ${frame.url()}`);
                    
                    try {
                        // 檢查frame內容
                        const frameContent = await frame.content();
                        if (frameContent.includes('課表') || frameContent.includes('schedule') || frameContent.includes('Table1')) {
                            console.log(`✅ 在frame ${i} 中找到課表相關內容`);
                            
                            // 在這個frame中執行課表提取
                            const scheduleData = await this.extractScheduleFromFrame(frame);
                            if (scheduleData && scheduleData.success) {
                                return scheduleData;
                            }
                        }
                    } catch (frameError) {
                        console.warn(`Frame ${i} 處理錯誤:`, frameError.message);
                    }
                }
            } catch (frameError) {
                console.warn("Frame處理失敗:", frameError.message);
            }

            // 🎯 備用方案：直接在主頁面中查找課表
            console.log("🔄 嘗試從主頁面提取課表...");
            
            // 等待頁面穩定
            await page.waitForTimeout(3000);
            
            // 🎯 執行JavaScript來觸發課表載入
            try {
                await page.evaluate(() => {
                    // 嘗試觸發常見的課表載入函數
                    if (typeof GoToURL !== 'undefined') {
                        GoToURL('App_', 'S5');
                    }
                });
                
                // 等待課表載入
                await page.waitForTimeout(5000);
                
                // 檢查是否有課表內容
                const pageContent = await page.content();
                if (pageContent.includes('Table1') || pageContent.includes('課表')) {
                    console.log("✅ 成功觸發課表載入");
                    
                    // 提取課表資料
                    const scheduleData = await this.extractScheduleFromPage(page);
                    if (scheduleData && scheduleData.success) {
                        return scheduleData;
                    }
                }
                
            } catch (jsError) {
                console.warn("JavaScript執行失敗:", jsError.message);
            }

            console.log("❌ 無法找到課表資料");
            return {
                success: false,
                course_list: [],
                message: "無法找到課表資料"
            };

        } catch (error) {
            console.error("❌ Puppeteer課表獲取失敗:", error.message);
            return {
                success: false,
                course_list: [],
                message: `課表獲取失敗: ${error.message}`
            };
        }
    }

    // 🎯 從frame中提取課表資料
    async extractScheduleFromFrame(frame) {
        try {
            console.log("🔍 從frame中提取課表資料...");
            
            const frameContent = await frame.content();
            const scheduleData = this.parseScheduleHTMLWithDetails(frameContent);
            
            if (scheduleData && scheduleData.length > 0) {
                console.log(`✅ 成功從frame提取 ${scheduleData.length} 門課程`);
                return {
                    success: true,
                    course_list: scheduleData,
                    message: "課表資料獲取成功"
                };
            }
            
            return null;
            
        } catch (error) {
            console.error("Frame提取失敗:", error.message);
            return null;
        }
    }

    // 🎯 從主頁面提取課表資料
    async extractScheduleFromPage(page) {
        try {
            console.log("🔍 從主頁面提取課表資料...");
            
            const pageContent = await page.content();
            const scheduleData = this.parseScheduleHTMLWithDetails(pageContent);
            
            if (scheduleData && scheduleData.length > 0) {
                console.log(`✅ 成功從主頁面提取 ${scheduleData.length} 門課程`);
                return {
                    success: true,
                    course_list: scheduleData,
                    message: "課表資料獲取成功"
                };
            }
            
            return {
                success: false,
                course_list: [],
                message: "主頁面中無課表資料"
            };
            
        } catch (error) {
            console.error("主頁面提取失敗:", error.message);
            return {
                success: false,
                course_list: [],
                message: `主頁面提取失敗: ${error.message}`
            };
        }
    }

    // 🧹 安全清理瀏覽器資源
    async cleanupPuppeteerResources(browser) {
        try {
            console.log("🧹 開始清理瀏覽器資源...");
            
            // 🎯 解決問題6: 優雅關閉所有頁面
            const pages = await browser.pages();
            for (const page of pages) {
                try {
                    await page.close();
                } catch (pageError) {
                    console.warn("⚠️ 關閉頁面時發生錯誤:", pageError.message);
                }
            }
            
            // 🎯 關閉瀏覽器
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

    // 📊 從完整課表資料中處理
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

                    // 解析每個時間段的課程
                    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                    let cellMatch;
                    let cellIndex = 0;
                    
                    while ((cellMatch = cellRegex.exec(rowHTML)) !== null) {
                        const cellHTML = cellMatch[1];
                        const cellText = cellHTML.replace(/<[^>]*>/g, '').trim();
                        
                        // 跳過空白儲存格和時間儲存格
                        if (!cellText || cellText.match(/^\d+$/) || cellIndex === 0) {
                            cellIndex++;
                            continue;
                        }

                        // 解析課程資訊
                        const timeInfo = { day: cellIndex - 1, period: rowIndex - 1 };
                        const courseInfo = this.parseCourseInfoFromCell(cellText, cellHTML, timeInfo, cellIndex - 1);
                        
                        if (courseInfo) {
                            courseList.push(courseInfo);
                        }
                        
                        cellIndex++;
                    }
                }
                
                console.log(`✅ Table1 解析完成，找到 ${courseList.length} 門課程`);
                return courseList;
                
            } catch (error) {
                console.error("Table1 解析失敗:", error.message);
                return [];
            }
        };

        try {
            console.log("📊 開始處理完整課表資料...");
            console.log("原始資料類型:", typeof rawData);
            console.log("原始資料內容:", rawData ? Object.keys(rawData) : 'null');

            if (!rawData) {
                console.warn("⚠️ 沒有原始資料可處理");
                return [];
            }

            // 如果原始資料已經包含處理好的 course_list
            if (rawData.course_list && rawData.course_list.length > 0) {
                console.log("✅ 使用現有的 course_list");
                return this.processPuppeteerScheduleData(rawData);
            }

            // 如果有 HTML 資料需要解析
            if (rawData.table1_html) {
                console.log("🔍 解析 Table1 HTML...");
                const courses = parseCourseListFromTable1(rawData.table1_html);
                return courses;
            }

            // 如果有其他格式的資料
            if (rawData.html_content) {
                console.log("🔍 解析一般 HTML 內容...");
                return this.parseScheduleHTMLWithDetails(rawData.html_content);
            }

            console.warn("⚠️ 無法識別的資料格式");
            return [];

        } catch (error) {
            console.error("❌ 處理完整課表資料失敗:", error.message);
            return [];
        }
    }

    // 🎯 解析課程資訊從儲存格
    parseCourseInfoFromCell(cellText, cellHTML, timeInfo, dayIndex) {
        try {
            if (!cellText || cellText.length < 3) return null;

            const lines = cellText.split('\n').map(line => line.trim()).filter(line => line);
            if (lines.length === 0) return null;

            // 提取課程代碼
            let courseId = 'UNKNOWN';
            const codeMatch = lines[0].match(/([A-Z]{2,3}\d{3}[A-Z]?)/);
            if (codeMatch) courseId = codeMatch[1];

            // 提取課程名稱（通常在第二行）
            let courseName = '';
            if (lines[1]) courseName = lines[1];

            // 提取教師和教室資訊
            let teacher = '';
            let room = '';
            
            for (let i = 2; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes('教授') || line.includes('老師') || line.includes('講師')) {
                    teacher = line;
                } else if (line.match(/[A-Z]\d+/)) {
                    room = line;
                }
            }

            const courseInfo = {
                course_id: courseId,
                name: courseName,
                teacher: teacher,
                room: room,
                day: dayIndex,
                period: timeInfo.period,
                time_slot: `${dayIndex + 1}-${timeInfo.period + 1}`,
                credit: 'N/A'
            };

            return courseInfo;

        } catch (error) {
            console.warn("解析課程儲存格失敗:", error.message);
            return null;
        }
    }

    // 📊 解析課表HTML並提取詳細資料
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
            
        } catch (error) {
            console.warn("分析 HTML 結構時發生錯誤:", error.message);
        }
    }

    // 🎯 從Table1提取課程資訊
    extractCourseInfoFromTable1(cells) {
        try {
            if (!cells || cells.length < 3) return null;
            
            const courseInfo = {
                course_id: this.extractCourseId(cells),
                name: cells[1] || '未知課程',
                teacher_name: this.processTeacherName(cells[2] || '未知教師'),
                time_slot: cells[3] || '未知時間',
                room: cells[4] || '未知教室',
                credit: this.extractCredit(cells[5])
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

    // 📚 提取學分數
    extractCredit(creditText) {
        if (!creditText) return 'N/A';
        const match = creditText.match(/(\d+)/);
        return match ? match[1] : 'N/A';
    }

    // 🧹 處理教師姓名（簡化版本，主要處理會在CourseQueryManager中）
    processTeacherName(teacherText) {
        if (!teacherText) return '';
        return String(teacherText).trim();
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

    extractRoomFromText(text) {
        // 簡單的教室提取邏輯
        const roomMatch = text.match(/([A-Z]\d+[A-Z]?)/);
        return roomMatch ? roomMatch[1] : '未知教室';
    }

    extractCreditFromText(text) {
        const creditMatch = text.match(/\((\d+)\)/);
        return creditMatch ? parseInt(creditMatch[1]) : 0;
    }
}

module.exports = { 
    PuppeteerManager, 
    loadPuppeteer 
};