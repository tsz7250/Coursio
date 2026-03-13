const ScheduleParser = require('./parsers/schedule_parser');
const { puppeteerLogin } = require('./schedule/schedule_login');
const scheduleTextExtractor = require('./schedule/schedule_text_extractor');
const { executeCompleteScheduleFetch } = require('./schedule/schedule_executor');

class ScheduleService {
    constructor(backend) {
        this.backend = backend;
    }

    getCourseSchedule(year, smtr) {
        return executeCompleteScheduleFetch(this, year, smtr);
    }

    parseScheduleHTMLWithDetails(htmlContent) {
        try {
            console.log("開始解析課表 HTML，尋找 label1 和 table1...");
            console.log("HTML 內容大小:", htmlContent.length, "字元");
            const parsed = ScheduleParser.parseScheduleHTMLWithDetails(htmlContent);

            if (parsed.found_label1) {
                console.log("✅ 找到 label1 內容:", parsed.label1Content);
            } else {
                console.log("⚠️ 未找到 label1 元素");
            }

            if (parsed.found_table1) {
                console.log(`✅ 找到 table1，解析出 ${parsed.courses.length} 門課程`);
            } else {
                console.log("⚠️ 未找到 table1 元素");
                console.log("嘗試尋找其他課表格式...");
            }

            return parsed;

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

    setEmptyPersonalSchedule(errorMessage) {
        console.log("設定空白個人課表，原因:", errorMessage);

        this.backend.course_schedule_data = {
            course_list: [],
            is_personal: true,
            source: "個人課表（空白）",
            warning: errorMessage,
            message: "個人課表無資料",
            empty_reason: errorMessage
        };

        return Promise.resolve(this.backend);
    }

    async puppeteerLogin(page) {
        return puppeteerLogin(page, this.backend);
    }

    async handleScheduleIframe(page) {
        try {
            console.log("🔍 等待課表 iframe 載入 (portalfun/Schedule)...");

            const frame = await this.backend._waitForTargetFrame(
                page,
                ['schedule_xp', 'my_schedule'],
                ['iframesub', 'iframeright', 'clickmenulog', 'about:blank', 'ffb_login'],
                15000
            );

            if (!frame) {
                console.warn("⚠️ 課表 iframe 等待超時，未找到目標 frame");
                return { success: false, message: "未找到有效的課表 iframe" };
            }

            await frame.waitForSelector('#Label1, #Table1', { timeout: 8000 }).catch(() => {
                console.warn("⚠️ 等待 #Label1 / #Table1 超時，嘗試繼續提取...");
            });

            const iframeScheduleData = await frame.evaluate(() => {
                const result = { label1_info: '', schedule_table: '', current_url: window.location.href };

                const label1 = document.getElementById('Label1');
                if (label1) result.label1_info = label1.innerHTML || label1.textContent || label1.innerText || '';

                const table1 = document.getElementById('Table1');
                if (table1) result.schedule_table = table1.outerHTML;

                return result;
            });

            if (iframeScheduleData.schedule_table || iframeScheduleData.label1_info) {
                this.backend.iframeScheduleData = iframeScheduleData;
                console.log("✅ 成功從課表 iframe 提取資料");
                return { success: true, data: iframeScheduleData };
            }

            console.warn("⚠️ 課表 iframe 中未找到 Label1 / Table1 資料");
            return { success: false, message: "iframe 中無課表資料" };

        } catch (error) {
            console.warn("⚠️ handleScheduleIframe 錯誤:", error.message);
            return { success: false, message: error.message };
        }
    }

    async puppeteerLoadSchedule(page) {
        try {
            console.log("📋 開始載入課表...");

            await page.waitForFunction(() => {
                return document.getElementById('tdS14') || Array.from(document.querySelectorAll('*[onclick]')).some(el => {
                    const text = (el.textContent || el.innerText || '').trim();
                    const onclick = el.getAttribute('onclick') || '';
                    return (text.includes('課表') && onclick.includes('S5')) || onclick.includes("GoToURL('App_','S5')");
                });
            }, { timeout: 12000 }).catch(() => {});

            const currentUrl = page.url();
            console.log("📍 當前頁面URL:", currentUrl);
            console.log("🔍 尋找課表菜單項...");

            await page.waitForFunction(() => {
                return document.getElementById('tdS14') || document.querySelector('*[onclick*="S5"]') || document.querySelector('*[onclick*="GoToURL"]');
            }, { timeout: 10000 }).catch(() => {
                console.warn("⚠️ 等待菜單元素超時，繼續嘗試...");
            });

            const scheduleMenuFound = await page.evaluate(() => {
                let scheduleElement = document.getElementById('tdS14');

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
                const navigationPromise = new Promise((resolve) => {
                    let navigationCompleted = false;

                    page.on('framenavigated', (frame) => {
                        if (frame === page.mainFrame() && !navigationCompleted) {
                            navigationCompleted = true;
                            console.log("✅ 檢測到頁面導航完成");
                            resolve();
                        }
                    });

                    page.on('response', async (response) => {
                        if ((response.url().includes('portalfun') || response.url().includes('Schedule') || response.url().includes('FFB_Login')) && !navigationCompleted) {
                            navigationCompleted = true;
                            console.log("✅ 檢測到課表相關請求完成");
                            resolve();
                        }
                    });

                    setTimeout(() => {
                        if (!navigationCompleted) {
                            console.log("⏰ 導航請求超時，繼續執行...");
                            resolve();
                        }
                    }, 15000);
                });

                console.log("🖱️ 點擊課表菜單...");
                await page.evaluate((menuInfo) => {
                    const element = document.getElementById(menuInfo.id) || document.querySelector(`*[onclick*="GoToURL('App_','S5')"]`);
                    if (element) {
                        element.click();
                        if (element.onclick) {
                            element.onclick();
                        } else if (typeof GoToURL === 'function') {
                            GoToURL('App_', 'S5');
                        }
                    }
                }, scheduleMenuFound);

                console.log("⏱️ 等待課表頁面載入...");
                await navigationPromise;
                await this.backend.waitForNetworkIdle(page, 600, 12000).catch(() => {});

                console.log("🔍 檢查iframe中的課表內容...");
                const iframeResult = await this.handleScheduleIframe(page);
                if (iframeResult.success) return { success: true };

                return { success: true };
            }

            console.log("⚠️ 未找到課表菜單，嘗試其他方法...");
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

        } catch (error) {
            console.error("❌ 載入課表失敗:", error.message);
            return { success: false, message: error.message };
        }
    }

    async puppeteerParseSchedule(page) {
        try {
            console.log("📊 解析課表數據...");

            if (this.backend.iframeScheduleData) {
                console.log("🎯 使用 iframe 中預存的課表數據...");
                const processedData = this.processScheduleDataFromComplete({
                    label1_info: this.backend.iframeScheduleData.label1_info,
                    schedule_table: this.backend.iframeScheduleData.schedule_table
                });
                return { success: true, data: processedData };
            }

            console.log("🔄 iframeScheduleData 為空，嘗試重新搜尋課表 iframe...");
            const frame = await this.backend._waitForTargetFrame(
                page,
                ['portalfun', 'schedule_xp', 'my_schedule'],
                ['iframesub', 'iframeright', 'clickmenulog', 'about:blank', 'ffb_login'],
                8000
            );

            if (frame) {
                await frame.waitForSelector('#Label1, #Table1', { timeout: 6000 }).catch(() => {});
                const scheduleData = await frame.evaluate(() => {
                    const result = { label1_info: '', schedule_table: '' };
                    const label1 = document.getElementById('Label1');
                    if (label1) result.label1_info = label1.innerHTML || label1.textContent || label1.innerText || '';
                    const table1 = document.getElementById('Table1');
                    if (table1) result.schedule_table = table1.outerHTML;
                    return result;
                });

                if (scheduleData.label1_info || scheduleData.schedule_table) {
                    const processedData = this.processScheduleDataFromComplete(scheduleData);
                    return { success: true, data: processedData };
                }
            }

            console.error("❌ 課表解析失敗：在所有 frame 中均未找到 Label1 / Table1");
            return {
                success: false,
                message: "課表提取失敗：找不到課表 iframe 或 iframe 中無課表資料。請確認已登入並等待頁面完全載入後再試。"
            };

        } catch (error) {
            console.error("❌ 解析課表數據失敗:", error.message);
            return { success: false, message: error.message };
        }
    }

    processScheduleDataFromComplete(rawData) {
        const cleanLabel1 = (text) => {
            if (!text) return '';

            let t = String(text);
            if (t.includes('<br>') || t.includes('<BR>')) {
                const parts = t.split(/<br\s*\/?>/i);
                t = parts[0].trim();
            }

            t = t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

            const match = t.match(/(\d{1,3}\s*學年第\s*\d{1,2}\s*學期學分小計[:：]\s*\d{1,3})/);
            if (match) return match[1].replace(/\s+/g, ' ').trim();

            const fallbackMatch = t.match(/(.*?小計[:：]?\s*)(\d{1,3})(?:\s|$)/);
            if (fallbackMatch) return (fallbackMatch[1] + fallbackMatch[2]).replace(/\s+/g, ' ').trim();

            return t;
        };

        const parseCourseListFromTable1 = (tableHTML) => {
            const courseList = [];
            if (!tableHTML) return courseList;

            try {
                console.log("🔍 開始從 Table1 解析課程資料...");

                const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                let rowMatch;

                while ((rowMatch = rowRegex.exec(tableHTML)) !== null) {
                    const rowHTML = rowMatch[1];
                    if (rowHTML.includes('Mon') || rowHTML.includes('週一') || rowHTML.includes('時間')) continue;

                    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                    let cellMatch;
                    let cellIndex = 0;
                    let timeInfo = '';

                    while ((cellMatch = cellRegex.exec(rowHTML)) !== null) {
                        const cellHTML = cellMatch[1];
                        const cellText = cellHTML.replace(/<[^>]*>/g, '').trim();

                        if (cellIndex === 0) {
                            timeInfo = cellText;
                            cellIndex++;
                            continue;
                        }

                        if (cellHTML.includes('<a') && cellHTML.includes('href') && cellText.length > 5) {
                            const courseInfo = this.parseCourseInfoFromCell(cellText, cellHTML, timeInfo, cellIndex);
                            if (courseInfo) courseList.push(courseInfo);
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
            course_list: courseList,
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

    parseCourseInfoFromCell(cellText, cellHTML, timeInfo, dayIndex) {
        return scheduleTextExtractor.parseCourseInfoFromCell(
            cellText,
            cellHTML,
            timeInfo,
            dayIndex,
            this.backend.processTeacherName.bind(this.backend)
        );
    }

    processPuppeteerScheduleData(rawData) {
        const processed = {
            is_personal: true,
            label1_info: rawData.label1_info || '',
            course_list: [],
            raw_table_html: rawData.schedule_table || '',
            extraction_time: new Date().toISOString()
        };

        if (rawData.course_list && rawData.course_list.length > 0) {
            rawData.course_list.forEach(course => {
                const courseText = course.course_text || '';
                if (courseText && courseText.length > 5) {
                    const lines = courseText.split('\n').map(line => line.trim()).filter(line => line);

                    let courseId = 'UNKNOWN';
                    let courseName;
                    let room;
                    let credit = 0;

                    if (lines.length >= 3) {
                        const firstLine = lines[0];
                        const codeMatch = firstLine.match(/([A-Z]{2,3}\d{3,4})/);
                        const creditMatch = firstLine.match(/\((\d+)\)/);

                        if (codeMatch) courseId = codeMatch[1];
                        if (creditMatch) credit = parseInt(creditMatch[1]);

                        courseName = lines[1] || '未知課程';
                        room = lines[2] || '未知教室';
                    } else {
                        courseId = this.extractCourseIdFromText(courseText);
                        courseName = this.extractCourseNameFromText(courseText);
                        room = this.extractRoomFromText(courseText);
                        credit = this.extractCreditFromText(courseText);
                    }

                    processed.course_list.push({
                        course_id: courseId,
                        name: courseName,
                        teacher_name: this.backend.processTeacherName('待查詢'),
                        room,
                        time: course.time_text || `第${course.period}節`,
                        days: course.day ? [course.day] : [],
                        periods: course.period ? [course.period] : [],
                        dept_name: '個人課程',
                        credit,
                        is_selected: true,
                        source: "Puppeteer Table1 精確解析",
                        raw_text: courseText,
                        raw_html: course.raw_html || '',
                        position: course.position || {}
                    });
                }
            });
        }

        console.log("🔄 Puppeteer數據處理完成:");
        console.log(`  - 個人課表: ${processed.is_personal ? '是' : '否'}`);
        console.log(`  - 課程數量: ${processed.course_list.length}`);
        console.log(`  - 標籤信息: ${processed.label1_info ? '有' : '無'}`);

        return processed;
    }

    extractCourseIdFromText(text) {
        return scheduleTextExtractor.extractCourseIdFromText(text);
    }

    extractCourseNameFromText(text) {
        return scheduleTextExtractor.extractCourseNameFromText(text);
    }

    extractTeacherFromText(_text) {
        return '未知教師';
    }

    extractRoomFromText(text) {
        return scheduleTextExtractor.extractRoomFromText(text);
    }

    extractTimeFromText(text) {
        return scheduleTextExtractor.extractTimeFromText(text);
    }

    extractDayFromText(text) {
        return scheduleTextExtractor.extractDayFromText(text);
    }

    extractPeriodFromText(text) {
        return scheduleTextExtractor.extractPeriodFromText(text);
    }

    extractCreditFromText(text) {
        return scheduleTextExtractor.extractCreditFromText(text);
    }

    generateScheduleTableHTML(courses = null) {
        console.log("🎯 開始生成課表HTML...");

        const courseList = courses || this.backend.course_schedule_data?.course_list || [];
        console.log(`📚 準備生成 ${courseList.length} 門課程的課表`);

        const schedule = Array(13).fill(null).map(() => Array(7).fill(null));

        const periodTimes = [
            "第1節\n08:10-09:00", "第2節\n09:10-10:00", "第3節\n10:10-11:00", "第4節\n11:10-12:00",
            "第5節\n12:10-13:00", "第6節\n13:10-14:00", "第7節\n14:10-15:00", "第8節\n15:10-16:00",
            "第9節\n16:10-17:00", "第10節\n17:10-18:00", "第11節\n18:30-19:20", "第12節\n19:25-20:15",
            "第13節\n20:20-21:10"
        ];

        courseList.forEach((course, courseIndex) => {
            console.log(`📋 處理課程 ${courseIndex + 1}: ${course.name} (${course.raw_text?.substring(0, 50)}...)`);

            const days = course.days || [];
            const periods = course.periods || [];

            if (days.length === 0 || periods.length === 0) {
                const rawText = course.raw_text || '';
                const extractedDays = this.extractDayFromText(rawText);
                const extractedPeriods = this.extractPeriodFromText(rawText);

                if (extractedDays.length > 0) days.push(...extractedDays);
                if (extractedPeriods.length > 0) periods.push(...extractedPeriods);
            }

            days.forEach(day => {
                periods.forEach(period => {
                    if (day >= 1 && day <= 7 && period >= 1 && period <= 13) {
                        const dayIndex = day - 1;
                        const periodIndex = period - 1;

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
                    }
                });
            });
        });

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

        for (let period = 0; period < 13; period++) {
            html += `\n    <tr>`;
            html += `<td style="background-color: rgb(248, 249, 250); font-weight: bold; white-space: pre-line; text-align: center;">${periodTimes[period]}</td>`;

            for (let day = 0; day < 7; day++) {
                const dayCourses = schedule[period][day];
                if (dayCourses && dayCourses.length > 0) {
                    const courseInfo = dayCourses.map(course => {
                        let info = course.name;
                        if (course.room) info += `\n${course.room}`;
                        if (course.teacher) info += `\n${course.teacher}`;
                        return info;
                    }).join('\n---\n');

                    html += `<td class="schedule-cell"><div class="course-slot" style="padding: 8px; text-align: center; background-color: #e3f2fd; color: #1976d2; border-radius: 4px; font-size: 12px; line-height: 1.4;">${courseInfo}</div></td>`;
                } else {
                    html += `<td class="schedule-cell"><div class="course-slot" style="padding: 8px; text-align: center; color: #999;">-</div></td>`;
                }
            }

            html += `</tr>`;
        }

        html += `\n</tbody>\n</table>`;

        console.log("✅ 課表HTML生成完成");

        let totalArranged = 0;
        schedule.forEach(row => {
            row.forEach(cell => {
                if (cell && cell.length > 0) totalArranged += cell.length;
            });
        });

        console.log(`📊 課表統計: 共${courseList.length}門課程，已安排${totalArranged}個時段`);
        return html;
    }
}

module.exports = ScheduleService;
