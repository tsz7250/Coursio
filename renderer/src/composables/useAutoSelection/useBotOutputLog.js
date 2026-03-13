import { ref, nextTick } from 'vue';

/**
 * 日誌輸出管理 Composable
 * 負責機器人輸出日誌的儲存、追加、清除與自動捲動。
 */
export function useBotOutputLog() {
    const MAX_LOGS = 500;
    const logs = ref([{ type: 'system', time: new Date().toLocaleTimeString(), message: 'Python yzuCourseBot 已就緒' }]);
    const autoScroll = ref(true);
    const outputContainer = ref(null);

    function appendLog(type, message) {
        logs.value.push({ type, time: new Date().toLocaleTimeString(), message });
        if (logs.value.length > MAX_LOGS) {
            logs.value.splice(0, logs.value.length - MAX_LOGS);
        }
        if (autoScroll.value) {
            nextTick(() => {
                if (outputContainer.value) {
                    outputContainer.value.scrollTop = outputContainer.value.scrollHeight;
                }
            });
        }
    }

    function clearOutput() {
        logs.value = [{ type: 'system', time: new Date().toLocaleTimeString(), message: '輸出已清空' }];
    }

    return { logs, autoScroll, outputContainer, appendLog, clearOutput };
}
