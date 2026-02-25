<template>
  <div ss-container id="section-About" class="inner-section is-shown">
    <!-- Top Bar -->
    <div class="top-bar">
      <span class="top-bar-title">關於</span>
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
    <div class="scroll-content scroll-content-tight">

      <!-- Brand Card -->
      <div class="about-brand-card">
        <div class="about-brand-logo">
          <img src="../../assets/icon.png" alt="Coursio" style="width: 48px; height: 48px; border-radius: 12px;">
        </div>
        <h2 class="about-brand-name">Coursio</h2>
        <p class="about-brand-subtitle">元智大學智慧選課系統</p>
        <div class="about-version-badge">v{{ version }}</div>
      </div>

      <!-- Feature Grid Title -->
      <h3 class="section-title">主要功能</h3>

      <!-- Feature Grid -->
      <div class="about-feature-grid">
        <div class="about-feature-card">
          <div class="about-feature-header">
            <div class="about-icon-box about-icon-box-primary">
              <i data-lucide="search" style="width:22px;height:22px;color:var(--color-primary);"></i>
            </div>
            <h4 class="about-feature-title">課程查詢</h4>
          </div>
          <p class="about-feature-desc">多條件搜尋課程，依課名、教師、系所、時間查找</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-header">
            <div class="about-icon-box about-icon-box-primary">
              <i data-lucide="calendar" style="width:22px;height:22px;color:var(--color-primary);"></i>
            </div>
            <h4 class="about-feature-title">課表管理</h4>
          </div>
          <p class="about-feature-desc">視覺化課表檢視，自動偵測衝堂與時間衝突</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-header">
            <div class="about-icon-box about-icon-box-warning">
              <i data-lucide="bot" style="width:22px;height:22px;color:var(--color-warning);"></i>
            </div>
            <h4 class="about-feature-title">自動選課</h4>
          </div>
          <p class="about-feature-desc">AI 驗證碼識別，自動搶課機器人</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-header">
            <div class="about-icon-box about-icon-box-success">
              <i data-lucide="shield-check" style="width:22px;height:22px;color:var(--color-success);"></i>
            </div>
            <h4 class="about-feature-title">安全儲存</h4>
          </div>
          <p class="about-feature-desc">帳號密碼加密存放，確保資料安全</p>
        </div>
      </div>

      <!-- Developer Card -->
      <div class="about-dev-card">
        <div class="about-dev-header">
          <i data-lucide="code" style="width:22px;height:22px;color:var(--color-primary);"></i>
          <span class="about-dev-title">開發資訊</span>
        </div>
        <div class="about-dev-info-row">
          <div class="about-dev-col">
            <div class="about-dev-item">
              <span class="about-dev-label">技術棧</span>
              <span class="about-dev-value">Electron + Vue.js + Python</span>
            </div>
            <div class="about-dev-item">
              <span class="about-dev-label">版本</span>
              <span class="about-dev-value">{{ version }}</span>
            </div>
            <div class="about-dev-item">
              <span class="about-dev-label">授權</span>
              <span class="about-dev-value">MIT License</span>
            </div>
          </div>
          <div class="about-dev-col">
            <div class="about-dev-item">
              <span class="about-dev-label">Electron</span>
              <span class="about-dev-value">v28.0.0</span>
            </div>
            <div class="about-dev-item">
              <span class="about-dev-label">Node.js</span>
              <span class="about-dev-value">v20.11.0</span>
            </div>
            <div class="about-dev-item">
              <span class="about-dev-label">Python</span>
              <span class="about-dev-value">v3.12.0</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Links Row -->
      <div class="about-links-row">
        <a class="about-link-btn"
           href="https://github.com/tsz7250/Coursio"
           target="_blank">
          <i data-lucide="github" style="width:20px;height:20px;color:var(--color-text-primary);"></i>
          <span>GitHub Repository</span>
          <i data-lucide="external-link" style="width:14px;height:14px;color:var(--color-text-muted);"></i>
        </a>
        <a class="about-link-btn"
           href="https://github.com/tsz7250/Coursio/issues"
           target="_blank">
          <i data-lucide="bug" style="width:20px;height:20px;color:var(--color-text-primary);"></i>
          <span>回報問題</span>
          <i data-lucide="external-link" style="width:14px;height:14px;color:var(--color-text-muted);"></i>
        </a>
      </div>

      <!-- Footer -->
      <div class="about-footer">
        <span>Made with ❤ for YZU Students</span>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';
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

const version = '1.0.0';

onMounted(() => {
  nextTick(() => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
});
</script>
