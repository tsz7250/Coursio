/**
 * init.js — 組件載入器
 *
 * 從 index.html 的 inline <script> 區塊提取。
 * 主程序已在背景處理預熱，此處直接載入組件，無需等待 prewarm-completed 事件。
 */
document.addEventListener('DOMContentLoaded', function () {
    loadComponents();
});

function loadComponents() {
    // 首先隱藏所有區段
    hideAllSection();

    // 載入首頁
    loadComponent('main-dashboard-container', './components/main-dashboard.html');

    // 載入課表
    loadComponent('schedule-container', './components/schedule.html');

    // 載入設定
    loadComponent('settings-container', './components/settings.html');

    // 載入關於模態框
    loadComponent('about-modal-container', './components/about-modal.html');

    // 載入自動選課介面（最後載入，因為它需要特殊處理）
    const autoSelectionInnerContainer = document.getElementById('auto-selection-inner-container');
    if (autoSelectionInnerContainer) {
        fetch('./sections/course_selection.html')
            .then(response => response.text())
            .then(html => {
                autoSelectionInnerContainer.innerHTML = html;
                // HTML 載入後初始化控制器
                if (typeof CourseSelectionController !== 'undefined') {
                    // 建立並掛到全域，供切頁時呼叫檢查
                    window.courseSelectionController = new CourseSelectionController();
                } else {
                    console.warn('CourseSelectionController 未定義');
                }
            })
            .catch(error => {
                console.error('載入自動選課介面失敗:', error);
                autoSelectionInnerContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <h4>❌ 載入失敗</h4>
                        <p>無法載入自動選課介面。錯誤: ${error.message}</p>
                    </div>
                `;
            });
    } else {
        console.error('找不到 auto-selection-inner-container 元素');
    }
}

function loadComponent(containerId, componentPath) {
    const container = document.getElementById(containerId);
    if (!container) return;

    fetch(componentPath)
        .then(response => response.text())
        .then(html => {
            container.innerHTML = html;

            // schedule 載入後綁定 refresh-schedule 按鈕事件
            if (componentPath.includes('schedule.html')) {
                const refreshBtn = document.getElementById('refresh-schedule');

                const handleRefreshSchedule = () => {
                    if (typeof window.refreshSchedule === 'function') {
                        window.refreshSchedule();
                    } else {
                        console.warn('refreshSchedule 尚未定義');
                    }
                };

                // 移除舊的事件監聽器（若存在）
                if (refreshBtn && window.scheduleRefreshHandler) {
                    refreshBtn.removeEventListener('click', window.scheduleRefreshHandler);
                }

                // 添加新的事件監聽器並保存引用
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', handleRefreshSchedule);
                    window.scheduleRefreshHandler = handleRefreshSchedule;
                }
            }
        })
        .catch(error => {
            console.error(`載入組件 ${componentPath} 失敗:`, error);
            container.innerHTML = `
                <div class="alert alert-danger">
                    <h4>❌ 載入失敗</h4>
                    <p>無法載入組件 ${componentPath}。錯誤: ${error.message}</p>
                </div>
            `;
        });
}
