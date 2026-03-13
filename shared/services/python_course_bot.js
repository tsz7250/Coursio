/**
 * python_course_bot.js — 薄層 IPC 代理
 *
 * 所有繁重的 Python 管理邏輯已移至主程序 (main_ipc.js)。
 * Renderer 透過 window.electronAPI.pythonBot.* 呼叫 IPC 以存取所有功能。
 * 此檔案的作用是維持與 course_selection_controller.js 的 API 相容性。
 */
/**
 * Python yzuCourseBot IPC 代理
 * 將所有方法轉發至主程序透過 window.electronAPI.pythonBot.*
 */
export class PythonCourseBot {
    constructor() {
        // pythonPath 由 initialize() 的回傳值更新，供 UI 顯示使用
        this.pythonPath = null;
        this.isInitialized = false;

        // 快取最近一次的 bot 狀態（供 getStatus() 同步讀取）
        this._cachedStatus = {
            hasPythonPath: false,
            hasAccounts: false,
            isRunning: false,
            pythonPath: null
        };

        // 訂閱狀態更新以保持本地快取同步
        try {
            window.electronAPI.pythonBot.onStatus((data) => {
                if (data && typeof data === 'object') {
                    this._cachedStatus = Object.assign(this._cachedStatus, data);
                }
            });
        } catch { /* 忽略 */ }
    }

    /**
     * 初始化 Python 環境（呼叫主程序檢查/安裝）
     */
    async initialize() {
        if (this.isInitialized) {
            return { success: true, message: 'Python 環境已初始化' };
        }
        try {
            const result = await window.electronAPI.pythonBot.initialize();
            if (result && result.success) {
                this.isInitialized = true;
                this.pythonPath = result.pythonPath || 'python';
                this._cachedStatus.hasPythonPath = true;
                this._cachedStatus.pythonPath = this.pythonPath;
            }
            return result;
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * 重置初始化狀態（下次 initialize() 將重新執行）
     */
    async resetInitialization() {
        this.isInitialized = false;
        this.pythonPath = null;
        this._cachedStatus.hasPythonPath = false;
        try {
            await window.electronAPI.pythonBot.resetInit();
        } catch { /* 忽略 */ }
    }

    /**
     * 取得目前 bot 狀態（同步，使用本地快取）
     */
    getStatus() {
        return Object.assign({}, this._cachedStatus);
    }

    /**
     * 設定 Portal 帳號和密碼（寫入 config.ini，作為唯一憑證來源）
     */
    async setupAccount(account, password) {
        try {
            const success = await window.electronAPI.config.writeAccounts({ account, password, rememberMe: true });
            if (success) {
                this._cachedStatus.hasAccounts = true;
            }
            return { success: !!success };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * 從資料庫載入選課任務
     */
    async loadCoursesFromDatabase() {
        try {
            return await window.electronAPI.pythonBot.loadCourses();
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * 啟動自動選課
     */
    async startCourseSelection(options) {
        try {
            const result = await window.electronAPI.pythonBot.start(options);
            if (result && result.success) {
                this._cachedStatus.isRunning = true;
            }
            return result;
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * 停止自動選課
     */
    async stopCourseSelection() {
        try {
            const result = await window.electronAPI.pythonBot.stop();
            if (result) {
                this._cachedStatus.isRunning = false;
            }
            return result;
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
}


