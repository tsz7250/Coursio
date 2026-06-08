/**
 * main_ipc.js — Main Process IPC 處理模組
 *
 * 集中管理所有從 Renderer → Main 的 IPC 通訊：
 *   - 設定檔讀寫 (settings.json)
 *   - SQLite 資料庫 CRUD (db.sqlite)
 *   - BackendService 課程查詢代理
 *   - Python yzuCourseBot 管理
 */

const { ipcMain, shell, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');

const { getBackend } = require('./backend_provider');
const configManager = require('./config_manager');
const yzuCourseBot = require('./yzuCourseBot');
const { createLogger } = require('./logger');
const { validateCustomConfigPath, sanitizeOpenDialogOptions } = require('./ipc/security_utils');
const { registerAllHandlers } = require('./ipc/register_all_handlers');

const logger = createLogger('main_ipc');

// ─── Lazy-loaded SQLite ───────────────────────────────────────────
let sqlite3 = null;
let db = null;

function getSqlite3() {
    if (!sqlite3) sqlite3 = require('sqlite3').verbose();
    return sqlite3;
}

function getDb() {
    if (!db) {
        const dbPath = path.join(__dirname, '..', 'db.sqlite');
        const dbInitPath = path.join(__dirname, '..', 'db.sqlite.init');

        // 如果 db.sqlite 不存在但 init 範本存在，則進行複製
        if (!fs.existsSync(dbPath) && fs.existsSync(dbInitPath)) {
            try {
                fs.copyFileSync(dbInitPath, dbPath);
                logger.info('已從範本初始化 db.sqlite');
            } catch (err) {
                logger.error('初始化 db.sqlite 失敗', { error: err.message });
            }
        }

        const s3 = getSqlite3();
        db = new s3.Database(dbPath, (err) => {
            if (err) logger.error('資料庫連線失敗', { error: err.message });
            else logger.info('Main Process 資料庫連線已建立');
        });
    }
    return db;
}

// ─── Module State ─────────────────────────────────────────────────
let mainWindow = null;
let backendInstance = null;

// ─── init() ───────────────────────────────────────────────────────
function init(win) {
    mainWindow = win;
    configManager.init();
    backendInstance = getBackend();
    yzuCourseBot.setMainWindow(win);
    yzuCourseBot.setDbProvider(() => getDb());

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
        database.run(`ALTER TABLE tasks ADD COLUMN time TEXT`, (err) => { /* 忽略欄位已存在的錯誤 */ });
        database.run(`ALTER TABLE tasks ADD COLUMN room TEXT`, (err) => { /* 忽略欄位已存在的錯誤 */ });
    });

    registerAllHandlers({
        ipcMain,
        configManager,
        app,
        validateCustomConfigPath,
        logger,
        getDb,
        getBackend: () => backendInstance,
        yzuCourseBot,
        shell,
        dialog,
        getMainWindow: () => mainWindow,
        sanitizeOpenDialogOptions
    });

    logger.info('Main Process IPC handlers (main_ipc.js) 已註冊');
}

module.exports = { init };
