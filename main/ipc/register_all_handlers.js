const { registerSettingsAndConfigHandlers } = require('./register_settings_config_handlers');
const { registerDbHandlers } = require('./register_db_handlers');
const { registerBackendHandlers } = require('./register_backend_handlers');
const { registerPythonHandlers } = require('./register_python_handlers');
const { registerShellAndDialogHandlers } = require('./register_shell_dialog_handlers');

function registerAllHandlers({
    ipcMain,
    configManager,
    app,
    validateCustomConfigPath,
    logger,
    getDb,
    getBackend,
    pythonBot,
    shell,
    dialog,
    getMainWindow,
    sanitizeOpenDialogOptions
}) {
    registerSettingsAndConfigHandlers(ipcMain, configManager, app, validateCustomConfigPath, logger);
    registerDbHandlers(ipcMain, getDb);
    registerBackendHandlers(ipcMain, getBackend);
    registerPythonHandlers(ipcMain, pythonBot);
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
