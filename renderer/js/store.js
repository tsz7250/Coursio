// store.js — 全域共享狀態（Vue.reactive）
// 在不使用 Pinia/Vuex 的情況下，提供跨元件共享的響應式狀態

// ─── M-03: 共用工具（供所有 page 元件使用，避免重複定義） ──────────────────
/** 民國年（動態，當前學年） */
const year_now = new Date().getFullYear() - 1911;
/** 當前學期（1=上學期, 2=下學期；以 7 月為分界） */
const smtr_now = new Date().getMonth() >= 7 ? 1 : 2;

/**
 * 過濾學期清單，僅保留最近 5 年的上下學期。
 * @param {Array} semesterList - 完整學期清單
 * @returns {Array} 排序後的過濾結果
 */
function filterSemesterListForTime(semesterList) {
    if (!Array.isArray(semesterList)) return [];
    const currentYear = year_now;
    const minYear = currentYear - 4;
    return semesterList.filter(semester => {
        const value = semester.value;
        if (!value || typeof value !== 'string') return false;
        const yearMatch = value.match(/^(\d+),/);
        if (!yearMatch) return false;
        const year = parseInt(yearMatch[1]);
        const semesterNum = value.split(',')[1]?.trim();
        return (semesterNum === '1' || semesterNum === '2') && year >= minYear && year <= currentYear;
    }).sort((a, b) => {
        const yearA = parseInt(a.value.split(',')[0]);
        const yearB = parseInt(b.value.split(',')[0]);
        const semesterA = parseInt(a.value.split(',')[1]);
        const semesterB = parseInt(b.value.split(',')[1]);
        if (yearA !== yearB) return yearB - yearA;
        return semesterB - semesterA;
    });
}

const Store = Vue.reactive({
    // ── 認證狀態 ──
    isLoggedIn: false,
    sid: '',
    spwd: '',

    // ── 全域 UI 狀態 ──
    isLoading: false,
    loadingText: '',

    // ── 課程資料快取 ──
    courseScheduleData: null,     // 個人課表資料
    allCourseList: [],            // 全校課程清單（查詢用）
    courseList: [],               // 當前顯示用課程清單
    isCourseListLoading: false,   // 課程資料載入中
    isCourseDataLoading: false,   // UI 載入指示器

    // ── 查詢用下拉選項 ──
    deptList: [],                 // 系所清單
    semesterListForTime: [],      // 學期清單（時間查詢用）

    // ── 設定 ──
    settings: { interval: 2, stage: '1' },
    stealCourseInterval: 2,
    stealCourseStage: '1',

    // ── 任務列表 ──
    tasks: [],

    // ── 查詢結果 ──
    queryResultForList: [],
    modalCourse: {},

    // ── 背景載入標記 ──
    isBackgroundLoadingSchedule: false,
    isRefreshingSchedule: false,

    // ── 課表 UI 狀態 ──
    scheduleViewState: 'idle',  // 'idle' | 'loading' | 'content' | 'error'
});

// 設定檔讀寫輔助
Store.saveSettings = function () {
    window.electronAPI.settings.write(Store.settings);
};

Store.loadSettings = async function () {
    try {
        const s = await window.electronAPI.settings.read();
        if (s) {
            Store.settings = s;
            Store.stealCourseInterval = s.interval || 2;
            Store.stealCourseStage = s.stage || '1';
        }
    } catch (_) { }
};

// 便利 getter，保持向後相容
Object.defineProperty(window, 'courseScheduleData', {
    get() { return Store.courseScheduleData; },
    set(v) { Store.courseScheduleData = v; },
    configurable: true,
});

// C-04: 不將密碼暴露於 window，僅保留 sid 供向後相容
// 設定憑證請透過 Store.sid / Store.spwd 直接存取
Object.defineProperty(window, 'storedCredentials', {
    get() { return { account: Store.sid, sid: Store.sid }; }, // 密碼不暴露於 window
    set(v) {
        if (v) { Store.sid = v.account || v.sid || ''; Store.spwd = v.password || v.spwd || ''; }
    },
    configurable: true,
});

Object.defineProperty(window, 'allCourseList', {
    get() { return Store.allCourseList; },
    set(v) { Store.allCourseList = v || []; },
    configurable: true,
});

Object.defineProperty(window, 'isBackgroundLoadingSchedule', {
    get() { return Store.isBackgroundLoadingSchedule; },
    set(v) { Store.isBackgroundLoadingSchedule = v; },
    configurable: true,
});

Object.defineProperty(window, 'isRefreshingSchedule', {
    get() { return Store.isRefreshingSchedule; },
    set(v) { Store.isRefreshingSchedule = v; },
    configurable: true,
});
