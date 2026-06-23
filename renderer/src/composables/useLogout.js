/**
 * useLogout.js — M-06: 統一登出邏輯 composable
 * 各頁面不再各自實作 logout()，改由此 composable 提供。
 */
import { useRouter } from 'vue-router';
import { Store } from '../store.js';

export function useLogout() {
    const router = useRouter();

    async function logout() {
        Store.isLoggedIn = false;
        Store.isShellReady = false;
        Store.sid = '';
        Store.spwd = '';
        Store.courseScheduleData = null;
        Store.showUserMenu = false;
        try {
            if (window.electronAPI && window.electronAPI.puppeteer && window.electronAPI.puppeteer.cleanup) {
                await window.electronAPI.puppeteer.cleanup();
            }
        } catch (error) {
            console.error('登出清理 Puppeteer 失敗:', error);
        }
        router.push({ name: 'Main' });
    }

    return { logout };
}
