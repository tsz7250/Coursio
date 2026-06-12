/**
 * preload_main.js — Electron Preload Script
 *
 * contextIsolation: true 環境下，透過 contextBridge 將安全的 API
 * 暴露至 renderer process 的 window.electronAPI。
 *
 * Renderer 端不再 require('electron') 或任何 Node.js 模組。
 */

const { contextBridge, ipcRenderer } = require('electron');
const FALLBACK_CHANNELS = {
    PUPPETEER: {
        LOGIN: 'puppeteer:login',
        GET_SCHEDULE: 'puppeteer:getSchedule',
        GET_COMPLETE_SCHEDULE: 'puppeteer:getCompleteSchedule',
        GET_GRADES: 'puppeteer:getGrades',
        CLEANUP: 'puppeteer:cleanup',
        PROGRESS: 'puppeteer:progress'
    },
    BACKEND: {
        SET_SID_SPWD: 'backend:setSidSpwd',
        GET_COURSE_LIST: 'backend:getCourseList',
        QUERY_BY_DEPT: 'backend:queryCourseByDept',
        QUERY_BY_NAME: 'backend:queryCourseByName',
        QUERY_BY_TEACHER: 'backend:queryCourseByTeacher',
        QUERY_BY_TIME: 'backend:queryCourseByTime',
        GET_COURSE_CREDIT: 'backend:getCourseCredit',
        GET_FULL_COURSE_INFO: 'backend:getFullCourseInfo'
    },
    DB: {
        ADD_TASK: 'db:addTask',
        CHECK_TASK_EXISTS: 'db:checkTaskExists',
        GET_ALL_TASKS: 'db:getAllTasks',
        DELETE_TASK: 'db:deleteTask',
        CLEAR_COMPLETED: 'db:clearCompleted',
        CLEAR_ALL_TASKS: 'db:clearAllTasks'
    },
    SETTINGS: {
        READ: 'settings:read',
        WRITE: 'settings:write'
    },
    CONFIG: {
        GET_PATH: 'config:getPath',
        SET_PATH: 'config:setPath',
        READ_ACCOUNTS: 'config:readAccounts',
        WRITE_ACCOUNTS: 'config:writeAccounts',
        DELETE_ACCOUNTS: 'config:deleteAccounts'
    },
    YZU_COURSE_BOT: {
        INITIALIZE: 'yzuCourseBot:initialize',
        START: 'yzuCourseBot:start',
        STOP: 'yzuCourseBot:stop',
        GET_STATUS: 'yzuCourseBot:getStatus',
        LOAD_COURSES: 'yzuCourseBot:loadCourses',
        RESET_INIT: 'yzuCourseBot:resetInit',
        OUTPUT_EVENT: 'yzuCourseBotOutput',
        STATUS_EVENT: 'yzuCourseBotStatus'
    },
    SHELL: {
        OPEN_EXTERNAL: 'shell:openExternal'
    },
    DIALOG: {
        SHOW_OPEN_DIALOG: 'dialog:showOpenDialog'
    }
};

let CHANNELS = FALLBACK_CHANNELS;
try {
    // 在非 sandbox preload 可直接共用主程序 IPC 契約。
    // sandbox preload 可能禁止跨路徑 require，故保留 fallback。
    CHANNELS = require('../../../main/ipc/contracts/channels').CHANNELS;
} catch {
    CHANNELS = FALLBACK_CHANNELS;
}

contextBridge.exposeInMainWorld('electronAPI', {

    // ─── Puppeteer (Main Process 登入 / 課表) ─────────────────────
    puppeteer: {
        login: (sid, spwd) => ipcRenderer.invoke(CHANNELS.PUPPETEER.LOGIN, { sid, spwd }),
        getSchedule: () => ipcRenderer.invoke(CHANNELS.PUPPETEER.GET_SCHEDULE),
        getCompleteSchedule: (params) => ipcRenderer.invoke(CHANNELS.PUPPETEER.GET_COMPLETE_SCHEDULE, params),
        getGrades: (params) => ipcRenderer.invoke(CHANNELS.PUPPETEER.GET_GRADES, params),
        cleanup: () => ipcRenderer.invoke(CHANNELS.PUPPETEER.CLEANUP),
        onProgress: (callback) => {
            const handler = (_event, step) => callback(step);
            ipcRenderer.on(CHANNELS.PUPPETEER.PROGRESS, handler);
            return () => ipcRenderer.removeListener(CHANNELS.PUPPETEER.PROGRESS, handler);
        }
    },

    // ─── Backend 課程查詢 ─────────────────────────────────────────
    backend: {
        setSidSpwd: (sid, spwd) => ipcRenderer.invoke(CHANNELS.BACKEND.SET_SID_SPWD, { sid, spwd }),
        getCourseList: (year, smtr) => ipcRenderer.invoke(CHANNELS.BACKEND.GET_COURSE_LIST, { year, smtr }),
        queryCourseByDept: (ddl_ym, ddl_dept, ddl_degree) =>
            ipcRenderer.invoke(CHANNELS.BACKEND.QUERY_BY_DEPT, { ddl_ym, ddl_dept, ddl_degree }),
        queryCourseByName: (ddl_ym, cos_name) =>
            ipcRenderer.invoke(CHANNELS.BACKEND.QUERY_BY_NAME, { ddl_ym, cos_name }),
        queryCourseByTeacher: (ddl_ym, teacher_name) =>
            ipcRenderer.invoke(CHANNELS.BACKEND.QUERY_BY_TEACHER, { ddl_ym, teacher_name }),
        queryCourseByTime: (ddl_ym, ctl216) =>
            ipcRenderer.invoke(CHANNELS.BACKEND.QUERY_BY_TIME, { ddl_ym, ctl216 }),
        getCourseCredit: (year, smtr, cos_id, cos_class) =>
            ipcRenderer.invoke(CHANNELS.BACKEND.GET_COURSE_CREDIT, { year, smtr, cos_id, cos_class }),
        getFullCourseInfo: (ddl_ym, cos_name, cos_id, cos_class) =>
            ipcRenderer.invoke(CHANNELS.BACKEND.GET_FULL_COURSE_INFO, { ddl_ym, cos_name, cos_id, cos_class })
    },

    // ─── Database (SQLite) ────────────────────────────────────────
    db: {
        addTask: (task) => ipcRenderer.invoke(CHANNELS.DB.ADD_TASK, task),
        // C-02: db:getTask 已移除（任意 SQL 安全風險），改用預定義查詢
        checkTaskExists: (cos_id, cos_class) =>
            ipcRenderer.invoke(CHANNELS.DB.CHECK_TASK_EXISTS, { cos_id, cos_class }),
        getAllTasks: () => ipcRenderer.invoke(CHANNELS.DB.GET_ALL_TASKS),
        deleteTask: (id) => ipcRenderer.invoke(CHANNELS.DB.DELETE_TASK, id),
        clearCompleted: () => ipcRenderer.invoke(CHANNELS.DB.CLEAR_COMPLETED),
        clearAllTasks: () => ipcRenderer.invoke(CHANNELS.DB.CLEAR_ALL_TASKS)
    },

    // ─── Settings ─────────────────────────────────────────────────
    settings: {
        read: () => ipcRenderer.invoke(CHANNELS.SETTINGS.READ),
        write: (data) => ipcRenderer.invoke(CHANNELS.SETTINGS.WRITE, data)
    },

    // ─── Config (帳號存儲) ────────────────────────────────────────
    config: {
        getPath: () => ipcRenderer.invoke(CHANNELS.CONFIG.GET_PATH),
        setPath: (customPath) => ipcRenderer.invoke(CHANNELS.CONFIG.SET_PATH, customPath),
        readAccounts: () => ipcRenderer.invoke(CHANNELS.CONFIG.READ_ACCOUNTS),
        writeAccounts: (data) => ipcRenderer.invoke(CHANNELS.CONFIG.WRITE_ACCOUNTS, data),
        deleteAccounts: () => ipcRenderer.invoke(CHANNELS.CONFIG.DELETE_ACCOUNTS)
    },

    // ─── Yzu Course Bot ───────────────────────────────────────────
    yzuCourseBot: {
        initialize: () => ipcRenderer.invoke(CHANNELS.YZU_COURSE_BOT.INITIALIZE),
        start: (options) => ipcRenderer.invoke(CHANNELS.YZU_COURSE_BOT.START, options),
        stop: () => ipcRenderer.invoke(CHANNELS.YZU_COURSE_BOT.STOP),
        getStatus: () => ipcRenderer.invoke(CHANNELS.YZU_COURSE_BOT.GET_STATUS),
        loadCourses: () => ipcRenderer.invoke(CHANNELS.YZU_COURSE_BOT.LOAD_COURSES),
        resetInit: () => ipcRenderer.invoke(CHANNELS.YZU_COURSE_BOT.RESET_INIT),
        onOutput: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on(CHANNELS.YZU_COURSE_BOT.OUTPUT_EVENT, handler);
            return () => ipcRenderer.removeListener(CHANNELS.YZU_COURSE_BOT.OUTPUT_EVENT, handler);
        },
        onStatus: (callback) => {
            const handler = (_event, data) => callback(data);
            ipcRenderer.on(CHANNELS.YZU_COURSE_BOT.STATUS_EVENT, handler);
            return () => ipcRenderer.removeListener(CHANNELS.YZU_COURSE_BOT.STATUS_EVENT, handler);
        }
    },

    // ─── Shell ────────────────────────────────────────────────────
    shell: {
        openExternal: (url) => ipcRenderer.invoke(CHANNELS.SHELL.OPEN_EXTERNAL, url),
        showOpenDialog: (options) => ipcRenderer.invoke(CHANNELS.DIALOG.SHOW_OPEN_DIALOG, options)
    },

    // ─── 課程詳細頁面 ─────────────────────────────────────────────
    openCourseDetail: (data) => ipcRenderer.send('openCourseDetail', data),

    // ─── Versions ─────────────────────────────────────────────────
    versions: process.versions
});