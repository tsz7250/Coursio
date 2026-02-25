/**
 * main_ipc.js — Main Process IPC 處理模組
 *
 * 集中管理所有從 Renderer → Main 的 IPC 通訊：
 *   - 設定檔讀寫 (settings.json)
 *   - SQLite 資料庫 CRUD (db.sqlite)
 *   - BackendService 課程查詢代理
 *   - Python yzuCourseBot 管理
 */

const { ipcMain, shell, app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// BackendService 重用同一份模組（main_puppeteer.js 也有載入）
const { BackendService } = require('./renderer/js/yzu_backend');

// ─── Lazy-loaded SQLite ───────────────────────────────────────────
let sqlite3 = null;
let db = null;

function getSqlite3() {
    if (!sqlite3) sqlite3 = require('sqlite3').verbose();
    return sqlite3;
}

function getDb() {
    if (!db) {
        const dbPath = 'db.sqlite';
        const dbInitPath = 'db.sqlite.init';

        // 如果 db.sqlite 不存在但 init 範本存在，則進行複製
        if (!fs.existsSync(dbPath) && fs.existsSync(dbInitPath)) {
            try {
                fs.copyFileSync(dbInitPath, dbPath);
                console.log('✅ 已從範本初始化 db.sqlite');
            } catch (err) {
                console.error('❌ 初始化 db.sqlite 失敗:', err.message);
            }
        }

        const s3 = getSqlite3();
        db = new s3.Database(dbPath, (err) => {
            if (err) console.error('❌ 資料庫連線失敗:', err.message);
            else console.log('✅ Main Process 資料庫連線已建立');
        });
    }
    return db;
}

// ─── PythonCourseBot (Main Process 版本) ──────────────────────────
class PythonCourseBot {
    constructor() {
        this.pythonPath = null;
        this.isInitialized = false;
        this.pythonChecked = false;
        this.isRunning = false;
        this.currentProcess = null;

        // Python 檔案路徑（相對於專案根目錄）
        const pythonDir = path.join(__dirname, 'renderer', 'py');
        this.botScriptPath = path.join(pythonDir, 'yzuCourseBot.py');
        this.modelPath = path.join(pythonDir, 'model.h5');
        this.requirementsPath = path.join(pythonDir, 'requirements.txt');
        this.accountsPath = path.join(pythonDir, 'accounts.ini');
    }

    // 主視窗參考（用於推送輸出）
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
        } catch (_) { /* ignore */ }
        throw new Error('找不到 Python 3.x 安裝。請安裝 Python 3.12+ 並確保加入 PATH');
    }

    async checkRequiredFiles() {
        const files = [
            { path: this.botScriptPath, name: 'yzuCourseBot.py' },
            { path: this.modelPath, name: '驗證碼識別模型 model.h5' },
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
            const s = JSON.parse(fs.readFileSync('settings.json', 'utf-8'));
            const c = s.pythonPackagesChecked;
            if (c && c.pythonPath === this.pythonPath && (Date.now() - (c.timestamp || 0)) < 86400000) return;
        } catch (_) { /* ignore */ }

        const testScript = `
import sys, importlib
pkgs = ['tensorflow','cv2','numpy','requests','bs4','configparser']
missing = [p for p in pkgs if not importlib.util.find_spec(p.replace('cv2','cv2').replace('bs4','bs4'))]
# 簡單 try/except 逐一檢查
missing2 = []
for p in pkgs:
    try:
        importlib.import_module(p)
    except ImportError:
        missing2.append(p)
if missing2:
    print("MISSING: " + ", ".join(missing2)); sys.exit(1)
else:
    print("SUCCESS: All packages available")
`;
        try {
            const result = await this.runCommand(this.pythonPath, ['-c', testScript], { timeout: 15000 });
            if (result.includes('SUCCESS')) {
                try {
                    let s = {};
                    try { s = JSON.parse(fs.readFileSync('settings.json', 'utf-8')); } catch (_) {}
                    s.pythonPackagesChecked = { pythonPath: this.pythonPath, timestamp: Date.now() };
                    fs.writeFileSync('settings.json', JSON.stringify(s), 'utf-8');
                } catch (_) {}
            } else {
                await this.installPythonPackages();
            }
        } catch (_) {
            await this.installPythonPackages();
        }
    }

    async installPythonPackages() {
        if (!this.pythonPath) throw new Error('Python 路徑未設定');
        await this.runCommand(this.pythonPath, ['-m', 'pip', 'install', '-r', this.requirementsPath, '--user'], { timeout: 300000 });
    }

    async setupAccount(account, password) {
        const cfg = `[Default]\nAccount=${account}\nPassword=${password}`;
        try {
            fs.writeFileSync(this.accountsPath, cfg, 'utf8');
            return { success: true };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    async loadCoursesFromDatabase() {
        return new Promise(resolve => {
            const database = getDb();
            database.all('SELECT * FROM tasks WHERE status = 0 ORDER BY id', [], (err, rows) => {
                if (err) { resolve({ success: false, message: err.message }); return; }
                if (!rows || rows.length === 0) {
                    resolve({ success: false, message: '沒有找到待選課程' }); return;
                }
                const courses = rows.map(r => ({
                    id: r.id, deptId: r.dept_id, courseId: r.cos_id,
                    classId: r.cos_class, name: r.name,
                    teacher_name: r.teacher_name, credit: r.credit,
                    status: r.status, formatted: `${r.dept_id},${r.cos_id}${r.cos_class}`
                }));
                resolve({ success: true, courses });
            });
        });
    }

    async setupCoursesListFromDatabase() {
        try {
            const result = await this.loadCoursesFromDatabase();
            if (!result.success) return result;
            // H-08: 不再以 regex 修改 Python 原始碼，改為寫出 courses.json
            const coursesJsonPath = path.join(path.dirname(this.botScriptPath), 'courses.json');
            const formatted = result.courses.map(c => c.formatted);
            fs.writeFileSync(coursesJsonPath, JSON.stringify(formatted, null, 2), 'utf8');
            return { success: true, coursesCount: result.courses.length, courses: result.courses };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    async updateDelaySettings(delay) {
        try {
            let content = fs.readFileSync(this.botScriptPath, 'utf8');
            const pat = /delay\s*=\s*[\d.]+/;
            const rep = `delay = ${delay}`;
            content = pat.test(content) ? content.replace(pat, rep) : content;
            fs.writeFileSync(this.botScriptPath, content, 'utf8');
        } catch (_) { /* ignore */ }
    }

    async startCourseSelection(options = {}) {
        if (this.isRunning) return { success: false, message: '選課機器人已在執行中' };
        const { delay = 2.5, maxAttempts = 100 } = options;
        try {
            const coursesResult = await this.setupCoursesListFromDatabase();
            if (!coursesResult.success) return { success: false, message: coursesResult.message };
            if (coursesResult.coursesCount === 0) return { success: false, message: '沒有待選課程' };
            await this.updateDelaySettings(delay);

            this.currentProcess = spawn(this.pythonPath, ['-u', this.botScriptPath], {
                cwd: path.dirname(this.botScriptPath),
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONUNBUFFERED: '1',
                    MAX_ATTEMPTS: String(Number.isFinite(maxAttempts) ? maxAttempts : 0)
                }
            });
            this.isRunning = true;

            this.currentProcess.stdout.on('data', (data) => {
                const output = data.toString('utf8');
                this._send('pythonBotOutput', { type: 'stdout', message: output, timestamp: new Date().toISOString() });
                if (output.includes('Login Successful!')) {
                    this._send('pythonBotStatus', { status: 'logged_in', message: '登入成功' });
                } else if (output.includes('加選訊息：')) {
                    const m = output.match(/(\w+\s+\w+)\s+加選訊息：(.+)/);
                    if (m) this._send('pythonBotStatus', { status: 'course_selected', course: m[1], message: m[2] });
                }
            });

            this.currentProcess.stderr.on('data', (data) => {
                this._send('pythonBotOutput', { type: 'stderr', message: data.toString('utf8'), timestamp: new Date().toISOString() });
            });

            this.currentProcess.on('close', (code) => {
                this.isRunning = false;
                this.currentProcess = null;
                this._send('pythonBotStatus', { status: 'stopped', message: `程序結束 (退出碼: ${code})`, exitCode: code });
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
            hasModel: fs.existsSync(this.modelPath),
            hasAccounts: fs.existsSync(this.accountsPath)
        };
    }

    resetInitialization() {
        this.isInitialized = false;
        this.pythonChecked = false;
        this.pythonPath = null;
    }

    runCommand(command, args, options = {}) {
        return new Promise((resolve, reject) => {
            const { timeout = 30000 } = options;
            const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
            let stdout = '', stderr = '';
            proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
            proc.stderr.on('data', d => { stderr += d.toString('utf8'); });
            const timer = setTimeout(() => { proc.kill(); reject(new Error('命令執行超時')); }, timeout);
            proc.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(stderr || `退出碼: ${code}`)); });
            proc.on('error', e => { clearTimeout(timer); reject(e); });
        });
    }
}

// ─── Module State ─────────────────────────────────────────────────
let mainWindow = null;
let backendInstance = null;
const pythonBot = new PythonCourseBot();
// L-02: settingFilePath 於 init() 後由 app.getPath('userData') 決定
let settingFilePath = 'settings.json';
const defaultSettings = { interval: 2, stage: '1' };

// ─── Config INI 工具函式 ───────────────────────────────────────────
function getDefaultConfigPath() {
    const appdata = process.env.APPDATA || require('os').homedir();
    return path.join(appdata, 'Coursio', 'config.ini');
}

function parseSimpleIni(content) {
    const result = {};
    let section = '';
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[') && trimmed.includes(']')) {
            section = trimmed.slice(1, trimmed.indexOf(']')).toLowerCase();
            result[section] = {};
        } else if (trimmed.includes('=') && section) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim().toLowerCase();
            result[section][key] = trimmed.slice(idx + 1).trim();
        }
    }
    return result;
}

function writeSimpleIni(sections) {
    let out = '';
    for (const [section, opts] of Object.entries(sections)) {
        out += `[${section}]\n`;
        for (const [key, value] of Object.entries(opts)) {
            out += `${key}=${value}\n`;
        }
    }
    return out;
}

// ─── init() ───────────────────────────────────────────────────────
function init(win) {
    mainWindow = win;
    // L-02: 使用 userData 目錄儲存設定檔，避免相對路徑問題
    settingFilePath = path.join(app.getPath('userData'), 'settings.json');
    backendInstance = new BackendService();
    pythonBot.setMainWindow(win);

    // 初始化資料庫
    const database = getDb();
    database.serialize(() => {
        database.run(`CREATE TABLE IF NOT EXISTS tasks (
            "id" INTEGER PRIMARY KEY AUTOINCREMENT,
            "cos_id" TEXT, "cos_class" TEXT, "name" TEXT,
            "teacher_name" TEXT, "credit" INTEGER, "dept_id" TEXT,
            "status" INTEGER
        )`);
        // M-11: 防止重複加選同一門課程
        database.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_unique ON tasks(cos_id, cos_class)`);
    });

    // ═══════════════════════════════════════════════════════════════
    // Settings IPC
    // ═══════════════════════════════════════════════════════════════
    ipcMain.handle('settings:read', async () => {
        try { return JSON.parse(fs.readFileSync(settingFilePath, 'utf-8')); }
        catch { return { ...defaultSettings }; }
    });

    ipcMain.handle('settings:write', async (_e, data) => {
        try { fs.writeFileSync(settingFilePath, JSON.stringify(data), 'utf-8'); return true; }
        catch { return false; }
    });

    // ═══════════════════════════════════════════════════════════════
    // Config (帳號存儲) IPC
    // ═══════════════════════════════════════════════════════════════
    function getConfigFilePath() {
        try {
            const s = JSON.parse(fs.readFileSync(settingFilePath, 'utf-8'));
            if (s && s.customConfigPath) return s.customConfigPath;
        } catch (_) {}
        return getDefaultConfigPath();
    }

    ipcMain.handle('config:getPath', async () => {
        return { path: getConfigFilePath(), defaultPath: getDefaultConfigPath() };
    });

    ipcMain.handle('config:setPath', async (_e, customPath) => {
        try {
            let s = {};
            try { s = JSON.parse(fs.readFileSync(settingFilePath, 'utf-8')); } catch (_) {}
            s.customConfigPath = customPath || null;
            fs.writeFileSync(settingFilePath, JSON.stringify(s), 'utf-8');
            return true;
        } catch { return false; }
    });

    ipcMain.handle('config:readAccounts', async () => {
        try {
            const cfgPath = getConfigFilePath();
            if (!fs.existsSync(cfgPath)) return { account: '', password: '', rememberMe: false };
            const content = fs.readFileSync(cfgPath, 'utf-8');
            const sections = parseSimpleIni(content);
            const def = sections['default'] || {};
            return {
                account: def['account'] || '',
                password: def['password'] || '',
                rememberMe: def['rememberme'] === 'true'
            };
        } catch { return { account: '', password: '', rememberMe: false }; }
    });

    ipcMain.handle('config:writeAccounts', async (_e, { account, password, rememberMe }) => {
        try {
            const cfgPath = getConfigFilePath();
            const dir = path.dirname(cfgPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const content = writeSimpleIni({
                Default: {
                    Account: account || '',
                    Password: password || '',
                    RememberMe: String(rememberMe || false)
                }
            });
            fs.writeFileSync(cfgPath, content, 'utf-8');
            return true;
        } catch { return false; }
    });

    ipcMain.handle('config:deleteAccounts', async () => {
        try {
            const cfgPath = getConfigFilePath();
            if (fs.existsSync(cfgPath)) {
                const content = writeSimpleIni({
                    Default: { Account: '', Password: '', RememberMe: 'false' }
                });
                fs.writeFileSync(cfgPath, content, 'utf-8');
            }
            return true;
        } catch { return false; }
    });

    // ═══════════════════════════════════════════════════════════════
    // Database IPC
    // ═══════════════════════════════════════════════════════════════
    ipcMain.handle('db:addTask', async (_e, task) => {
        return new Promise((resolve, reject) => {
            getDb().run(
                'INSERT INTO tasks (cos_id, cos_class, name, teacher_name, credit, dept_id, status) VALUES (?,?,?,?,?,?,?)',
                [task.cos_id, task.cos_class, task.name, task.teacher_name, task.credit, task.dept_id, task.status || 0],
                function (err) { err ? reject(err.message) : resolve({ id: this.lastID }); }
            );
        });
    });

    // C-02: 僅允許預定義查詢，不接受任意 SQL
    ipcMain.handle('db:checkTaskExists', async (_e, { cos_id, cos_class }) => {
        return new Promise((resolve, reject) => {
            getDb().get(
                'SELECT id FROM tasks WHERE cos_id = ? AND cos_class = ?',
                [cos_id, cos_class],
                (err, row) => err ? reject(err.message) : resolve(row || null)
            );
        });
    });

    ipcMain.handle('db:getAllTasks', async () => {
        return new Promise((resolve, reject) => {
            getDb().all('SELECT * FROM tasks ORDER BY id', [], (err, rows) => {
                err ? reject(err.message) : resolve(rows || []);
            });
        });
    });

    ipcMain.handle('db:deleteTask', async (_e, id) => {
        return new Promise((resolve, reject) => {
            getDb().run('DELETE FROM tasks WHERE id = ?', [id],
                function (err) { err ? reject(err.message) : resolve({ changes: this.changes }); });
        });
    });

    ipcMain.handle('db:clearCompleted', async () => {
        return new Promise((resolve, reject) => {
            getDb().run('DELETE FROM tasks WHERE status != 0',
                function (err) { err ? reject(err.message) : resolve({ changes: this.changes }); });
        });
    });

    ipcMain.handle('db:executeQuery', async (_e, { sql, params }) => {
        return new Promise((resolve, reject) => {
            getDb().run(sql, params || [], function (err) {
                err ? reject(err.message) : resolve({ id: this.lastID, changes: this.changes });
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // Backend — 課程查詢 IPC
    // ═══════════════════════════════════════════════════════════════
    ipcMain.handle('backend:setSidSpwd', async (_e, { sid, spwd }) => {
        backendInstance._setSidSpwd(sid, spwd);
        return true;
    });

    ipcMain.handle('backend:getCourseList', async (_e, { year, smtr }) => {
        return await backendInstance.getCourseListFromYZUApi(year, smtr);
    });

    ipcMain.handle('backend:queryCourseByDept', async (_e, { ddl_ym, ddl_dept, ddl_degree }) => {
        return await backendInstance.queryCourseByDept(ddl_ym, ddl_dept, ddl_degree);
    });

    ipcMain.handle('backend:queryCourseByName', async (_e, { ddl_ym, cos_name }) => {
        return await backendInstance.queryCourseByName(ddl_ym, cos_name);
    });

    ipcMain.handle('backend:queryCourseByTeacher', async (_e, { ddl_ym, teacher_name }) => {
        return await backendInstance.queryCourseByTeacher(ddl_ym, teacher_name);
    });

    ipcMain.handle('backend:queryCourseByTime', async (_e, { ddl_ym, ctl216 }) => {
        return await backendInstance.queryCourseByTime(ddl_ym, ctl216);
    });

    ipcMain.handle('backend:getCourseCredit', async (_e, { year, smtr, cos_id, cos_class }) => {
        return await backendInstance.getCourseCredit(year, smtr, cos_id, cos_class);
    });

    // ═══════════════════════════════════════════════════════════════
    // Python Bot IPC
    // ═══════════════════════════════════════════════════════════════
    ipcMain.handle('pythonBot:initialize', async () => {
        return await pythonBot.initialize();
    });

    ipcMain.handle('pythonBot:start', async (_e, options) => {
        return await pythonBot.startCourseSelection(options);
    });

    ipcMain.handle('pythonBot:stop', async () => {
        return await pythonBot.stopCourseSelection();
    });

    ipcMain.handle('pythonBot:getStatus', async () => {
        return pythonBot.getStatus();
    });

    ipcMain.handle('pythonBot:setupAccount', async (_e, { account, password }) => {
        return await pythonBot.setupAccount(account, password);
    });

    ipcMain.handle('pythonBot:loadCourses', async () => {
        return await pythonBot.loadCoursesFromDatabase();
    });

    ipcMain.handle('pythonBot:resetInit', async () => {
        pythonBot.resetInitialization();
        return true;
    });

    // ═══════════════════════════════════════════════════════════════
    // Shell IPC
    // ═══════════════════════════════════════════════════════════════
    ipcMain.handle('shell:openExternal', async (_e, url) => {        // C-03: 只允許 https:// 開頭的 URL，防止 file:// 或自訂協定起局部程式
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:') {
                console.warn('\u62d2絕開啟非 https URL:', url);
                return false;
            }
        } catch (_) {
            console.warn('\u7121效 URL，拒絕開啟:', url);
            return false;
        }        await shell.openExternal(url);
        return true;
    });

    // ═══════════════════════════════════════════════════════════════
    // Dialog IPC
    // ═══════════════════════════════════════════════════════════════
    ipcMain.handle('dialog:showOpenDialog', async (_e, options) => {
        try {
            return await dialog.showOpenDialog(mainWindow, options || {});
        } catch (e) {
            return { canceled: true, filePaths: [] };
        }
    });

    console.log('✅ Main Process IPC handlers (main_ipc.js) 已註冊');
}

module.exports = { init };
