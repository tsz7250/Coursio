// 使用 IIFE 避免全域變數衝突
(function() {
    'use strict';
    
    // 使用全域的 PythonCourseBot 類別
    const PythonCourseBot = window.PythonCourseBot;

/**
 * 自動選課介面控制器
 * 管理 Python yzuCourseBot 整合和 UI 互動
 */
class CourseSelectionController {
    constructor() {
        this.pythonBot = new PythonCourseBot();
        this.isInitialized = false;
        this.initializeUI();
    }

    /**
     * 初始化 UI 事件監聽
     */
    initializeUI() {
        // 等待 DOM 載入完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.bindEvents());
        } else {
            this.bindEvents();
        }
    }

    /**
     * 綁定 UI 事件
     */
    bindEvents() {
        // 環境檢查
        const checkEnvBtn = document.getElementById('checkEnvironmentBtn');
        if (checkEnvBtn) {
            checkEnvBtn.addEventListener('click', () => this.checkEnvironment(true)); // 強制重新檢查
        }

        // 帳號設定
        const saveAccountBtn = document.getElementById('saveAccountBtn');
        if (saveAccountBtn) {
            saveAccountBtn.addEventListener('click', () => this.saveAccount());
        }

        // 任務列表管理
        const refreshTaskListBtn = document.getElementById('refreshTaskListBtn');
        if (refreshTaskListBtn) {
            refreshTaskListBtn.addEventListener('click', () => this.refreshTaskList());
        }
        
        const clearCompletedBtn = document.getElementById('clearCompletedBtn');
        if (clearCompletedBtn) {
            clearCompletedBtn.addEventListener('click', () => this.clearCompletedTasks());
        }

        // 機器人控制
        const startBotBtn = document.getElementById('startBotBtn');
        if (startBotBtn) {
            startBotBtn.addEventListener('click', () => this.startBot());
        }

        const stopBotBtn = document.getElementById('stopBotBtn');
        if (stopBotBtn) {
            stopBotBtn.addEventListener('click', () => this.stopBot());
        }

        // 輸出控制
        const clearOutputBtn = document.getElementById('clearOutputBtn');
        if (clearOutputBtn) {
            clearOutputBtn.addEventListener('click', () => this.clearOutput());
        }

        // IPC 監聽（透過 contextBridge）
        window.electronAPI.pythonBot.onOutput((data) => {
            this.appendOutput(data.type, data.message, data.timestamp);
        });

        window.electronAPI.pythonBot.onStatus((data) => {
            this.updateBotStatus(data);
        });
    }

    /**
     * 檢查 Python 環境 (優化版本)
     */
    async checkEnvironment(forceRefresh = false) {
        // 防止重複檢查
        if (this.isInitialized && !forceRefresh) {
            return;
        }

        // 如果強制重新檢查，重置初始化狀態
        if (forceRefresh) {
            this.pythonBot.resetInitialization();
            this.isInitialized = false;
        }

        // 並行更新所有狀態為載入中
        this.updateAllStatuses('loading', [
            { id: 'pythonStatus', text: '檢查 Python 安裝...' },
            { id: 'packagesStatus', text: '檢查 Python 套件...' },
            { id: 'modelStatus', text: '檢查 AI 模型檔案...' },
            { id: 'accountStatus', text: '檢查帳號設定...' }
        ]);

        const startTime = Date.now();

        try {
            const result = await this.pythonBot.initialize();
            
            if (result.success) {
                // 並行更新所有成功狀態
                this.updateAllStatuses('success', [
                    { id: 'pythonStatus', text: `Python 可用: ${this.pythonBot.pythonPath}` },
                    { id: 'packagesStatus', text: '所有套件已安裝' },
                    { id: 'modelStatus', text: 'AI 模型檔案存在' }
                ]);
                
                // 檢查帳號設定
                const status = this.pythonBot.getStatus();
                if (status.hasAccounts) {
                    this.updateStatus('accountStatus', 'success', '帳號已設定');
                } else {
                    this.updateStatus('accountStatus', 'warning', '需要設定帳號');
                }

                this.isInitialized = true;
                const duration = Date.now() - startTime;
                this.appendOutput('system', `✅ Python yzuCourseBot 環境檢查完成 (${duration}ms)，可以開始使用`);
                
                // 自動載入任務列表
                this.refreshTaskList();
                
            } else {
                this.updateStatus('pythonStatus', 'error', result.message);
                this.appendOutput('system', `❌ 環境檢查失敗: ${result.message}`);
            }

        } catch (error) {
            console.error("環境檢查失敗:", error);
            this.updateStatus('pythonStatus', 'error', '環境檢查失敗');
            this.appendOutput('system', `❌ 環境檢查異常: ${error.message}`);
        }
    }

    /**
     * 儲存 Portal 帳號設定
     */
    async saveAccount() {
        const accountInput = document.getElementById('portalAccount');
        const passwordInput = document.getElementById('portalPassword');

        if (!accountInput || !passwordInput) return;

        const account = accountInput.value.trim();
        const password = passwordInput.value.trim();

        if (!account || !password) {
            alert('請填入完整的帳號和密碼');
            return;
        }

        try {
            const result = await this.pythonBot.setupAccount(account, password);
            
            if (result.success) {
                this.updateStatus('accountStatus', 'success', '帳號已設定');
                this.appendOutput('system', '✅ Portal 帳號設定完成');
                
                // 清空密碼輸入框（安全考量）
                passwordInput.value = '';
                
            } else {
                this.appendOutput('system', `❌ 帳號設定失敗: ${result.message}`);
            }

        } catch (error) {
            console.error("帳號設定失敗:", error);
            this.appendOutput('system', `❌ 帳號設定異常: ${error.message}`);
        }
    }

    /**
     * 重新載入任務列表
     */
    async refreshTaskList() {
        try {
            const result = await this.pythonBot.loadCoursesFromDatabase();
            
            if (result.success) {
                this.displayTaskList(result.courses);
                this.appendOutput('system', `✅ 已載入 ${result.courses.length} 門待選課程`);
            } else {
                this.displayTaskList([]);
                this.appendOutput('system', `ℹ️ ${result.message}`);
            }
            
        } catch (error) {
            console.error("載入任務列表失敗:", error);
            this.appendOutput('system', `❌ 載入任務列表失敗: ${error.message}`);
        }
    }

    /**
     * 顯示任務列表
     */
    displayTaskList(tasks) {
        const tbody = document.getElementById('taskListBody');
        const taskCount = document.getElementById('taskCount');
        
        if (!tbody || !taskCount) return;

        // 清空現有內容
        tbody.innerHTML = '';
        
        if (tasks.length === 0) {
            tbody.innerHTML = `
                <tr class="bot-task-empty-row">
                    <td colspan="6">
                        <div class="bot-task-empty">
                            <p>尚無待選課程</p>
                            <small>請前往「課程查詢」頁面加入課程</small>
                        </div>
                    </td>
                </tr>
            `;
            taskCount.textContent = '0 門待選';
            return;
        }

        // 顯示任務列表
        tasks.forEach(task => {
            const row = document.createElement('tr');
            row.setAttribute('data-task-id', task.id ?? '');
            const statusText = (s => {
                if (s === 0) return '待選';
                if (s === 1) return '已選到';
                if (s === 2) return '已選過';
                return `狀態 ${s}`;
            })(task.status);
            const statusClass = (s => {
                if (s === 0) return 'status-pending';
                if (s === 1) return 'status-success';
                if (s === 2) return 'status-warning';
                return 'status-info';
            })(task.status);

            row.innerHTML = `
                <td class="course-code">${task.courseId}${task.classId}</td>
                <td class="course-name" title="${task.name}">${task.name}</td>
                <td class="teacher-name">${task.teacher_name ?? '-'}</td>
                <td class="credit">${task.credit ?? '-'}</td>
                <td class="status">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td class="actions">
                    <button class="btn btn-outline btn-small delete-task-btn" data-id="${task.id}">🗑️ 刪除</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // 綁定刪除按鈕事件（事件委派）
        tbody.addEventListener('click', (e) => {
            const target = e.target;
            if (target && target.classList.contains('delete-task-btn')) {
                const id = parseInt(target.getAttribute('data-id'));
                if (!isNaN(id)) {
                    this.deleteTask(id);
                }
            }
        }, { once: true });

        taskCount.textContent = `${tasks.length} 門待選`;
    }

    /**
     * 刪除指定任務
     */
    async deleteTask(id) {
        const confirmFn = window.customConfirm || ((msg) => Promise.resolve(confirm(msg)));
        const confirmed = await confirmFn('確定要刪除此課程嗎？');
        if (!confirmed) return;

        try {
            await window.electronAPI.db.deleteTask(id);
            this.appendOutput('system', `🗑️ 已刪除任務 #${id}`);
            this.refreshTaskList();
        } catch (error) {
            console.error('刪除任務異常:', error);
            this.appendOutput('system', `❌ 刪除異常: ${error.message}`);
        }
    }

    /**
     * 清除已完成的任務
     */
    async clearCompletedTasks() {
        const confirmFn = window.customConfirm || ((msg) => Promise.resolve(confirm(msg)));
        const confirmed = await confirmFn('確定要清除所有已完成的選課任務嗎？');
        if (!confirmed) return;

        try {
            await window.electronAPI.db.clearCompleted();
            this.appendOutput('system', '✅ 已清除所有已完成的任務');
            this.refreshTaskList();
        } catch (error) {
            console.error("清除已完成任務失敗:", error);
            this.appendOutput('system', `❌ 清除失敗: ${error.message}`);
        }
    }

    /**
     * 啟動選課機器人
     */
    async startBot() {
        if (!this.isInitialized) {
            alert('請先完成環境檢查');
            return;
        }

        // 檢查必要設定
        const status = this.pythonBot.getStatus();
        if (!status.hasAccounts) {
            alert('請先設定 Portal 帳號密碼');
            return;
        }

        // 獲取設定
        const delayInput = document.getElementById('selectionDelay');
        const maxAttemptsInput = document.getElementById('maxAttempts');
        
        const delay = delayInput ? parseFloat(delayInput.value) || 2.5 : 2.5;
        let maxAttempts = maxAttemptsInput ? parseInt(maxAttemptsInput.value) : 0;
        if (!Number.isFinite(maxAttempts) || maxAttempts < 0) {
            maxAttempts = 0; // 0 代表無上限
        }

        try {
            this.appendOutput('system', '🚀 正在啟動 Python 自動選課機器人...');
            
            const result = await this.pythonBot.startCourseSelection({ delay, maxAttempts });
            
            if (result.success) {
                this.appendOutput('system', `✅ 選課機器人已啟動 (PID: ${result.pid})`);
                this.updateBotControlUI(true);
            } else {
                this.appendOutput('system', `❌ 啟動失敗: ${result.message}`);
            }

        } catch (error) {
            console.error("啟動機器人失敗:", error);
            this.appendOutput('system', `❌ 啟動異常: ${error.message}`);
        }
    }

    /**
     * 停止選課機器人
     */
    async stopBot() {
        try {
            this.appendOutput('system', '⏹️ 正在停止選課機器人...');
            
            const result = await this.pythonBot.stopCourseSelection();
            
            if (result.success) {
                this.appendOutput('system', '✅ 選課機器人已停止');
                this.updateBotControlUI(false);
            } else {
                this.appendOutput('system', `❌ 停止失敗: ${result.message}`);
            }

        } catch (error) {
            console.error("停止機器人失敗:", error);
            this.appendOutput('system', `❌ 停止異常: ${error.message}`);
        }
    }

    /**
     * 更新機器人控制 UI
     */
    updateBotControlUI(isRunning) {
        const startBtn = document.getElementById('startBotBtn');
        const stopBtn = document.getElementById('stopBotBtn');
        const statusDot = document.querySelector('.status-dot');
        const statusLabel = document.querySelector('.status-label');

        if (startBtn) startBtn.disabled = isRunning;
        if (stopBtn) stopBtn.disabled = !isRunning;
        
        if (statusDot) {
            statusDot.classList.toggle('running', isRunning);
        }
        
        if (statusLabel) {
            statusLabel.textContent = isRunning ? '執行中' : '待機中';
        }
    }

    /**
     * 更新機器人狀態
     */
    updateBotStatus(statusData) {
        const { status, message, course } = statusData;
        
        switch (status) {
            case 'logged_in':
                this.appendOutput('success', '🔐 ' + message);
                break;
            case 'course_selected':
                this.appendOutput('success', `🎯 ${course}: ${message}`);
                break;
            case 'stopped':
                this.appendOutput('system', '⏹️ ' + message);
                this.updateBotControlUI(false);
                break;
            default:
                this.appendOutput('stdout', message);
        }
    }

    /**
     * 更新狀態顯示
     */
    updateStatus(statusId, type, message) {
        const statusItem = document.getElementById(statusId);
        if (!statusItem) return;

        // 新 pill 設計
        const dot        = statusItem.querySelector('.env-pill-dot');
        const statusSpan = statusItem.querySelector('.env-pill-status');

        const dotClasses  = { loading: 'env-pill-dot-pending', success: 'env-pill-dot-ok', warning: 'env-pill-dot-warn', error: 'env-pill-dot-error' };
        const pillClasses = { success: 'env-pill-ok', warning: 'env-pill-warn', error: 'env-pill-error' };

        if (dot) {
            dot.className = `env-pill-dot ${dotClasses[type] || 'env-pill-dot-pending'}`;
        }
        if (statusSpan) statusSpan.textContent = message;

        // 更新 pill container 顏色
        ['env-pill-ok', 'env-pill-warn', 'env-pill-error'].forEach(c => statusItem.classList.remove(c));
        if (pillClasses[type]) statusItem.classList.add(pillClasses[type]);

        // 舊設計向下相容
        const icon = statusItem.querySelector('.status-icon');
        const text = statusItem.querySelector('.status-text');
        const icons = { loading: '⏳', success: '✅', warning: '⚠️', error: '❌' };
        if (icon) icon.textContent = icons[type] || '⏳';
        if (text) text.textContent = message;
    }

    /**
     * 批量更新狀態 (優化版本)
     */
    updateAllStatuses(status, statusList) {
        statusList.forEach(({ id, text }) => {
            this.updateStatus(id, status, text);
        });
    }


    /**
     * 添加輸出訊息
     */
    appendOutput(type, message, timestamp = null) {
        const outputContent = document.getElementById('outputContent');
        if (!outputContent) return;

        const outputItem = document.createElement('div');
        outputItem.className = `output-item ${type}`;

        const time = timestamp ? new Date(timestamp) : new Date();
        const timeStr = time.toLocaleTimeString();

        outputItem.innerHTML = `
            <span class="timestamp">[${timeStr}]</span>
            <span class="message">${message}</span>
        `;

        outputContent.appendChild(outputItem);

        // 自動捲動
        const autoScroll = document.getElementById('autoScrollOutput');
        if (autoScroll && autoScroll.checked) {
            const container = document.getElementById('outputContainer');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }

        // 限制輸出行數（避免記憶體過度使用）
        const maxLines = 500;
        const items = outputContent.querySelectorAll('.output-item');
        if (items.length > maxLines) {
            const excess = items.length - maxLines;
            for (let i = 0; i < excess; i++) {
                items[i].remove();
            }
        }
    }

    /**
     * 清空輸出
     */
    clearOutput() {
        const outputContent = document.getElementById('outputContent');
        if (outputContent) {
            outputContent.innerHTML = `
                <div class="output-item system">
                    <span class="timestamp">[系統]</span>
                    <span class="message">輸出已清空</span>
                </div>
            `;
        }
    }

    /**
     * 載入儲存的設定
     */
    loadSettings() {
        // 這裡可以加載之前儲存的設定
        // 例如課程清單、機器人參數等
    }

    /**
     * 儲存設定
     */
    saveSettings() {
        // 這裡可以儲存當前設定
        // 供下次使用時載入
    }
}

    // 全域實例
    let courseSelectionController = null;

    // 初始化控制器
    document.addEventListener('DOMContentLoaded', () => {
        courseSelectionController = new CourseSelectionController();
    });

    // 將類別暴露到全域作用域
    window.CourseSelectionController = CourseSelectionController;
    
    // 同時支援 CommonJS 模組系統
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { CourseSelectionController };
    }
})();