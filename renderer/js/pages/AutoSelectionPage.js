// AutoSelectionPage.js — 自動選課頁元件 (UI.pen NEW-05)
const AutoSelectionPage = {
    template: `
    <div ss-container id="section-Auto-Selection" class="inner-section is-shown">
        <!-- Top Bar -->
        <div class="top-bar">
            <span class="top-bar-title">自動選課機器人</span>
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
            <div id="auto-selection-inner-container">
                <!-- 內容將由 loadContent 載入 -->
            </div>
        </div>
    </div>
    `,

    setup() {
        const contentLoaded = Vue.ref(false);

        async function loadContent() {
            const container = document.getElementById('auto-selection-inner-container');
            if (!container || contentLoaded.value) return;

            try {
                const response = await fetch('./sections/course_selection.html');
                const html = await response.text();
                container.innerHTML = html;
                contentLoaded.value = true;

                // 初始化控制器
                if (typeof CourseSelectionController !== 'undefined') {
                    window.courseSelectionController = new CourseSelectionController();
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

        Vue.onMounted(() => {
            Vue.nextTick(async () => {
                await loadContent();
                checkEnvironment();
            });
        });

        Vue.onActivated && Vue.onActivated(() => {
            checkEnvironment();
        });

        return { Store };
    }
};
