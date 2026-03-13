const cheerio = require('cheerio');

/**
 * 成績解析器 - 專門負責解析 YZU 成績相關 HTML
 * 採用純函數設計，接收 HTML 字串並回傳 JSON 資料
 * 
 * 注意：回傳結構必須與 GradesPage.vue 的預期欄位完全一致
 */
class GradesParser {
    static _normalizeYearSemester(raw) {
        const text = String(raw || '').trim();
        if (!text) return '';

        // 支援 112/1、112,1、112-1、1121、112學年 第1學期 等格式
        const compact = text.replace(/\s+/g, '');
        const slashLike = compact.match(/^(\d{2,3})[/,-]([12])$/);
        if (slashLike) return `${slashLike[1]}/${slashLike[2]}`;

        const schoolYear = compact.match(/^(\d{2,3})學年.*?([12])學期$/);
        if (schoolYear) return `${schoolYear[1]}/${schoolYear[2]}`;

        const pureDigits = compact.match(/^(\d{2,3})([12])$/);
        if (pureDigits) return `${pureDigits[1]}/${pureDigits[2]}`;

        // 無法識別的格式，返回空字符串並記錄警告
        console.warn(`[GradesParser] ⚠️ 無法正規化學期值: "${text}"（原始值）`);
        return '';
    }

    static _getDataRows($, minCells = 8) {
        // 表頭行關鍵字，用於過濾掉 HTML 表頭行
        const headerKeywords = ['學年期', '科目碼', '序號', '課目代碼', '班次', '課號', '年級', '班級'];
        
        return $('#Table1 tr').filter((_, row) => {
            const $row = $(row);
            const cells = $row.find('td');
            const cellCount = cells.length;
            if (cellCount < minCells) return false;

            const text = $row.text().replace(/\s+/g, ' ').trim();
            if (!text) return false;
            
            // 排除包含「小計」的行
            if (text.includes('學分小計') || text.includes('小計')) return false;
            
            // 排除表頭行：檢查是否包含表頭關鍵字
            if (headerKeywords.some(kw => text.includes(kw))) return false;
            
            // 驗證第 2 格 (cells[1]) 必須包含數字（學期值特徵）
            const semesterCell = cells.length > 1 ? $(cells[1]).text().trim() : '';
            if (!/\d+/.test(semesterCell)) return false;

            return true;
        });
    }

    /**
     * 解析學期成績
     * @param {string} html 
     */
    static parseSemesterGrades(html) {
        try {
            const $ = cheerio.load(html);
            const result = {
                semesters: [],
                stats: { totalCredits: 0, passedCredits: 0, average: 0 },
                courses: [],
                semesterLabel: '',
                success: true
            };

            // 1. 提取學期下拉選單
            const ddl = $('#DropDownList2 option');
            ddl.each((_, opt) => {
                const $opt = $(opt);
                const item = {
                    value: $opt.val(),
                    text: $opt.text().trim(),
                    selected: $opt.prop('selected') || $opt.attr('selected') !== undefined
                };
                result.semesters.push(item);
                if (item.selected) {
                    result.semesterLabel = item.text;
                }
            });

            // 2. 提取統計資訊 (#lbl_CR_Hint)
            const hintText = $('#lbl_CR_Hint').text() || '';
            const totalMatch = hintText.match(/學分小計\s*[:：]\s*([\d.]+)/);
            const passedMatch = hintText.match(/已過學分\s*[:：]\s*([\d.]+)/);
            const avgMatch = hintText.match(/平均\s*[:：]\s*([\d.]+)/);
            
            if (totalMatch) result.stats.totalCredits = parseFloat(totalMatch[1]);
            if (passedMatch) result.stats.passedCredits = parseFloat(passedMatch[1]);
            if (avgMatch) result.stats.average = parseFloat(avgMatch[1]);

            // 3. 提取成績表格 (#Table1)
            const rows = GradesParser._getDataRows($, 8);
            rows.each((_, row) => {
                const cells = $(row).find('td');
                if (cells.length < 8) return;

                const scoreCell = $(cells[7]);
                const isWithdrawn = scoreCell.text().includes('停修') || 
                                    scoreCell.text().includes('Withdrawal');
                
                // 課名處理 (含 <br/>)
                const nameCell = $(cells[4]);
                let nameEn = '';
                const nameHtml = nameCell.html() || '';
                let nameZh;
                if (nameHtml.includes('<br')) {
                    const parts = nameHtml.split(/<br\s*\/?>/i);
                    nameZh = cheerio.load(parts[0]).text().trim();
                    nameEn = cheerio.load(parts[1] || '').text().trim();
                } else {
                    nameZh = nameCell.text().trim();
                }

                const rawScore = scoreCell.text().trim();

                result.courses.push({
                    yearSemester: GradesParser._normalizeYearSemester($(cells[1]).text().trim()),
                    courseCode: $(cells[2]).text().trim(),
                    classGroup: $(cells[3]).text().trim(),
                    courseName: nameZh,
                    courseNameEn: nameEn,
                    midterm: $(cells[5]).text().trim(),
                    credits: parseFloat($(cells[6]).text().trim()) || 0,
                    score: isWithdrawn ? '停修' : rawScore,
                    isWithdrawn
                });
            });

            return result;
        } catch (error) {
            console.error('[GradesParser] parseSemesterGrades error:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * 解析歷年成績
     * @param {string} html 
     */
    static parseHistoricalGrades(html) {
        try {
            const $ = cheerio.load(html);
            const result = {
                studentInfo: { system: '', department: '', studentId: '', name: '' },
                courses: [],
                summary: { totalCredits: 0, passedCredits: 0, overallAverage: 0 },
                success: true
            };

            // 1. 提取學生資訊
            const infoRows = $('#tab_std_data tr');
            if (infoRows.length >= 3) {
                const dataCells = $(infoRows[2]).find('td');
                if (dataCells.length >= 4) {
                    result.studentInfo = {
                        system: $(dataCells[0]).text().trim(),
                        department: $(dataCells[1]).text().trim(),
                        studentId: $(dataCells[2]).text().trim(),
                        name: $(dataCells[3]).text().trim()
                    };
                }
            }

            // 2. 提取歷年成績 (#Table1)
            const rows = GradesParser._getDataRows($, 9);
            
            // 用於統計
            let totalCredits = 0;
            let passedCredits = 0;
            let sumScoreTimesCredit = 0;
            let validCreditsForAvg = 0;

            rows.each((_, row) => {
                const $row = $(row);
                const cells = $row.find('td');
                
                // 跳過小計列
                if (cells.length === 2 && $row.text().includes('小計')) return;
                if (cells.length < 9) return;

                const term = GradesParser._normalizeYearSemester($(cells[1]).text().trim());
                const scoreCell = $(cells[8]);
                const isWithdrawn = scoreCell.text().includes('停修') || 
                                    scoreCell.text().includes('Withdrawal');

                let nameEn = '';
                const nameCell = $(cells[5]);
                const nameHtml = nameCell.html() || '';
                let nameZh;
                if (nameHtml.includes('<br')) {
                    const parts = nameHtml.split(/<br\s*\/?>/i);
                    nameZh = cheerio.load(parts[0]).text().trim();
                    nameEn = cheerio.load(parts[1] || '').text().trim();
                } else {
                    nameZh = nameCell.text().trim();
                }

                const rawScore = scoreCell.text().trim();
                const credits = parseFloat($(cells[7]).text().trim()) || 0;
                const courseType = $(cells[2]).text().trim();

                const courseObj = {
                    yearSemester: term,
                    courseType: courseType,
                    courseCode: $(cells[3]).text().trim(),
                    classGroup: $(cells[4]).text().trim(),
                    courseName: nameZh,
                    courseNameEn: nameEn,
                    midterm: $(cells[6]).text().trim(),
                    credits: credits,
                    score: isWithdrawn ? '停修' : rawScore,
                    isWithdrawn
                };

                result.courses.push(courseObj);

                // 計算統計
                if (!isWithdrawn && rawScore !== '') {
                    totalCredits += credits;
                    const scoreNum = parseFloat(rawScore);
                    if (!isNaN(scoreNum)) {
                        if (scoreNum >= 60) passedCredits += credits;
                        sumScoreTimesCredit += (scoreNum * credits);
                        validCreditsForAvg += credits;
                    } else if (rawScore.includes('及格') || rawScore.includes('抵免') || rawScore.includes('通過')) {
                        passedCredits += credits;
                    }
                }
            });

            result.summary = {
                totalCredits,
                passedCredits,
                overallAverage: validCreditsForAvg > 0 ? (sumScoreTimesCredit / validCreditsForAvg).toFixed(2) : 0
            };

            return result;
        } catch (error) {
            console.error('[GradesParser] parseHistoricalGrades error:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * 解析歷年排名
     * @param {string} html 
     */
    static parseRankingData(html) {
        try {
            const $ = cheerio.load(html);
            const result = {
                studentInfo: { system: '', department: '', studentId: '', name: '' },
                rankings: [],
                success: true
            };

            // 1. 提取學生資訊
            const infoRows = $('#tab_std_data tr');
            if (infoRows.length >= 3) {
                const dataCells = $(infoRows[2]).find('td');
                if (dataCells.length >= 4) {
                    result.studentInfo = {
                        system: $(dataCells[0]).text().trim(),
                        department: $(dataCells[1]).text().trim(),
                        studentId: $(dataCells[2]).text().trim(),
                        name: $(dataCells[3]).text().trim()
                    };
                }
            }

            // 2. 提取排名 (#Table1)
            const rows = $('#Table1 tr.hi_line, #Table1 tr.record2');
            rows.each((_, row) => {
                const cells = $(row).find('td');
                if (cells.length < 5) return;

                const parseFraction = (str) => {
                    const parts = (str || '').split('/');
                    return {
                        rank: parseInt(parts[0]) || 0,
                        total: parseInt(parts[1]) || 0
                    };
                };

                const classData = parseFraction($(cells[2]).text().trim());
                const deptData = parseFraction($(cells[3]).text().trim());

                result.rankings.push({
                    year: $(cells[0]).text().trim(),
                    semester: $(cells[1]).text().trim(),
                    classRankNum: classData.rank,
                    classTotalNum: classData.total,
                    deptRankNum: deptData.rank,
                    deptTotalNum: deptData.total,
                    average: parseFloat($(cells[4]).text().trim()) || 0
                });
            });

            return result;
        } catch (error) {
            console.error('[GradesParser] parseRankingData error:', error);
            return { success: false, message: error.message };
        }
    }
}

module.exports = GradesParser;
