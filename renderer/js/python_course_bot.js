// 使用 IIFE 避免全域變數衝突
(function() {
    'use strict';
    
    const { spawn, execFile } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const { ipcRenderer } = require('electron');

/**
 * Python yzuCourseBot 整合服務
 * 基於 py/yzuCourseBot.py 提供自動選課功能
 */
class PythonCourseBot {
    constructor() {
        this.pythonPath = null;
        
        // 獲取正確的 Python 檔案路徑
        // Python 檔案位於 renderer/py 目錄中
        let pythonDir;
        
        // 調試：輸出 __dirname 和 process.cwd() 的值
        console.log('🔍 調試路徑信息:');
        console.log('  - __dirname:', typeof __dirname !== 'undefined' ? __dirname : 'undefined');
        console.log('  - process.cwd():', process.cwd());
        
        if (typeof __dirname !== 'undefined') {
            if (__dirname.includes('renderer/js')) {
                // __dirname 指向 renderer/js，所以 py 目錄在 ../py
                pythonDir = path.join(__dirname, '../py');
                console.log('  - 使用 renderer/js 路徑邏輯');
            } else if (__dirname.endsWith('renderer')) {
                // __dirname 指向 renderer 目錄，所以 py 目錄在 ./py
                pythonDir = path.join(__dirname, 'py');
                console.log('  - 使用 renderer 目錄路徑邏輯');
            } else {
                // __dirname 可能指向專案根目錄，需要指向 renderer/py
                pythonDir = path.join(__dirname, 'renderer/py');
                console.log('  - 使用專案根目錄路徑邏輯');
            }
        } else {
            // 如果沒有 __dirname，使用 process.cwd() 並假設在 renderer/py
            pythonDir = path.join(process.cwd(), 'renderer/py');
            console.log('  - 使用 process.cwd() 路徑邏輯');
        }
        
        this.botScriptPath = path.join(pythonDir, 'yzuCourseBot.py');
        this.modelPath = path.join(pythonDir, 'model.h5');
        this.requirementsPath = path.join(pythonDir, 'requirements.txt');
        this.accountsPath = path.join(pythonDir, 'accounts.ini');
        this.isRunning = false;
        this.currentProcess = null;
        
        // 調試：輸出實際路徑
        console.log('🐍 Python 檔案路徑 (Python 目錄:', pythonDir, '):');
        console.log('  - Bot Script:', this.botScriptPath);
        console.log('  - Model:', this.modelPath);
        console.log('  - Requirements:', this.requirementsPath);
        console.log('  - Accounts:', this.accountsPath);
    }

    /**
     * 初始化 Python 環境
     */
    async initialize() {
        console.log("🐍 初始化 Python yzuCourseBot 環境...");
        
        try {
            // 1. 檢查 Python 可用性
            await this.checkPythonInstallation();
            
            // 2. 檢查必要檔案
            await this.checkRequiredFiles();
            
            // 3. 檢查 Python 套件
            await this.checkPythonPackages();
            
            console.log("✅ Python yzuCourseBot 環境初始化完成");
            return { success: true, message: "Python 環境就緒" };
            
        } catch (error) {
            console.error("❌ Python yzuCourseBot 初始化失敗:", error.message);
            return { success: false, message: error.message };
        }
    }

    /**
     * 檢查 Python 安裝狀況
     */
    async checkPythonInstallation() {
        const pythonCommands = ['python', 'python3', 'py'];
        
        for (const cmd of pythonCommands) {
            try {
                const version = await this.runCommand(cmd, ['--version']);
                if (version.includes('Python 3.')) {
                    this.pythonPath = cmd;
                    console.log(`✅ 找到 Python: ${cmd} (${version.trim()})`);
                    return;
                }
            } catch (error) {
                console.log(`⚠️ ${cmd} 不可用: ${error.message}`);
            }
        }
        
        throw new Error("找不到 Python 3.x 安裝。請安裝 Python 3.12+ 並確保加入 PATH");
    }

    /**
     * 檢查必要檔案
     */
    async checkRequiredFiles() {
        const requiredFiles = [
            { path: this.botScriptPath, name: 'yzuCourseBot.py' },
            { path: this.modelPath, name: '驗證碼識別模型 model.h5' },
            { path: this.requirementsPath, name: 'requirements.txt' }
        ];
        
        for (const file of requiredFiles) {
            if (!fs.existsSync(file.path)) {
                throw new Error(`缺少必要檔案: ${file.name} (${file.path})`);
            }
        }
        
        console.log("✅ 所有必要檔案檢查完成");
    }

    /**
     * 檢查並安裝 Python 套件
     */
    async checkPythonPackages() {
        console.log("📦 檢查 Python 套件...");
        
        try {
            // 嘗試 import 主要套件
            const testScript = `
import sys
try:
    import tensorflow as tf
    import cv2
    import numpy as np
    import requests
    import bs4
    import configparser
    print("SUCCESS: All packages available")
except ImportError as e:
    print(f"MISSING: {e}")
    sys.exit(1)
`;
            
            const result = await this.runCommand(this.pythonPath, ['-c', testScript]);
            
            if (result.includes('SUCCESS')) {
                console.log("✅ Python 套件檢查完成");
            } else {
                console.log("📦 安裝缺少的套件...");
                await this.installPythonPackages();
            }
            
        } catch (error) {
            console.log("📦 Python 套件不完整，開始安裝...");
            await this.installPythonPackages();
        }
    }

    /**
     * 安裝 Python 套件
     */
    async installPythonPackages() {
        console.log("📦 安裝 yzuCourseBot 相依套件...");
        
        try {
            const installResult = await this.runCommand(this.pythonPath, [
                '-m', 'pip', 'install', '-r', this.requirementsPath, '--user'
            ], { timeout: 300000 }); // 5分鐘超時
            
            console.log("✅ Python 套件安裝完成");
            console.log(installResult);
            
        } catch (error) {
            throw new Error(`Python 套件安裝失敗: ${error.message}\n\n請手動執行：\n${this.pythonPath} -m pip install -r py/requirements.txt`);
        }
    }

    /**
     * 設定 Portal 帳號密碼
     * @param {string} account - 學號
     * @param {string} password - 密碼
     */
    async setupAccount(account, password) {
        console.log("🔐 設定 Portal 帳號...");
        
        const accountsConfig = `[Default]
Account=${account}
Password=${password}`;
        
        try {
            fs.writeFileSync(this.accountsPath, accountsConfig, 'utf8');
            console.log("✅ 帳號設定完成");
            return { success: true };
        } catch (error) {
            console.error("❌ 帳號設定失敗:", error.message);
            return { success: false, message: error.message };
        }
    }

    /**
     * 設定選課清單
     * @param {Array} coursesList - 課程清單，格式: [{ deptId, courseId, classId }, ...]
     */
    async setupCoursesList(coursesList) {
        console.log("📝 設定選課清單...");
        
        try {
            // 讀取 Python 檔案內容
            let pythonContent = fs.readFileSync(this.botScriptPath, 'utf8');
            
            // 轉換課程格式：{ deptId: "304", courseId: "CS352", classId: "A" } => "304,CS352A"
            const formattedCourses = coursesList.map(course => {
                return `'${course.deptId},${course.courseId}${course.classId}'`;
            });
            
            // 更新 coursesList 變數
            const coursesListPattern = /coursesList\s*=\s*\[[^\]]*\]/;
            const newCoursesList = `coursesList = [
        ${formattedCourses.join(',\n        ')}
    ]`;
            
            if (coursesListPattern.test(pythonContent)) {
                pythonContent = pythonContent.replace(coursesListPattern, newCoursesList);
            } else {
                // 如果找不到現有的 coursesList，在 if __name__ == '__main__': 之前插入
                const insertPoint = pythonContent.indexOf("if __name__ == '__main__':");
                if (insertPoint !== -1) {
                    pythonContent = pythonContent.slice(0, insertPoint) + 
                                  `# 自動選課清單\n${newCoursesList}\n\n` + 
                                  pythonContent.slice(insertPoint);
                }
            }
            
            // 寫回檔案
            fs.writeFileSync(this.botScriptPath, pythonContent, 'utf8');
            
            console.log(`✅ 已設定 ${coursesList.length} 門課程`);
            return { success: true, coursesCount: coursesList.length };
            
        } catch (error) {
            console.error("❌ 設定選課清單失敗:", error.message);
            return { success: false, message: error.message };
        }
    }

    /**
     * 開始自動選課
     * @param {Object} options - 選項 { delay: 2.5, maxAttempts: 100 }
     */
    async startCourseSelection(options = {}) {
        if (this.isRunning) {
            return { success: false, message: "選課機器人已在執行中" };
        }
        
        console.log("🚀 啟動 Python 自動選課機器人...");
        
        const { delay = 2.5, maxAttempts = 100 } = options;
        
        try {
            // 更新延遲時間設定
            await this.updateDelaySettings(delay);
            
            // 啟動 Python 程序
            this.currentProcess = spawn(this.pythonPath, ['-u', this.botScriptPath], {
                cwd: path.dirname(this.botScriptPath),
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUTF8: '1',
                    PYTHONUNBUFFERED: '1'  // 禁用 Python 輸出緩衝
                }
            });
            
            this.isRunning = true;
            
            // 監聽輸出
            this.currentProcess.stdout.on('data', (data) => {
                const output = data.toString('utf8');
                console.log('🐍 Python 輸出:', output);
                
                // 傳送輸出到前端
                ipcRenderer.send('pythonBotOutput', {
                    type: 'stdout',
                    message: output,
                    timestamp: new Date().toISOString()
                });
                
                // 解析重要訊息
                if (output.includes('Login Successful!')) {
                    ipcRenderer.send('pythonBotStatus', { status: 'logged_in', message: '登入成功' });
                } else if (output.includes('加選訊息：')) {
                    const courseMatch = output.match(/(\w+\s+\w+)\s+加選訊息：(.+)/);
                    if (courseMatch) {
                        ipcRenderer.send('pythonBotStatus', { 
                            status: 'course_selected', 
                            course: courseMatch[1],
                            message: courseMatch[2]
                        });
                    }
                }
            });
            
            this.currentProcess.stderr.on('data', (data) => {
                const error = data.toString('utf8');
                console.error('🐍 Python 錯誤:', error);
                
                ipcRenderer.send('pythonBotOutput', {
                    type: 'stderr',
                    message: error,
                    timestamp: new Date().toISOString()
                });
            });
            
            this.currentProcess.on('close', (code) => {
                console.log(`🐍 Python 程序結束，退出碼: ${code}`);
                this.isRunning = false;
                this.currentProcess = null;
                
                ipcRenderer.send('pythonBotStatus', { 
                    status: 'stopped', 
                    message: `程序結束 (退出碼: ${code})`,
                    exitCode: code
                });
            });
            
            console.log("✅ Python 自動選課機器人已啟動");
            return { 
                success: true, 
                message: "自動選課機器人已啟動",
                pid: this.currentProcess.pid
            };
            
        } catch (error) {
            this.isRunning = false;
            this.currentProcess = null;
            console.error("❌ 啟動選課機器人失敗:", error.message);
            return { success: false, message: error.message };
        }
    }

    /**
     * 停止自動選課
     */
    async stopCourseSelection() {
        if (!this.isRunning || !this.currentProcess) {
            return { success: true, message: "選課機器人未在執行中" };
        }
        
        console.log("⏹️ 停止 Python 自動選課機器人...");
        
        try {
            // 嘗試優雅地結束程序
            this.currentProcess.kill('SIGTERM');
            
            // 等待 3 秒，如果還沒結束就強制終止
            setTimeout(() => {
                if (this.currentProcess && !this.currentProcess.killed) {
                    console.log("🔥 強制終止 Python 程序");
                    this.currentProcess.kill('SIGKILL');
                }
            }, 3000);
            
            this.isRunning = false;
            
            console.log("✅ Python 自動選課機器人已停止");
            return { success: true, message: "選課機器人已停止" };
            
        } catch (error) {
            console.error("❌ 停止選課機器人失敗:", error.message);
            return { success: false, message: error.message };
        }
    }

    /**
     * 獲取機器人狀態
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            pythonPath: this.pythonPath,
            pid: this.currentProcess ? this.currentProcess.pid : null,
            hasModel: fs.existsSync(this.modelPath),
            hasAccounts: fs.existsSync(this.accountsPath)
        };
    }

    /**
     * 更新延遲設定
     */
    async updateDelaySettings(delay) {
        try {
            let pythonContent = fs.readFileSync(this.botScriptPath, 'utf8');
            
            // 更新 delay 變數
            const delayPattern = /delay\s*=\s*[\d.]+/;
            const newDelay = `delay = ${delay}`;
            
            if (delayPattern.test(pythonContent)) {
                pythonContent = pythonContent.replace(delayPattern, newDelay);
            } else {
                // 在 depts = 之前插入 delay 設定
                const deptsIndex = pythonContent.indexOf('depts = set([');
                if (deptsIndex !== -1) {
                    pythonContent = pythonContent.slice(0, deptsIndex) + 
                                  `    # Time Parameter, sleep n seconds\n    ${newDelay}\n    \n    ` + 
                                  pythonContent.slice(deptsIndex);
                }
            }
            
            fs.writeFileSync(this.botScriptPath, pythonContent, 'utf8');
            console.log(`✅ 已更新延遲設定: ${delay} 秒`);
            
        } catch (error) {
            console.warn("⚠️ 更新延遲設定失敗:", error.message);
        }
    }

    /**
     * 執行命令行程序
     */
    runCommand(command, args, options = {}) {
        return new Promise((resolve, reject) => {
            const { timeout = 30000 } = options;
            
            const process = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            process.stdout.on('data', (data) => {
                stdout += data.toString('utf8');
            });
            
            process.stderr.on('data', (data) => {
                stderr += data.toString('utf8');
            });
            
            const timer = setTimeout(() => {
                process.kill();
                reject(new Error('命令執行超時'));
            }, timeout);
            
            process.on('close', (code) => {
                clearTimeout(timer);
                
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(stderr || `程序退出碼: ${code}`));
                }
            });
            
            process.on('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
}

    // 將類別暴露到全域作用域
    window.PythonCourseBot = PythonCourseBot;
    
    // 同時支援 CommonJS 模組系統
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { PythonCourseBot };
    }
})();