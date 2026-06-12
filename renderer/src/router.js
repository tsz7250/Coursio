// router.js — Vue Router 設定 (ESM)
// 使用 hash mode 以相容 Electron file:// 協定

import { createRouter, createWebHashHistory } from 'vue-router';
import MainDashboard from './pages/MainDashboard.vue';
import SchedulePage from './pages/SchedulePage.vue';
import PreSchedulePage from './pages/PreSchedulePage.vue';
import CourseQueryPage from './pages/CourseQueryPage.vue';
import AutoSelectionPage from './pages/AutoSelectionPage.vue';
import GradesPage from './pages/GradesPage.vue';
import SettingsPage from './pages/SettingsPage.vue';
import AboutPage from './pages/AboutPage.vue';

const routes = [
    { path: '/',               name: 'Main',          component: MainDashboard },
    { path: '/schedule',       name: 'Schedule',      component: SchedulePage },
    { path: '/pre-schedule',   name: 'PreSchedule',   component: PreSchedulePage },
    { path: '/query',          name: 'CourseQuery',   component: CourseQueryPage },
    { path: '/auto-selection', name: 'AutoSelection', component: AutoSelectionPage },
    { path: '/grades',         name: 'Grades',        component: GradesPage },
    { path: '/settings',       name: 'Settings',      component: SettingsPage },
    { path: '/about',          name: 'About',         component: AboutPage },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

// 路由進入後：更新側邊欄 active 狀態
router.afterEach((to) => {
    // 清除舊的 active 狀態
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));

    // 路由名稱 → 側邊欄 ID 映射
    const sidebarMap = {
        'Main':          'Main-sidebar-item',
        'Schedule':      'Schedule-sidebar-item',
        'PreSchedule':   'PreSchedule-sidebar-item',
        'CourseQuery':   'School-timetable-Query-sidebar-item',
        'AutoSelection': 'Auto-Selection-sidebar-item',
        'Settings':      'Settings-sidebar-item',
        'About':         'About-sidebar-item',
    };

    const sidebarId = sidebarMap[to.name];
    if (sidebarId) {
        const el = document.getElementById(sidebarId);
        if (el) el.classList.add('active');
    }
});

export default router;
