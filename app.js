const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs")

const renderer_dirpath = path.join("./", "renderer")

var settingFilePath = "settings.json"

let MainWindow = null
// 移除舊的選課 Worker Window，改用 Python yzuCourseBot
var initConfigSettingJson = {"interval":2, "stage": "1"};

function readOrcreateSettingJson() {
    try {
        const content = fs.readFileSync(settingFilePath, "utf-8")
    } catch (error) {
        fs.writeFile(settingFilePath, JSON.stringify(initConfigSettingJson), "utf-8", function (err, data) {})
    }
}``

function createWindow() {
    readOrcreateSettingJson()

    
    // 建立 Browser Window
    MainWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        winWidth: 1000,
        winHeight: 800,
        transparent: false,

        // Remove the frame of the window
        frame: true, // 控制有沒有外框
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false, // 關閉網頁安全性以允許跨域請求
            // preload: path.join(renderer_dirpath, "js", "preload.js"),
        }
    })

    MainWindow.setMenuBarVisibility(false)
    MainWindow.loadFile(path.join(renderer_dirpath, "index.html"))
    MainWindow.webContents.openDevTools();

    // 在主畫面關閉時清理資源
    MainWindow.on("close", function () {
        // 確保刪除登入 Token 
        try {
            var settings = JSON.parse(fs.readFileSync(settingFilePath, "utf-8") || '{}');
            settings["token"] = "";
            fs.writeFile(settingFilePath, JSON.stringify(settings), "utf-8", function (err, data) {
                if (err) console.error("清理 token 失敗:", err);
            });
        } catch (error) {
            console.error("清理設定檔失敗:", error);
        }
    })
}

// 有些 API 只能在這個事件發生後才能用。
app.whenReady().then(createWindow)

// 處理離開時的狀態
app.on('window-all-closed', () => {
    // 在 macOS 中，一般會讓應用程式及選單列繼續留著，
    // 除非使用者按了 Cmd + Q 確定終止它們
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    // 在 macOS 中，一般會在使用者按了 Dock 圖示
    // 且沒有其他視窗開啟的情況下，
    // 重新在應用程式裡建立視窗。
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

// IPC - Python Bot 輸出
ipcMain.on("pythonBotOutput", (event, data)=>{
    // 轉發 Python 機器人輸出到主視窗
    MainWindow.webContents.send("pythonBotOutput", data);
})

// IPC - Python Bot 狀態
ipcMain.on("pythonBotStatus", (event, data)=>{
    // 轉發 Python 機器人狀態到主視窗
    MainWindow.webContents.send("pythonBotStatus", data);
})
// IPC 開啟課程詳細頁面（在 Electron 新視窗中）
ipcMain.on("openCourseDetail", (event, data)=>{
    const { year, smtr, cos_id, cos_class } = data;
    const url = `https://portalfun.yzu.edu.tw/cosSelect/Cos_Plan.aspx?y=${year}&s=${smtr}&id=${cos_id}&c=${cos_class}`;
    console.log("Opening course detail URL in new window:", url);
    
    // 建立新的 BrowserWindow 來顯示課程詳細頁面
    let courseDetailWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        parent: MainWindow, // 設定父視窗
        modal: false, // 非模態視窗
        autoHideMenuBar: true, // 自動隱藏選單列
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        }
    });
    
    // 載入課程詳細頁面
    courseDetailWindow.loadURL(url);
    
    // 當視窗關閉時清理資源
    courseDetailWindow.on('closed', () => {
        courseDetailWindow = null;
    });
})