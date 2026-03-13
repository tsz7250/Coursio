import { ref, computed, onMounted, nextTick } from 'vue';
import { Store, year_now, filterSemesterListForTime } from '../store.js';

export function useAppShell(router) {
    let isCourseListLoading = false;

    const sid = ref('');
    const spwd = ref('');
    const rememberMe = ref(false);

    const isLoggedIn = computed({
        get: () => Store.isLoggedIn,
        set: (v) => { Store.isLoggedIn = v; }
    });
    const isLoading = computed({
        get: () => Store.isLoading,
        set: (v) => { Store.isLoading = v; }
    });
    const loading_text = computed({
        get: () => Store.loadingText,
        set: (v) => { Store.loadingText = v; }
    });

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showToastError(message, title = '登入失敗') {
        const html = `<span class="toast-error-content"><i class="fas fa-exclamation-circle toast-error-icon"></i><strong class="toast-error-title">${escapeHtml(title)}</strong><span class="toast-error-message">${escapeHtml(message)}</span></span>`;
        if (typeof M !== 'undefined' && M?.toast) {
            M.toast({ html, displayLength: 4000, classes: 'red darken-2 rounded login-error-toast' });
        } else {
            alert(`${title}：${message}`);
        }
    }

    function getCourseListForQuery(options = {}) {
        const { showLoading = true, returnPromise = false, storeInWindow = false } = options;
        if (showLoading && isCourseListLoading) return returnPromise ? Promise.resolve() : undefined;
        if (showLoading) {
            isCourseListLoading = true;
            Store.isCourseDataLoading = true;
        }

        const year = year_now;
        const semester = new Date().getMonth() >= 7 ? '1' : '2';

        const promise = window.electronAPI.backend.getCourseList(`${year}`, semester).then((data) => {
            if (storeInWindow) {
                window.allCourseList = data.course_list;
            } else {
                Store.courseList = data.course_list;
            }
            if (data.dept_list && Array.isArray(data.dept_list)) Store.deptList = data.dept_list;
            if (data.semester_list && Array.isArray(data.semester_list)) {
                Store.semesterListForTime = filterSemesterListForTime(data.semester_list);
            }
            if (showLoading) {
                isCourseListLoading = false;
                Store.isCourseDataLoading = false;
            }
        }).catch((error) => {
            if (showLoading) {
                isCourseListLoading = false;
                Store.isCourseDataLoading = false;
            }
            if (storeInWindow) {
                console.error('全校課程資料載入失敗:', error);
                window.allCourseList = [];
            } else {
                console.error('課程資料載入失敗:', error);
            }
        });

        return returnPromise ? promise : undefined;
    }

    function getCourseListSilent() {
        if (isCourseListLoading || Store.courseList.length > 0) return;
        isCourseListLoading = true;
        Store.isCourseDataLoading = true;

        const year = year_now;
        const semester = new Date().getMonth() >= 7 ? '1' : '2';

        window.electronAPI.backend.getCourseList(`${year}`, semester).then((data) => {
            Store.courseList = data.course_list;
            if (data.dept_list && Array.isArray(data.dept_list)) Store.deptList = data.dept_list;
            if (data.semester_list && Array.isArray(data.semester_list)) {
                Store.semesterListForTime = filterSemesterListForTime(data.semester_list);
            }
            isCourseListLoading = false;
            Store.isCourseDataLoading = false;
        }).catch((error) => {
            isCourseListLoading = false;
            Store.isCourseDataLoading = false;
            console.error('靜默載入課程資料失敗:', error);
        });
    }

    function loadInitialCourseOptions() {
        if (isCourseListLoading || (Store.deptList.length > 0 && Store.semesterListForTime.length > 0)) return;
        isCourseListLoading = true;

        const year = year_now;
        const semester = new Date().getMonth() >= 7 ? '1' : '2';

        window.electronAPI.backend.getCourseList(`${year}`, semester).then((data) => {
            if (data.dept_list && Array.isArray(data.dept_list)) Store.deptList = data.dept_list;
            if (data.semester_list && Array.isArray(data.semester_list)) {
                Store.semesterListForTime = filterSemesterListForTime(data.semester_list);
            }
            isCourseListLoading = false;
        }).catch((error) => {
            isCourseListLoading = false;
            console.error('系所和學期選項載入失敗:', error);
        });
    }

    async function login() {
        if (isLoading.value) return;

        if (!sid.value || !spwd.value) {
            alert('請輸入學號和密碼');
            return;
        }

        loading_text.value = '正在驗證帳號密碼...';
        isLoading.value = true;

        const loadingPanel = document.getElementById('loading-panel');
        if (loadingPanel) {
            loadingPanel.style.cssText = `position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; z-index: 2000 !important; background: #ffffff !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 24px !important; transition: opacity 0.3s ease-in-out !important;`;
        }

        let cleanupProgress = null;
        try {
            cleanupProgress = window.electronAPI.puppeteer.onProgress((step) => {
                loading_text.value = step;
            });
        } catch {
            // ignore
        }

        try {
            await window.electronAPI.backend.setSidSpwd(sid.value, spwd.value);

            loading_text.value = '驗證帳密中...';
            const loginResult = await window.electronAPI.puppeteer.login(sid.value, spwd.value);
            if (!loginResult?.success) throw new Error(loginResult?.message || '登入失敗');

            loading_text.value = '登入成功，正在載入資料...';
            isLoggedIn.value = true;
            Store.sid = sid.value;
            Store.spwd = spwd.value;

            try {
                if (rememberMe.value) {
                    await window.electronAPI.config.writeAccounts({ account: sid.value, password: spwd.value, rememberMe: true });
                } else {
                    await window.electronAPI.config.writeAccounts({ account: '', password: '', rememberMe: false });
                }
            } catch {
                // ignore
            }

            const loginPanel = document.querySelector('.login-panel');
            const contentPanel = document.querySelector('.content-panel');

            contentPanel.style.display = 'flex';
            contentPanel.style.opacity = '0';
            contentPanel.style.transition = 'opacity 0.3s ease-in-out';
            loginPanel.classList.add('slide-up');

            setTimeout(() => {
                contentPanel.style.opacity = '1';
                router.push({ name: 'Main' });
            }, 400);

            setTimeout(() => {
                loginPanel.style.display = 'none';
                loginPanel.classList.remove('slide-up');
                contentPanel.style.transition = '';
            }, 800);

            if (loadingPanel) {
                isLoading.value = false;
                loading_text.value = '';
                loadingPanel.style.cssText = '';
            }

            window.isBackgroundLoadingSchedule = true;
            Store.isLoadingGradesHistory = true;

            (async () => {
                try {
                    const gradesResult = await window.electronAPI.puppeteer.getGrades({ type: 'history' });
                    if (gradesResult?.success && gradesResult.data) Store.gradesData.history = gradesResult.data;
                    const rankingResult = await window.electronAPI.puppeteer.getGrades({ type: 'ranking' });
                    if (rankingResult?.success && rankingResult.data) Store.gradesData.ranking = rankingResult.data;
                } catch (e) {
                    console.warn('⚠️ 成績背景預載失敗:', e.message);
                } finally {
                    Store.isLoadingGradesHistory = false;
                }
            })();

            Store.scheduleViewState = 'loading';
            Promise.allSettled([
                (async () => {
                    const scheduleResult = await window.electronAPI.puppeteer.getSchedule();
                    if (scheduleResult?.success && scheduleResult.data) {
                        window.courseScheduleData = scheduleResult.data;
                    } else {
                        window.courseScheduleData = null;
                        throw new Error(scheduleResult?.message || '課表載入失敗');
                    }
                })(),
                getCourseListForQuery({ showLoading: false, returnPromise: true, storeInWindow: true })
            ]).then(([scheduleResult]) => {
                window.isBackgroundLoadingSchedule = false;
                if (scheduleResult.status !== 'fulfilled') {
                    Store.scheduleViewState = 'error';
                } else if (Store.scheduleViewState === 'loading' && (Store.courseScheduleData?.course_list?.length ?? 0) > 0) {
                    Store.scheduleViewState = 'content';
                }
            }).catch(() => {
                window.isBackgroundLoadingSchedule = false;
                Store.scheduleViewState = 'error';
            });
        } catch (error) {
            console.error('登入失敗:', error);
            if (loadingPanel) {
                isLoading.value = false;
                loading_text.value = '';
                loadingPanel.style.cssText = '';
            }
            showToastError(error.message || String(error));
        } finally {
            if (cleanupProgress) {
                try { cleanupProgress(); } catch {
                    // ignore
                }
            }
        }
    }

    function browseAsGuest() {
        isLoggedIn.value = false;

        const loginPanel = document.querySelector('.login-panel');
        const contentPanel = document.querySelector('.content-panel');

        contentPanel.style.display = 'flex';
        contentPanel.style.opacity = '0';
        contentPanel.style.transition = 'opacity 0.3s ease-in-out';
        loginPanel.classList.add('slide-up');

        setTimeout(() => {
            contentPanel.style.opacity = '1';
            router.push({ name: 'CourseQuery' });
        }, 400);

        setTimeout(() => {
            loginPanel.style.display = 'none';
            loginPanel.classList.remove('slide-up');
            contentPanel.style.transition = '';
        }, 800);

        if (Store.courseList.length === 0 && !isCourseListLoading) getCourseListSilent();
        if (!window.allCourseList || window.allCourseList.length === 0) {
            getCourseListForQuery({ showLoading: false, returnPromise: true, storeInWindow: true });
        }
    }

    function navigateTo(name) {
        router.push({ name });
    }

    onMounted(async () => {
        window.customConfirm = (message, title) => {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'custom-confirm-overlay';
                overlay.innerHTML = `<div class="custom-confirm-dialog"><div class="custom-confirm-title">${title || '確認操作'}</div><div class="custom-confirm-message">${message}</div><div class="custom-confirm-actions"><button class="btn btn-outline custom-confirm-cancel">取消</button><button class="btn btn-danger custom-confirm-ok">確定</button></div></div>`;
                document.body.appendChild(overlay);
                overlay.querySelector('.custom-confirm-ok').addEventListener('click', () => {
                    document.body.removeChild(overlay); resolve(true);
                });
                overlay.querySelector('.custom-confirm-cancel').addEventListener('click', () => {
                    document.body.removeChild(overlay); resolve(false);
                });
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) { document.body.removeChild(overlay); resolve(false); }
                });
            });
        };

        try {
            const originalAlert = window.alert;
            const originalConfirm = window.confirm;
            function maybeDispatchLoginFailed(message, source) {
                const text = String(message || '');
                if (text.includes('Login Failed') || text.includes('登入失敗')) {
                    window.dispatchEvent(new CustomEvent('yzu:login-failed', { detail: { message: text, source } }));
                }
            }
            window.alert = function () {
                try { maybeDispatchLoginFailed(arguments[0], 'alert'); } catch {
                    // ignore
                }
                return originalAlert.apply(window, arguments);
            };
            window.confirm = function () {
                try { maybeDispatchLoginFailed(arguments[0], 'confirm'); } catch {
                    // ignore
                }
                return originalConfirm.apply(window, arguments);
            };
        } catch {
            // ignore
        }

        window.addEventListener('yzu:login-failed', (ev) => {
            try {
                const loadingPanel = document.getElementById('loading-panel');
                if (loadingPanel) {
                    isLoading.value = false;
                    loading_text.value = '';
                    loadingPanel.style.cssText = '';
                }
                showToastError(ev?.detail?.message || '登入失敗');
            } catch {
                // ignore
            }
        });

        window.electronAPI.settings.read().then((s) => {
            if (s) {
                Store.settings = s;
                Store.stealCourseInterval = s.interval ?? 2;
                Store.stealCourseStage = s.stage ?? '1';
            }
        }).catch(() => {
            // ignore
        });

        try {
            const saved = await window.electronAPI.config.readAccounts();
            if (saved && saved.rememberMe && saved.account) {
                sid.value = saved.account;
                spwd.value = saved.password || '';
                rememberMe.value = true;
            }
        } catch {
            // ignore
        }

        if (!window._dbPollingInterval) {
            window._dbPollingInterval = setInterval(async () => {
                try {
                    const allTasks = await window.electronAPI.db.getAllTasks();
                    Store.tasks = allTasks || [];
                } catch (error) {
                    console.error('輪詢任務列表失敗:', error);
                }
            }, 5000);
        }

        nextTick(() => {
            if (typeof M !== 'undefined' && M?.Modal) {
                const elems = document.querySelectorAll('.modal:not(#about-modal)');
                M.Modal.init(elems, {});
            }
        });

        document.addEventListener('click', (e) => {
            const restricted = e.target?.closest('[data-requires-auth="true"]');
            if (restricted && !isLoggedIn.value) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof M !== 'undefined' && M?.toast) {
                    M.toast({ html: '需登入才能使用此功能', displayLength: 4000, classes: 'auth-toast' });
                } else {
                    alert('需登入才能使用此功能');
                }
                return false;
            }
            return true;
        }, true);

        loadInitialCourseOptions();
        nextTick(() => {
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    });

    return {
        sid,
        spwd,
        rememberMe,
        isLoggedIn,
        isLoading,
        loading_text,
        login,
        browseAsGuest,
        navigateTo
    };
}
