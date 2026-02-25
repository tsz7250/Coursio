<template>
  <div ss-container id="section-Schedule" class="inner-section is-shown">
    <!-- Top Bar -->
    <div class="top-bar">
      <span class="top-bar-title top-bar-title-lg">我的課表</span>
      <div class="top-bar-right">
        <i data-lucide="bell" style="width:20px;height:20px;color:var(--color-text-secondary);cursor:pointer;"></i>
        <div class="user-chip" v-if="isLoggedIn" @click.stop="Store.showUserMenu = !Store.showUserMenu">
          <i data-lucide="user"></i>
          <span>{{ sid || '' }}</span>
          <div class="user-menu" v-show="Store.showUserMenu">
            <div class="user-menu-item" @click.stop="goToSettings">
              <i data-lucide="settings" style="width:14px;height:14px;"></i> 設定帳號
            </div>
            <div class="user-menu-item user-menu-item-danger" @click.stop="logout">
              <i data-lucide="log-out" style="width:14px;height:14px;"></i> 登出
            </div>
          </div>
        </div>
      </div>
    </div>

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
        <div class="schedule-table-container">
          <table class="schedule-table">
            <thead>
              <tr>
                <th class="sched-time-col">時間</th>
                <th>週一</th>
                <th>週二</th>
                <th>週三</th>
                <th>週四</th>
                <th>週五</th>
                <th>週六</th>
                <th>週日</th>
              </tr>
            </thead>
            <tbody id="schedule-tbody">
            </tbody>
          </table>
        </div>
      </div>

      <!-- Error -->
      <div id="schedule-error" class="schedule-error" v-show="showError">
        <div class="error-content">
          <i data-lucide="alert-circle" style="width:48px;height:48px;color:var(--color-danger);margin-bottom:12px;"></i>
          <h4>無法載入課表資料</h4>
          <p class="error-message">課表資料載入失敗，請重新載入課表</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Store } from '../store.esm.js';

const router = useRouter();
function goToSettings() { router.push({ name: 'Settings' }); Store.showUserMenu = false; }
function logout() {
  Store.isLoggedIn = false;
  Store.sid = '';
  Store.courseScheduleData = null;
  Store.showUserMenu = false;
  router.push({ name: 'Main' });
}

const isScheduleLoading = computed(() => Store.scheduleViewState === 'loading');
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
  if (typeof window.refreshSchedule === 'function') {
    window.refreshSchedule();
  } else {
    console.warn('refreshSchedule 尚未定義');
  }
}

function autoLoadSchedule() {
  if (Store.courseScheduleData &&
      Store.courseScheduleData.course_list &&
      Store.courseScheduleData.course_list.length > 0) {
    window.generateScheduleTable();
  } else if (Store.isBackgroundLoadingSchedule) {
    Store.scheduleViewState = 'loading';
  } else {
    const hasScheduleError = Store.courseScheduleData === null && !Store.isBackgroundLoadingSchedule;
    if (hasScheduleError && Store.isLoggedIn) {
      Store.scheduleViewState = 'error';
    } else if (Store.isLoggedIn) {
      if (!Store.isRefreshingSchedule) {
        window.refreshSchedule();
      }
    }
  }
}

onMounted(() => {
  nextTick(() => {
    autoLoadSchedule();
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
});
</script>
