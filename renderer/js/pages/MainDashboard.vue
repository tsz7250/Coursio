<template>
  <div id="section-Main" class="inner-section is-shown">
    <!-- Top Bar -->
    <div class="top-bar">
      <span class="top-bar-title">首頁</span>
      <div class="top-bar-right">
        <i data-lucide="bell" style="width:20px;height:20px;color:var(--color-text-secondary);cursor:pointer;"></i>
        <div class="user-chip" v-if="isLoggedIn" @click.stop="Store.showUserMenu = !Store.showUserMenu">
          <i data-lucide="user"></i>
          <span>{{ displayName }}</span>
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
    <div class="scroll-content">
      <!-- Greeting Card -->
      <div class="greeting-card">
        <div class="greeting-text">
          <h3>嗨, {{ displayName }}！今天想要選點什麼學分？</h3>
          <p>{{ semesterInfo }}</p>
        </div>
        <button class="btn btn-primary" @click="goToSchedule" v-if="isLoggedIn">
          <i data-lucide="calendar"></i> 查看課表
        </button>
      </div>

      <!-- Quick Actions -->
      <h4 class="section-title">快速操作</h4>
      <div class="quick-actions">
        <div class="qa-card" @click="goToQuery">
          <i data-lucide="search" class="qa-icon qa-icon-primary"></i>
          <span class="qa-title">課程查詢</span>
          <span class="qa-desc">搜尋所有課程資訊</span>
        </div>
        <div class="qa-card" @click="goToSchedule" :class="{ 'qa-disabled': !isLoggedIn }">
          <i data-lucide="calendar" class="qa-icon qa-icon-success"></i>
          <span class="qa-title">我的課表</span>
          <span class="qa-desc">查看個人時間表</span>
        </div>
        <div class="qa-card" @click="goToBot" :class="{ 'qa-disabled': !isLoggedIn }">
          <i data-lucide="bot" class="qa-icon qa-icon-info"></i>
          <span class="qa-title">自動選課</span>
          <span class="qa-desc">設定自動搶課排程</span>
        </div>
        <div class="qa-card" @click="goToSettings" :class="{ 'qa-disabled': !isLoggedIn }">
          <i data-lucide="settings" class="qa-icon qa-icon-warning"></i>
          <span class="qa-title">設定</span>
          <span class="qa-desc">管理應用程式偏好</span>
        </div>
      </div>

      <!-- Recent Courses -->
      <h4 class="section-title" v-if="recentCourses.length > 0">已選課程</h4>
      <div class="recent-courses" v-if="recentCourses.length > 0">
        <div class="rc-card" v-for="(course, idx) in recentCourses" :key="idx">
          <div class="rc-top" :style="{ backgroundColor: courseColors[idx % courseColors.length] }"></div>
          <div class="rc-body">
            <span class="rc-name">{{ course.name }}</span>
            <span class="rc-detail">{{ course.teacher_name || '未知教師' }} · {{ course.timeDisplay || '' }}</span>
            <span class="badge badge-success" v-if="course.credit">{{ course.credit }} 學分</span>
          </div>
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

const displayName = computed(() =>
  Store.isLoggedIn && Store.sid ? Store.sid : '訪客'
);
const isLoggedIn = computed(() => Store.isLoggedIn);
const semesterInfo = computed(() => {
  // 直接使用 Puppeteer 擷取的 label1（例如「114 學年第 2學期學分小計: 6」）
  return Store.courseScheduleData?.label1 || '課程資訊載入中...';
});
const TIME_SLOTS = [
  '08:10-09:00', '09:10-10:00', '10:10-11:00', '11:10-12:00',
  '12:10-13:00', '13:10-14:00', '14:10-15:00', '15:10-16:00',
  '16:10-17:00', '17:10-18:00', '18:30-19:20', '19:25-20:15',
  '20:20-21:10'
];
const recentCourses = computed(() => {
  const courses = Store.courseScheduleData?.course_list || [];
  const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const groups = new Map();
  courses.forEach(c => {
    const key = (c.course_id && c.course_id !== 'UNKNOWN') ? c.course_id : c.name;
    if (!groups.has(key)) groups.set(key, { ...c, _periods: [] });
    const entry = groups.get(key);
    if (c.day && c.period) entry._periods.push({ day: Number(c.day), period: Number(c.period) });
  });
  return Array.from(groups.values()).slice(0, 3).map(c => {
    let timeDisplay = '';
    if (c._periods.length > 0) {
      const byDay = {};
      c._periods.forEach(p => {
        (byDay[p.day] = byDay[p.day] || []).push(p.period);
      });
      timeDisplay = Object.entries(byDay)
        .sort(([a], [b]) => a - b)
        .map(([d, ps]) => {
          const sorted = ps.sort((a, b) => a - b);
          const startTime = TIME_SLOTS[sorted[0] - 1]?.split('-')[0] || '';
          const endTime   = TIME_SLOTS[sorted[sorted.length - 1] - 1]?.split('-')[1] || '';
          return `${dayNames[d] || ''} ${startTime}-${endTime}`;
        })
        .join('、');
    } else if (c.time) {
      timeDisplay = c.time;
    }
    return { ...c, timeDisplay };
  });
});
const courseColors = ['#0891B2', '#6366F1', '#F59E0B', '#22C55E', '#EF4444'];

function logout() {
  Store.isLoggedIn = false;
  Store.sid = '';
  Store.courseScheduleData = null;
  Store.showUserMenu = false;
}

function goToSchedule() { if (Store.isLoggedIn) router.push({ name: 'Schedule' }); }
function goToQuery() { router.push({ name: 'CourseQuery' }); }
function goToBot() { if (Store.isLoggedIn) router.push({ name: 'AutoSelection' }); }
function goToSettings() { if (Store.isLoggedIn) router.push({ name: 'Settings' }); }

onMounted(() => {
  nextTick(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); });
});
</script>
