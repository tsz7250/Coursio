/**
 * preload_main.js — Electron Preload Script
 *
 * contextIsolation: true 環境下，透過 contextBridge 將安全的 API
 * 暴露至 renderer process 的 window.electronAPI。
 *
 * Renderer 端不再 require('electron') 或任何 Node.js 模組。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

    // ─── Puppeteer (Main Process 登入 / 課表) ─────────────────────
    puppeteer: {
        login: (sid, spwd) => ipcRenderer.invoke('puppeteer:login', { sid, spwd }),
        getSchedule: () => ipcRenderer.invoke('puppeteer:getSchedule'),
        getCompleteSchedule: (params) => ipcRenderer.invoke('puppeteer:getCompleteSchedule', params),
        cleanup: () => ipcRenderer.invoke('puppeteer:cleanup'),
        onProgress: (callback) => {
            const handler = (_event, step) => callback(step);
            ipcRenderer.on('puppeteer:progress', handler);
            return () => ipcRenderer.removeListener('puppeteer:progress', handler);
        }
    },

    // ─── Backend 課程查詢 ─────────────────────────────────────────
    backend: {
        setSidSpwd: (sid, spwd) => ipcRenderer.invoke('backend:setSidSpwd', { sid, spwd }),
        getCourseList: (year, smtr) => ipcRenderer.invoke('backend:getCourseList', { year, smtr }),
        queryCourseByDept: (ddl_ym, ddl_dept, ddl_degree) =>
            ipcRenderer.invoke('backend:queryCourseByDept', { ddl_ym, ddl_dept, ddl_degree }),
        queryCourseByName: (ddl_ym, cos_name) =>
            ipcRenderer.invoke('backend:queryCourseByName', { ddl_ym, cos_name }),
        queryCourseByTeacher: (ddl_ym, teacher_name) =>
            ipcRenderer.invoke('backend:queryCourseByTeacher', { ddl_ym, teacher_name }),
        queryCourseByTime: (ddl_ym, ctl216) =>
            ipcRenderer.invoke('backend:queryCourseByTime', { ddl_ym, ctl216 }),
        getCourseCredit: (year, smtr, cos_id, cos_class) =>
            ipcRenderer.invoke('backend:getCourseCredit', { year, smtr, cos_id, cos_class })
    },

    // ─── Database (SQLite) ────────────────────────────────────────
    db: {
        addTask: (task) => ipcRenderer.invoke('db:addTask', task),
        // C-02: db:getTask 已移除（任意 SQL 安全風險），改用預定義查詢
        checkTaskExists: (cos_id, cos_class) =>
            ipcRenderer.invoke('db:checkTaskExists', { cos_id, cos_class }),
        getAllTasks: () => ipcRenderer.invoke('db:getAllTasks'),
        deleteTask: (id) => ipcRenderer.invoke('db:deleteTask', id),
        clearCompleted: () => ipcRenderer.invoke('db:clearCompleted'),
        executeQuery: (sql, params) => ipcRenderer.invoke('db:executeQuery', { sql, params })
    },

    // ─── Settings ─────────────────────────────────────────────────
    settings: {
        read: () => ipcRenderer.invoke('settings:read'),
        write: (data) => ipcRenderer.invoke('settings:write', data)
    },

    // ─── Config (帳號存儲) ────────────────────────────────────────
    config: {
        getPath: () => ipcRenderer.invoke('config:getPath'),
        setPath: (customPath) => ipcRenderer.invoke('config:setPath', customPath),
        readAccounts: () => ipcRenderer.invoke('config:readAccounts'),
        writeAccounts: (data) => ipcRenderer.invoke('config:writeAccounts', data),
        deleteAccounts: () => ipcRenderer.invoke('config:deleteAccounts')
    },

    // ─── Python Bot ───────────────────────────────────────────────
    pythonBot: {
        initialize: () => ipcRenderer.invoke('pythonBot:initialize'),
        start: (options) => ipcRenderer.invoke('pythonBot:start', options),
        stop: () => ipcRenderer.invoke('pythonBot:stop'),
        getStatus: () => ipcRenderer.invoke('pythonBot:getStatus'),
        setupAccount: (account, password) =>
            ipcRenderer.invoke('pythonBot:setupAccount', { account, password }),
        loadCourses: () => ipcRenderer.invoke('pythonBot:loadCourses'),
        resetInit: () => ipcRenderer.invoke('pythonBot:resetInit'),
        onOutput: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('pythonBotOutput', handler);
            return () => ipcRenderer.removeListener('pythonBotOutput', handler);
        },
        onStatus: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on('pythonBotStatus', handler);
            return () => ipcRenderer.removeListener('pythonBotStatus', handler);
        }
    },

    // ─── Shell ────────────────────────────────────────────────────
    shell: {
        openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
        showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options)
    },

    // ─── 課程詳細頁面 ─────────────────────────────────────────────
    openCourseDetail: (data) => ipcRenderer.send('openCourseDetail', data)
});