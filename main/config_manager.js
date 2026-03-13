const path = require('path');
const fs = require('fs');
const { app, safeStorage } = require('electron');

class ConfigManager {
    constructor() {
        this.settingFilePath = null;
        this.defaultSettings = { interval: 2, stage: '1' };
    }

    init() {
        if (!this.settingFilePath) {
            this.settingFilePath = path.join(app.getPath('userData'), 'settings.json');
        }
    }

    getSettingFilePath() {
        this.init();
        return this.settingFilePath;
    }

    // 非同步讀取 settings.json
    async readSettings() {
        try {
            const content = await fs.promises.readFile(this.getSettingFilePath(), 'utf-8');
            return JSON.parse(content || '{}');
        } catch {
            return { ...this.defaultSettings };
        }
    }

    // 非同步寫入 settings.json
    async writeSettings(data) {
        try {
            await fs.promises.writeFile(this.getSettingFilePath(), JSON.stringify(data), 'utf-8');
            return true;
        } catch (error) {
            console.error('❌ writeSettings 發生錯誤:', error);
            return false;
        }
    }

    // 同步讀取 settings.json (系統啟動時使用)
    readSettingsSync() {
        try {
            const content = fs.readFileSync(this.getSettingFilePath(), 'utf-8');
            return JSON.parse(content || '{}');
        } catch {
            return { ...this.defaultSettings };
        }
    }

    // 同步寫入 settings.json (app quit 時使用以確保執行完畢)
    writeSettingsSync(data) {
        try {
            fs.writeFileSync(this.getSettingFilePath(), JSON.stringify(data), 'utf-8');
        } catch (error) {
            console.error("❌ 同步寫入設定檔發生錯誤:", error);
        }
    }

    // 初始化/建立預設 settings.json
    readOrCreateSettingJsonSync() {
        try {
            fs.readFileSync(this.getSettingFilePath(), "utf-8");
        } catch {
            this.writeSettingsSync(this.defaultSettings);
        }
    }

    getDefaultConfigPath() {
        const appdata = process.env.APPDATA || require('os').homedir();
        return path.join(appdata, 'Coursio', 'config.ini');
    }

    async getConfigFilePath() {
        try {
            const s = await this.readSettings();
            if (s && s.customConfigPath) return s.customConfigPath;
        } catch { /* 忽略 */ }
        return this.getDefaultConfigPath();
    }

    parseSimpleIni(content) {
        const result = {};
        let section = '';
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (trimmed.startsWith('[') && trimmed.includes(']')) {
                section = trimmed.slice(1, trimmed.indexOf(']')).toLowerCase();
                result[section] = {};
            } else if (trimmed.includes('=') && section) {
                const idx = trimmed.indexOf('=');
                const key = trimmed.slice(0, idx).trim().toLowerCase();
                result[section][key] = trimmed.slice(idx + 1).trim();
            }
        }
        return result;
    }

    writeSimpleIni(sections) {
        let out = '';
        for (const [section, opts] of Object.entries(sections)) {
            out += `[${section}]\n`;
            for (const [key, value] of Object.entries(opts)) {
                out += `${key}=${value}\n`;
            }
        }
        return out;
    }

    // 嘗試以 safeStorage 解密 base64 字串
    // 回傳 { password, wasEncrypted }，供呼叫端判斷是否需要遷移
    _decryptPassword(stored) {
        if (!stored) return { password: '', wasEncrypted: true };
        try {
            if (safeStorage.isEncryptionAvailable()) {
                const buf = Buffer.from(stored, 'base64');
                if (buf.length > 4) {
                    const decrypted = safeStorage.decryptString(buf);
                    return { password: decrypted, wasEncrypted: true };
                }
            }
        } catch {
            // 解密失敗：stored 為舊版明文
        }
        return { password: stored, wasEncrypted: false };
    }

    // 以 safeStorage 加密字串後回傳 base64 字串（安全存入檔案）
    _encryptPassword(plain) {
        if (!plain) return '';
        try {
            if (safeStorage.isEncryptionAvailable()) {
                const encrypted = safeStorage.encryptString(plain);
                return encrypted.toString('base64');
            }
        } catch (error) {
            console.error('❌ safeStorage 加密失敗，退回明文存儲:', error);
        }
        return plain;
    }

    async readAccounts() {
        try {
            const cfgPath = await this.getConfigFilePath();
            try {
                await fs.promises.access(cfgPath, fs.constants.F_OK);
            } catch {
                return { account: '', password: '', rememberMe: false };
            }
            const content = await fs.promises.readFile(cfgPath, 'utf-8');
            const sections = this.parseSimpleIni(content);
            const def = sections['default'] || {};
            const storedPwd = def['password'] || '';
            const { password: decryptedPwd, wasEncrypted } = this._decryptPassword(storedPwd);

            // 若讀到舊版明文密碼，自動遷移為加密版本
            if (!wasEncrypted && storedPwd && def['account']) {
                this.writeAccounts({ account: def['account'], password: decryptedPwd, rememberMe: def['rememberme'] === 'true' }).catch(() => {});
            }

            return {
                account: def['account'] || '',
                password: decryptedPwd,
                rememberMe: def['rememberme'] === 'true'
            };
        } catch (error) {
            console.error('❌ readAccounts 發生錯誤:', error);
            return { account: '', password: '', rememberMe: false };
        }
    }

    async writeAccounts({ account, password, rememberMe }) {
        try {
            const cfgPath = await this.getConfigFilePath();
            const dir = path.dirname(cfgPath);
            try {
                await fs.promises.access(dir, fs.constants.F_OK);
            } catch {
                await fs.promises.mkdir(dir, { recursive: true });
            }
            const encryptedPwd = this._encryptPassword(password || '');
            const content = this.writeSimpleIni({
                Default: {
                    Account: account || '',
                    Password: encryptedPwd,
                    RememberMe: String(rememberMe || false)
                }
            });
            await fs.promises.writeFile(cfgPath, content, 'utf-8');
            return true;
        } catch (error) {
            console.error('❌ writeAccounts 發生錯誤:', error);
            return false;
        }
    }

    async deleteAccounts() {
        try {
            const cfgPath = await this.getConfigFilePath();
            try {
                await fs.promises.access(cfgPath, fs.constants.F_OK);
                const content = this.writeSimpleIni({
                    Default: { Account: '', Password: '', RememberMe: 'false' }
                });
                await fs.promises.writeFile(cfgPath, content, 'utf-8');
            } catch { /* 檔案不存在則忽略 */ }
            return true;
        } catch (error) {
            console.error('❌ deleteAccounts 發生錯誤:', error);
            return false;
        }
    }
}

module.exports = new ConfigManager();
