const { ipcRenderer } = require('electron');
const { PythonCourseBot } = require('./python_course_bot');

/**
 * 自動選課介面控制器
 * 管理 Python yzuCourseBot 整合和 UI 互動
 */
class CourseSelectionController {
    constructor() {
        this.pythonBot = new PythonCourseBot();
        this.courseList = [];
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
            checkEnvBtn.addEventListener('click', () => this.checkEnvironment());
        }

        // 帳號設定
        const saveAccountBtn = document.getElementById('saveAccountBtn');
        if (saveAccountBtn) {
            saveAccountBtn.addEventListener('click', () => this.saveAccount());
        }

        // 課程清單管理
        const addCourseBtn = document.getElementById('addCourseBtn');
        if (addCourseBtn) {
            addCourseBtn.addEventListener('click', () => this.addCourseItem());
        }

        const saveCourseListBtn = document.getElementById('saveCourseListBtn');
        if (saveCourseListBtn) {
            saveCourseListBtn.addEventListener('click', () => this.saveCourseList());
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

        // IPC 監聽
        ipcRenderer.on('pythonBotOutput', (event, data) => {
            this.appendOutput(data.type, data.message, data.timestamp);
        });

        ipcRenderer.on('pythonBotStatus', (event, data) => {
            this.updateBotStatus(data);
        });

        // 初始化檢查
        setTimeout(() => this.checkEnvironment(), 1000);
    }

    /**
     * 檢查 Python 環境
     */
    async checkEnvironment() {
        console.log("🔍 檢查 Python yzuCourseBot 環境...");

        this.updateStatus('pythonStatus', 'loading', '檢查 Python 安裝...');
        this.updateStatus('packagesStatus', 'loading', '檢查 Python 套件...');
        this.updateStatus('modelStatus', 'loading', '檢查 AI 模型檔案...');
        this.updateStatus('accountStatus', 'loading', '檢查帳號設定...');

        try {
            const result = await this.pythonBot.initialize();
            
            if (result.success) {
                this.updateStatus('pythonStatus', 'success', `Python 可用: ${this.pythonBot.pythonPath}`);
                this.updateStatus('packagesStatus', 'success', '所有套件已安裝');
                this.updateStatus('modelStatus', 'success', 'AI 模型檔案存在');
                
                // 檢查帳號設定
                const status = this.pythonBot.getStatus();
                if (status.hasAccounts) {
                    this.updateStatus('accountStatus', 'success', '帳號已設定');
                } else {
                    this.updateStatus('accountStatus', 'warning', '需要設定帳號');
                }

                this.isInitialized = true;
                this.appendOutput('system', '✅ Python yzuCourseBot 環境檢查完成，可以開始使用');
                
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
     * 新增課程項目
     */
    addCourseItem(courseData = null) {
        const container = document.getElementById('courseListContainer');
        const template = document.querySelector('.course-item-template');
        
        if (!container || !template) return;

        const courseItem = template.cloneNode(true);
        courseItem.style.display = 'block';
        courseItem.classList.remove('course-item-template');
        
        const index = this.courseList.length;
        courseItem.querySelector('.course-item').dataset.courseIndex = index;

        // 填入預設值
        if (courseData) {
            courseItem.querySelector('.dept-id').value = courseData.deptId || '';
            courseItem.querySelector('.course-id').value = courseData.courseId || '';
            courseItem.querySelector('.class-id').value = courseData.classId || '';
        }

        // 綁定事件
        const inputs = courseItem.querySelectorAll('input[type="text"]');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.updateCoursePreview(courseItem));
        });

        const removeBtn = courseItem.querySelector('.remove-course');
        removeBtn.addEventListener('click', () => this.removeCourseItem(courseItem));

        container.appendChild(courseItem);
        
        // 加入到課程列表
        this.courseList.push(courseData || { deptId: '', courseId: '', classId: '' });
        this.updateCoursePreview(courseItem);
        this.updateCourseCount();

        // 聚焦到第一個輸入框
        const firstInput = courseItem.querySelector('.dept-id');
        if (firstInput) firstInput.focus();
    }

    /**
     * 移除課程項目
     */
    removeCourseItem(courseItem) {
        const index = parseInt(courseItem.querySelector('.course-item').dataset.courseIndex);
        this.courseList.splice(index, 1);
        courseItem.remove();
        this.updateCourseCount();
    }

    /**
     * 更新課程預覽
     */
    updateCoursePreview(courseItem) {
        const deptId = courseItem.querySelector('.dept-id').value.trim();
        const courseId = courseItem.querySelector('.course-id').value.trim();
        const classId = courseItem.querySelector('.class-id').value.trim().toUpperCase();
        
        const preview = courseItem.querySelector('.preview-text');
        if (deptId && courseId && classId) {
            preview.textContent = `格式: "${deptId},${courseId}${classId}"`;
            preview.style.color = '#28a745';
        } else {
            preview.textContent = '請填入完整的課程資訊';
            preview.style.color = '#6c757d';
        }

        // 更新課程列表資料
        const index = parseInt(courseItem.querySelector('.course-item').dataset.courseIndex);
        if (this.courseList[index]) {
            this.courseList[index] = { deptId, courseId, classId };
        }
    }

    /**
     * 儲存課程清單
     */
    async saveCourseList() {
        // 過濾出完整的課程
        const validCourses = this.courseList.filter(course => 
            course.deptId && course.courseId && course.classId
        );

        if (validCourses.length === 0) {
            alert('請至少新增一門有效的課程');
            return;
        }

        try {
            const result = await this.pythonBot.setupCoursesList(validCourses);
            
            if (result.success) {
                this.appendOutput('system', `✅ 已儲存 ${result.coursesCount} 門課程到選課清單`);
            } else {
                this.appendOutput('system', `❌ 儲存課程清單失敗: ${result.message}`);
            }

        } catch (error) {
            console.error("儲存課程清單失敗:", error);
            this.appendOutput('system', `❌ 儲存課程清單異常: ${error.message}`);
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

        if (this.courseList.length === 0) {
            alert('請先新增要選的課程');
            return;
        }

        // 獲取設定
        const delayInput = document.getElementById('selectionDelay');
        const maxAttemptsInput = document.getElementById('maxAttempts');
        
        const delay = delayInput ? parseFloat(delayInput.value) || 2.5 : 2.5;
        const maxAttempts = maxAttemptsInput ? parseInt(maxAttemptsInput.value) || 100 : 100;

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

        const icon = statusItem.querySelector('.status-icon');
        const text = statusItem.querySelector('.status-text');

        const icons = {
            loading: '⏳',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        if (icon) icon.textContent = icons[type] || '⏳';
        if (text) text.textContent = message;
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
     * 更新課程數量顯示
     */
    updateCourseCount() {
        const countElement = document.getElementById('courseCount');
        if (countElement) {
            const validCount = this.courseList.filter(course => 
                course.deptId && course.courseId && course.classId
            ).length;
            countElement.textContent = `課程數量: ${validCount}`;
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

module.exports = { CourseSelectionController };