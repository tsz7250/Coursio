<template>
  <div class="section">
    <!-- Loading Panel -->
    <div v-show="isLoading" id="loading-panel" class="section">
      <div class="loading-spinner"></div>
      <h3>{{ loading_text }}</h3>
    </div>

    <!-- Login Panel -->
    <div class="login-panel section">
      <!-- 左側：漸層 Hero Panel -->
      <div class="hero-panel">
        <div class="hero-content">
          <div class="hero-logo">
            <img class="hero-logo-icon" src="./assets/icon.png" alt="Coursio">
            <span class="hero-logo-text">Coursio</span>
          </div>
          <div class="hero-headline">
            <h1>半夜依舊在電腦前守著?</h1>
            <p class="hero-desc">黑眼圈熬出來也不一定搶得到課R?<br>專屬於元智人的搶課程式幫助妳/你！</p>
          </div>
          <div class="hero-features">
            <div class="hero-feature-item">
              <i data-lucide="shield-check"></i>
              <span>不記錄帳號密碼，程式碼完全公開</span>
            </div>
            <div class="hero-feature-item">
              <i data-lucide="cpu"></i>
              <span>不對電腦造成額外負擔</span>
            </div>
            <div class="hero-feature-item">
              <i data-lucide="zap"></i>
              <span>全自動搶課，快速精準</span>
            </div>
          </div>
        </div>
        <div class="hero-footer">
          <a target="_blank" href="https://github.com/tsz7250/Coursio">
            <i data-lucide="github"></i>
          </a>
        </div>
      </div>
      <!-- 右側：白色登入卡片 -->
      <div class="login-panel-right">
        <div class="login-card">
          <div class="login-card-header">
            <h2>登入</h2>
            <p>使用元智大學學號登入</p>
          </div>
          <div class="login-input-group">
            <input v-model="sid" class="login-input" placeholder="學號" type="text"
              id="student_id" pattern="s[0-9]{7}" required @keydown.enter="login">
            <input v-model="spwd" class="login-input" placeholder="密碼" type="password"
              id="student_pwd" required @keydown.enter="login">
            <label class="remember-me-label">
              <input type="checkbox" v-model="rememberMe" id="remember_me">
              <span>記住帳密</span>
            </label>
            <button @click="login" class="login-btn-primary" id="login-btn">開始搶課！</button>
            <button @click="browseAsGuest" class="login-btn-secondary" id="guest-btn">訪客瀏覽課程</button>
          </div>
        </div>
      </div>
    </div><!-- End of Login Panel -->

    <!-- Content Panel -->
    <div class="content-panel section">
      <div class="sidebar">
        <div class="sidebar-header header">
          <img class="sidebar-logo-img" src="./assets/icon.png" alt="Coursio">
          <span class="sidebar-brand">Coursio</span>
        </div>

        <div class="sidebar-funcitonal-items point-it">
          <div @click="navigateTo('Main')" id="Main-sidebar-item" class="sidebar-item">
            <i data-lucide="house"></i>
            <span>首頁</span>
          </div>
          <div @click="navigateTo('Schedule')" id="Schedule-sidebar-item" class="sidebar-item point-it"
            :class="!isLoggedIn ? 'guest-disabled' : ''">
            <i data-lucide="calendar"></i>
            <span>我的課表</span>
          </div>
          <div @click="navigateTo('CourseQuery')" id="School-timetable-Query-sidebar-item"
            class="sidebar-item point-it">
            <i data-lucide="search"></i>
            <span>課程查詢</span>
          </div>
          <div @click="navigateTo('AutoSelection')" id="Auto-Selection-sidebar-item" class="sidebar-item point-it"
            :class="!isLoggedIn ? 'guest-disabled' : ''">
            <i data-lucide="bot"></i>
            <span>自動選課</span>
          </div>
          <div @click="navigateTo('Settings')" id="Settings-sidebar-item" class="sidebar-item point-it"
            :class="!isLoggedIn ? 'guest-disabled' : ''">
            <i data-lucide="settings"></i>
            <span>設定</span>
          </div>
        </div>

        <div id="About-sidebar-item" class="sidebar-item point-it" @click="navigateTo('About')">
          <i data-lucide="info"></i>
          <span>關於</span>
        </div>
      </div> <!-- End of Sidebar -->

      <div id="inner-content-panel">
        <router-view></router-view>
      </div>
    </div> <!-- End of Content Panel -->
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Store, year_now, filterSemesterListForTime } from './js/store.esm.js';

const router = useRouter();

// ── 設定檔預設值 ──
let settings = { interval: 2, stage: '1' };

// ── 登入資料 ──
const sid = ref('');
const spwd = ref('');
const rememberMe = ref(false);

// ── 從 Store 讀取 UI 狀態 ──
const isLoggedIn = computed({
  get: () => Store.isLoggedIn,
  set: (v) => { Store.isLoggedIn = v; },
});
const isLoading = computed({
  get: () => Store.isLoading,
  set: (v) => { Store.isLoading = v; },
});
const loading_text = computed({
  get: () => Store.loadingText,
  set: (v) => { Store.loadingText = v; },
});

// ── 課程資料狀態 ──
let isCourseListLoading = false;

// ── 輔助函式 ──
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToastError(message, title = '登入失敗') {
  const html = `<span class="toast-error-content">
    <i class="fas fa-exclamation-circle toast-error-icon"></i>
    <strong class="toast-error-title">${escapeHtml(title)}</strong>
    <span class="toast-error-message">${escapeHtml(message)}</span>
  </span>`;
  if (typeof M !== 'undefined' && M?.toast) {
    M.toast({ html, displayLength: 4000, classes: 'red darken-2 rounded login-error-toast' });
  } else {
    alert(`${title}：${message}`);
  }
}

// ── 課程資料載入（登入 / 訪客流程共用） ──
function getCourseListForQuery(options = {}) {
  const { showLoading = true, returnPromise = false, storeInWindow = false } = options;
  if (showLoading && isCourseListLoading) return returnPromise ? Promise.resolve() : undefined;
  if (showLoading) {
    isCourseListLoading = true;
    Store.isCourseDataLoading = true;
  }

  const year = year_now;
  const semester = new Date().getMonth() >= 7 ? '1' : '2';

  const promise = window.electronAPI.backend.getCourseList(`${year}`, semester).then((data) => {
    if (storeInWindow) {
      window.allCourseList = data.course_list;
    } else {
      Store.courseList = data.course_list;
    }
    if (data.dept_list && Array.isArray(data.dept_list)) Store.deptList = data.dept_list;
    if (data.semester_list && Array.isArray(data.semester_list)) {
      Store.semesterListForTime = filterSemesterListForTime(data.semester_list);
    }
    if (showLoading) {
      isCourseListLoading = false;
      Store.isCourseDataLoading = false;
    }
  }).catch((error) => {
    if (showLoading) {
      isCourseListLoading = false;
      Store.isCourseDataLoading = false;
    }
    if (storeInWindow) {
      console.error('全校課程資料載入失敗:', error);
      window.allCourseList = [];
    } else {
      console.error('課程資料載入失敗:', error);
    }
  });

  return returnPromise ? promise : undefined;
}

function getCourseListSilent() {
  if (isCourseListLoading || Store.courseList.length > 0) return;
  isCourseListLoading = true;
  Store.isCourseDataLoading = true;

  const year = year_now;
  const semester = new Date().getMonth() >= 7 ? '1' : '2';

  window.electronAPI.backend.getCourseList(`${year}`, semester).then((data) => {
    Store.courseList = data.course_list;
    if (data.dept_list && Array.isArray(data.dept_list)) Store.deptList = data.dept_list;
    if (data.semester_list && Array.isArray(data.semester_list)) {
      Store.semesterListForTime = filterSemesterListForTime(data.semester_list);
    }
    isCourseListLoading = false;
    Store.isCourseDataLoading = false;
  }).catch((error) => {
    isCourseListLoading = false;
    Store.isCourseDataLoading = false;
    console.error('靜默載入課程資料失敗:', error);
  });
}

function loadInitialCourseOptions() {
  if (isCourseListLoading || (Store.deptList.length > 0 && Store.semesterListForTime.length > 0)) return;
  isCourseListLoading = true;

  const year = year_now;
  const semester = new Date().getMonth() >= 7 ? '1' : '2';

  window.electronAPI.backend.getCourseList(`${year}`, semester).then((data) => {
    if (data.dept_list && Array.isArray(data.dept_list)) Store.deptList = data.dept_list;
    if (data.semester_list && Array.isArray(data.semester_list)) {
      Store.semesterListForTime = filterSemesterListForTime(data.semester_list);
    }
    isCourseListLoading = false;
  }).catch((error) => {
    isCourseListLoading = false;
    console.error('系所和學期選項載入失敗:', error);
  });
}

// ── 登入 ──
async function login() {
  if (isLoading.value) return;

  if (!sid.value || !spwd.value) {
    alert('請輸入學號和密碼');
    return;
  }

  loading_text.value = '正在驗證帳號密碼...';
  isLoading.value = true;

  const loadingPanel = document.getElementById('loading-panel');
  if (loadingPanel) {
    loadingPanel.style.cssText = `
      position: fixed !important; top: 0 !important; left: 0 !important;
      width: 100% !important; height: 100% !important; z-index: 2000 !important;
      background: #ffffff !important; display: flex !important;
      flex-direction: column !important; align-items: center !important;
      justify-content: center !important; transition: opacity 0.3s ease-in-out !important;
    `;
  }

  let cleanupProgress = null;
  try {
    cleanupProgress = window.electronAPI.puppeteer.onProgress((step) => {
      loading_text.value = step;
    });
  } catch (_) {}

  try {
    await window.electronAPI.backend.setSidSpwd(sid.value, spwd.value);

    loading_text.value = '驗證帳密中...';
    const loginResult = await window.electronAPI.puppeteer.login(sid.value, spwd.value);
    if (!loginResult?.success) throw new Error(loginResult?.message || '登入失敗');

    loading_text.value = '登入成功，正在載入資料...';
    isLoggedIn.value = true;
    Store.sid = sid.value;
    Store.spwd = spwd.value;

    // 記住帳密处理
    try {
      if (rememberMe.value) {
        await window.electronAPI.config.writeAccounts({
          account: sid.value, password: spwd.value, rememberMe: true
        });
      } else {
        await window.electronAPI.config.writeAccounts({
          account: '', password: '', rememberMe: false
        });
      }
    } catch (_) {}

    // 切換面板動畫
    const loginPanel = document.querySelector('.login-panel');
    const contentPanel = document.querySelector('.content-panel');

    contentPanel.style.display = 'flex';
    contentPanel.style.opacity = '0';
    contentPanel.style.transition = 'opacity 0.3s ease-in-out';
    loginPanel.classList.add('slide-up');

    setTimeout(() => {
      contentPanel.style.opacity = '1';
      router.push({ name: 'Main' });
    }, 400);

    setTimeout(() => {
      loginPanel.style.display = 'none';
      loginPanel.classList.remove('slide-up');
      contentPanel.style.transition = '';
    }, 800);

    // 隱藏載入面板
    if (loadingPanel) {
      isLoading.value = false;
      loading_text.value = '';
      loadingPanel.style.cssText = '';
    }

    // 背景載入課表 & 課程資料
    window.isBackgroundLoadingSchedule = true;

    Promise.allSettled([
      (async () => {
        const scheduleResult = await window.electronAPI.puppeteer.getSchedule();
        if (scheduleResult?.success && scheduleResult.data) {
          window.courseScheduleData = scheduleResult.data;
        } else {
          window.courseScheduleData = null;
          throw new Error(scheduleResult?.message || '課表載入失敗');
        }
      })(),
      getCourseListForQuery({ showLoading: false, returnPromise: true, storeInWindow: true }),
    ]).then(() => {
      window.isBackgroundLoadingSchedule = false;
    }).catch(() => {
      window.isBackgroundLoadingSchedule = false;
    });
  } catch (error) {
    console.error('登入失敗:', error);
    if (loadingPanel) {
      isLoading.value = false;
      loading_text.value = '';
      loadingPanel.style.cssText = '';
    }
    showToastError(error.message || String(error));
  } finally {
    if (cleanupProgress) { try { cleanupProgress(); } catch (_) {} }
  }
}

// ── 訪客瀏覽 ──
function browseAsGuest() {
  isLoggedIn.value = false;

  const loginPanel = document.querySelector('.login-panel');
  const contentPanel = document.querySelector('.content-panel');

  contentPanel.style.display = 'flex';
  contentPanel.style.opacity = '0';
  contentPanel.style.transition = 'opacity 0.3s ease-in-out';
  loginPanel.classList.add('slide-up');

  setTimeout(() => {
    contentPanel.style.opacity = '1';
    router.push({ name: 'CourseQuery' });
  }, 400);

  setTimeout(() => {
    loginPanel.style.display = 'none';
    loginPanel.classList.remove('slide-up');
    contentPanel.style.transition = '';
  }, 800);

  if (Store.courseList.length === 0 && !isCourseListLoading) getCourseListSilent();
  if (!window.allCourseList || window.allCourseList.length === 0) {
    getCourseListForQuery({ showLoading: false, returnPromise: true, storeInWindow: true });
  }
}

// ── 返回登入頁面 ──
function returnToLogin() {
  isLoggedIn.value = false;

  const loginPanel = document.querySelector('.login-panel');
  const contentPanel = document.querySelector('.content-panel');

  contentPanel.style.transition = 'opacity 0.3s ease-in-out';
  contentPanel.style.opacity = '0';

  setTimeout(() => {
    contentPanel.style.display = 'none';
    contentPanel.style.transition = '';
    loginPanel.style.display = 'flex';
    loginPanel.classList.remove('slide-up');
  }, 300);
}

// ── 導航 ──
function navigateTo(name) {
  router.push({ name });
}

// ── 生命週期 ──
onMounted(async () => {
  window.customConfirm = (message, title) => {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'custom-confirm-overlay';
      overlay.innerHTML = `
        <div class="custom-confirm-dialog">
          <div class="custom-confirm-title">${title || '確認操作'}</div>
          <div class="custom-confirm-message">${message}</div>
          <div class="custom-confirm-actions">
            <button class="btn btn-outline custom-confirm-cancel">取消</button>
            <button class="btn btn-danger custom-confirm-ok">確定</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('.custom-confirm-ok').addEventListener('click', () => {
        document.body.removeChild(overlay); resolve(true);
      });
      overlay.querySelector('.custom-confirm-cancel').addEventListener('click', () => {
        document.body.removeChild(overlay); resolve(false);
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { document.body.removeChild(overlay); resolve(false); }
      });
    });
  };

  // 覆寫 alert/confirm 攔截登入失敗
  try {
    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    function maybeDispatchLoginFailed(message, source) {
      const text = String(message || '');
      if (text.includes('Login Failed') || text.includes('登入失敗')) {
        window.dispatchEvent(new CustomEvent('yzu:login-failed', { detail: { message: text, source } }));
      }
    }
    window.alert = function () {
      try { maybeDispatchLoginFailed(arguments[0], 'alert'); } catch (_) {}
      return originalAlert.apply(window, arguments);
    };
    window.confirm = function () {
      try { maybeDispatchLoginFailed(arguments[0], 'confirm'); } catch (_) {}
      return originalConfirm.apply(window, arguments);
    };
  } catch (_) {}

  // 監聽登入失敗事件
  window.addEventListener('yzu:login-failed', (ev) => {
    try {
      const loadingPanel = document.getElementById('loading-panel');
      if (loadingPanel) {
        isLoading.value = false;
        loading_text.value = '';
        loadingPanel.style.cssText = '';
      }
      showToastError(ev?.detail?.message || '登入失敗');
    } catch (_) {}
  });

  // 讀取設定
  window.electronAPI.settings.read().then((s) => {
    if (s) {
      settings = s;
      Store.settings = s;
      Store.stealCourseInterval = s.interval ?? 2;
      Store.stealCourseStage = s.stage ?? '1';
    }
  }).catch(() => {});

  // 讀取已儲存的帳密（記住帳密）
  try {
    const saved = await window.electronAPI.config.readAccounts();
    if (saved && saved.rememberMe && saved.account) {
      sid.value = saved.account;
      spwd.value = saved.password || '';
      rememberMe.value = true;
    }
  } catch (_) {}

  // DB 輪詢
  if (!window._dbPollingInterval) {
    window._dbPollingInterval = setInterval(async () => {
      try {
        const allTasks = await window.electronAPI.db.getAllTasks();
        Store.tasks = allTasks || [];
      } catch (error) {
        console.error('輪詢任務列表失敗:', error);
      }
    }, 5000);
  }

  // Materialize init
  nextTick(() => {
    if (typeof M !== 'undefined' && M?.Modal) {
      const elems = document.querySelectorAll('.modal:not(#about-modal)');
      M.Modal.init(elems, {});
    }
  });

  // 全域攔截需登入功能
  document.addEventListener('click', (e) => {
    const restricted = e.target?.closest('[data-requires-auth="true"]');
    if (restricted && !isLoggedIn.value) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof M !== 'undefined' && M?.toast) {
        M.toast({ html: '需登入才能使用此功能', displayLength: 4000, classes: 'auth-toast' });
      } else {
        alert('需登入才能使用此功能');
      }
      return false;
    }
  }, true);

  // 載入系所/學期選項
  loadInitialCourseOptions();
  // 渲染 sidebar Lucide 圖示
  nextTick(() => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });});
</script>
