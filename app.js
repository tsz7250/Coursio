const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs")
const mainPuppeteer = require("./main_puppeteer")
const mainIpc = require("./main_ipc")

// 修正 Windows console 亂碼（設定 UTF-8 code page）
if (process.platform === 'win32') {
    try { require('child_process').execSync('chcp 65001', { stdio: 'ignore' }); } catch (_) {}
    if (process.stdout && process.stdout.setEncoding) process.stdout.setEncoding('utf8');
    if (process.stderr && process.stderr.setEncoding) process.stderr.setEncoding('utf8');
}

// 靜默忽略 EPIPE（Electron 中 stdout/stderr pipe 可能已關閉）
if (process.stdout) process.stdout.on('error', (e) => { if (e.code === 'EPIPE') return; });
if (process.stderr) process.stderr.on('error', (e) => { if (e.code === 'EPIPE') return; });
process.on('uncaughtException', (e) => { if (e.code === 'EPIPE') return; throw e; });

const renderer_dirpath = path.join("./", "renderer")

// L-02: 使用 userData 目錄儲存設定檔，避免相對路徑問題
// (不能在 app.whenReady 前呼叫 app.getPath，於 createWindow 中初始化)
let settingFilePath = null

let MainWindow = null
var initConfigSettingJson = {"interval":2, "stage": "1"};

function readOrcreateSettingJson() {
    try {
        const content = fs.readFileSync(settingFilePath, "utf-8")
    } catch (error) {
        fs.writeFile(settingFilePath, JSON.stringify(initConfigSettingJson), "utf-8", function (err, data) {})
    }
}

function createWindow() {
    // L-02: 於 app.whenReady 後計算 userData 路徑
    settingFilePath = path.join(app.getPath('userData'), 'settings.json')
    readOrcreateSettingJson()

    MainWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        winWidth: 1000,
        winHeight: 800,
        transparent: false,
        frame: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            preload: path.join(__dirname, "renderer", "js", "preload_main.js"),
        }
    })

    MainWindow.setMenuBarVisibility(false)

    // 開發環境：載入 Vite dev server；正式環境：載入打包後的檔案
    if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
        MainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else if (!app.isPackaged) {
        // 開發環境但沒有 Vite dev server — 嘗試載入 dist 或原始 index.html
        const distIndex = path.join(__dirname, "renderer", "dist", "index.html");
        if (fs.existsSync(distIndex)) {
            MainWindow.loadFile(distIndex);
        } else {
            MainWindow.loadFile(path.join(renderer_dirpath, "index.html"));
        }
    } else {
        // 正式打包環境：載入 Vite 打包後的 dist/index.html
        MainWindow.loadFile(path.join(__dirname, "renderer", "dist", "index.html"));
    }

    // 僅在開發環境開啟 DevTools
    if (!app.isPackaged) MainWindow.webContents.openDevTools();

    // 初始化 Main Process Puppeteer IPC handlers
    mainPuppeteer.init(MainWindow);

    // 初始化 Main Process IPC handlers (settings, db, backend, pythonBot)
    mainIpc.init(MainWindow);

    // 頁面載入完成後延遲 2 秒預熱 Browserless，避免與 UI 初始化搶 CPU
    MainWindow.webContents.on('did-finish-load', () => {
        setTimeout(() => {
            mainPuppeteer.prewarm();
        }, 2000);
    });

    // 在主畫面關閉時清理資源
    MainWindow.on("close", function () {
        // 確保刪除登入 Token（同步寫入，程式退出前完成）
        try {
            var settings = JSON.parse(fs.readFileSync(settingFilePath, "utf-8") || '{}');
            settings["token"] = "";
            fs.writeFileSync(settingFilePath, JSON.stringify(settings), "utf-8");
        } catch (error) {
            console.error("清理設定檔失敗:", error);
        }
    })
}

// 有些 API 只能在這個事件發生後才能用。
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

// IPC 開啟課程詳細頁面（在 Electron 新視窗中）
ipcMain.on("openCourseDetail", (event, data) => {
    const { year, smtr, cos_id, cos_class } = data;
    const url = `https://portalfun.yzu.edu.tw/cosSelect/Cos_Plan.aspx?y=${encodeURIComponent(year)}&s=${encodeURIComponent(smtr)}&id=${encodeURIComponent(cos_id)}&c=${encodeURIComponent(cos_class)}`;

    let courseDetailWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        parent: MainWindow,
        modal: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        }
    });

    courseDetailWindow.loadURL(url);

    courseDetailWindow.on('closed', () => {
        courseDetailWindow = null;
    });
})