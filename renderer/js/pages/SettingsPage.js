// SettingsPage.js — 設定頁元件 (UI.pen NEW-06)
const SettingsPage = {
    template: `
    <div ss-container id="section-Settings" class="inner-section is-shown">
        <!-- Top Bar -->
        <div class="top-bar">
            <span class="top-bar-title">設定</span>
            <div class="top-bar-right">
                <i data-lucide="bell" style="width:20px;height:20px;color:var(--color-text-secondary);cursor:pointer;"></i>
                <div class="user-chip" v-if="Store.isLoggedIn">
                    <i data-lucide="user"></i>
                    <span>{{ Store.sid || '' }}</span>
                </div>
            </div>
        </div>

        <!-- Scroll Content -->
        <div class="scroll-content">
            <!-- Account Card -->
            <div class="settings-card">
                <h4 class="settings-card-title">
                    <i data-lucide="user" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;margin-right:8px;"></i>
                    帳號資訊
                </h4>
                <div class="setting-row">
                    <div class="setting-label">
                        <span class="setting-label-title">學號</span>
                        <span class="setting-label-desc">YZU Portal 帳號</span>
                    </div>
                    <span style="font-size:0.875rem;color:var(--color-text-primary);font-weight:600;">{{ Store.sid || '未登入' }}</span>
                </div>
                <div class="setting-row">
                    <div class="setting-label">
                        <span class="setting-label-title">登入狀態</span>
                        <span class="setting-label-desc">目前的驗證狀態</span>
                    </div>
                    <span class="badge" :class="Store.isLoggedIn ? 'badge-success' : 'badge-warning'">
                        {{ Store.isLoggedIn ? '已登入' : '未登入' }}
                    </span>
                </div>
            </div>

            <!-- Danger Zone -->
            <div class="settings-card danger-zone">
                <h4 class="settings-card-title">
                    <i data-lucide="alert-triangle" style="width:18px;height:18px;display:inline;vertical-align:text-bottom;margin-right:8px;"></i>
                    危險區域
                </h4>
                <div class="setting-row">
                    <div class="setting-label">
                        <span class="setting-label-title">清除所有選課任務</span>
                        <span class="setting-label-desc">移除資料庫中所有已新增的選課任務</span>
                    </div>
                    <button class="btn btn-danger" @click="clearAllTasks">
                        <i data-lucide="trash-2"></i> 清除
                    </button>
                </div>
                <div class="setting-row">
                    <div class="setting-label">
                        <span class="setting-label-title">重設所有設定</span>
                        <span class="setting-label-desc">還原為預設設定值</span>
                    </div>
                    <button class="btn btn-danger" @click="resetSettings">
                        <i data-lucide="rotate-ccw"></i> 重設
                    </button>
                </div>
            </div>
        </div>
    </div>
    `,

    setup() {
        async function clearAllTasks() {
            if (!confirm('確定清除所有選課任務？此操作無法復原。')) return;
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

        function resetSettings() {
            if (!confirm('確定重設所有設定？')) return;
            Store.stealCourseInterval = 5;
            Store.settings = { interval: 5 };
            Store.saveSettings();
            if (typeof M !== 'undefined' && M.toast) {
                M.toast({ html: '已還原預設設定', displayLength: 3000 });
            }
        }

        Vue.onMounted(() => {
            Vue.nextTick(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); });
        });

        return { clearAllTasks, resetSettings, Store };
    }
};
