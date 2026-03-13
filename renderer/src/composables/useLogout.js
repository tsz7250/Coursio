/**
 * useLogout.js — M-06: 統一登出邏輯 composable
 * 各頁面不再各自實作 logout()，改由此 composable 提供。
 */
import { useRouter } from 'vue-router';
import { Store } from '../store.js';

export function useLogout() {
    const router = useRouter();

    function logout() {
        Store.isLoggedIn = false;
        Store.sid = '';
        Store.spwd = '';
        Store.courseScheduleData = null;
        Store.showUserMenu = false;
        router.push({ name: 'Main' });
    }

    return { logout };
}
