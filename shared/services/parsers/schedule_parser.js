class ScheduleParser {
    /**
     * 處理教師名稱，移除空的括號和重複內容
     * @param {string} teacherText - 原始教師名稱
     * @returns {string} - 處理後的教師名稱
     */
    static processTeacherName(teacherText) {
        if (!teacherText) return '';
        
        // M-08: 防護異常長字串，超過上限直接截斷
        const MAX_TEACHER_NAME_LENGTH = 80;
        let cleanText = teacherText.trim();
        if (cleanText.length > MAX_TEACHER_NAME_LENGTH) {
            return cleanText.slice(0, MAX_TEACHER_NAME_LENGTH) + '…';
        }
        
        // 支援多教師拆分處理（用頓號或全形逗號）
        // 為了避免英文名字內部的逗號 (e.g. Chiu,Chieh-Sen) 被切斷，我們只用 `、` 與全形 `，` 來做主要切分
        const teachers = cleanText.split(/[、，]/).map(t => t.trim()).filter(t => t);
        
        const processedTeachers = teachers.map(teacher => {
            return ScheduleParser.processSingleTeacherName(teacher);
        }).filter(t => t);
        
        return processedTeachers.join('、');
    }

    /**
     * 處理單一教師名稱，移除空的括號和重複內容
     * @param {string} cleanText - 原始教師名稱
     * @returns {string} - 處理後的教師名稱
     */
    static processSingleTeacherName(cleanText) {
        if (!cleanText) return '';

        // 處理缺少開頭括號的情況，例如: "廖建勛Chien-Shiun Liao)" -> "廖建勛(Chien-Shiun Liao)"
        const missingBracketPattern = /^([\u4e00-\u9fff]+)([A-Za-z\s,-]+)\)$/;
        const missingBracketMatch = cleanText.match(missingBracketPattern);
        if (missingBracketMatch) {
            const chineseName = missingBracketMatch[1];
            const englishName = missingBracketMatch[2].trim();
            cleanText = `${chineseName}(${englishName})`;
        }
        
        // 處理重複的括號內容
        const duplicatePattern = /^([\u4e00-\u9fff]+)([A-Za-z\s,-]+)\)\(([A-Za-z\s,-]+)\)$/;
        const duplicateMatch = cleanText.match(duplicatePattern);
        if (duplicateMatch) {
            const chineseName = duplicateMatch[1];
            const englishName = duplicateMatch[2].trim();
            const duplicateEnglishName = duplicateMatch[3].trim();
            
            if (englishName === duplicateEnglishName) {
                cleanText = `${chineseName}(${englishName})`;
            } else {
                cleanText = `${chineseName}(${englishName})(${duplicateEnglishName})`;
            }
        }
        
        if (cleanText.includes('(')) {
            const parts = cleanText.split('(');
            const name = parts[0].trim();
            const bracketContent = parts.slice(1).join('(').trim();
            
            // 清理括號內容只有右括號或空格的情況，例如 ")" 或 " )" 或 ""
            const cleanContent = bracketContent.replace(/[)\s]/g, '');
            if (!cleanContent) {
                return name;
            }
            
            const correctFormatPattern = /^[\u4e00-\u9fff]+\([A-Za-z\s,-]+\)$/;
            if (correctFormatPattern.test(cleanText)) {
                return cleanText.replace('(', '\n(');
            }
            
            let cleanBracketContent = bracketContent;
            
            if (bracketContent.includes(')(')) {
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
                    return name + '\n(' + resultParts.join(')(') + ')';
                }
            }
            
            const bracketPattern = /\(([^)]+)\)/g;
            const matches = bracketContent.match(bracketPattern);
            
            if (matches && matches.length > 1) {
                const uniqueContents = new Set();
                const uniqueMatches = [];
                
                for (const match of matches) {
                    const content = match.slice(1, -1).trim();
                    if (!uniqueContents.has(content)) {
                        uniqueContents.add(content);
                        uniqueMatches.push(match);
                    }
                }
                if (uniqueMatches.length < matches.length) {
                    cleanBracketContent = uniqueMatches.join('');
                    return name + '\n' + cleanBracketContent;
                }
            }
            
            return name + '\n' + cleanBracketContent;
        }
        
        return cleanText;
    }

    // 解析課表 HTML，提取 label1 與 table1 並回傳詳細資訊
    static parseScheduleHTMLWithDetails(htmlContent) {
        const MAX_COURSES = 5000; // M-10: 防止超大 HTML 造成記憶體暴增
        try {
            console.log("開始解析課表 HTML，尋找 label1 和 table1...");
            const courses = [];
            
            // 1. 提取 label1 內容
            const label1Match = htmlContent.match(/<label[^>]*id\s*=\s*["']label1["'][^>]*>([\s\S]*?)<\/label>/i);
            let label1Content = '';
            if (label1Match) {
                label1Content = label1Match[1].replace(/<[^>]*>/g, '').trim();
                console.log("✅ 找到 label1 內容:", label1Content);
            }
            
            // 2. 提取 table1 內容
            const table1Match = htmlContent.match(/<table[^>]*id\s*=\s*["']table1["'][^>]*>([\s\S]*?)<\/table>/i);
            
            if (table1Match) {
                const tableContent = table1Match[1];
                const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                let rowMatch;
                let rowCount = 0;
                
                while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
                    rowCount++; // eslint-disable-line no-unused-vars
                    // M-10: 超過上限時停止解析，避免記憶體耗盡
                    if (courses.length >= MAX_COURSES) {
                        console.warn(`⚠️ 課程數量達上限 ${MAX_COURSES}，停止解析`);
                        break;
                    }
                    const rowContent = rowMatch[1];
                    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                    const cells = [];
                    let cellMatch;
                    
                    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
                        const cellText = cellMatch[1].replace(/<[^>]*>/g, '').trim();
                        if (cellText && cellText !== '&nbsp;') {
                            cells.push(cellText);
                        }
                    }
                    
                    if (cells.length >= 3) {
                        const courseInfo = this.extractCourseInfoFromTable1(cells);
                        if (courseInfo) {
                            courses.push(courseInfo);
                        }
                    }
                }
            } else {
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

    static logHtmlStructure(htmlContent) {
        try {
            console.log("分析 HTML 結構...");
            const allTables = htmlContent.match(/<table[^>]*>/gi) || [];
            console.log("找到的 table 元素:", allTables.length);
            const allLabels = htmlContent.match(/<label[^>]*>/gi) || [];
            console.log("找到的 label 元素:", allLabels.length);
        } catch (error) {
            console.warn("分析 HTML 結構時發生錯誤:", error);
        }
    }

    static extractCourseInfoFromTable1(cells) {
        try {
            const courseInfo = {
                course_id: cells[0] || 'UNKNOWN',
                name: cells[1] || cells[0] || '未知課程',
                credit: this.extractCredit(cells[2] || '0'),
                time: this.parseTimeSlot(cells[3] || ''),
                room: cells[4] || '未知教室',
                teacher_name: this.processTeacherName(cells[5] || '未知教師'),
                dept_name: '個人課程',
                is_selected: true,
                source: "官方個人課表 HTML (table1)"
            };
            
            if (this.isValidCourseInfo(courseInfo)) {
                return courseInfo;
            }
            return null;
        } catch {
            return null;
        }
    }

    static isValidCourseInfo(courseInfo) {
        if (!courseInfo.name || courseInfo.name.length < 2) return false;
        
        const invalidPatterns = [
            '&nbsp;', '　', 'undefined', 'null', '未知課程',
            '課程代號', '課程名稱', '學分', '時間', '教室', '教師',
            '合計', '小計', '總計', '備註', '說明'
        ];
        
        for (const pattern of invalidPatterns) {
            if (courseInfo.name.includes(pattern)) return false;
        }
        
        if (courseInfo.course_id === 'UNKNOWN' && courseInfo.name.length < 3) {
            return false;
        }
        
        return true;
    }

    static parseTimeSlot(timeText) {
        try {
            if (!timeText || timeText.trim() === '') return "時間待確認";
            
            const cleanTime = timeText.replace(/\s+/g, '').replace(/[（）()]/g, '');
            const dayMapping = {
                '一': '1', '二': '2', '三': '3', '四': '4', 
                '五': '5', '六': '6', '日': '7', '天': '7'
            };
            
            let result = [];
            for (const [chinese, number] of Object.entries(dayMapping)) {
                if (cleanTime.includes('週' + chinese) || cleanTime.includes('星期' + chinese)) {
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
        } catch {
            return timeText || "時間待確認";
        }
    }

    static extractCredit(creditText) {
        try {
            const match = creditText.match(/(\d+)/);
            return match ? parseInt(match[1]) : 0;
        } catch {
            return 0;
        }
    }

    static extractCourseId(cells) {
        try {
            for (const cell of cells) {
                const match = cell.match(/[A-Z0-9]{6,}/);
                if (match) return match[0];
            }
            return 'UNKNOWN';
        } catch {
            return 'UNKNOWN';
        }
    }
}

module.exports = ScheduleParser;
