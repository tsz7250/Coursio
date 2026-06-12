// Mock electron before requiring any internal modules
const Module = require('module');
const originalRequire = Module.prototype.require;
const path = require('path');
const fs = require('fs');

const tempDir = path.join(process.cwd(), 'temp_test_dir');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Ensure resourcesPath is mocked before yzuCourseBot class is loaded
process.resourcesPath = path.join(process.cwd(), 'resources');

// Global record for mocked handlers
global.mockIpcHandlers = {};

Module.prototype.require = function (id) {
    if (id === 'electron') {
        return {
            app: {
                isPackaged: true, // Force using resourcesPath and userData path
                getPath: (name) => path.join(tempDir, name),
            },
            ipcMain: {
                handle: (channel, handler) => {
                    global.mockIpcHandlers[channel] = handler;
                }
            },
            shell: {
                openExternal: async () => true
            },
            dialog: {
                showOpenDialog: async () => ({ canceled: false, filePaths: [] })
            },
            safeStorage: {
                isEncryptionAvailable: () => false // Force plaintext fallback in tests
            }
        };
    }
    return originalRequire.apply(this, arguments);
};

// Intercept registerAllHandlers to capture the sqlite3 database instance for closing it later
const registerAllHandlersModule = require('../main/ipc/register_all_handlers');
const originalRegisterAllHandlers = registerAllHandlersModule.registerAllHandlers;
let activeDbInstance = null;

registerAllHandlersModule.registerAllHandlers = function(args) {
    if (args && args.getDb) {
        const originalGetDb = args.getDb;
        args.getDb = function() {
            const dbInstance = originalGetDb();
            activeDbInstance = dbInstance;
            return dbInstance;
        };
    }
    return originalRegisterAllHandlers.apply(this, arguments);
};

// Now import target modules
const { getBackend } = require('../main/backend_provider');
const configManager = require('../main/config_manager');
const yzuCourseBot = require('../main/yzuCourseBot');
const ScheduleParser = require('../shared/services/parsers/schedule_parser');

// Test suite helper
const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

// Mock IPC Event that passes validateIpcSender check
const mockEvent = {
    senderFrame: {
        url: 'file:///test-frame/index.html'
    }
};

// Define test cases

// Test 1: Backend Singleton and Core Facade Methods
test('Backend Singleton and Facade Methods', async () => {
    const backendA = getBackend();
    const backendB = getBackend();
    if (backendA !== backendB) {
        throw new Error('Backend singleton 驗證失敗：getBackend() 未傳回相同實例');
    }

    const requiredMethods = [
        'loginService',
        'getCourseListFromYZUApi',
        'queryCourseByDept',
        'puppeteerGetGrades',
        'getCourseSchedule',
        'getCourseCredit',
        'getFullCourseInfo',
        'prewarmBrowser',
        'cleanupPuppeteerBrowser'
    ];

    for (const name of requiredMethods) {
        if (typeof backendA[name] !== 'function') {
            throw new Error('Backend 缺少必要方法: ' + name);
        }
    }
    console.log('  → Backend Facade 方法結構驗證成功');
});

// Test 2: Database Initialization and Unique Course Selection Constraint (M-11) via IPC Handler
test('Database Constraints (Prevent Duplicate Course Tasks - M-11) via IPC', async () => {
    // Import main_ipc.js and run init() to setup DB schema in userData directory
    const mockWin = {
        isDestroyed: () => false,
        webContents: {
            send: () => {}
        }
    };
    const mainIpc = require('../main/main_ipc');
    mainIpc.init(mockWin);

    const addTaskHandler = global.mockIpcHandlers['db:addTask'];
    const checkTaskExistsHandler = global.mockIpcHandlers['db:checkTaskExists'];
    const clearAllTasksHandler = global.mockIpcHandlers['db:clearAllTasks'];

    if (!addTaskHandler || !checkTaskExistsHandler || !clearAllTasksHandler) {
        throw new Error('未在 IPC 中找到資料庫存取處理常式');
    }

    // Clear any leftover tasks from previous failed runs to guarantee a clean state
    await clearAllTasksHandler(mockEvent);

    const task1 = {
        cos_id: '304001',
        cos_class: 'A',
        name: '軟體工程',
        teacher_name: '廖建勛',
        credit: 3,
        dept_id: '304',
        status: 0
    };

    // First insert should succeed
    const res1 = await addTaskHandler(mockEvent, task1);
    if (!res1 || typeof res1.id !== 'number') {
        throw new Error('首次寫入選課任務失敗');
    }

    // Check task exists
    const exists = await checkTaskExistsHandler(mockEvent, { cos_id: '304001', cos_class: 'A' });
    if (!exists || exists.id !== res1.id) {
        throw new Error('未能正確查詢到已寫入的選課任務');
    }

    // Second insert with same cos_id and cos_class must fail with UNIQUE constraint error
    try {
        await addTaskHandler(mockEvent, {
            cos_id: '304001',
            cos_class: 'A',
            name: '重複的軟體工程',
            status: 0
        });
        throw new Error('資料庫未阻擋重複的 (cos_id, cos_class) 加選任務！這違反了 M-11 規格要求');
    } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes('UNIQUE constraint failed')) {
            console.log('  → 成功透過 IPC 驗證 UNIQUE 約束阻擋重複任務：', errMsg);
        } else {
            throw new Error('非預期的資料庫錯誤: ' + errMsg);
        }
    }
});

// Test 3: Settings and Config Manager Encryption Fallback
test('Config Manager and Settings CRUD', async () => {
    configManager.init();
    
    // Set custom config path
    const customConfigPath = path.join(tempDir, 'custom_config.ini');
    const settings = {
        interval: 3,
        stage: '2',
        customConfigPath
    };
    
    // Write setting file
    const writeOk = await configManager.writeSettings(settings);
    if (!writeOk) {
        throw new Error('寫入 settings.json 失敗');
    }
    
    // Read and verify settings
    const readSettings = await configManager.readSettings();
    if (readSettings.interval !== 3 || readSettings.customConfigPath !== customConfigPath) {
        throw new Error('讀取的 settings.json 配置與寫入不符');
    }
    
    // Write accounts (using plaintext fallback since safeStorage is mocked out)
    const accounts = {
        account: 's1101234',
        password: 'secure_password_123',
        rememberMe: true
    };
    
    const writeAccountsOk = await configManager.writeAccounts(accounts);
    if (!writeAccountsOk) {
        throw new Error('寫入帳號設定失敗');
    }
    
    // Read and verify accounts
    const readAcc = await configManager.readAccounts();
    if (readAcc.account !== 's1101234' || readAcc.password !== 'secure_password_123' || !readAcc.rememberMe) {
        throw new Error('讀取帳號資訊不符，明文降級解密失敗');
    }
    
    // Clean accounts
    const deleteOk = await configManager.deleteAccounts();
    if (!deleteOk) {
        throw new Error('刪除帳號設定失敗');
    }
    
    const clearedAcc = await configManager.readAccounts();
    if (clearedAcc.account !== '') {
        throw new Error('刪除帳號後依然能讀取到帳號資料');
    }
    
    console.log('  → ConfigManager 配置讀寫與帳密明文回退驗證成功');
});

// Test 4: Parser Unit Tests (processTeacherName & parseScheduleHTMLWithDetails)
test('Schedule HTML Parser Unit Tests', async () => {
    // 1. Test processTeacherName with brackets & commas
    const teacherA = ScheduleParser.processTeacherName('廖建勛Chien-Shiun Liao)');
    const expectedA = '廖建勛\n(Chien-Shiun Liao)';
    if (teacherA !== expectedA) {
        throw new Error('教師姓名括號處理錯誤。期望: ' + expectedA + '，實際: ' + teacherA);
    }

    const teacherC = ScheduleParser.processTeacherName('張三(Zhang San) ， 李四(Li Si)');
    if (!teacherC.includes('張三') || !teacherC.includes('李四')) {
        throw new Error('多教師拆分處理錯誤: ' + teacherC);
    }

    // 2. Test parseScheduleHTMLWithDetails with mock HTML
    const mockHtml = `
    <html>
        <body>
            <label id="label1">114學年度第1學期 測試學生課表</label>
            <table id="table1">
                <tr>
                    <td>課程代碼</td><td>課程名稱</td><td>學分</td><td>時間</td><td>教室</td><td>教師</td>
                </tr>
                <tr>
                    <td>304001</td>
                    <td>軟體工程</td>
                    <td>3</td>
                    <td>週一第1,2節</td>
                    <td>SF101</td>
                    <td>廖建勛Chien-Shiun Liao)</td>
                </tr>
            </table>
        </body>
    </html>
    `;

    const parseResult = ScheduleParser.parseScheduleHTMLWithDetails(mockHtml);
    if (!parseResult.found_table1 || !parseResult.found_label1) {
        throw new Error('無法定位 label1 或 table1 元素');
    }

    if (parseResult.label1Content !== '114學年度第1學期 測試學生課表') {
        throw new Error('label1 內容解析錯誤: ' + parseResult.label1Content);
    }

    if (parseResult.courses.length !== 1) {
        throw new Error('解析課程數量錯誤。期望: 1, 實際: ' + parseResult.courses.length);
    }

    const course = parseResult.courses[0];
    if (course.course_id !== '304001' || course.name !== '軟體工程' || course.credit !== 3 || course.time !== '101,102' || course.teacher_name !== '廖建勛\n(Chien-Shiun Liao)') {
        throw new Error('課表欄位解析錯誤: ' + JSON.stringify(course));
    }

    console.log('  → ScheduleParser 姓名處理與課表 HTML 解析驗證成功');
});

// Test 5: IPC Channels and Handlers Alignment
test('IPC Channels and Handlers Verification', async () => {
    const { CHANNELS } = require('../main/ipc/contracts/channels');
    const mainPuppeteer = require('../main/main_puppeteer');

    // Instantiate mock window and initialize Puppeteer handlers to trigger registration
    const mockWin = {
        isDestroyed: () => false,
        webContents: {
            send: () => {}
        }
    };
    mainPuppeteer.init(mockWin);

    // List of channels to exclude from handler checks (e.g., event channels or external triggers)
    const excludeChannels = [
        CHANNELS.YZU_COURSE_BOT.OUTPUT_EVENT,
        CHANNELS.YZU_COURSE_BOT.STATUS_EVENT,
        CHANNELS.PUPPETEER.PROGRESS // Progress is webContents.send event, not handled via handle()
    ];

    const missingHandlers = [];

    // Traverse CHANNELS recursively
    function checkChannels(obj) {
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object') {
                checkChannels(value);
            } else if (typeof value === 'string') {
                if (excludeChannels.includes(value)) continue;
                if (!global.mockIpcHandlers[value]) {
                    missingHandlers.push(value);
                }
            }
        }
    }

    checkChannels(CHANNELS);

    if (missingHandlers.length > 0) {
        throw new Error('發現未在主進程中註冊 handle 處理的 IPC 頻道:\n  - ' + missingHandlers.join('\n  - '));
    }

    console.log('  → IPC Channels 與註冊的 Handlers 完全一致，無遺漏管道');
});

// Test 6: Python bot requirements and model file validation
test('Python Bot Requirements and Model File check', async () => {
    // 1. Verify required files are physically present
    const botScript = yzuCourseBot.botScriptPath;
    const modelFile = yzuCourseBot.modelPath;
    const reqsFile = yzuCourseBot.requirementsPath;

    if (!fs.existsSync(botScript)) throw new Error('缺少 Python 腳本: ' + botScript);
    if (!fs.existsSync(modelFile)) throw new Error('缺少 OCR 辨識模型: ' + modelFile);
    if (!fs.existsSync(reqsFile)) throw new Error('缺少 requirements 宣告: ' + reqsFile);

    console.log('  → Python Bot 必要資源檔檢查通過');

    // 2. Run initialize() to verify Python installation & versions
    console.log('  → 執行 yzuCourseBot.initialize() 環境檢測...');
    try {
        const initRes = await yzuCourseBot.initialize();
        if (initRes.success) {
            console.log(`  → Python 初始化成功: ${initRes.message}`);
        } else {
            console.warn(`  ⚠️ Python 初始化回報警告 (這通常在 CI 環境中是正常的，因無 Python 環境): ${initRes.message}`);
        }
    } catch (err) {
        console.warn(`  ⚠️ Python 初始化丟出異常: ${err.message}`);
    }
});

// Runner
async function runAll() {
    console.log('================================================');
    console.log('🚀 開始執行擴充煙霧測試 (Enhanced Smoke Check)...');
    console.log('================================================');

    let failed = false;
    for (const { name, fn } of tests) {
        console.log(`• [RUN] ${name}...`);
        try {
            await fn();
            console.log(`  [PASS] ${name}\n`);
        } catch (err) {
            console.error(`  [FAIL] ${name}`);
            console.error(`  Error: ${err.message || err}\n`);
            failed = true;
        }
    }

    // Close the database connection if opened during the test, to release the file lock
    if (activeDbInstance) {
        await new Promise((resolve) => {
            activeDbInstance.close((err) => {
                if (err) {
                    console.warn('⚠️ 關閉資料庫失敗:', err.message);
                } else {
                    console.log('🧹 資料庫連線已關閉');
                }
                resolve();
            });
        });
    }

    // Cleanup temp directory
    try {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    } catch (e) {
        console.warn('⚠️ 無法完全清理臨時測試目錄:', e.message);
    }

    if (failed) {
        console.log('================================================');
        console.log('❌ 煙霧測試失敗！請檢查錯誤原因。');
        console.log('================================================');
        process.exit(1);
    } else {
        console.log('================================================');
        console.log('✅ 煙霧測試全部通過！核心邏輯健全。');
        console.log('================================================');
        process.exit(0);
    }
}

runAll().catch(err => {
    console.error('執行測試套件時發生非預期錯誤:', err);
    process.exit(1);
});
