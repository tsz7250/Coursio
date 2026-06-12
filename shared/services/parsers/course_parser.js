const cheerio = require('cheerio');
const ScheduleParser = require('./schedule_parser');

class CourseParser {
    /**
     * 從課程詳細頁面的 HTML 提取學分數
     * @param {string} html - 課程詳細頁面 HTML
     * @returns {number} 學分數 (若失敗返回 0)
     */
    static extractCreditFromHtml(html) {
        try {
            const $ = cheerio.load(html);
            
            // 尋找包含學分數的td元素
            const creditCell = $('td.record[title*="授課時數"]');
            if (creditCell.length > 0) {
                // 先嘗試從td的內容中取得學分數
                const cellText = creditCell.text().trim();
                if (cellText && cellText !== '') {
                    const credit = parseInt(cellText);
                    if (!isNaN(credit) && credit > 0) {
                        return credit;
                    }
                }
                
                // 如果td內容為空，再嘗試從title屬性取得
                const title = creditCell.attr('title');
                if (title) {
                    const creditMatch = title.match(/授課時數:(\d+)/);
                    if (creditMatch) {
                        return parseInt(creditMatch[1]);
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
                    const cellText = element.text().trim();
                    if (cellText && cellText !== '') {
                        const credit = parseInt(cellText);
                        if (!isNaN(credit) && credit > 0) {
                            return credit;
                        }
                    }
                    
                    const title = element.attr('title');
                    if (title) {
                        const creditMatch = title.match(/(\d+)/);
                        if (creditMatch) {
                            return parseInt(creditMatch[1]);
                        }
                    }
                }
            }
            
            return 0;
        } catch (error) {
            console.error('[CourseParser] 提取學分數失敗:', error.message);
            return 0;
        }
    }

    /**
     * 解析系所和學期選項
     * @param {string} html - HTML 首頁內容
     * @returns {Object} 包含 dept_list, dept_options, semester_list 的結果
     */
    static parseDeptAndSemesterOptions(html) {
        try {
            const $ = cheerio.load(html);

            // 解析系所選項 (DDL_Dept)
            const dept_list = [];
            const deptOptions = $("#DDL_Dept option");
            deptOptions.each((index, element) => {
                const value = $(element).attr('value');
                const elementHtml = $(element).html() || "";
                
                // 保留縮排格式，將HTML實體轉換為實際字符
                const text = elementHtml
                    .replace(/&nbsp;/g, ' ')  
                    .replace(/<[^>]*>/g, '')   
                    .replace(/\s+$/g, '');     
                
                if (value && text && value !== "") {
                    dept_list.push({
                        value: value,
                        text: text,
                        dept_name: text 
                    });
                }
            });

            // 解析學期選項 (DDL_YM)
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

            return {
                dept_options: dept_list,
                dept_list: dept_list.map(dept => dept.dept_name),
                semester_list: semester_list,
                success: true
            };
        } catch (error) {
            console.error('[CourseParser] 解析選項失敗:', error.message);
            throw new Error(`選項取得失敗: ${error.message}`, { cause: error });
        }
    }

    /**
     * 共用的課程資料解析方法
     * @param {string} html - 包含課程表格的HTML內容
     * @returns {Object} 解析結果 { success, courses, message }
     */
    static parseCourseTable(html) {
        try {
            const $ = cheerio.load(html);
            const table1 = $("#Table1");

            if (table1.length) {
                const courses = [];
                const rows = table1.find("tr").toArray();
                if (rows.length === 0) {
                    return { success: false, courses: [], message: "未找到課程資料" };
                }

                // 解析表頭以對應欄位索引
                const headerCells = $(rows[0]).find("td").toArray();
                const colIndexes = {
                    cos_id: -1,
                    dept_level: -1,
                    cos_name: -1,
                    type: -1,
                    time_room: -1,
                    teacher: -1,
                    reg_num: -1, // 選課人數
                    max_num: -1  // 人數上限
                };

                headerCells.forEach((cell, idx) => {
                    const text = $(cell).text().trim();
                    const title = $(cell).attr('title') || '';

                    if (title.includes("Course ID") || text.includes("課號")) {
                        colIndexes.cos_id = idx;
                    } else if (title.includes("Department") || text.includes("開課系級")) {
                        colIndexes.dept_level = idx;
                    } else if (title.includes("Course Name") || text.includes("課程名稱")) {
                        colIndexes.cos_name = idx;
                    } else if (text.includes("選別")) {
                        colIndexes.type = idx;
                    } else if (title.includes("Timetable") || text.includes("時間,教室")) {
                        colIndexes.time_room = idx;
                    } else if (title.includes("Instructor") || text.includes("授課教師")) {
                        colIndexes.teacher = idx;
                    } else if ((text.includes("選課人數") || text.includes("已選")) && (text.includes("上限") || text.includes("限額"))) {
                        colIndexes.reg_num = idx;
                        colIndexes.max_num = idx;
                    } else if (text.includes("選課人數") || text.includes("已選")) {
                        colIndexes.reg_num = idx;
                    } else if (text.includes("上限") || text.includes("限額")) {
                        colIndexes.max_num = idx;
                    }
                });

                // 萬一表頭解析失敗，提供原本 7 欄的 fallback
                if (colIndexes.cos_id === -1) {
                    colIndexes.cos_id = 1;
                    colIndexes.dept_level = 2;
                    colIndexes.cos_name = 3;
                    colIndexes.type = 4;
                    colIndexes.time_room = 5;
                    colIndexes.teacher = 6;
                }

                // 從第2行開始，每2行為一組
                for (let i = 1; i < rows.length; i += 2) { 
                    const row = $(rows[i]);
                    const cells = row.find("td");
                    
                    if (cells.length > Math.max(colIndexes.cos_id, colIndexes.dept_level, colIndexes.cos_name, colIndexes.type, colIndexes.time_room, colIndexes.teacher)) { 
                        // 從課號班別欄位提取課程ID和班級
                        const courseIdCell = $(cells[colIndexes.cos_id]).find("a").text().trim() || $(cells[colIndexes.cos_id]).text().trim();
                        const courseIdMatch = courseIdCell.match(/^(\w+)\s+([A-Z0-9]+)$/);
                        
                        let cos_id = courseIdCell;
                        let cos_class = "";
                        if (courseIdMatch) {
                            cos_id = courseIdMatch[1];
                            cos_class = courseIdMatch[2];
                        }
                        
                        // 從課程名稱欄位提取完整文字，保留換行格式
                        const courseNameHtml = $(cells[colIndexes.cos_name]).html() || "";
                        const cos_name = courseNameHtml
                            .replace(/<br\s*\/?>/gi, '\n')  
                            .replace(/<[^>]*>/g, '')        
                            .replace(/^\s+|\s+$/g, '')      
                            .replace(/\n\s+/g, '\n')        
                            .replace(/\s+\n/g, '\n');       
                        
                        // 從授課教師欄位提取教師姓名
                        const rawTeacherText = $(cells[colIndexes.teacher]).find("a").text().trim() || $(cells[colIndexes.teacher]).text().trim();
                        const teacherText = ScheduleParser.processTeacherName(rawTeacherText);
                        
                        // 提取人數資訊 (若有)
                        let reg_num = "";
                        let max_num = "";
                        
                        if (colIndexes.reg_num !== -1 && colIndexes.max_num !== -1 && colIndexes.reg_num === colIndexes.max_num) {
                            const combinedText = $(cells[colIndexes.reg_num]).text().trim();
                            const parts = combinedText.split('/');
                            if (parts.length === 2) {
                                reg_num = parts[0].trim();
                                max_num = parts[1].trim();
                            } else {
                                reg_num = combinedText;
                            }
                        } else {
                            reg_num = colIndexes.reg_num !== -1 ? $(cells[colIndexes.reg_num]).text().trim() : "";
                            max_num = colIndexes.max_num !== -1 ? $(cells[colIndexes.max_num]).text().trim() : "";
                        }

                        courses.push({
                            cos_id: cos_id.trim(),
                            cos_class: cos_class.trim(),
                            cos_name: cos_name,
                            type: colIndexes.type !== -1 ? $(cells[colIndexes.type]).text().trim() : "", 
                            time_room: colIndexes.time_room !== -1 ? $(cells[colIndexes.time_room]).html()
                                .replace(/<br\s*\/?>/gi, '\n')  
                                .replace(/<[^>]*>/g, '')        
                                .replace(/^\s+|\s+$/g, '')      
                                .replace(/\n\s+/g, '\n')        
                                .replace(/\s+\n/g, '\n') : "",       
                            teacher: teacherText, 
                            credits: "", 
                            dept_level: colIndexes.dept_level !== -1 ? $(cells[colIndexes.dept_level]).text().replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : "",
                            reg_num: reg_num,
                            max_num: max_num
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
        } catch (error) {
            console.error('[CourseParser] 解析課程表格失敗:', error.message);
            return {
                success: false,
                courses: [],
                message: `解析失敗: ${error.message}`
            };
        }
    }
}

module.exports = CourseParser;
