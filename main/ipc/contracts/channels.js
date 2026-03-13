const CHANNELS = {
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
        GET_COURSE_CREDIT: 'backend:getCourseCredit'
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
    PYTHON_BOT: {
        INITIALIZE: 'pythonBot:initialize',
        START: 'pythonBot:start',
        STOP: 'pythonBot:stop',
        GET_STATUS: 'pythonBot:getStatus',
        LOAD_COURSES: 'pythonBot:loadCourses',
        RESET_INIT: 'pythonBot:resetInit',
        OUTPUT_EVENT: 'pythonBotOutput',
        STATUS_EVENT: 'pythonBotStatus'
    },
    SHELL: {
        OPEN_EXTERNAL: 'shell:openExternal'
    },
    DIALOG: {
        SHOW_OPEN_DIALOG: 'dialog:showOpenDialog'
    }
};

module.exports = { CHANNELS };
