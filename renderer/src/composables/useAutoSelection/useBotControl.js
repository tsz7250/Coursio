import { ref, onBeforeUnmount } from 'vue';

/**
 * 機器人控制 Composable
 * 負責任務列表管理、機器人啟停、IPC 事件綁定。
 *
 * @param {object} pythonBot - PythonCourseBot 實例
 * @param {function} appendLog - 日誌輸出函式 (from useBotOutputLog)
 * @param {object} envReadyRef - envReady ref (from useEnvironmentCheck)
 */
export function useBotControl(pythonBot, appendLog, envReadyRef) {
    const taskList = ref([]);
    const selectionDelay = ref(2.5);
    const maxAttempts = ref(0);
    const isRunning = ref(false);
    const botStatusSub = ref('等待啟動指令');

    async function loadTaskList() {
        try {
            const result = await pythonBot.loadCoursesFromDatabase();
            if (result.success) {
                taskList.value = result.courses || [];
            }
        } catch (err) {
            console.error('載入任務失敗:', err);
        }
    }

    async function startBot() {
        if (!envReadyRef.value) return;
        try {
            const result = await pythonBot.startCourseSelection({
                delay: selectionDelay.value,
                maxAttempts: maxAttempts.value
            });
            if (result.success) {
                appendLog('system', '🚀 機器人已啟動 (PID: ' + result.pid + ')');
                isRunning.value = true;
                botStatusSub.value = '登入中...';
            } else {
                appendLog('error', '啟動失敗: ' + result.message);
            }
        } catch (err) {
            appendLog('error', '啟動異常: ' + err.message);
        }
    }

    async function stopBot() {
        try {
            const result = await pythonBot.stopCourseSelection();
            if (result.success) {
                appendLog('system', '⏹️ 選課機器人已停止');
                isRunning.value = false;
                botStatusSub.value = '等待啟動指令';
            }
        } catch (err) {
            appendLog('error', '停止異常: ' + err.message);
        }
    }

    async function deleteTask(id) {
        if (!confirm('確定要刪除此課程嗎？')) return;
        try {
            await window.electronAPI.db.deleteTask(id);
            appendLog('system', `🗑️ 已刪除任務 #${id}`);
            loadTaskList();
        } catch (err) {
            appendLog('error', '刪除失敗: ' + err.message);
        }
    }

    async function clearCompletedTasks() {
        if (!confirm('確定要清除所有已完成的任務嗎？')) return;
        try {
            await window.electronAPI.db.clearCompleted();
            appendLog('system', '✅ 已清除所有已完成的任務');
            loadTaskList();
        } catch (err) {
            appendLog('error', '清除失敗: ' + err.message);
        }
    }

    // IPC 監聽 — 綁定後在 unmount 時自動解綁
    const unbindOutput = window.electronAPI.pythonBot.onOutput((data) => {
        appendLog(data.type || 'stdout', data.message);
    });

    const unbindStatus = window.electronAPI.pythonBot.onStatus((data) => {
        if (data.status === 'starting') botStatusSub.value = data.message || '登入中...';
        if (data.status === 'login_retry') botStatusSub.value = '登入重試中...';
        if (data.status === 'logged_in') botStatusSub.value = '執行中: ' + data.message;
        if (data.status === 'course_selected') botStatusSub.value = '執行中: 持續選課中';
        if (data.status === 'stopped') {
            isRunning.value = false;
            botStatusSub.value = '已停止: ' + data.message;
        }
    });

    // 某些情況只會有 stdout/stderr，提供狀態 fallback，避免 UI 長時間停在「登入中...」
    const loginRetryPattern = /Login\s*Failed|登入過程發生錯誤|重試|選課系統尚未開放/i;
    const loggedInPattern = /Login\s*Successful|登入成功/i;
    const courseLoopPattern = /加選訊息：|已選過/i;

    const unbindOutputStatusFallback = window.electronAPI.pythonBot.onOutput((data) => {
        const message = String(data?.message || '');
        if (loggedInPattern.test(message)) {
            botStatusSub.value = '執行中: 登入成功';
            return;
        }
        if (loginRetryPattern.test(message)) {
            botStatusSub.value = '登入重試中...';
            return;
        }
        if (courseLoopPattern.test(message)) {
            botStatusSub.value = '執行中: 持續選課中';
        }
    });

    onBeforeUnmount(() => {
        if (typeof unbindOutput === 'function') unbindOutput();
        if (typeof unbindStatus === 'function') unbindStatus();
        if (typeof unbindOutputStatusFallback === 'function') unbindOutputStatusFallback();
    });

    return { taskList, selectionDelay, maxAttempts, isRunning, botStatusSub, loadTaskList, startBot, stopBot, deleteTask, clearCompletedTasks };
}
