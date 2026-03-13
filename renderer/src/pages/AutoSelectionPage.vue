<template>
  <div id="section-Auto-Selection" class="auto-selection-page">
    <AppTopBar
      title="自動選課機器人"
      :is-logged-in="StoreRef.isLoggedIn"
      :sid="StoreRef.sid || ''"
      :show-user-menu="StoreRef.showUserMenu"
      @update:show-user-menu="StoreRef.showUserMenu = $event"
      @settings="goToSettings"
      @logout="logout"
    />

    <!-- Scroll Content -->
    <div class="scroll-content scroll-content-compact">
      <div id="auto-selection-inner-container" class="course-selection-section">
        <div class="section-header">
          <h3><i data-lucide="bot"></i> 自動選課機器人 (Python yzuCourseBot)</h3>
          <p class="section-description">
            使用 AI 驗證碼識別技術的專業選課機器人，支援自動登入和智能選課
          </p>
        </div>

        <!-- 環境狀態 Pills -->
        <div class="bot-card" id="environmentStatus">
          <div class="bot-card-header">
            <i data-lucide="activity" class="icon-clr-primary"></i>
            <span class="bot-card-title">環境狀態</span>
            <button @click="checkEnvironment(true)" class="btn btn-outline btn-sm u-ml-auto">
              <i data-lucide="refresh-cw"></i> 重新檢查
            </button>
          </div>
          <div class="env-pill-row">
            <div v-for="(env, key) in envStatuses" :key="key" :class="['env-pill', env.pillClass]">
              <span :class="['env-pill-dot', env.dotClass]"></span>
              <span class="env-pill-label">{{ env.label }}</span>
              <span class="env-pill-status">{{ env.statusText }}</span>
            </div>
          </div>
        </div>

        <!-- Portal 帳號設定 -->
        <div class="bot-card" id="portalAccountCard">
          <div class="bot-card-header">
            <i data-lucide="key" class="icon-clr-primary"></i>
            <span class="bot-card-title">Portal 帳號設定</span>
            <span v-if="accountSetHint" class="bot-task-count u-ml-auto">{{ accountSetHint }}</span>
          </div>
          <div class="u-flex-row-wrap">
            <div class="form-group u-form-flex-item">
              <label class="form-label">學號</label>
              <input type="text" v-model="portalAccount" class="form-control" placeholder="e.g. s1234567">
            </div>
            <div class="form-group u-form-flex-item">
              <label class="form-label">密碼</label>
              <input type="password" v-model="portalPassword" class="form-control" placeholder="Portal 密碼">
            </div>
            <button @click="saveAccount" class="btn btn-primary btn-sm u-h-38">
              <i data-lucide="save"></i> 儲存帳號
            </button>
          </div>
        </div>

        <!-- 選課任務列表 -->
        <div class="bot-card" id="courseListDisplay">
          <div class="bot-card-header">
            <i data-lucide="list-checks" class="icon-clr-primary"></i>
            <span class="bot-card-title">選課任務列表</span>
            <span class="bot-task-count">{{ taskList.length }} 門待選</span>
            <button @click="loadTaskList" class="btn btn-outline btn-sm">
              <i data-lucide="refresh-cw"></i>
            </button>
            <button @click="clearCompletedTasks" class="btn btn-outline btn-sm">清除已完成</button>
          </div>
          <div class="bot-task-table-wrap">
            <table class="bot-task-table">
              <thead>
                <tr>
                  <th class="btc-id">課程代號</th>
                  <th class="btc-name">課程名稱</th>
                  <th class="btc-teacher">教師</th>
                  <th class="btc-credit">學分</th>
                  <th class="btc-status">狀態</th>
                  <th class="btc-action">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="taskList.length === 0" class="bot-task-empty-row">
                  <td colspan="6">
                    <div class="bot-task-empty">
                      <i data-lucide="list-checks" class="icon-32 icon-clr-muted"></i>
                      <p>尚無待選課程</p>
                      <small>請前往「課程查詢」頁面加入課程</small>
                    </div>
                  </td>
                </tr>
                <tr v-for="task in taskList" :key="task.id">
                  <td class="course-code">{{ task.courseId }}{{ task.classId }}</td>
                  <td class="course-name" :title="task.name">{{ task.name }}</td>
                  <td class="teacher-name">{{ task.teacher_name || '-' }}</td>
                  <td class="credit">{{ task.credit || '-' }}</td>
                  <td>
                    <span :class="['status-badge', getStatusBadgeClass(task.status)]">
                      {{ getStatusText(task.status) }}
                    </span>
                  </td>
                  <td class="actions">
                    <button @click="deleteTask(task.id)" class="btn btn-outline btn-sm">🗑️ 刪除</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 設定 + 控制 (2-col) -->
        <div class="bot-2col-row">
          <div class="bot-card">
            <div class="bot-card-header">
              <i data-lucide="sliders-horizontal" class="icon-clr-primary"></i>
              <span class="bot-card-title">機器人設定</span>
            </div>
            <div class="form-group u-mb-14">
              <label class="form-label">選課間隔（秒）</label>
              <input type="number" v-model="selectionDelay" min="0.5" max="10" step="0.1" class="form-control">
              <small class="help-text">建議 2.5 秒以避免被系統封鎖</small>
            </div>
            <div class="form-group">
              <label class="form-label">最大嘗試次數</label>
              <input type="number" v-model="maxAttempts" min="0" max="1000" class="form-control">
              <small class="help-text">0 = 無上限</small>
            </div>
          </div>

          <div class="bot-card">
            <div class="bot-card-header">
              <i data-lucide="play-circle" class="icon-clr-primary"></i>
              <span class="bot-card-title">機器人控制</span>
            </div>
            <div class="bot-status-area">
              <div class="bot-status-dot-row">
                <span :class="['status-dot', { active: isRunning }]"></span>
                <div>
                  <span class="status-label">{{ isRunning ? '執行中' : '待機中' }}</span>
                  <span class="status-sub">{{ botStatusSub }}</span>
                </div>
              </div>
            </div>
            <div class="bot-ctrl-btns">
              <button @click="startBot" class="btn btn-success" :disabled="isRunning || !envReady">
                <i data-lucide="play-circle"></i> 啟動
              </button>
              <button @click="stopBot" class="btn btn-danger" :disabled="!isRunning">
                <i data-lucide="x"></i> 停止
              </button>
            </div>
          </div>
        </div>

        <!-- 即時輸出 -->
        <div class="bot-card bot-card-output">
          <div class="bot-output-header">
            <i data-lucide="terminal" class="icon-clr-slate"></i>
            <span class="bot-output-title">即時輸出</span>
            <button @click="clearOutput" class="btn btn-ghost btn-sm u-ml-auto">清空</button>
            <label class="auto-scroll-label">
              <input type="checkbox" v-model="autoScroll"> 自動捲動
            </label>
          </div>
          <div class="output-container" ref="outputContainer">
            <div class="output-content">
              <div v-for="(log, index) in logs" :key="index" :class="['output-item', log.type]">
                <span class="timestamp">[{{ log.time }}]</span>
                <span class="message">{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Store } from '../store.js';
import { PythonCourseBot } from '../services/python_course_bot.js';
import { useLogout } from '@/composables/useLogout.js';
import AppTopBar from '@/components/layout/AppTopBar.vue';
import { useBotOutputLog } from '@/composables/useAutoSelection/useBotOutputLog.js';
import { useEnvironmentCheck } from '@/composables/useAutoSelection/useEnvironmentCheck.js';
import { usePortalAccount } from '@/composables/useAutoSelection/usePortalAccount.js';
import { useBotControl } from '@/composables/useAutoSelection/useBotControl.js';

const router = useRouter();
const StoreRef = Store;
const pythonBot = new PythonCourseBot();

// --- Composables ---
const { logs, autoScroll, outputContainer, appendLog, clearOutput } = useBotOutputLog();
const { envReady, envStatuses, checkEnvironment } = useEnvironmentCheck(pythonBot, appendLog);
const { portalAccount, portalPassword, accountSetHint, saveAccount } = usePortalAccount(pythonBot, appendLog, envStatuses);
const { taskList, selectionDelay, maxAttempts, isRunning, botStatusSub, loadTaskList, startBot, stopBot, deleteTask, clearCompletedTasks } = useBotControl(pythonBot, appendLog, envReady);

// --- 導航與登出 ---
function goToSettings() { router.push({ name: 'Settings' }); StoreRef.showUserMenu = false; }
const { logout } = useLogout();

// --- 模板輔助函式 ---
function getStatusText(s) {
  if (s === 0) return '待選';
  if (s === 1) return '已選到';
  if (s === 2) return '已選過';
  return '狀態 ' + s;
}

function getStatusBadgeClass(s) {
  if (s === 0) return 'status-pending';
  if (s === 1) return 'status-success';
  if (s === 2) return 'status-warning';
  return 'status-info';
}

onMounted(() => {
  nextTick(async () => {
    if (StoreRef.isLoggedIn && StoreRef.sid) {
      portalAccount.value = StoreRef.sid;
      if (StoreRef.spwd) {
        portalPassword.value = StoreRef.spwd;
        accountSetHint.value = '已從登入帳號帶入';
        await window.electronAPI.config.writeAccounts({ account: StoreRef.sid, password: StoreRef.spwd, rememberMe: true });
      }
    }
    await checkEnvironment();
    if (window.lucide) window.lucide.createIcons();
  });
});
</script>

<style scoped lang="scss">
.auto-selection-page {
  width: 100%;
  height: 100%;
  position: relative;
  overflow-y: auto;
  background: var(--color-bg-page);
}

.course-selection-section { display: flex; flex-direction: column; gap: 24px; padding: 20px; }
.section-header {
  h3 { display: flex; align-items: center; gap: 8px; font-family: 'Poppins', sans-serif; font-size: 18px; font-weight: 600; color: #164E63; margin: 0 0 6px; }
}
.section-description { font-family: 'Open Sans', sans-serif; font-size: 13px; color: #94A3B8; margin: 0; }
.bot-card { background: #FFFFFF; border: 1px solid #E2E8F0; padding: 20px; border-radius: 12px;
  .bot-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
  .bot-card-title { font-family: 'Poppins', sans-serif; font-size: 16px; font-weight: 600; color: #164E63; margin: 0; }
}
.env-pill-row { display: flex; flex-wrap: wrap; gap: 10px; }
.env-pill { display: flex; align-items: center; gap: 7px; flex: 1 1 auto; min-width: 120px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 14px; font-family: 'Open Sans', sans-serif;
  .env-pill-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
    &.env-pill-dot-pending { background: #94A3B8; }
    &.env-pill-dot-ok      { background: #22C55E; }
    &.env-pill-dot-error   { background: #EF4444; }
    &.env-pill-dot-warn    { background: #F59E0B; }
  }
  .env-pill-label { font-size: 12px; font-weight: 600; color: #334155; }
  .env-pill-status { font-size: 11px; color: #64748B; margin-left: auto; }
  &.env-pill-ok    { border-color: #BBF7D0; background: #F0FDF4; }
  &.env-pill-error { border-color: #FECACA; background: #FEF2F2; }
  &.env-pill-warn  { border-color: #FED7AA; background: #FFF7ED; }
}
.bot-task-count { font-family: 'Open Sans', sans-serif; font-size: 12px; font-weight: 600; color: #0891B2; background: #ECFEFF; border-radius: 20px; padding: 2px 10px; }
.bot-task-table-wrap { border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; margin-top: 12px; }
.bot-task-table { width: 100%; border-collapse: collapse; font-family: 'Open Sans', sans-serif; font-size: 13px;
  thead tr { background: #F8FAFC; border-bottom: 1px solid #E2E8F0; }
  th { padding: 8px 12px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; text-align: left; }
  tbody tr { border-bottom: 1px solid #F1F5F9; &:hover { background: #F8FAFC; } }
  td { padding: 10px 12px; color: #334155; vertical-align: middle; }
}
.status-badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;
  &.status-pending { background: #F1F5F9; color: #64748B; }
  &.status-success { background: #DCFCE7; color: #166534; }
  &.status-warning { background: #FEF3C7; color: #92400E; }
  &.status-info    { background: #E0F2FE; color: #075985; }
}
.bot-2col-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; @media (max-width: 680px) { grid-template-columns: 1fr; } }
.bot-status-area { margin-bottom: 16px; padding: 12px 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; }
.bot-status-dot-row { display: flex; align-items: center; gap: 12px;
  .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #94A3B8; &.active { background: #22C55E; box-shadow: 0 0 0 3px rgba(34,197,94,.2); animation: pulse-dot 1.5s infinite; } }
  .status-label { font-size: 13px; font-weight: 600; color: #334155; display: block; }
  .status-sub { font-size: 11px; color: #94A3B8; display: block; }
}
@keyframes pulse-dot { 0%, 100% { box-shadow: 0 0 0 3px rgba(34,197,94,.2); } 50% { box-shadow: 0 0 0 6px rgba(34,197,94,.1); } }
.bot-ctrl-btns { display: flex; gap: 10px; }
.output-container { background: #0F172A; border-radius: 8px; height: 220px; overflow-y: auto; padding: 12px 16px;
  .output-item { font-family: 'IBM Plex Mono', monospace; font-size: 12px; line-height: 1.6; color: #E2E8F0; // 預設淺灰色
    .timestamp { color: #64748B; margin-right: 6px; } 
    &.system { color: #CBD5E1; } 
    &.stdout { color: #E2E8F0; }
    &.stderr { color: #FCA5A5; }
    &.success { color: #4ADE80; } 
    &.error { color: #F87171; } 
    &.warning { color: #FCD34D; } 
    &.info { color: #60A5FA; } }
}
.help-text { font-size: 11px; color: #94A3B8; margin-top: 4px; display: block; }
.auto-scroll-label { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #64748B; cursor: pointer; }
</style>
