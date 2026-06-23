const { CHANNELS } = require('./contracts/channels');
const { validateIpcSender } = require('./security_utils');

function registerDbHandlers(ipcMain, getDb) {
    ipcMain.handle(CHANNELS.DB.ADD_TASK, async (e, task) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return new Promise((resolve, reject) => {
            getDb().run(
                'INSERT INTO tasks (cos_id, cos_class, name, teacher_name, credit, dept_id, status, time, room) VALUES (?,?,?,?,?,?,?,?,?)',
                [task.cos_id, task.cos_class, task.name, task.teacher_name, task.credit, task.dept_id, task.status || 0, task.time || '', task.room || ''],
                function (err) { err ? reject(err.message) : resolve({ id: this.lastID }); }
            );
        });
    });

    ipcMain.handle(CHANNELS.DB.CHECK_TASK_EXISTS, async (e, { cos_id, cos_class }) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return new Promise((resolve, reject) => {
            getDb().get(
                'SELECT id FROM tasks WHERE cos_id = ? AND cos_class = ?',
                [cos_id, cos_class],
                (err, row) => err ? reject(err.message) : resolve(row || null)
            );
        });
    });

    ipcMain.handle(CHANNELS.DB.GET_ALL_TASKS, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return new Promise((resolve, reject) => {
            getDb().all('SELECT * FROM tasks ORDER BY id', [], (err, rows) => {
                err ? reject(err.message) : resolve(rows || []);
            });
        });
    });

    ipcMain.handle(CHANNELS.DB.DELETE_TASK, async (e, id) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return new Promise((resolve, reject) => {
            const dbInstance = getDb();
            let changes = 0;
            dbInstance.serialize(() => {
                dbInstance.run('BEGIN TRANSACTION');
                dbInstance.run('DELETE FROM tasks WHERE id = ?', [id], function (err) {
                    if (!err) changes = this.changes;
                });
                dbInstance.run('UPDATE tasks SET group_id = NULL WHERE group_id IN (SELECT group_id FROM tasks WHERE group_id IS NOT NULL GROUP BY group_id HAVING COUNT(*) < 2)');
                dbInstance.run('COMMIT', (err) => {
                    err ? reject(err.message) : resolve({ changes });
                });
            });
        });
    });

    ipcMain.handle(CHANNELS.DB.CLEAR_COMPLETED, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return new Promise((resolve, reject) => {
            const dbInstance = getDb();
            let changes = 0;
            dbInstance.serialize(() => {
                dbInstance.run('BEGIN TRANSACTION');
                dbInstance.run('DELETE FROM tasks WHERE status != 0', function (err) {
                    if (!err) changes = this.changes;
                });
                dbInstance.run('UPDATE tasks SET group_id = NULL WHERE group_id IN (SELECT group_id FROM tasks WHERE group_id IS NOT NULL GROUP BY group_id HAVING COUNT(*) < 2)');
                dbInstance.run('COMMIT', (err) => {
                    err ? reject(err.message) : resolve({ changes });
                });
            });
        });
    });

    ipcMain.handle(CHANNELS.DB.CLEAR_ALL_TASKS, async (e) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return new Promise((resolve, reject) => {
            getDb().run('DELETE FROM tasks',
                function (err) { err ? reject(err.message) : resolve({ changes: this.changes }); });
        });
    });

    ipcMain.handle(CHANNELS.DB.SET_TASK_GROUP, async (e, { ids, group_id }) => {
        if (!validateIpcSender(e)) throw new Error('未授權的 IPC sender');
        return new Promise((resolve, reject) => {
            const dbInstance = getDb();
            dbInstance.serialize(() => {
                dbInstance.run('BEGIN TRANSACTION');
                const stmt = dbInstance.prepare('UPDATE tasks SET group_id = ? WHERE id = ?');
                for (const id of ids) {
                    stmt.run(group_id, id);
                }
                stmt.finalize();
                // 清理剩餘少於2個待選的群組關係
                dbInstance.run('UPDATE tasks SET group_id = NULL WHERE group_id IN (SELECT group_id FROM tasks WHERE group_id IS NOT NULL GROUP BY group_id HAVING COUNT(*) < 2)');
                dbInstance.run('COMMIT', (err) => {
                    err ? reject(err.message) : resolve({ success: true });
                });
            });
        });
    });
}

module.exports = { registerDbHandlers };
