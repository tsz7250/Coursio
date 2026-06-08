const { CHANNELS } = require('./contracts/channels');
const { validateIpcSender } = require('./security_utils');

function registerYzuCourseBotHandlers(ipcMain, yzuCourseBot) {
    ipcMain.handle(CHANNELS.YZU_COURSE_BOT.INITIALIZE, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return yzuCourseBot.initialize();
    });
    ipcMain.handle(CHANNELS.YZU_COURSE_BOT.START, async (e, options) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return yzuCourseBot.startCourseSelection(options);
    });
    ipcMain.handle(CHANNELS.YZU_COURSE_BOT.STOP, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return yzuCourseBot.stopCourseSelection();
    });
    ipcMain.handle(CHANNELS.YZU_COURSE_BOT.GET_STATUS, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return yzuCourseBot.getStatus();
    });
    ipcMain.handle(CHANNELS.YZU_COURSE_BOT.LOAD_COURSES, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return yzuCourseBot.loadCoursesFromDatabase();
    });
    ipcMain.handle(CHANNELS.YZU_COURSE_BOT.RESET_INIT, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        yzuCourseBot.resetInitialization();
        return true;
    });
}

module.exports = { registerYzuCourseBotHandlers };
