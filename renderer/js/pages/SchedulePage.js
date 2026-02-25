// SchedulePage.js — 課表頁元件 (UI.pen NEW-03)
const SchedulePage = {
    template: `
    <div ss-container id="section-Schedule" class="inner-section is-shown">
        <!-- Top Bar -->
        <div class="top-bar">
            <span class="top-bar-title">我的課表</span>
            <div class="top-bar-right">
                <i data-lucide="bell" style="width:20px;height:20px;color:var(--color-text-secondary);cursor:pointer;"></i>
                <div class="user-chip" v-if="isLoggedIn">
                    <i data-lucide="user"></i>
                    <span>{{ sid || '' }}</span>
                </div>
            </div>
        </div>

        <!-- Scroll Content -->
        <div class="scroll-content">
            <!-- Tool Row -->
            <div class="sched-tool-row">
                <div class="sched-tool-left">
                    <span class="sched-semester-label">{{ semesterLabel }}</span>
                    <span class="badge badge-primary">{{ creditCount }} 學分</span>
                </div>
                <div class="sched-tool-right">
                    <button class="btn btn-outline" id="refresh-schedule" @click="handleRefresh">
                        <i data-lucide="refresh-cw"></i> 重新載入
                    </button>
                </div>
            </div>

            <!-- Loading -->
            <div id="schedule-loading" class="schedule-loading" v-show="isScheduleLoading">
                <div class="loading-spinner"></div>
                <p>正在載入課表資料...</p>
            </div>

            <!-- Schedule Table -->
            <div id="schedule-content" v-show="showContent">
                <div class="schedule-table-container">
                    <table class="schedule-table">
                        <thead>
                            <tr>
                                <th class="sched-time-col">時間</th>
                                <th>週一</th>
                                <th>週二</th>
                                <th>週三</th>
                                <th>週四</th>
                                <th>週五</th>
                                <th>週六</th>
                                <th>週日</th>
                            </tr>
                        </thead>
                        <tbody id="schedule-tbody">
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Error -->
            <div id="schedule-error" class="schedule-error" v-show="showError">
                <div class="error-content">
                    <i data-lucide="alert-circle" style="width:48px;height:48px;color:var(--color-danger);margin-bottom:12px;"></i>
                    <h4>無法載入課表資料</h4>
                    <p class="error-message">課表資料載入失敗，請重新載入課表</p>
                </div>
            </div>
        </div>
    </div>
    `,

    setup() {
        const isScheduleLoading = Vue.computed(() => Store.scheduleViewState === 'loading');
        const showContent = Vue.computed(() => Store.scheduleViewState === 'content');
        const showError = Vue.computed(() => Store.scheduleViewState === 'error');

        // M-09: 以 computed 包裝 Store 屬性，不直接在 template 存取 Store
        const isLoggedIn = Vue.computed(() => Store.isLoggedIn);
        const sid = Vue.computed(() => Store.sid);

        const semesterLabel = Vue.computed(() => {
            const label1 = Store.courseScheduleData?.label1 || '';
            // 從「114 學年第 2學期學分小計: 6」提取「114 學年度 第2學期」
            // label1 格式: "114 學年第 2學期學分小計: 6"
            if (label1.includes('學分小計')) {
                const semester = label1.split('學分小計')[0].trim();
                // 將「第 2」改為「第2」，並確保格式一致
                return semester.replace(/第\s*(\d)/g, '第$1');
            }
            return '課程資訊載入中...';
        });

        const creditCount = Vue.computed(() => {
            const label1 = Store.courseScheduleData?.label1 || '';
            // 從「114 學年第 2學期學分小計: 6」提取「6」
            const match = label1.match(/:\s*(\d+)/);
            return match ? match[1] : '0';
        });

        function handleRefresh() {
            if (typeof window.refreshSchedule === 'function') {
                window.refreshSchedule();
            } else {
                console.warn('refreshSchedule 尚未定義');
            }
        }

        function autoLoadSchedule() {
            if (Store.courseScheduleData &&
                Store.courseScheduleData.course_list &&
                Store.courseScheduleData.course_list.length > 0) {
                window.generateScheduleTable();
            } else if (Store.isBackgroundLoadingSchedule) {
                Store.scheduleViewState = 'loading';
            } else {
                const hasScheduleError = Store.courseScheduleData === null && !Store.isBackgroundLoadingSchedule;
                if (hasScheduleError && Store.isLoggedIn) {
                    Store.scheduleViewState = 'error';
                } else if (Store.isLoggedIn) {
                    if (!Store.isRefreshingSchedule) {
                        window.refreshSchedule();
                    }
                }
            }
        }

        Vue.onMounted(() => {
            Vue.nextTick(() => {
                autoLoadSchedule();
                if (typeof lucide !== 'undefined') lucide.createIcons();
            });
        });

        Vue.onActivated && Vue.onActivated(() => {
            Vue.nextTick(() => autoLoadSchedule());
        });

        return { isScheduleLoading, showContent, showError, handleRefresh, creditCount, isLoggedIn, sid };
    }
};
