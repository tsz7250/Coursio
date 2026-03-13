<template>
  <div ss-container id="section-Schedule" class="inner-section is-shown">
    <AppTopBar
      title="我的課表"
      :title-large="true"
      :is-logged-in="isLoggedIn"
      :sid="sid || ''"
      :show-user-menu="Store.showUserMenu"
      @update:show-user-menu="Store.showUserMenu = $event"
      @settings="goToSettings"
      @logout="logout"
    />

    <!-- Scroll Content -->
    <div class="scroll-content scroll-content-wide">
      <!-- Tool Row -->
      <div class="sched-tool-row">
        <div class="sched-tool-left">
          <span class="sched-semester-label">{{ semesterLabel }}</span>
          <span class="badge badge-primary">{{ creditCount }} 學分</span>
        </div>
        <div class="sched-tool-right">
          <button class="btn btn-outline" id="refresh-schedule" @click="handleRefresh">
            <i data-lucide="refresh-cw"></i> 重新載入
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div id="schedule-loading" class="schedule-loading" v-show="isScheduleLoading">
        <div class="loading-spinner"></div>
        <p>正在載入課表資料...</p>
      </div>

      <!-- Schedule Table -->
      <div id="schedule-content" v-show="showContent">
        <ScheduleTable :scheduleData="Store.courseScheduleData" />
      </div>

      <!-- Error -->
      <div id="schedule-error" class="schedule-error" v-show="showError">
        <div class="error-content">
          <i data-lucide="alert-circle" class="icon-state-danger"></i>
          <h4>無法載入課表資料</h4>
          <p class="error-message">課表資料載入失敗，請重新載入課表</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import ScheduleTable from '../components/ScheduleTable.vue';
import { Store } from '../store.js';
import AppTopBar from '@/components/layout/AppTopBar.vue';
import { refreshSchedule, generateScheduleTable } from '@/utils/schedule-helpers.js'; // M-03
import { useLogout } from '@/composables/useLogout.js'; // M-06

const router = useRouter();
function goToSettings() { router.push({ name: 'Settings' }); Store.showUserMenu = false; }
const { logout } = useLogout(); // M-06

// M-05: 將複合條件拆成具名 computed，提升可讀性
const isExplicitlyLoading = computed(() =>
  Store.scheduleViewState === 'loading' || Store.isRefreshingSchedule
);
const hasScheduleData = computed(() =>
  (Store.courseScheduleData?.course_list?.length ?? 0) > 0
);
const isScheduleLoading = computed(() =>
  isExplicitlyLoading.value ||
  (Store.isLoggedIn && !hasScheduleData.value && Store.scheduleViewState !== 'error')
);
const showContent = computed(() => Store.scheduleViewState === 'content');
const showError = computed(() => Store.scheduleViewState === 'error');
const isLoggedIn = computed(() => Store.isLoggedIn);
const sid = computed(() => Store.sid);

const semesterLabel = computed(() => {
  const label1 = Store.courseScheduleData?.label1 || '';
  // 從「114 學年第 2學期學分小計: 6」提取「114 學年度 第2學期」
  // label1 格式: "114 學年第 2學期學分小計: 6"
  if (label1.includes('學分小計')) {
    const semester = label1.split('學分小計')[0].trim();
    // 將「第 2」改為「第2」，並確保格式一致
    return semester.replace(/第\s*(\d)/g, '第$1');
  }
  return '課程資訊載入中...';
});

const creditCount = computed(() => {
  const label1 = Store.courseScheduleData?.label1 || '';
  // 從「114 學年第 2學期學分小計: 6」提取「6」
  const match = label1.match(/:\s*(\d+)/);
  return match ? match[1] : '0';
});

function handleRefresh() {
  refreshSchedule(); // M-03: 直接呼叫模組函式
}

function autoLoadSchedule() {
  if (Store.courseScheduleData &&
      Store.courseScheduleData.course_list &&
      Store.courseScheduleData.course_list.length > 0) {
    generateScheduleTable();
  } else if (Store.isBackgroundLoadingSchedule) {
    Store.scheduleViewState = 'loading';
  } else {
    const hasScheduleError = Store.courseScheduleData === null && !Store.isBackgroundLoadingSchedule;
    if (hasScheduleError && Store.isLoggedIn) {
      Store.scheduleViewState = 'error';
    } else if (Store.isLoggedIn) {
      if (!Store.isRefreshingSchedule) {
        refreshSchedule(); // M-03
      }
    }
  }
}

// 監聽課表資料就緒（背景載入完成後自動渲染）
const stopWatchScheduleData = watch(
  () => Store.courseScheduleData,
  (data) => {
    if (data?.course_list?.length > 0 && Store.scheduleViewState !== 'content') {
      nextTick(() => {
        generateScheduleTable(); // M-03
      });
    }
  }
);

// 監聽背景載入開始（若用戶已在課表頁，顯示 spinner）
// 也處理背景載入結束時的狀態評估
const stopWatchLoading = watch(
  () => Store.isBackgroundLoadingSchedule,
  (loading) => {
    if (loading && Store.scheduleViewState !== 'content') {
      Store.scheduleViewState = 'loading';
    } else if (!loading && Store.scheduleViewState === 'loading') {
      // 背景載入剛結束，重新評估課表狀態
      nextTick(() => autoLoadSchedule());
    }
  }
);

onMounted(() => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  // isScheduleLoading 現在是資料驅動，spinner 顯示不依賴時序
  // 直接用 nextTick 確保 Vue 完成首次渲染後再執行 autoLoadSchedule
  nextTick(() => {
    autoLoadSchedule();
  });
});

onUnmounted(() => {
  stopWatchScheduleData();
  stopWatchLoading();
});
</script>

<style scoped lang="scss">
// =============================================================================
// Schedule Page Styles
// =============================================================================

// 課表格子：固定欄寬與配置
.schedule-cell {
  width: 120px;
  height: 80px;
  padding: 4px;
  vertical-align: top;
  position: relative;
}

// 時間欄（第一欄）
.schedule-time-cell {
  background-color: #F8FFFE;
  font-weight: bold;
  white-space: pre-line;
  text-align: center;
}

// 課程格子
.schedule-course-cell {
  padding: 6px;

  &.has-course {
    white-space: pre-line;
    font-size: 16px;
    line-height: 1.2;
  }
}

.schedule-course-slot {
  padding: 8px;
  text-align: center;
  color: #94A3B8;
}

// 課程色塊 (Cyan gradient)
.course-item {
  background: linear-gradient(135deg, #0891B2 0%, #22D3EE 100%);
  color: white;
  border-radius: 6px;
  padding: 8px;
  margin: 2px;
  box-shadow: 0 2px 4px rgba(8, 145, 178, 0.2);
  transition: all 0.3s ease;
  cursor: pointer;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(8, 145, 178, 0.35);
  }

  div:first-child {
    font-weight: 600;
    font-size: 12px;
    line-height: 1.2;
    margin-bottom: 4px;
  }

  div:not(:first-child) {
    font-size: 10px;
    opacity: 0.9;
    line-height: 1.1;
  }
}

// 課表輔助資訊區塊
.schedule-info {
  background: #F8FFFE;
  border-radius: 8px;
  padding: 20px;
  margin-top: 30px;
  border: 1px solid #E2E8F0;

  h4 {
    margin: 0 0 15px 0;
    color: #164E63;
    font-size: 18px;
  }

  ul {
    margin: 0;
    padding-left: 20px;

    li {
      margin-bottom: 8px;
      color: #475569;
      line-height: 1.5;
      &:last-child { margin-bottom: 0; }
    }
  }
}

// Responsive
@media (max-width: 768px) {
  .schedule-cell {
    width: 100px;
    height: 70px;
  }

  .course-item {
    padding: 6px;
    div:first-child { font-size: 11px; }
    div:not(:first-child) { font-size: 9px; }
  }
}
</style>
