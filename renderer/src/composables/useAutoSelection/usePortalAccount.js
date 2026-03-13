import { ref } from 'vue';

/**
 * Portal 帳號設定 Composable
 * 負責學號/密碼輸入與帳號儲存邏輯。
 *
 * @param {object} pythonBot - PythonCourseBot 實例
 * @param {function} appendLog - 日誌輸出函式 (from useBotOutputLog)
 * @param {object} envStatuses - 環境狀態物件 (from useEnvironmentCheck)
 */
export function usePortalAccount(pythonBot, appendLog, envStatuses) {
    const portalAccount = ref('');
    const portalPassword = ref('');
    const accountSetHint = ref('');

    async function saveAccount() {
        if (!portalAccount.value || !portalPassword.value) {
            alert('請填入完整的帳號和密碼');
            return;
        }
        try {
            const result = await pythonBot.setupAccount(portalAccount.value, portalPassword.value);
            if (result.success) {
                envStatuses.account.statusText = '已設定';
                envStatuses.account.dotClass = 'env-pill-dot-ok';
                envStatuses.account.pillClass = 'env-pill-ok';
                appendLog('system', '✅ Portal 帳號設定完成');
                portalPassword.value = '';
            } else {
                appendLog('error', '❌ 帳號設定失敗: ' + result.message);
            }
        } catch (err) {
            appendLog('error', '帳號設定異常: ' + err.message);
        }
    }

    return { portalAccount, portalPassword, accountSetHint, saveAccount };
}
