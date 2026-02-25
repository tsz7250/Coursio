// main.js — Vite 入口（renderer 端）
import { createApp } from 'vue';
import App from './App.vue';
import router from './js/router.esm.js';
import { Store } from './js/store.esm.js';

// Lucide icons — 只 import 專案實際使用的 28 個圖示（tree-shake 優化）
import {
  createIcons,
  Bell, User, House, Calendar, Search, Settings, Bot, Info,
  ShieldCheck, Zap, Cpu, ExternalLink, Github, Globe, Linkedin,
  X, Activity, AlertCircle, AlertTriangle, Bug, Code, LogOut,
  ListChecks, PlayCircle, RefreshCw, RotateCcw, Trash2,
  Terminal, SlidersHorizontal,
  Save, Key, FolderOpen
} from 'lucide';
const lucideIcons = {
  Bell, User, House, Calendar, Search, Settings, Bot, Info,
  ShieldCheck, Zap, Cpu, ExternalLink, Github, Globe, Linkedin,
  X, Activity, AlertCircle, AlertTriangle, Bug, Code, LogOut,
  ListChecks, PlayCircle, RefreshCw, RotateCcw, Trash2,
  Terminal, SlidersHorizontal,
  Save, Key, FolderOpen
};
// 包裝 createIcons，自動注入 icons 物件，修復「Please provide an icons object」錯誤
window.lucide = {
  createIcons: (opts = {}) => createIcons({ icons: lucideIcons, ...opts }),
  icons: lucideIcons
};

// CSS（Vite 會合併打包，不再需要 <link> 標籤）
import './scss/wannaclass.scss';
import './css/tailwind.css';

// UMD / IIFE 副作用模組（設定 window 全域變數）
import './js/simple-scrollbar.js';           // window.SimpleScrollbar
import './js/schedule-helpers.js';           // window.refreshSchedule, window.generateScheduleTable
import './js/python_course_bot.js';          // window.PythonCourseBot
import './js/course_selection_controller.js'; // window.CourseSelectionController

const app = createApp(App);
app.use(router);
app.mount('#app');

// =====================================================================
// Toast 通知工具
window.showToast = function (msg = '', duration = 3000) {
  let el = document.getElementById('wc-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wc-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('wc-toast-show');
  clearTimeout(el._tid);
  el._tid = setTimeout(() => el.classList.remove('wc-toast-show'), duration);
};

// 通知鈴 — 事件委派（不需修改各個頁面）
document.addEventListener('click', e => {
  const bellSvg = e.target.closest('svg.lucide-bell');
  if (bellSvg) window.showToast('🔔 目前無新通知');
  // 點擊 .user-chip 以外的地方 → 關閉 dropdown
  if (!e.target.closest('.user-chip')) {
    Store.showUserMenu = false;
  }
});
