const { CHANNELS } = require('./contracts/channels');
const { validateIpcSender } = require('./security_utils');

function registerShellAndDialogHandlers(ipcMain, shell, dialog, getMainWindow, app, sanitizeOpenDialogOptions, logger) {
    ipcMain.handle(CHANNELS.SHELL.OPEN_EXTERNAL, async (e, url) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:') {
                logger.warn('拒絕開啟非 https URL', { url });
                return false;
            }
        } catch {
            logger.warn('無效 URL，拒絕開啟', { url });
            return false;
        }

        await shell.openExternal(url);
        return true;
    });

    ipcMain.handle(CHANNELS.DIALOG.SHOW_OPEN_DIALOG, async (e, options) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        try {
            const safeOptions = sanitizeOpenDialogOptions(app, options);
            return await dialog.showOpenDialog(getMainWindow(), safeOptions);
        } catch {
            return { canceled: true, filePaths: [] };
        }
    });
}

module.exports = { registerShellAndDialogHandlers };
