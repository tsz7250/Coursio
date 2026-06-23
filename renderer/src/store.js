// store.js — 全域共享狀態（Vue.reactive）
// 在不使用 Pinia/Vuex 的情況下，提供跨元件共享的響應式狀態

import { reactive } from 'vue';
import authState from './store/modules/auth.js';
import uiState from './store/modules/ui.js';
import courseState from './store/modules/course.js';
import gradesState from './store/modules/grades.js';
import taskState from './store/modules/task.js';

// ─── M-03: 共用工具（供所有 page 元件使用，避免重複定義） ──────────────────
/** 民國年（動態，當前學年） */
export const year_now = new Date().getFullYear() - 1911;
/** 當前學期（1=上學期, 2=下學期；以 7 月為分界） */
export const smtr_now = new Date().getMonth() >= 7 ? 1 : 2;

/**
 * 過濾學期清單，僅保留最近 5 年的上下學期。
 * @param {Array} semesterList - 完整學期清單
 * @returns {Array} 排序後的過濾結果
 */
export function filterSemesterListForTime(semesterList) {
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

export const Store = reactive({
    // 以分域模組組成全域狀態，保留既有扁平 key 以維持相容性
    ...authState,
    ...uiState,
    ...courseState,
    ...gradesState,
    ...taskState,
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
        }
    } catch { /* 忽略 */ }
};

Store.getCourseList = async function (year, semester) {
    try {
        const data = await window.electronAPI.backend.getCourseList(`${year}`, semester);
        if (data) {
            if (data.course_list) Store.courseList = data.course_list;
            if (data.dept_list && Array.isArray(data.dept_list)) Store.deptList = data.dept_list;
            if (data.semester_list && Array.isArray(data.semester_list)) {
                Store.semesterListForTime = filterSemesterListForTime(data.semester_list);
            }
        }
        return data;
    } catch (e) {
        console.error('getCourseList 失敗:', e);
        throw e;
    }
};
