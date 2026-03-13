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
          <div @click="navigateTo('Grades')" id="Grades-sidebar-item" class="sidebar-item point-it"
            :class="!isLoggedIn ? 'guest-disabled' : ''">
            <i data-lucide="bar-chart-2"></i>
            <span>成績查詢</span>
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
import { useRouter } from 'vue-router';
import { useAppShell } from './composables/useAppShell.js';

const router = useRouter();
const {
  sid,
  spwd,
  rememberMe,
  isLoggedIn,
  isLoading,
  loading_text,
  login,
  browseAsGuest,
  navigateTo
} = useAppShell(router);
</script>

<style scoped lang="scss">
// =============================================================================
// App Core Layout & Login Page Styles
// =============================================================================

// Layout Wrapper
.content-panel {
    background: var(--color-bg-page);
    display: none;
    flex-direction: row;
    height: 100vh;
    width: 100vw;
    overflow: hidden;

    &.is-visible {
        display: flex;
    }
}

#inner-content-panel {
    width: 100%;
    height: 100%;
    flex: 1;
    overflow-x: hidden;
    overflow-y: auto;
    position: relative;
}

.inner-section {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    overflow-y: auto;
    visibility: hidden;
    opacity: 0;

    &.is-shown {
        visibility: visible;
        opacity: 1;
        transition: all 0.3s ease-in-out;
    }
}

// ── Login Page ───────────────────────────────────────────────────────────────
.login-panel {
    display: flex;
    flex-direction: row;
    height: 100vh;
    width: 100vw;
    overflow: hidden;

    .hero-panel {
        flex: 1;
        background: linear-gradient(160deg, #0891B2 0%, #0E7490 50%, #164E63 100%);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 80px;
        overflow: hidden;
    }

    .hero-content {
        display: flex;
        flex-direction: column;
        gap: 40px;
        flex: 1;
        justify-content: center;
    }

    .hero-logo {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .hero-logo-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        flex-shrink: 0;
        object-fit: contain;
    }

    .hero-logo-text {
        color: #FFFFFF;
        font-family: 'Poppins', sans-serif;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 0.5px;
    }

    .hero-headline h1 {
        color: #FFFFFF;
        font-family: 'Poppins', 'Noto Sans TC', sans-serif;
        font-size: 2rem;
        font-weight: 700;
        line-height: 1.3;
        margin: 0;
    }

    .hero-desc {
        color: rgba(255, 255, 255, 0.85);
        font-size: 1rem;
        line-height: 1.7;
        margin: 0;
        font-weight: 400;
    }

    .hero-features {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .hero-feature-item {
        display: flex;
        align-items: center;
        gap: 12px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-weight: 500;

        svg {
            width: 20px;
            height: 20px;
            color: #22D3EE;
        }
    }

    .hero-footer {
        display: flex;
        gap: 24px;
        align-items: center;

        a svg {
            width: 24px;
            height: 24px;
            color: rgba(255, 255, 255, 0.53);
            transition: color 0.2s;
        }

        a:hover svg {
            color: rgba(255, 255, 255, 0.85);
        }
    }

    .login-panel-right {
        width: 480px;
        flex: 0 0 480px;
        background: #FFFFFF;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 0 60px;
        box-shadow: -4px 0 24px rgba(8, 145, 178, 0.06);
    }

    .login-card {
        width: 360px;
        display: flex;
        flex-direction: column;
        gap: 28px;
    }

    .login-card-header {
        h2 {
            color: #164E63;
            font-size: 1.75rem;
            font-weight: 600;
            margin: 0;
        }
        p {
            color: #475569;
            font-size: 0.875rem;
            margin: 0;
        }
    }

    .login-input-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .login-input {
        width: 100%;
        padding: 12px 16px;
        font-size: 0.9375rem;
        border: 1.5px solid #E2E8F0;
        border-radius: 8px;
        color: #164E63;
        outline: none;
        transition: all 0.2s;

        &:focus {
            border-color: #0891B2;
            box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.12);
        }
    }

    .remember-me-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.875rem;
        color: #475569;
        cursor: pointer;

        input { accent-color: #0891B2; }
    }

    .login-btn-primary {
        width: 100%;
        padding: 12px 16px;
        background: #0891B2;
        color: #FFFFFF;
        font-weight: 600;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
            background: #0E7490;
            box-shadow: 0 4px 12px rgba(8, 145, 178, 0.3);
        }
    }

    .login-btn-secondary {
        width: 100%;
        padding: 11px 16px;
        background: transparent;
        color: #475569;
        border: 1.5px solid #E2E8F0;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
            border-color: #0891B2;
            color: #0891B2;
            background: #ECFEFF;
        }
    }
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
.sidebar {
    width: 240px;
    flex: 0 0 240px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 24px 12px;
    background-color: #FFFFFF;
    border-right: 1px solid #F1F5F9;
    box-sizing: border-box;

    .sidebar-header {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 8px 16px;
        margin-bottom: 8px;

        .sidebar-logo-img {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            object-fit: contain;
        }

        span {
            font-family: 'Poppins', sans-serif;
            font-size: 15px;
            font-weight: 600;
            color: #164E63;
        }
    }

    .sidebar-logo-box {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: linear-gradient(135deg, #0891B2 0%, #22D3EE 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        .sidebar-logo-text {
            color: #FFFFFF;
            font-weight: 700;
        }
    }

    .sidebar-item {
        width: 100%;
        height: 44px;
        padding: 0 16px;
        margin: 2px 0;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
        color: #475569;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 14px;
        font-weight: 500;

        svg { width: 18px; height: 18px; }

        &:hover {
            background-color: #F0FDFA;
            color: #0891B2;
        }

        &.active {
            background-color: #ECFEFF;
            color: #0891B2;
            font-weight: 600;
            position: relative;

            &::before {
                content: '';
                position: absolute;
                left: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 4px;
                height: 28px;
                border-radius: 2px;
                background: #0891B2;
            }
        }
    }

    #About-sidebar-item {
        margin-top: auto;
    }
}
</style>

