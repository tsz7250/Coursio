// router.js — Vue Router 設定
// 使用 hash mode 以相容 Electron file:// 協定

const { createRouter, createWebHashHistory } = VueRouter;

const routes = [
    { path: '/',               name: 'Main',              component: MainDashboard },
    { path: '/schedule',       name: 'Schedule',          component: SchedulePage },
    { path: '/query',          name: 'CourseQuery',       component: CourseQueryPage },
    { path: '/auto-selection', name: 'AutoSelection',     component: AutoSelectionPage },
    { path: '/settings',       name: 'Settings',          component: SettingsPage },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

// 路由進入前：更新側邊欄 active 狀態
router.afterEach((to) => {
    // 清除舊的 active 狀態
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));

    // 路由名稱 → 側邊欄 ID 映射
    const sidebarMap = {
        'Main':          'Main-sidebar-item',
        'Schedule':      'Schedule-sidebar-item',
        'CourseQuery':   'School-timetable-Query-sidebar-item',
        'AutoSelection': 'Auto-Selection-sidebar-item',
        'Settings':      'Settings-sidebar-item',
    };

    const sidebarId = sidebarMap[to.name];
    if (sidebarId) {
        const el = document.getElementById(sidebarId);
        if (el) el.classList.add('active');
    }
});
