import { ref, reactive } from 'vue';

/**
 * 環境狀態檢查 Composable
 * 負責 Python/套件/模型/帳號的就緒狀態 pills 更新。
 *
 * @param {object} pythonBot - PythonCourseBot 實例
 * @param {function} appendLog - 日誌輸出函式 (from useBotOutputLog)
 */
export function useEnvironmentCheck(pythonBot, appendLog) {
    const envReady = ref(false);
    const envStatuses = reactive({
        python:   { label: 'Python',  statusText: '檢查中...', dotClass: 'env-pill-dot-pending', pillClass: '' },
        packages: { label: '套件',    statusText: '檢查中...', dotClass: 'env-pill-dot-pending', pillClass: '' },
        model:    { label: 'AI 模型', statusText: '檢查中...', dotClass: 'env-pill-dot-pending', pillClass: '' },
        account:  { label: '帳號',    statusText: '檢查中...', dotClass: 'env-pill-dot-pending', pillClass: '' }
    });

    async function checkEnvironment(force = false) {
        if (force) {
            pythonBot.resetInitialization();
            envReady.value = false;
        }

        Object.keys(envStatuses).forEach(k => {
            envStatuses[k].statusText = '檢查中...';
            envStatuses[k].dotClass = 'env-pill-dot-pending';
            envStatuses[k].pillClass = '';
        });

        try {
            const result = await pythonBot.initialize();
            if (result.success) {
                envStatuses.python.statusText = `可用: ${pythonBot.pythonPath}`;
                envStatuses.python.dotClass = 'env-pill-dot-ok';
                envStatuses.python.pillClass = 'env-pill-ok';

                envStatuses.packages.statusText = '已安裝';
                envStatuses.packages.dotClass = 'env-pill-dot-ok';
                envStatuses.packages.pillClass = 'env-pill-ok';

                envStatuses.model.statusText = '存在';
                envStatuses.model.dotClass = 'env-pill-dot-ok';
                envStatuses.model.pillClass = 'env-pill-ok';

                const accountData = await window.electronAPI.config.readAccounts();
                if (accountData && accountData.account && accountData.password) {
                    envStatuses.account.statusText = '已設定';
                    envStatuses.account.dotClass = 'env-pill-dot-ok';
                    envStatuses.account.pillClass = 'env-pill-ok';
                } else {
                    envStatuses.account.statusText = '尚未設定';
                    envStatuses.account.dotClass = 'env-pill-dot-warn';
                    envStatuses.account.pillClass = 'env-pill-warn';
                }
                envReady.value = true;
            } else {
                envStatuses.python.statusText = '錯誤';
                envStatuses.python.dotClass = 'env-pill-dot-error';
                envStatuses.python.pillClass = 'env-pill-error';
                appendLog('error', result.message);
            }
        } catch (err) {
            appendLog('error', '環境檢查異常: ' + err.message);
        }
    }

    return { envReady, envStatuses, checkEnvironment };
}
