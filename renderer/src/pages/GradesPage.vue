<template>
    <div ss-container id="section-Grades" class="inner-section is-shown">
        <!-- Top Bar -->
        <div class="top-bar">
            <span class="top-bar-title">成績查詢</span>
            <div class="top-bar-right">
                <i data-lucide="bell" class="icon-topbar-bell"></i>
                <div class="user-chip" v-if="isLoggedIn">
                    <i data-lucide="user"></i>
                    <span>{{ sid || '' }}</span>
                </div>
            </div>
        </div>

        <!-- Scroll Content -->
        <div class="scroll-content">
            <!-- Tabs -->
            <div class="grades-tabs">
                <div class="grades-tab" :class="{ active: activeTab === 'semester' }" @click="switchTab('semester')">
                    <span>學期成績查詢</span>
                </div>
                <div class="grades-tab" :class="{ active: activeTab === 'history' }" @click="switchTab('history')">
                    <span>歷年成績查詢</span>
                </div>
                <div class="grades-tab" :class="{ active: activeTab === 'ranking' }" @click="switchTab('ranking')">
                    <span>歷年學期排名查詢</span>
                </div>
            </div>

            <!-- Content Panel -->
            <div class="grades-content-panel" :class="tabCornerClass">

                <!-- Loading -->
                <div class="grades-loading" v-if="isLoading">
                    <div class="loading-spinner"></div>
                    <p>{{ loadingText }}</p>
                </div>

                <!-- Error -->
                <div class="grades-error" v-if="showError && !isLoading">
                    <div class="error-content">
                        <i data-lucide="alert-circle" class="icon-state-danger"></i>
                        <h4>無法載入成績資料</h4>
                        <p class="error-message">{{ errorMessage }}</p>
                        <button class="btn btn-outline u-mt-12" @click="fetchCurrentTab">
                            <i data-lucide="refresh-cw"></i> 重新載入
                        </button>
                    </div>
                </div>

                <!-- Not Logged In -->
                <div class="grades-error" v-if="!isLoggedIn && !isLoading">
                    <div class="error-content">
                        <i data-lucide="lock" class="icon-state-muted"></i>
                        <h4>請先登入</h4>
                        <p class="error-message">成績查詢需要登入後才能使用</p>
                    </div>
                </div>

                <!-- ========== 學期成績 ========== -->
                <template v-if="activeTab === 'semester' && !isLoading && !showError && isLoggedIn">
                    <SemesterGradesTable
                        :courses="semesterCourses"
                        :stats="semesterStats"
                        :availableSemesters="availableSemesters"
                        :selectedSemester="selectedSemester"
                        :selectedSemesterLabel="selectedSemesterLabel"
                        @select-semester="selectSemester"
                    />
                </template>

                <!-- ========== 歷年成績 ========== -->
                <template v-if="activeTab === 'history' && !isLoading && !showError && isLoggedIn">
                    <HistoryGradesTable
                        :courses="historyCourses"
                        :summary="historySummary"
                    />
                </template>

                <!-- ========== 歷年排名 ========== -->
                <template v-if="activeTab === 'ranking' && !isLoading && !showError && isLoggedIn">
                    <RankingGradesTable
                        :rows="rankingRows"
                        :studentInfo="rankingStudentInfo"
                    />
                </template>
            </div>
        </div>
    </div>
</template>

<script setup>
import { onMounted, onActivated, nextTick, watch } from 'vue';
import { Store } from '../store.js';

import SemesterGradesTable from '@/components/grades/SemesterGradesTable.vue';
import HistoryGradesTable from '@/components/grades/HistoryGradesTable.vue';
import RankingGradesTable from '@/components/grades/RankingGradesTable.vue';
import { useGrades } from '@/composables/useGrades.js';

const {
    isLoggedIn, sid,
    activeTab, isLoading, loadingText, errorMessage, showError,
    selectedSemester, selectedSemesterLabel, availableSemesters,
    semesterCourses, semesterStats,
    historyCourses, historySummary,
    rankingRows, rankingStudentInfo,
    tabCornerClass,
    switchTab, selectSemester, fetchCurrentTab,
    fetchGrades, _applyGradesData, _preloadBackgroundTabs,
} = useGrades();

onMounted(() => {
    nextTick(() => {
        if (isLoggedIn.value) {
            if (Store.gradesData.history) {
                _applyGradesData('history', Store.gradesData.history);
                if (Store.gradesData.ranking) _applyGradesData('ranking', Store.gradesData.ranking);
                _preloadBackgroundTabs();
            } else if (Store.isLoadingGradesHistory) {
                isLoading.value = true;
                loadingText.value = '正在載入成績資料...';
                const stopWatch = watch(() => Store.gradesData.history, (data) => {
                    if (data) {
                        stopWatch();
                        _applyGradesData('history', data);
                        isLoading.value = false;
                        _preloadBackgroundTabs();
                    }
                });
            } else {
                fetchGrades('history').then(() => { _preloadBackgroundTabs(); });
            }
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
});

onActivated(() => {
    nextTick(() => {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
});
</script>

<style scoped lang="scss">
// Grades Page Styles (UI.pen 08/08b/08c)
// =============================================================================

// Tabs
.grades-tabs {
    display: flex;
    gap: 6px;
    padding: 0;
    margin-bottom: 0;
}

.grades-tab {
    padding: 10px 18px;
    border-radius: 10px 10px 0 0;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    color: var(--color-text-secondary);
    background: transparent;
    transition: all 0.2s ease;
    border: 1px solid transparent;
    border-bottom: none;
    white-space: nowrap;

    &:hover {
        background: var(--color-bg-card);
        color: var(--color-text-primary);
    }

    &.active {
        background: var(--color-bg-card);
        color: var(--color-primary);
        border-color: var(--color-border);
        border-bottom: none;
        position: relative;
        z-index: 2;

        &::after {
            content: '';
            position: absolute;
            bottom: -1px;
            left: 0;
            right: 0;
            height: 2px;
            background: var(--color-bg-card);
        }
    }
}

// Content Panel
.grades-content-panel {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 20px 24px;
    min-height: 400px;
    position: relative;

    &.corner-right {
        border-radius: 0 12px 12px 12px;
    }
    &.corner-left-right {
        border-radius: 12px 12px 12px 12px;
    }
    &.corner-all {
        border-radius: 12px 12px 12px 12px;
    }
}

// Loading & Error States
.grades-loading,
.grades-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    text-align: center;

    .loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--color-border);
        border-top-color: var(--color-primary);
        border-radius: 50%;
        animation: gradeSpin 0.8s linear infinite;
    }

    p {
        margin-top: 16px;
        color: var(--color-text-secondary);
        font-size: 14px;
    }
}

.error-content {
    display: flex;
    flex-direction: column;
    align-items: center;

    h4 {
        font-size: 18px;
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0 0 8px;
    }

    .error-message {
        color: var(--color-text-muted);
        font-size: 14px;
    }
}

@keyframes gradeSpin {
    to { transform: rotate(360deg); }
}

// Info Row
.grades-info-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
}

.grades-stat {
    font-size: 14px;
    color: var(--color-text-secondary);
    padding: 6px 12px;
    background: var(--color-bg-page);
    border-radius: 8px;
    white-space: nowrap;
}

// Dropdown
.semester-dropdown {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--color-bg-page);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
    transition: border-color 0.2s;

    &:hover { border-color: var(--color-primary); }
    .dropdown-txt { font-size: 14px; color: var(--color-text-primary); font-weight: 500; }
}

.semester-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 200px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    z-index: 50;
    max-height: 200px;
    overflow-y: auto;
}

.semester-dropdown-item {
    padding: 8px 12px;
    font-size: 13px;
    cursor: pointer;
    color: var(--color-text-primary);
    transition: background 0.15s;

    &:hover { background: var(--color-bg-page); }
    &.selected { color: var(--color-primary); font-weight: 600; }
    &:first-child { border-radius: 8px 8px 0 0; }
    &:last-child { border-radius: 0 0 8px 8px; }
}

// Summary Row
.grades-summary-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;

    .summary-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--color-text-primary);
    }
}

// Table
.grades-table-wrapper {
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--color-border);
}

.grades-table {
    width: 100%;
    display: table;
    border-collapse: collapse;
}

.grades-header-row {
    display: flex;
    background: var(--color-primary);
    color: white;

    .grades-cell {
        font-weight: 600;
        font-size: 13px;
        padding: 10px 8px;
    }
}

.grades-data-row {
    display: flex;
    border-bottom: 1px solid var(--color-border);
    transition: background 0.15s;

    &:last-child { border-bottom: none; }
    &.row-odd { background: var(--color-bg-card); }
    &.row-even { background: var(--color-bg-page); }
    &:hover { background: rgba(var(--color-primary-rgb, 0, 122, 255), 0.05); }
}

.grades-cell {
    padding: 10px 8px;
    font-size: 13px;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;

    &.gc-no { flex: 0 0 40px; white-space: nowrap; }
    &.gc-year { flex: 0 0 70px; white-space: nowrap; }
    &.gc-type { flex: 0 0 110px; white-space: nowrap; }
    &.gc-code { flex: 0 0 90px; font-family: monospace; white-space: nowrap; }
    &.gc-class { flex: 0 0 50px; white-space: nowrap; }
    &.gc-name { flex: 1; justify-content: flex-start; text-align: left; }
    &.gc-mid { flex: 0 0 70px; white-space: nowrap; }
    &.gc-credit { flex: 0 0 55px; white-space: nowrap; }
    &.gc-score { flex: 0 0 65px; font-weight: 600; white-space: nowrap; }
    &.gc-fill { flex: 1; }
    &.flex-2 { flex: 2; }
}

.gc-name-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block !important;
}

.score-highlight { color: var(--color-primary-dark, var(--color-primary)); }
.score-warning { color: var(--color-warning, #e67e22); }
.score-error { color: var(--color-danger, #e74c3c); }
.code-error { color: var(--color-danger, #e74c3c); }

// Student Info
.grades-student-info {
    background: var(--color-bg-page);
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 16px;
    border: 1px solid var(--color-border);

    .student-info-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--color-text-primary);
        margin-bottom: 12px;
    }

    .student-info-row {
        display: flex;
        gap: 24px;
        flex-wrap: wrap;
        
        &.horizontal-info {
            align-items: center;
            .info-label { font-size: 13px; color: var(--color-text-muted); }
            .info-value { font-size: 14px; font-weight: 500; color: var(--color-text-primary); }
            .ml-4 { margin-left: 16px; }
        }
    }
}

.rank-percent { font-size: 12px; color: var(--color-text-secondary); margin-left: 4px; }

// Notes
.grades-notes {
    margin-top: 16px;
    padding: 12px 16px;
    background: var(--color-bg-page);
    border-radius: 8px;
    border: 1px solid var(--color-border);

    .notes-title {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-primary);
        margin-bottom: 8px;
    }

    p { font-size: 12px; color: var(--color-text-secondary); margin: 4px 0; line-height: 1.6; }
}

.grades-footer-note {
    display: block;
    margin-top: 12px;
    font-size: 12px;
    color: var(--color-text-muted);
    font-style: italic;
}

.grades-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    p { color: var(--color-text-muted); font-size: 14px; }
}
</style>
