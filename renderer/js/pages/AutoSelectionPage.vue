<template>
  <div ss-container id="section-Auto-Selection" class="inner-section is-shown">
    <!-- Top Bar -->
    <div class="top-bar">
      <span class="top-bar-title">自動選課機器人</span>
      <div class="top-bar-right">
        <i data-lucide="bell" style="width:20px;height:20px;color:var(--color-text-secondary);cursor:pointer;"></i>
        <div class="user-chip" v-if="Store.isLoggedIn" @click.stop="Store.showUserMenu = !Store.showUserMenu">
          <i data-lucide="user"></i>
          <span>{{ Store.sid || '' }}</span>
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
    <div class="scroll-content scroll-content-compact">
      <div id="auto-selection-inner-container">
        <!-- 內容將由 loadContent 載入 -->
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Store } from '../store.esm.js';
import courseSelectionHtml from '../../sections/course_selection.html?raw';

const router = useRouter();
function goToSettings() { router.push({ name: 'Settings' }); Store.showUserMenu = false; }
function logout() {
  Store.isLoggedIn = false;
  Store.sid = '';
  Store.courseScheduleData = null;
  Store.showUserMenu = false;
  router.push({ name: 'Main' });
}

const contentLoaded = ref(false);

async function loadContent() {
  const container = document.getElementById('auto-selection-inner-container');
  if (!container || contentLoaded.value) return;

  try {
    container.innerHTML = courseSelectionHtml;
    contentLoaded.value = true;

    // 初始化控制器
    if (typeof CourseSelectionController !== 'undefined') {
      window.courseSelectionController = new CourseSelectionController();
    }

    // 若已登入，自動帶入帳號密碼
    if (Store.isLoggedIn && Store.sid) {
      await nextTick();
      const accountInput = document.getElementById('portalAccount');
      const passwordInput = document.getElementById('portalPassword');
      const hintEl = document.getElementById('accountSetHint');
      if (accountInput && passwordInput) {
        accountInput.value = Store.sid;
        if (Store.spwd) {
          passwordInput.value = Store.spwd;
          // 自動儲存帳號設定
          if (window.courseSelectionController &&
              typeof window.courseSelectionController.saveAccount === 'function') {
            await window.courseSelectionController.saveAccount();
          }
        }
        if (hintEl) hintEl.textContent = '已從登入帳號帶入';
      }
    }
    // 渲染 Lucide 圖示
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (error) {
    console.error('載入自動選課介面失敗:', error);
    container.innerHTML = `
      <div class="bot-card" style="text-align:center;padding:48px;">
        <i data-lucide="alert-circle" style="width:48px;height:48px;color:var(--color-danger);margin-bottom:12px;"></i>
        <h4 class="bot-card-title">載入失敗</h4>
        <p style="color:var(--color-text-muted);">無法載入自動選課介面。錯誤: ${error.message}</p>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function checkEnvironment() {
  try {
    if (window.courseSelectionController &&
        typeof window.courseSelectionController.checkEnvironment === 'function') {
      if (!window.courseSelectionController.isInitialized) {
        window.courseSelectionController.checkEnvironment();
      }
    }
  } catch (e) {
    console.warn('自動選課環境檢查失敗:', e);
  }
}

onMounted(() => {
  nextTick(async () => {
    await loadContent();
    checkEnvironment();
  });
});
</script>
