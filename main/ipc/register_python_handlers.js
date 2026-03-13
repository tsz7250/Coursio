const { CHANNELS } = require('./contracts/channels');
const { validateIpcSender } = require('./security_utils');

function registerPythonHandlers(ipcMain, pythonBot) {
    ipcMain.handle(CHANNELS.PYTHON_BOT.INITIALIZE, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return pythonBot.initialize();
    });
    ipcMain.handle(CHANNELS.PYTHON_BOT.START, async (e, options) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return pythonBot.startCourseSelection(options);
    });
    ipcMain.handle(CHANNELS.PYTHON_BOT.STOP, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return pythonBot.stopCourseSelection();
    });
    ipcMain.handle(CHANNELS.PYTHON_BOT.GET_STATUS, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return pythonBot.getStatus();
    });
    ipcMain.handle(CHANNELS.PYTHON_BOT.LOAD_COURSES, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return pythonBot.loadCoursesFromDatabase();
    });
    ipcMain.handle(CHANNELS.PYTHON_BOT.RESET_INIT, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        pythonBot.resetInitialization();
        return true;
    });
}

module.exports = { registerPythonHandlers };
