const { CHANNELS } = require('./contracts/channels');
const { validateIpcSender } = require('./security_utils');
const { ensureObject, ensureString } = require('./request_validation');

function registerBackendHandlers(ipcMain, getBackendInstance) {
    ipcMain.handle(CHANNELS.BACKEND.SET_SID_SPWD, async (e, payload) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        const { sid, spwd } = ensureObject(payload);
        getBackendInstance()._setSidSpwd(ensureString(sid, 'sid'), ensureString(spwd, 'spwd'));
        return true;
    });

    ipcMain.handle(CHANNELS.BACKEND.GET_COURSE_LIST, async (e, payload) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        const { year, smtr } = ensureObject(payload);
        return getBackendInstance().getCourseListFromYZUApi(year, smtr);
    });

    ipcMain.handle(CHANNELS.BACKEND.QUERY_BY_DEPT, async (e, payload) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        const { ddl_ym, ddl_dept, ddl_degree } = ensureObject(payload);
        return getBackendInstance().queryCourseByDept(ddl_ym, ddl_dept, ddl_degree);
    });

    ipcMain.handle(CHANNELS.BACKEND.QUERY_BY_NAME, async (e, payload) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        const { ddl_ym, cos_name } = ensureObject(payload);
        return getBackendInstance().queryCourseByName(ddl_ym, cos_name);
    });

    ipcMain.handle(CHANNELS.BACKEND.QUERY_BY_TEACHER, async (e, payload) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        const { ddl_ym, teacher_name } = ensureObject(payload);
        return getBackendInstance().queryCourseByTeacher(ddl_ym, teacher_name);
    });

    ipcMain.handle(CHANNELS.BACKEND.QUERY_BY_TIME, async (e, payload) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        const { ddl_ym, ctl216 } = ensureObject(payload);
        return getBackendInstance().queryCourseByTime(ddl_ym, ctl216);
    });

    ipcMain.handle(CHANNELS.BACKEND.GET_COURSE_CREDIT, async (e, payload) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        const { year, smtr, cos_id, cos_class } = ensureObject(payload);
        return getBackendInstance().getCourseCredit(year, smtr, cos_id, cos_class);
    });

    ipcMain.handle(CHANNELS.BACKEND.GET_FULL_COURSE_INFO, async (e, payload) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        const { ddl_ym, cos_name, cos_id, cos_class } = ensureObject(payload);
        return getBackendInstance().getFullCourseInfo(
            ensureString(ddl_ym, 'ddl_ym'),
            ensureString(cos_name, 'cos_name'),
            ensureString(cos_id, 'cos_id'),
            ensureString(cos_class, 'cos_class')
        );
    });
}

module.exports = { registerBackendHandlers };
