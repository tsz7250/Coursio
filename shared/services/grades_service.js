/**
 * GradesService — 成績查詢專責服務
 *
 * 從 BackendService 中提取的 Puppeteer 成績查詢邏輯。
 * 包含：頁面導航、iframe 定位、學期/歷年/排名三種格式的資料提取。
 *
 * @param {object} backend - BackendService 實例
 */

const GradesParser = require('./parsers/grades_parser');

class GradesService {
    constructor(backend) {
        this.backend = backend;
    }

    async puppeteerNavigateToGrades(page) {
        try {
            console.log("📊 開始導航至成績查詢頁面...");

            const hasGoToURL = await page.evaluate(() => {
                return typeof GoToURL === 'function';
            }).catch(() => false);

            if (hasGoToURL) {
                console.log("✅ 找到 GoToURL 函式，直接呼叫 GoToURL('App_','S6')");

                const navigationPromise = new Promise((resolve) => {
                    let completed = false;

                    page.on('framenavigated', (frame) => {
                        if (!completed) {
                            const url = frame.url();
                            if (url.includes('portalfun') || url.includes('Score') || url.includes('STD_Score') || url.includes('FFB_Login')) {
                                completed = true;
                                console.log("✅ 偵測到成績頁面 iframe 導航:", url);
                                resolve();
                            }
                        }
                    });

                    page.on('response', async (response) => {
                        const url = response.url();
                        if (!completed && (url.includes('IFrameSub') || url.includes('FFB_Login') || url.includes('STD_Score'))) {
                            completed = true;
                            console.log("✅ 偵測到成績頁面 response:", url);
                            resolve();
                        }
                    });

                    setTimeout(() => {
                        if (!completed) {
                            completed = true;
                            console.log("⏰ 成績導航等待超時（15s），繼續...");
                            resolve();
                        }
                    }, 15000);
                });

                await page.evaluate(() => {
                    GoToURL('App_', 'S6');
                });

                await navigationPromise;
                await this.backend.waitForNetworkIdle(page, 400, 8000).catch(() => {});

                return { success: true };
            }

            console.log("⚠️ GoToURL 不存在，嘗試手動搜尋菜單...");

            const gradesMenuFound = await page.evaluate(() => {
                const elements = document.querySelectorAll('*[onclick*="S6"]');
                for (const el of elements) {
                    const onclick = el.getAttribute('onclick') || '';
                    if (onclick.includes("GoToURL") && onclick.includes("S6")) {
                        return { found: true, id: el.id, text: (el.textContent || '').trim(), onclick };
                    }
                }

                const tdElements = document.querySelectorAll('td[onclick]');
                for (const td of tdElements) {
                    const text = (td.textContent || td.innerText || '').trim();
                    const onclick = td.getAttribute('onclick') || '';
                    if ((text.includes('成績') || text.includes('學習檔案')) && onclick.includes('GoToURL')) {
                        return { found: true, id: td.id, text, onclick };
                    }
                }

                return { found: false };
            });

            if (gradesMenuFound.found) {
                console.log(`✅ 找到成績菜單: "${gradesMenuFound.text}" (onclick: ${gradesMenuFound.onclick})`);

                const navPromise = new Promise((resolve) => {
                    let completed = false;
                    page.on('framenavigated', (frame) => {
                        const url = frame.url();
                        if (!completed && (url.includes('portalfun') || url.includes('Score'))) {
                            completed = true;
                            resolve();
                        }
                    });
                    setTimeout(() => { if (!completed) { completed = true; resolve(); } }, 15000);
                });

                await page.evaluate((info) => {
                    const el = document.getElementById(info.id);
                    if (el) el.click();
                }, gradesMenuFound);

                await navPromise;
                await this.backend.waitForNetworkIdle(page, 400, 8000).catch(() => {});
                return { success: true };
            }

            console.log("⚠️ 未找到成績菜單，繼續嘗試在 iframe 中尋找...");
            return { success: true };

        } catch (error) {
            console.error("❌ 導航至成績頁面失敗:", error.message);
            return { success: false, message: error.message };
        }
    }

    async puppeteerExtractGradesFromIframe(page, queryType, semesterValue) {
        try {
            console.log(`🔍 在 iframe 中尋找成績資料 (${queryType})...`);

            const targetFrame = await this.backend._waitForTargetFrame(
                page,
                ['score', 'stdregi', 'year_score', 'year_order'],
                ['iframesub', 'iframeright', 'about:blank'],
                12000
            );

            if (targetFrame) {
                console.log(`✅ 找到成績 iframe: ${targetFrame.url()}`);
                await this.backend.waitForNetworkIdle(page, 400, 6000).catch(() => {});
                return await this._operateGradesFrame(page, targetFrame, queryType, semesterValue);
            }

            console.log("🔄 未找到成績 iframe，嘗試在主頁面操作...");
            return await this._operateGradesFrame(page, page.mainFrame(), queryType, semesterValue);

        } catch (error) {
            console.error("❌ 提取成績資料失敗:", error.message);
            return { success: false, message: error.message };
        }
    }

    async _operateGradesFrame(page, frame, queryType, semesterValue) {
        try {
            console.log(`📄 操作成績 frame (queryType: ${queryType})...`);
            const frameUrl = frame.url();
            console.log(`📍 Frame URL: ${frameUrl}`);

            const targetPages = {
                semester: 'My_stdregi_score.aspx',
                history:  'My_stdregi_year_score.aspx',
                ranking:  'My_stdregi_year_order.aspx'
            };

            const targetPage = targetPages[queryType];
            const isOnCorrectPage = frameUrl.toLowerCase().includes(targetPage.toLowerCase());

            if (!isOnCorrectPage) {
                console.log(`🔄 需要切換頁籤到 ${targetPage}`);

                const clicked = await frame.evaluate((pageName) => {
                    const links = document.querySelectorAll('a');
                    for (const link of links) {
                        const href = (link.href || link.getAttribute('href') || '').toLowerCase();
                        if (href.includes(pageName.toLowerCase())) {
                            link.click();
                            return true;
                        }
                    }
                    return false;
                }, targetPage);

                if (clicked) {
                    console.log('✅ 已點擊頁籤連結，等待 iframe URL 切換...');
                    const prevUrl = frame.url().toLowerCase();
                    const targetLower = targetPage.toLowerCase();
                    const deadline = Date.now() + 10000;
                    while (Date.now() < deadline) {
                        const cur = frame.url().toLowerCase();
                        if (cur !== prevUrl && cur.includes(targetLower)) {
                            console.log(`✅ iframe 已切換至: ${frame.url()}`);
                            break;
                        }
                        await new Promise(r => setTimeout(r, 100));
                    }
                    await frame.waitForSelector('#Table1', { timeout: 8000 }).catch(() => {});
                } else {
                    console.warn(`⚠️ 未找到 ${targetPage} 連結`);
                }
            }

            if (queryType === 'semester' && semesterValue) {
                console.log(`🔄 切換學期至 ${semesterValue}`);
                const postBackTriggered = await frame.evaluate((val) => {
                    const select = document.getElementById('DropDownList2');
                    if (select && select.value !== val) {
                        select.value = val;
                        if (typeof __doPostBack === 'function') {
                            __doPostBack('DropDownList2', '');
                            return true;
                        }
                    }
                    return false;
                }, semesterValue);

                if (postBackTriggered) {
                    await this.backend.waitForNetworkIdle(page, 400, 8000).catch(() => {});
                    await frame.waitForSelector('#Table1', { timeout: 5000 }).catch(() => {});
                }
            }

            if (queryType === 'semester') {
                return await this._extractSemesterGrades(frame);
            } else if (queryType === 'history') {
                return await this._extractHistoryGrades(frame);
            } else if (queryType === 'ranking') {
                return await this._extractRankingData(frame);
            }

            return { success: false, message: '未知的查詢類型' };
        } catch (error) {
            console.error(`❌ 操作成績頁面 frame 失敗 (${queryType}):`, error.message);
            return { success: false, message: error.message };
        }
    }

    async _extractSemesterGrades(frame) {
        try {
            await frame.waitForSelector('#Table1, #DropDownList2', { timeout: 10000 }).catch(() => {});
            const html = await frame.content();
            const result = GradesParser.parseSemesterGrades(html);
            return {
                success: result.success,
                data: result.success ? result : null,
                message: result.message
            };
        } catch (error) {
            console.error('提取學期成績發生錯誤:', error);
            return { success: false, message: `提取失敗: ${error.message}` };
        }
    }

    async _extractHistoryGrades(frame) {
        try {
            await frame.waitForSelector('#Table1, #tab_std_data', { timeout: 10000 }).catch(() => {});
            const html = await frame.content();
            const result = GradesParser.parseHistoricalGrades(html);
            return {
                success: result.success,
                data: result.success ? result : null,
                message: result.message
            };
        } catch (error) {
            console.error('提取歷年成績發生錯誤:', error);
            return { success: false, message: `提取失敗: ${error.message}` };
        }
    }

    async _extractRankingData(frame) {
        try {
            await frame.waitForSelector('#Table1, #tab_std_data', { timeout: 10000 }).catch(() => {});
            const html = await frame.content();
            const result = GradesParser.parseRankingData(html);
            return {
                success: result.success,
                data: result.success ? result : null,
                message: result.message
            };
        } catch (error) {
            console.error('提取排名資訊發生錯誤:', error);
            return { success: false, message: `提取失敗: ${error.message}` };
        }
    }

    async puppeteerGetGrades(page, type = 'semester', year, smtr) {
        try {
            console.log(`📊 成績查詢: type=${type}, year=${year}, smtr=${smtr}`);

            let alreadyOnGrades = false;
            const frames = page.frames();
            for (const frame of frames) {
                const frameUrl = frame.url().toLowerCase();
                if (frameUrl.includes('score') || frameUrl.includes('stdregi') || frameUrl.includes('year_score') || frameUrl.includes('year_order')) {
                    if (!frameUrl.includes('iframesub')) {
                        alreadyOnGrades = true;
                        break;
                    }
                }
            }

            if (!alreadyOnGrades) {
                const navResult = await this.puppeteerNavigateToGrades(page);
                if (!navResult.success) {
                    return { success: false, message: navResult.message || '無法導航至成績頁面' };
                }
                await this.backend.waitForNetworkIdle(page, 400, 8000).catch(() => {});
            } else {
                console.log("⚡ 已經在成績頁面，跳過首頁導航流程");
            }

            const semesterValue = (year && smtr) ? `${year}/${smtr}` : null;
            return await this.puppeteerExtractGradesFromIframe(page, type, semesterValue);

        } catch (error) {
            console.error("❌ 成績查詢失敗:", error.message);
            return { success: false, message: error.message };
        }
    }
}

module.exports = GradesService;
