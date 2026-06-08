const { registerSettingsAndConfigHandlers } = require('./register_settings_config_handlers');
const { registerDbHandlers } = require('./register_db_handlers');
const { registerBackendHandlers } = require('./register_backend_handlers');
const { registerYzuCourseBotHandlers } = require('./register_yzuCourseBot_handlers');
const { registerShellAndDialogHandlers } = require('./register_shell_dialog_handlers');

function registerAllHandlers({
    ipcMain,
    configManager,
    app,
    validateCustomConfigPath,
    logger,
    getDb,
    getBackend,
    yzuCourseBot,
    shell,
    dialog,
    getMainWindow,
    sanitizeOpenDialogOptions
}) {
    registerSettingsAndConfigHandlers(ipcMain, configManager, app, validateCustomConfigPath, logger);
    registerDbHandlers(ipcMain, getDb);
    registerBackendHandlers(ipcMain, getBackend);
    registerYzuCourseBotHandlers(ipcMain, yzuCourseBot);
    registerShellAndDialogHandlers(
        ipcMain,
        shell,
        dialog,
        getMainWindow,
        app,
        sanitizeOpenDialogOptions,
        logger
    );
}

module.exports = { registerAllHandlers };
