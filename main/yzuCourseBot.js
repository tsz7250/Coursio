const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const configManager = require('./config_manager');

class YzuCourseBot {
    constructor() {
        this.pythonPath = null;
        this.isInitialized = false;
        this.pythonChecked = false;
        this.isRunning = false;
        this.currentProcess = null;
        this.stdoutBuffer = '';

        // Python 檔案路徑（相對於專案根目錄，打包後移至 extraResources 中）
        const { app } = require('electron');
        const pythonDir = app.isPackaged
            ? path.join(process.resourcesPath, 'yzuCourseBot')
            : path.join(__dirname, '..', 'resources', 'yzuCourseBot');
        this.botScriptPath = path.join(pythonDir, 'yzuCourseBot.py');
        this.checkPackagesScriptPath = path.join(pythonDir, 'check_packages.py'); // M-09
        this.modelPath = path.join(pythonDir, 'model.onnx');
        this.requirementsPath = path.join(pythonDir, 'requirements.txt');

        this.dbProvider = null;
    }

    setDbProvider(provider) {
        this.dbProvider = provider;
    }

    _mainWindow = null;
    setMainWindow(win) { this._mainWindow = win; }

    _send(channel, data) {
        if (this._mainWindow && !this._mainWindow.isDestroyed()) {
            this._mainWindow.webContents.send(channel, data);
        }
    }

    async initialize() {
        if (this.isInitialized) return { success: true, message: 'Python 環境已初始化' };
        try {
            await this.checkPythonInstallation();
            const [filesResult, packagesResult] = await Promise.allSettled([
                this.checkRequiredFiles(),
                this.checkPythonPackages()
            ]);
            if (filesResult.status === 'rejected') throw filesResult.reason;
            if (packagesResult.status === 'rejected') throw packagesResult.reason;
            this.isInitialized = true;
            return { success: true, message: 'Python 環境就緒' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async checkPythonInstallation() {
        if (this.pythonChecked) return;
        try {
            const version = await this.runCommand('python', ['--version'], { timeout: 5000 });
            if (version.includes('Python 3.')) {
                this.pythonPath = 'python';
                this.pythonChecked = true;
                return;
            }
        } catch { /* ignore */ }
        throw new Error('找不到 Python 3.x 安裝。請安裝 Python 3.12+ 並確保加入 PATH');
    }

    async checkRequiredFiles() {
        const files = [
            { path: this.botScriptPath, name: 'yzuCourseBot.py' },
            { path: this.modelPath, name: '驗證碼識別模型 model.onnx' },
            { path: this.requirementsPath, name: 'requirements.txt' }
        ];
        await Promise.all(files.map(f =>
            new Promise((resolve, reject) => {
                fs.access(f.path, fs.constants.F_OK, err =>
                    err ? reject(new Error(`缺少必要檔案: ${f.name} (${f.path})`)) : resolve());
            })
        ));
    }

    async checkPythonPackages() {
        if (!this.pythonPath) throw new Error('Python 路徑未設定');
        // 快取檢查
        try {
            const s = await configManager.readSettings();
            const c = s.pythonPackagesChecked;
            if (c && c.pythonPath === this.pythonPath && (Date.now() - (c.timestamp || 0)) < 86400000) return;
        } catch (e) {
            console.error('checkPythonPackages 讀取設定錯誤:', e);
        }

        // M-09: 腳本已外部化，改用腳本路徑直接執行
        try {
            const result = await this.runCommand(this.pythonPath, [this.checkPackagesScriptPath], { timeout: 15000 });
            if (result.includes('SUCCESS')) {
                try {
                    let s = await configManager.readSettings();
                    s.pythonPackagesChecked = { pythonPath: this.pythonPath, timestamp: Date.now() };
                    await configManager.writeSettings(s);
                } catch (e) {
                    console.error('checkPythonPackages 寫入設定錯誤:', e);
                }
            } else {
                await this.installPythonPackages();
            }
        } catch {
            await this.installPythonPackages();
        }
    }

    async installPythonPackages() {
        if (!this.pythonPath) throw new Error('Python 路徑未設定');
        await this.runCommand(this.pythonPath, ['-m', 'pip', 'install', '-r', this.requirementsPath, '--user'], { timeout: 300000 });
    }

    async loadCoursesFromDatabase() {
        return new Promise(resolve => {
            if (!this.dbProvider) {
                resolve({ success: false, message: '資料庫提供者未設置' }); return;
            }
            const database = this.dbProvider();
            database.all('SELECT * FROM tasks WHERE status = 0 ORDER BY id', [], (err, rows) => {
                if (err) { resolve({ success: false, message: err.message }); return; }
                if (!rows || rows.length === 0) {
                    resolve({ success: false, message: '沒有找到待選課程' }); return;
                }
                const courses = rows.map(r => ({
                    id: r.id, deptId: r.dept_id, courseId: r.cos_id,
                    classId: r.cos_class, name: r.name,
                    teacher_name: r.teacher_name, credit: r.credit,
                    status: r.status, formatted: `${r.dept_id},${r.cos_id}${r.cos_class}`,
                    groupId: r.group_id,
                    time: r.time
                }));
                resolve({ success: true, courses });
            });
        });
    }

    async setupCoursesListFromDatabase() {
        try {
            const result = await this.loadCoursesFromDatabase();
            if (!result.success) return result;
            const { app } = require('electron');
            const coursesJsonPath = path.join(app.getPath('userData'), 'courses.json');
            
            const groupsMap = {};
            const individual = [];
            
            result.courses.forEach(c => {
                if (c.groupId !== null && c.groupId !== undefined && c.groupId !== '') {
                    if (!groupsMap[c.groupId]) {
                        groupsMap[c.groupId] = [];
                    }
                    groupsMap[c.groupId].push(c.formatted);
                } else {
                    individual.push(c.formatted);
                }
            });
            
            const coursesData = {
                groups: Object.values(groupsMap),
                individual
            };
            
            await fs.promises.writeFile(coursesJsonPath, JSON.stringify(coursesData, null, 2), 'utf8');
            return { success: true, coursesCount: result.courses.length, courses: result.courses };
        } catch (e) {
            console.error('setupCoursesListFromDatabase 發生錯誤:', e);
            return { success: false, message: e.message };
        }
    }

    async startCourseSelection(options = {}) {
        if (this.isRunning) return { success: false, message: '選課機器人已在執行中' };
        const { delay = 2.5, maxAttempts = 100 } = options;
        try {
            const coursesResult = await this.setupCoursesListFromDatabase();
            if (!coursesResult.success) return { success: false, message: coursesResult.message };
            if (coursesResult.coursesCount === 0) return { success: false, message: '沒有待選課程' };

            // 從 config.ini 讀取帳密作為環境變數注入 Python（唯一憑證來源）
            const accounts = await configManager.readAccounts();
            if (!accounts.account || !accounts.password) {
                return { success: false, message: '尚未設定 Portal 帳號密碼，請至帳號設定頁面填入後再啟動機器人' };
            }

            const { app } = require('electron');
            const coursesJsonPath = path.join(app.getPath('userData'), 'courses.json');

            this.currentProcess = spawn(this.pythonPath, ['-u', this.botScriptPath], {
                cwd: app.getPath('temp'),
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONUNBUFFERED: '1',
                    MAX_ATTEMPTS: String(Number.isFinite(maxAttempts) ? maxAttempts : 0),
                    PORTAL_ACCOUNT: accounts.account,
                    PORTAL_PASSWORD: accounts.password,
                    COURSES_JSON_PATH: coursesJsonPath,
                    DELAY_INTERVAL: String(delay)
                }
            });
            this.isRunning = true;
            this.stdoutBuffer = '';
            this._send('yzuCourseBotStatus', { status: 'starting', message: '機器人已啟動，登入中...' });

            const detectStatusFromText = (text) => {
                const normalized = String(text || '').trim();
                if (!normalized) return;

                if (/Login\s*Successful|登入成功/i.test(normalized)) {
                    this._send('yzuCourseBotStatus', { status: 'logged_in', message: '登入成功' });
                    return;
                }

                if (/Login\s*Failed|登入過程發生錯誤|重試|選課系統尚未開放/i.test(normalized)) {
                    this._send('yzuCourseBotStatus', { status: 'login_retry', message: normalized });
                    return;
                }

                const skipMatch = normalized.match(/\[COURSE_SKIPPED\]\s*(.+)/);
                if (skipMatch) {
                    const courseKey = skipMatch[1].trim();
                    this._send('yzuCourseBotStatus', { status: 'course_skipped', course: courseKey, message: '同群組已有其他課程加選成功，跳過此課程' });
                    return;
                }

                if (/加選訊息：|已選過/i.test(normalized)) {
                    this._send('yzuCourseBotStatus', { status: 'course_selected', message: normalized });
                }
            };

            this.currentProcess.stdout.on('data', (data) => {
                const output = data.toString('utf8');
                this._send('yzuCourseBotOutput', { type: 'stdout', message: output, timestamp: new Date().toISOString() });

                // 避免 stdout 分段導致關鍵字被切斷，改為逐行判斷狀態
                this.stdoutBuffer += output;
                const lines = this.stdoutBuffer.split(/\r?\n/);
                this.stdoutBuffer = lines.pop() || '';
                lines.forEach((line) => detectStatusFromText(line));

                if (output.includes('加選訊息：')) {
                    const m = output.match(/(\w+\s+\w+)\s+加選訊息：(.+)/);
                    if (m) this._send('yzuCourseBotStatus', { status: 'course_selected', course: m[1], message: m[2] });
                }
            });

            this.currentProcess.stderr.on('data', (data) => {
                this._send('yzuCourseBotOutput', { type: 'stderr', message: data.toString('utf8'), timestamp: new Date().toISOString() });
            });

            this.currentProcess.on('close', (code) => {
                if (this.stdoutBuffer) {
                    detectStatusFromText(this.stdoutBuffer);
                    this.stdoutBuffer = '';
                }
                this.isRunning = false;
                this.currentProcess = null;
                this._send('yzuCourseBotStatus', { status: 'stopped', message: `程序結束 (退出碼: ${code})`, exitCode: code });
            });

            return { success: true, message: '自動選課機器人已啟動', pid: this.currentProcess.pid };
        } catch (e) {
            this.isRunning = false; this.currentProcess = null;
            return { success: false, message: e.message };
        }
    }

    async stopCourseSelection() {
        if (!this.isRunning || !this.currentProcess) return { success: true, message: '選課機器人未在執行中' };
        try {
            this.currentProcess.kill('SIGTERM');
            setTimeout(() => { if (this.currentProcess && !this.currentProcess.killed) this.currentProcess.kill('SIGKILL'); }, 3000);
            this.isRunning = false;
            return { success: true, message: '選課機器人已停止' };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            pythonPath: this.pythonPath,
            pid: this.currentProcess ? this.currentProcess.pid : null,
            hasModel: fs.existsSync(this.modelPath)
        };
    }

    resetInitialization() {
        this.isInitialized = false;
        this.pythonChecked = false;
        this.pythonPath = null;
    }

    async recognizeCaptcha(imagePath) {
        if (!this.pythonPath) {
            await this.checkPythonInstallation();
        }
        const ocrScriptPath = path.join(path.dirname(this.botScriptPath), 'predict_captcha.py');
        try {
            const stdout = await this.runCommand(this.pythonPath, [ocrScriptPath, imagePath], { timeout: 15000 });
            const match = stdout.match(/RESULT:(.+)/);
            if (match) {
                return { success: true, result: match[1].trim() };
            }
            return { success: false, message: '無法解析辨識結果', stdout };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    runCommand(command, args, options = {}) {
        return new Promise((resolve, reject) => {
            const { timeout = 30000 } = options;
            const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
            let stdout = '', stderr = '';
            proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
            proc.stderr.on('data', d => { stderr += d.toString('utf8'); });
            const timer = setTimeout(() => { proc.kill(); reject(new Error('命令執行超時')); }, timeout);
            proc.on('close', code => {
                clearTimeout(timer);
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(`退出碼: ${code}\nstdout: ${stdout}\nstderr: ${stderr}`));
                }
            });
            proc.on('error', e => { clearTimeout(timer); reject(e); });
        });
    }
}

// 匯出為 Singleton
module.exports = new YzuCourseBot();
