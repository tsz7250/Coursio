import { ref, computed, watch } from 'vue';
import { Store } from '../store.js';

/**
 * 成績查詢業務邏輯 Composable
 * 抽離 GradesPage.vue 的 <script setup> 邏輯，包含：
 * - 所有響應式狀態
 * - 資料抓取、套用、推導
 * - 分頁切換與學期選擇
 * - 背景預載協調
 */
export function useGrades() {
    const isLoggedIn = computed(() => Store.isLoggedIn);
    const sid = computed(() => Store.sid);

    const activeTab = ref('semester');
    const isLoading = ref(false);
    const loadingText = ref('正在載入成績資料...');
    const errorMessage = ref('');
    const showError = ref(false);
    const isBackgroundLoading = ref(false);
    const pendingSemesterSwitch = ref(null);

    // 請求版本計數器：防止過期響應覆寫狀態
    const pendingRequestId = { semester: 0, history: 0, ranking: 0 };

    // Semester grades
    const selectedSemester = ref('');
    const selectedSemesterLabel = ref('選擇學期');
    const availableSemesters = ref([]);
    const semesterCourses = ref([]);
    const semesterStats = ref({ totalCredits: 0, passedCredits: 0, average: 0 });

    // History grades
    const historyCourses = ref([]);
    const historySummary = ref({ totalCredits: 0, passedCredits: 0, overallAverage: 0 });

    // Ranking
    const rankingRows = ref([]);
    const rankingStudentInfo = ref({ system: '', department: '', studentId: '', name: '' });

    const tabCornerClass = computed(() => {
        if (activeTab.value === 'semester') return 'corner-right';
        if (activeTab.value === 'history') return 'corner-left-right';
        return 'corner-all';
    });

    function normalizeSemesterValue(raw) {
        const text = String(raw || '').trim();
        if (!text) return '';
        const compact = text.replace(/\s+/g, '');
        const slashLike = compact.match(/(\d{2,3})\s*[/,-]\s*([12])/);
        if (slashLike) return `${slashLike[1]}/${slashLike[2]}`;
        const schoolYear = compact.match(/(\d{2,3})學年.*?([12])學期/);
        if (schoolYear) return `${schoolYear[1]}/${schoolYear[2]}`;
        const pureDigits = compact.match(/^(\d{2,3})([12])$/);
        if (pureDigits) return `${pureDigits[1]}/${pureDigits[2]}`;
        return text;
    }

    // ── 從歷年成績即時推導指定學期的課程列表與統計
    function _deriveSemesterFromHistory(semValue) {
        const normalized = normalizeSemesterValue(semValue);
        const courses = historyCourses.value.filter(c => normalizeSemesterValue(c.yearSemester) === normalized);

        const totalCredits = courses
            .filter(c => c.score !== '停修' && c.score !== 'Withdrawal')
            .reduce((sum, c) => sum + (parseInt(c.credits) || 0), 0);

        const passedCredits = courses
            .filter(c => parseFloat(c.score) >= 60)
            .reduce((sum, c) => sum + (parseInt(c.credits) || 0), 0);

        const scoredCourses = courses.filter(c => !isNaN(parseFloat(c.score)));
        const sumWeighted = scoredCourses.reduce((sum, c) => sum + parseFloat(c.score) * (parseInt(c.credits) || 0), 0);
        const sumCredits  = scoredCourses.reduce((sum, c) => sum + (parseInt(c.credits) || 0), 0);
        const average = sumCredits > 0 ? parseFloat((sumWeighted / sumCredits).toFixed(5)) : 0;

        semesterCourses.value = courses;
        semesterStats.value   = { totalCredits, passedCredits, average };
    }

    // ── 套用成績資料（不觸動 isLoading，供背景預載使用）
    function _applyGradesData(type, data) {
        if (type === 'semester') {
            semesterCourses.value = data.courses || [];
            semesterStats.value = data.stats || { totalCredits: 0, passedCredits: 0, average: 0 };
            if (data.semesters && data.semesters.length > 0) {
                availableSemesters.value = data.semesters.map((sem) => ({
                    ...sem,
                    value: normalizeSemesterValue(sem.value)
                }));
                if (!selectedSemester.value) {
                    selectedSemester.value = normalizeSemesterValue(data.semesters[0].value);
                    selectedSemesterLabel.value = data.semesters[0].text;
                }
            }
            if (data.semesterLabel) selectedSemesterLabel.value = data.semesterLabel;
            Store.gradesData.semester = data;

        } else if (type === 'history') {
            historyCourses.value = data.courses || [];
            historySummary.value = data.summary || { totalCredits: 0, passedCredits: 0, overallAverage: 0 };
            Store.gradesData.history = data;

            if (availableSemesters.value.length === 0 && historyCourses.value.length > 0) {
                const unique = [...new Set(historyCourses.value.map(c => normalizeSemesterValue(c.yearSemester)))]
                    .filter(v => v && v.length >= 2 && v.includes('/'))
                    .sort((a, b) => a.localeCompare(b));
                
                // 防守檢查：如果過濾後沒有有效的學期值，記錄警告
                if (unique.length === 0 && historyCourses.value.length > 0) {
                    const invalids = [...new Set(historyCourses.value.map(c => normalizeSemesterValue(c.yearSemester)))]
                        .filter(v => v && !v.includes('/'));
                    console.error('❌ [useGrades] 無法生成有效的學期列表。無效值：', invalids);
                }
                
                availableSemesters.value = unique.map(v => {
                    const parts = v.split('/');
                    const year = parts[0] || '';
                    const sem = parts[1] || '';
                    return { value: v, text: `${year}學年 第${sem}學期` };
                });
            }

            if (pendingSemesterSwitch.value) {
                const pending = pendingSemesterSwitch.value;
                pendingSemesterSwitch.value = null;
                selectedSemester.value      = pending.value;
                selectedSemesterLabel.value = pending.text;
                _deriveSemesterFromHistory(pending.value);
                isLoading.value = false;
            } else if (semesterCourses.value.length === 0 && availableSemesters.value.length > 0) {
                if (!selectedSemester.value) {
                    const oldest = availableSemesters.value[0];
                    selectedSemester.value      = oldest.value;
                    selectedSemesterLabel.value = oldest.text;
                }
                _deriveSemesterFromHistory(selectedSemester.value);
                isLoading.value = false;
            }

        } else if (type === 'ranking') {
            rankingRows.value = data.rankings || [];
            rankingStudentInfo.value = data.studentInfo || { system: '', department: '', studentId: '', name: '' };
            Store.gradesData.ranking = data;
        }
    }

    // ── 主資料抓取（含請求版本管理）
    async function fetchGrades(type) {
        if (!isLoggedIn.value) return;

        const myId = ++pendingRequestId[type];

        isLoading.value = true;
        showError.value = false;
        loadingText.value = type === 'semester' ? '正在載入學期成績...'
            : type === 'history' ? '正在載入歷年成績...'
            : '正在載入排名資料...';

        try {
            const result = await window.electronAPI.puppeteer.getGrades({
                type,
                year: selectedSemester.value ? normalizeSemesterValue(selectedSemester.value).split('/')[0] : undefined,
                smtr: selectedSemester.value ? normalizeSemesterValue(selectedSemester.value).split('/')[1] : undefined
            });

            if (pendingRequestId[type] !== myId) return;

            if (result.success && result.data) {
                _applyGradesData(type, result.data);
            } else {
                showError.value = true;
                errorMessage.value = result.message || '成績查詢失敗';
            }
        } catch (error) {
            if (pendingRequestId[type] !== myId) return;
            console.error('❌ 成績查詢錯誤:', error);
            showError.value = true;
            errorMessage.value = error.message || '發生未知錯誤';
        } finally {
            if (pendingRequestId[type] === myId) isLoading.value = false;
        }
    }

    // ── 背景靜默預載排名資料
    async function _preloadBackgroundTabs() {
        if (!isLoggedIn.value || rankingRows.value.length > 0) return;

        if (Store.gradesData.ranking) {
            _applyGradesData('ranking', Store.gradesData.ranking);
        } else if (Store.isLoadingGradesHistory) {
            const stopWatch = watch(() => Store.gradesData.ranking, (data) => {
                if (data) { stopWatch(); _applyGradesData('ranking', data); }
            }, { immediate: true });
        } else {
            if (isBackgroundLoading.value) return;
            isBackgroundLoading.value = true;
            try {
                const rankId = ++pendingRequestId.ranking;
                const r = await window.electronAPI.puppeteer.getGrades({ type: 'ranking' });
                if (r.success && r.data && pendingRequestId.ranking === rankId) {
                    _applyGradesData('ranking', r.data);
                }
            } catch (e) {
                console.warn('⚠️ 背景預載排名失敗:', e.message);
            } finally {
                isBackgroundLoading.value = false;
            }
        }
    }

    // ── 分頁切換
    function switchTab(tab) {
        activeTab.value = tab;

        if (tab === 'semester' && semesterCourses.value.length === 0 && isLoggedIn.value) {
            if (historyCourses.value.length > 0) {
                const target = selectedSemester.value || availableSemesters.value[0]?.value;
                if (target) _deriveSemesterFromHistory(target);
            } else {
                fetchGrades('history');
            }
        } else if (tab === 'history' && historyCourses.value.length === 0 && isLoggedIn.value) {
            fetchGrades('history');
        } else if (tab === 'ranking' && rankingRows.value.length === 0 && isLoggedIn.value) {
            if (Store.gradesData.ranking) {
                _applyGradesData('ranking', Store.gradesData.ranking);
            } else if (Store.isLoadingGradesHistory) {
                const stopWatch = watch(() => Store.gradesData.ranking, (data) => {
                    if (data) { stopWatch(); _applyGradesData('ranking', data); isLoading.value = false; }
                }, { immediate: true });
                if (!Store.gradesData.ranking) {
                    isLoading.value = true;
                    loadingText.value = '正在載入排名資料...';
                }
            } else {
                fetchGrades('ranking');
            }
        }
    }

    // ── 重試當前分頁
    function fetchCurrentTab() {
        showError.value = false;
        if (activeTab.value === 'semester') fetchGrades('history');
        else fetchGrades(activeTab.value);
    }

    // ── 學期選擇
    function selectSemester(sem) {
        if (historyCourses.value.length > 0) {
            selectedSemester.value      = sem.value;
            selectedSemesterLabel.value = sem.text;
            _deriveSemesterFromHistory(sem.value);
        } else {
            pendingSemesterSwitch.value = sem;
            isLoading.value   = true;
            showError.value   = false;
            loadingText.value = '資料讀取中，請稍候...';
        }
    }

    return {
        // state
        isLoggedIn, sid,
        activeTab, isLoading, loadingText, errorMessage, showError,
        selectedSemester, selectedSemesterLabel, availableSemesters,
        semesterCourses, semesterStats,
        historyCourses, historySummary,
        rankingRows, rankingStudentInfo,
        tabCornerClass,
        // actions
        switchTab, selectSemester, fetchCurrentTab,
        fetchGrades, _applyGradesData, _preloadBackgroundTabs,
    };
}
