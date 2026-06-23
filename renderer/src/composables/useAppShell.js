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

        const promise = Store.getCourseList(year, semester).then((data) => {
            if (storeInWindow && data && data.course_list) {
                Store.allCourseList = data.course_list;
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
                Store.allCourseList = [];
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

        Store.getCourseList(year, semester).then(() => {
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

            Store.isShellReady = true;
            setTimeout(() => {
                router.push({ name: 'Main' });
            }, 400);

            isLoading.value = false;
            loading_text.value = '';

            Store.isBackgroundLoadingSchedule = true;
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
                        Store.courseScheduleData = scheduleResult.data;
                    } else {
                        Store.courseScheduleData = null;
                        throw new Error(scheduleResult?.message || '課表載入失敗');
                    }
                })(),
                getCourseListForQuery({ showLoading: false, returnPromise: true, storeInWindow: true })
            ]).then(([scheduleResult]) => {
                Store.isBackgroundLoadingSchedule = false;
                if (scheduleResult.status !== 'fulfilled') {
                    Store.scheduleViewState = 'error';
                } else if (Store.scheduleViewState === 'loading' && (Store.courseScheduleData?.course_list?.length ?? 0) > 0) {
                    Store.scheduleViewState = 'content';
                }
            }).catch(() => {
                Store.isBackgroundLoadingSchedule = false;
                Store.scheduleViewState = 'error';
            });
        } catch (error) {
            console.error('登入失敗:', error);
            isLoading.value = false;
            loading_text.value = '';
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

        Store.isShellReady = true;
        setTimeout(() => {
            router.push({ name: 'CourseQuery' });
        }, 400);

        if (Store.courseList.length === 0 && !isCourseListLoading) getCourseListSilent();
        if (!Store.allCourseList || Store.allCourseList.length === 0) {
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
                const safeTitle = escapeHtml(title || '確認操作');
                const safeMessage = escapeHtml(message);
                overlay.innerHTML = `<div class="custom-confirm-dialog"><div class="custom-confirm-title">${safeTitle}</div><div class="custom-confirm-message">${safeMessage}</div><div class="custom-confirm-actions"><button class="btn btn-outline custom-confirm-cancel">取消</button><button class="btn btn-danger custom-confirm-ok">確定</button></div></div>`;
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

        window.customConflictConfirm = (message, title) => {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'custom-confirm-overlay';
                const safeTitle = escapeHtml(title || '時間衝突警告');
                const safeMessage = escapeHtml(message);
                overlay.innerHTML = `<div class="custom-confirm-dialog"><div class="custom-confirm-title">${safeTitle}</div><div class="custom-confirm-message">${safeMessage}</div><div class="custom-confirm-actions"><button class="btn btn-outline custom-confirm-cancel">取消加入</button><button class="btn btn-primary custom-confirm-keep">同時保留</button><button class="btn btn-danger custom-confirm-replace">替換舊課</button></div></div>`;
                
                // 套用樣式避免違反 CSP
                const dialog = overlay.querySelector('.custom-confirm-dialog');
                if (dialog) dialog.style.maxWidth = '480px';
                
                const actions = overlay.querySelector('.custom-confirm-actions');
                if (actions) {
                    actions.style.display = 'flex';
                    actions.style.gap = '8px';
                    actions.style.justifyContent = 'flex-end';
                    actions.style.marginTop = '20px';
                }
                
                const cancelBtn = overlay.querySelector('.custom-confirm-cancel');
                if (cancelBtn) cancelBtn.style.marginRight = 'auto';

                const prompt = overlay.querySelector('.conflict-prompt');
                if (prompt) {
                    prompt.style.marginTop = '14px';
                    prompt.style.paddingTop = '10px';
                    prompt.style.borderTop = '1px dashed #E2E8F0';
                    prompt.style.fontSize = '12px';
                    prompt.style.color = '#475569';
                    prompt.style.lineHeight = '1.6';
                }

                const subTitle = overlay.querySelector('.conflict-sub-title');
                if (subTitle) {
                    subTitle.style.marginBottom = '10px';
                }

                document.body.appendChild(overlay);
                
                overlay.querySelector('.custom-confirm-replace').addEventListener('click', () => {
                    document.body.removeChild(overlay); resolve('replace');
                });
                overlay.querySelector('.custom-confirm-keep').addEventListener('click', () => {
                    document.body.removeChild(overlay); resolve('keep');
                });
                overlay.querySelector('.custom-confirm-cancel').addEventListener('click', () => {
                    document.body.removeChild(overlay); resolve('cancel');
                });
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) { document.body.removeChild(overlay); resolve('cancel'); }
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
            isLoading.value = false;
            loading_text.value = '';
            showToastError(ev?.detail?.message || '登入失敗');
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

        // ponytail: 移除全域任務清單輪詢，因為 UI 頁面已有載入與事件處理機制

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
