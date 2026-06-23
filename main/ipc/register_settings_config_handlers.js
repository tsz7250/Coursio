const { CHANNELS } = require('./contracts/channels');
const { validateIpcSender } = require('./security_utils');

function registerSettingsAndConfigHandlers(ipcMain, configManager, app, validateCustomConfigPath, logger) {
    ipcMain.handle(CHANNELS.SETTINGS.READ, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return configManager.readSettings();
    });

    ipcMain.handle(CHANNELS.SETTINGS.WRITE, async (e, data) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        if (!data || typeof data !== 'object') return false;

        const currentSettings = await configManager.readSettings();
        if (Object.prototype.hasOwnProperty.call(data, 'interval')) {
            const val = Number(data.interval);
            if (!isNaN(val)) {
                currentSettings.interval = val;
            }
        }
        if (Object.prototype.hasOwnProperty.call(data, 'stage')) {
            if (typeof data.stage === 'string') {
                currentSettings.stage = data.stage;
            }
        }
        return configManager.writeSettings(currentSettings);
    });

    ipcMain.handle(CHANNELS.CONFIG.GET_PATH, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return { path: await configManager.getConfigFilePath(), defaultPath: configManager.getDefaultConfigPath() };
    });

    ipcMain.handle(CHANNELS.CONFIG.SET_PATH, async (e, customPath) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        try {
            const checked = validateCustomConfigPath(app, customPath);
            if (!checked.valid) {
                logger.warn('拒絕不安全的 customConfigPath', { customPath, reason: checked.reason });
                return false;
            }
            const s = await configManager.readSettings();
            s.customConfigPath = checked.normalized;
            return await configManager.writeSettings(s);
        } catch {
            return false;
        }
    });

    ipcMain.handle(CHANNELS.CONFIG.READ_ACCOUNTS, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return configManager.readAccounts();
    });
    ipcMain.handle(CHANNELS.CONFIG.WRITE_ACCOUNTS, async (e, data) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return configManager.writeAccounts(data);
    });
    ipcMain.handle(CHANNELS.CONFIG.DELETE_ACCOUNTS, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return configManager.deleteAccounts();
    });
}

module.exports = { registerSettingsAndConfigHandlers };
