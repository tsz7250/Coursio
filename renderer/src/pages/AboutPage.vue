<template>
  <div ss-container id="section-About" class="inner-section is-shown">
    <AppTopBar
      title="關於"
      :is-logged-in="Store.isLoggedIn"
      :sid="Store.sid || ''"
      :show-user-menu="Store.showUserMenu"
      @update:show-user-menu="Store.showUserMenu = $event"
      @settings="goToSettings"
      @logout="logout"
    />

    <!-- Scroll Content -->
    <div class="scroll-content scroll-content-tight">

      <!-- Brand Card -->
      <div class="about-brand-card">
        <div class="about-brand-logo">
          <img src="@/assets/icon.png" alt="Coursio" class="about-app-logo">
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
              <i data-lucide="search" class="icon-22 icon-clr-primary"></i>
            </div>
            <h4 class="about-feature-title">課程查詢</h4>
          </div>
          <p class="about-feature-desc">多條件搜尋課程，依課名、教師、系所、時間查找</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-header">
            <div class="about-icon-box about-icon-box-primary">
              <i data-lucide="calendar" class="icon-22 icon-clr-primary"></i>
            </div>
            <h4 class="about-feature-title">課表管理</h4>
          </div>
          <p class="about-feature-desc">視覺化課表檢視，自動偵測衝堂與時間衝突</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-header">
            <div class="about-icon-box about-icon-box-warning">
              <i data-lucide="bot" class="icon-22 icon-clr-warning"></i>
            </div>
            <h4 class="about-feature-title">自動選課</h4>
          </div>
          <p class="about-feature-desc">AI 驗證碼識別，自動搶課機器人</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-header">
            <div class="about-icon-box about-icon-box-success">
              <i data-lucide="shield-check" class="icon-22 icon-clr-success"></i>
            </div>
            <h4 class="about-feature-title">安全儲存</h4>
          </div>
          <p class="about-feature-desc">帳號密碼加密存放，確保資料安全</p>
        </div>
        <div class="about-feature-card">
          <div class="about-feature-header">
            <div class="about-icon-box about-icon-box-info">
              <i data-lucide="award" class="icon-22 icon-clr-info"></i>
            </div>
            <h4 class="about-feature-title">成績查詢</h4>
          </div>
          <p class="about-feature-desc">快速查詢歷年與各學期的成績與排名</p>
        </div>
      </div>

      <!-- Developer Card -->
      <div class="about-dev-card">
        <div class="about-dev-header">
          <i data-lucide="code" class="icon-22 icon-clr-primary"></i>
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
              <span class="about-dev-value">GPLv3 License</span>
            </div>
          </div>
          <div class="about-dev-col">
            <div class="about-dev-item">
              <span class="about-dev-label">Electron</span>
              <span class="about-dev-value">v{{ versions?.electron || '40.6.1' }}</span>
            </div>
            <div class="about-dev-item">
              <span class="about-dev-label">Node.js</span>
              <span class="about-dev-value">v{{ versions?.node || '22.14.0' }}</span>
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
          <i data-lucide="github" class="icon-20 icon-clr-primary-text"></i>
          <span>GitHub Repository</span>
          <i data-lucide="external-link" class="icon-14 icon-clr-muted"></i>
        </a>
        <a class="about-link-btn"
           href="https://github.com/tsz7250/Coursio/issues"
           target="_blank">
          <i data-lucide="bug" class="icon-20 icon-clr-primary-text"></i>
          <span>回報問題</span>
          <i data-lucide="external-link" class="icon-14 icon-clr-muted"></i>
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
import { onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Store } from '../store.js';
import { useLogout } from '@/composables/useLogout.js'; // M-06
import AppTopBar from '@/components/layout/AppTopBar.vue';

const router = useRouter();
function goToSettings() { router.push({ name: 'Settings' }); Store.showUserMenu = false; }
const { logout } = useLogout(); // M-06

const versions = window.electronAPI?.versions;
const version = '1.0.0';

onMounted(() => {
  nextTick(() => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
});
</script>

<style scoped lang="scss">
// About Page Scoped Styles
// -----------------------------------------------------------------------------

.inner-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  flex: 1 1 0%;
}

.scroll-content {
  flex: 1 1 0%;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// Brand Card
.about-brand-card {
  background: white;
  border-radius: 16px;
  padding: 32px;
  text-align: center;
  border: 1px solid #f1f5f9;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  margin-bottom: 8px;

  .about-brand-logo {
    display: inline-flex;
    padding: 12px;
    background: #ecfeff;
    border-radius: 20px;
    margin-bottom: 16px;
  }

  .about-brand-name {
    font-family: 'Poppins', sans-serif;
    font-size: 24px;
    font-weight: 700;
    color: #164e63;
    margin: 0 0 4px;
  }

  .about-brand-subtitle {
    color: #64748b;
    font-size: 14px;
    margin: 0 0 16px;
  }

  .about-version-badge {
    display: inline-flex;
    padding: 4px 12px;
    background: #f1f5f9;
    border-radius: 99px;
    font-size: 12px;
    font-weight: 600;
    color: #475569;
  }
}

// Feature Grid
.about-feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.about-feature-card {
  background: white;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  padding: 20px;
  transition: all 0.2s ease;

  &:hover {
    border-color: #0891b2;
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(8, 145, 178, 0.08);
  }

  .about-feature-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    text-align: left; // 強制左對齊
  }

  .about-icon-box {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &.about-icon-box-primary { background: #ecfeff; }
    &.about-icon-box-warning { background: #fef3c7; }
    &.about-icon-box-success { background: #dcfce7; }
    &.about-icon-box-info    { background: #eef2ff; }
  }

  .about-feature-title {
    font-family: 'Poppins', sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: #164e63;
    margin: 0;
  }

  .about-feature-desc {
    color: #64748b;
    font-size: 13px;
    line-height: 1.6;
    margin: 0;
    text-align: left; // 強制左對齊
  }
}

// Dev Card
.about-dev-card {
  background: white;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  padding: 24px;
  margin-top: 8px;

  .about-dev-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid #f1f5f9;

    .about-dev-title {
      font-family: 'Poppins', sans-serif;
      font-size: 15px;
      font-weight: 600;
      color: #164e63;
    }
  }

  .about-dev-info-row {
    display: flex;
    gap: 40px;
    flex-wrap: wrap;
  }

  .about-dev-col {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .about-dev-item {
    display: flex;
    justify-content: space-between;
    font-size: 13px;

    .about-dev-label {
      color: #94a3b8;
    }

    .about-dev-value {
      color: #475569;
      font-weight: 600;
    }
  }
}

// Links
.about-links-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.about-link-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  text-decoration: none;
  transition: all 0.2s;

  span {
    color: #164e63;
    font-size: 13px;
    font-weight: 600;
    flex: 1;
    margin-left: 12px;
    text-align: left;
  }

  &:hover {
    border-color: #0891b2;
    background: #f8ffff;
  }
}

.about-footer {
  text-align: center;
  margin-top: 24px;
  padding-bottom: 12px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
}
</style>
