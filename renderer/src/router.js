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



export default router;
