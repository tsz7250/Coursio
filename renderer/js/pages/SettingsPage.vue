<template>
  <div ss-container id="section-Settings" class="inner-section is-shown">
    <!-- Top Bar -->
    <div class="top-bar">
      <span class="top-bar-title">設定</span>
      <div class="top-bar-right">
        <i data-lucide="bell" style="width:20px;height:20px;color:var(--color-text-secondary);cursor:pointer;"></i>
        <div class="user-chip" v-if="Store.isLoggedIn" @click.stop="Store.showUserMenu = !Store.showUserMenu">
          <i data-lucide="user"></i>
          <span>{{ Store.sid || '' }}</span>
          <div class="user-menu" v-show="Store.showUserMenu">
            <div class="user-menu-item" @click.stop="logout">
              <i data-lucide="log-out" style="width:14px;height:14px;"></i> 登出
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Scroll Content -->
    <div class="scroll-content scroll-content-tight">
      <!-- Account Card -->
      <div class="settings-card">
        <h4 class="settings-card-title">
          <i data-lucide="user" style="width:18px;height:18px;"></i>
          帳號資訊
        </h4>
        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-label-title">學號</span>
            <span class="setting-label-desc">YZU Portal 帳號</span>
          </div>
          <div class="setting-row-control">
            <span style="font-size:0.875rem;color:var(--color-text-primary);font-weight:600;">{{ Store.sid || '未登入' }}</span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-label-title">登入狀態</span>
            <span class="setting-label-desc">目前的驗證狀態</span>
          </div>
          <div class="setting-row-control">
            <span class="badge" :class="Store.isLoggedIn ? 'badge-success' : 'badge-warning'">
              {{ Store.isLoggedIn ? '已登入' : '未登入' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Saved Credentials Card -->
      <div class="settings-card">
        <h4 class="settings-card-title">
          <i data-lucide="key" style="width:18px;height:18px;"></i>
          記住帳密設定
        </h4>
        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-label-title">帳密儲存狀態</span>
            <span class="setting-label-desc">登入時勾選「記住帳密」後，帳密將加密儲存於設定檔</span>
          </div>
          <div class="setting-row-control">
            <span class="badge" :class="hasSavedCredentials ? 'badge-success' : 'badge-warning'">
              {{ hasSavedCredentials ? '已儲存' : '未儲存' }}
            </span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-label-title">設定檔路徑</span>
            <span class="setting-label-desc">帳密以 config.ini 格式儲存於此路徑（留空使用預設路徑）</span>
          </div>
          <div class="setting-row-control" style="flex-direction:column;align-items:flex-end;gap:6px;">
            <div style="display:flex;gap:6px;align-items:center;">
              <input v-model="configPath" class="form-control"
                style="width:180px;font-size:11px;"
                :placeholder="defaultConfigPath || 'APPDATA\\Coursio\\config.ini'">
              <button class="btn btn-outline btn-sm" @click="browseConfigPath" title="瀏覽檔案">
                <i data-lucide="folder-open" style="width:13px;height:13px;"></i>
              </button>
            </div>
            <button class="btn btn-outline btn-sm" @click="saveConfigPath">
              <i data-lucide="save" style="width:13px;height:13px;"></i> 儲存路徑
            </button>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="settings-card danger-zone">
        <h4 class="settings-card-title">
          <i data-lucide="alert-triangle" style="width:18px;height:18px;"></i>
          危險區域
        </h4>
        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-label-title">清除所有選課任務</span>
            <span class="setting-label-desc">移除資料庫中所有已新增的選課任務</span>
          </div>
          <div class="setting-row-control">
            <button class="btn btn-danger" @click="clearAllTasks">
              <i data-lucide="trash-2"></i> 清除
            </button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-label-title">刪除已儲存的帳號密碼</span>
            <span class="setting-label-desc">清除設定檔中儲存的帳號密碼</span>
          </div>
          <div class="setting-row-control">
            <button class="btn btn-danger" @click="deleteStoredAccounts">
              <i data-lucide="key"></i> 刪除帳密
            </button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-label-title">重設所有設定</span>
            <span class="setting-label-desc">還原為預設設定值</span>
          </div>
          <div class="setting-row-control">
            <button class="btn btn-danger" @click="resetSettings">
              <i data-lucide="rotate-ccw"></i> 重設
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onActivated, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Store } from '../store.esm.js';

const router = useRouter();
function logout() {
  Store.isLoggedIn = false;
  Store.sid = '';
  Store.spwd = '';
  Store.courseScheduleData = null;
  Store.showUserMenu = false;
  router.push({ name: 'Main' });
}

// ── 記住帳密相關 ──
const hasSavedCredentials = ref(false);
const configPath = ref('');
const defaultConfigPath = ref('');

async function loadConfigInfo() {
  try {
    const info = await window.electronAPI.config.getPath();
    defaultConfigPath.value = info.defaultPath || '';
    // 若有自訂路徑才顯示
    const s = await window.electronAPI.settings.read();
    if (s && s.customConfigPath) configPath.value = s.customConfigPath;
    const saved = await window.electronAPI.config.readAccounts();
    hasSavedCredentials.value = !!(saved && saved.rememberMe && saved.account);
  } catch (_) {}
}

async function saveConfigPath() {
  try {
    await window.electronAPI.config.setPath(configPath.value.trim() || null);
    await loadConfigInfo();
    if (typeof M !== 'undefined' && M.toast) M.toast({ html: '設定檔路徑已儲存', displayLength: 2000 });
  } catch (e) {
    if (typeof M !== 'undefined' && M.toast) M.toast({ html: '儲存路徑失敗: ' + e.message, displayLength: 3000 });
  }
}

async function browseConfigPath() {
  try {
    const result = await window.electronAPI.shell.showOpenDialog({
      title: '選擇設定檔路徑',
      properties: ['openFile', 'showHiddenFiles'],
      filters: [{ name: 'INI 設定檔', extensions: ['ini'] }]
    });
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      configPath.value = result.filePaths[0];
    }
  } catch (e) {
    console.error('瀏覽路徑失敗:', e);
  }
}

async function deleteStoredAccounts() {
  const confirmFn = window.customConfirm || ((msg) => Promise.resolve(confirm(msg)));
  const confirmed = await confirmFn('確定要刪除已儲存的帳號密碼嗎？');
  if (!confirmed) return;
  try {
    await window.electronAPI.config.deleteAccounts();
    hasSavedCredentials.value = false;
    if (typeof M !== 'undefined' && M.toast) M.toast({ html: '已刪除儲存的帳號密碼', displayLength: 3000 });
  } catch (e) {
    console.error('刪除帳密失敗:', e);
  }
}

async function clearAllTasks() {
  const confirmFn = window.customConfirm || ((msg) => Promise.resolve(confirm(msg)));
  if (!await confirmFn('確定清除所有選課任務？此操作無法復原。')) return;
  try {
    await window.electronAPI.db.executeQuery('DELETE FROM tasks', []);
    Store.tasks = [];
    if (typeof M !== 'undefined' && M.toast) {
      M.toast({ html: '已清除所有選課任務', displayLength: 3000 });
    }
  } catch (e) {
    console.error('清除任務失敗:', e);
  }
}

async function resetSettings() {
  const confirmFn = window.customConfirm || ((msg) => Promise.resolve(confirm(msg)));
  if (!await confirmFn('確定重設所有設定？')) return;
  Store.stealCourseInterval = 5;
  Store.settings = { interval: 5 };
  Store.saveSettings();
  if (typeof M !== 'undefined' && M.toast) {
    M.toast({ html: '已還原預設設定', displayLength: 3000 });
  }
}

function initLucide() {
  nextTick(() => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
}

onMounted(() => {
  initLucide();
  loadConfigInfo();
});

onActivated(() => {
  initLucide();
});
</script>
