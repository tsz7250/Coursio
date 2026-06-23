// main.js — Vite 入口（renderer 端）
import { createApp } from 'vue';
import App from '@/App.vue';
import router from '@/router.js';
import { Store } from '@/store.js';

// Lucide icons — 只 import 專案實際使用的圖示（tree-shake 優化）
import {
  createIcons,
  Bell, User, House, Calendar, CalendarRange, Search, Settings, Bot, Info,
  ShieldCheck, Zap, Cpu, ExternalLink, Github, Globe, Linkedin,
  X, Activity, AlertCircle, AlertTriangle, Bug, Code, LogOut,
  ListChecks, PlayCircle, RefreshCw, RotateCcw, Trash2,
  Terminal, SlidersHorizontal, BarChart2, ChevronDown, ChevronLeft, ChevronRight, Lock,
  Save, Key, FolderOpen, Award, HelpCircle
} from 'lucide';
const lucideIcons = {
  Bell, User, House, Calendar, CalendarRange, Search, Settings, Bot, Info,
  ShieldCheck, Zap, Cpu, ExternalLink, Github, Globe, Linkedin,
  X, Activity, AlertCircle, AlertTriangle, Bug, Code, LogOut,
  ListChecks, PlayCircle, RefreshCw, RotateCcw, Trash2,
  Terminal, SlidersHorizontal, BarChart2, ChevronDown, ChevronLeft, ChevronRight, Lock,
  Save, Key, FolderOpen, Award, HelpCircle
};
// 包裝 createIcons，自動注入 icons 物件，修復「Please provide an icons object」錯誤
window.lucide = {
  createIcons: (opts = {}) => createIcons({ icons: lucideIcons, ...opts }),
  icons: lucideIcons
};

// CSS（Vite 會合併打包，不再需要 <link> 標籤）
import '@/assets/scss/coursio.scss';
import '@/assets/css/tailwind.css';

// UMD / IIFE 副作用模組（設定 window 全域變數）
import '@/utils/simple-scrollbar.js';           // window.SimpleScrollbar
// M-03: schedule-helpers 已改為具名匯出，SchedulePage.vue 直接 import，此處保留以確保模組被載入
// window.CourseSelectionController removed (Replaced by AutoSelectionPage.vue logic)

const app = createApp(App);
app.use(router);
app.mount('#app');

// 通知鈴 — 事件委派（不需修改各個頁面）
document.addEventListener('click', e => {
  const bellSvg = e.target.closest('svg.lucide-bell');
  if (bellSvg) {
    if (typeof M !== 'undefined' && M.toast) {
      M.toast({ html: '🔔 目前無新通知', displayLength: 3000 });
    }
  }
  // 點擊 .user-chip 以外的地方 → 關閉 dropdown
  if (!e.target.closest('.user-chip')) {
    Store.showUserMenu = false;
  }
});
