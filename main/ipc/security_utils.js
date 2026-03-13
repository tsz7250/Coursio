const path = require('path');
const os = require('os');
const { URL } = require('url');

function getAllowedConfigRoots(app) {
    const appData = process.env.APPDATA || os.homedir();
    return [
        path.resolve(app.getPath('userData')),
        path.resolve(path.join(appData, 'Coursio'))
    ];
}

function isPathWithinRoots(targetPath, roots) {
    const resolvedTarget = path.resolve(targetPath);
    return roots.some((root) => {
        const resolvedRoot = path.resolve(root);
        return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep);
    });
}

function validateCustomConfigPath(app, customPath) {
    if (!customPath) return { valid: true, normalized: null };

    const normalized = path.resolve(String(customPath));
    const ext = path.extname(normalized).toLowerCase();
    if (ext && ext !== '.ini') {
        return { valid: false, reason: '設定檔路徑必須為 .ini 檔案' };
    }

    const allowedRoots = getAllowedConfigRoots(app);
    if (!isPathWithinRoots(normalized, allowedRoots)) {
        return { valid: false, reason: '設定檔路徑超出允許範圍' };
    }

    return { valid: true, normalized };
}

function sanitizeOpenDialogOptions(app, options) {
    const input = options && typeof options === 'object' ? options : {};
    const safe = {};

    if (typeof input.title === 'string') safe.title = input.title;
    if (typeof input.buttonLabel === 'string') safe.buttonLabel = input.buttonLabel;
    if (typeof input.message === 'string') safe.message = input.message;

    if (typeof input.defaultPath === 'string') {
        const resolved = path.resolve(input.defaultPath);
        if (isPathWithinRoots(resolved, getAllowedConfigRoots(app))) {
            safe.defaultPath = resolved;
        }
    }

    const allowedProperties = new Set(['openFile', 'openDirectory', 'multiSelections', 'showHiddenFiles', 'createDirectory']);
    if (Array.isArray(input.properties)) {
        const filtered = input.properties.filter((p) => typeof p === 'string' && allowedProperties.has(p));
        if (filtered.length > 0) safe.properties = filtered;
    }

    if (Array.isArray(input.filters)) {
        safe.filters = input.filters
            .filter((f) => f && typeof f === 'object' && typeof f.name === 'string' && Array.isArray(f.extensions))
            .map((f) => ({
                name: f.name,
                extensions: f.extensions.filter((e) => typeof e === 'string' && /^[a-zA-Z0-9]+$/.test(e))
            }))
            .filter((f) => f.extensions.length > 0);
    }

    if (!safe.properties) safe.properties = ['openFile'];
    return safe;
}

function validateIpcSender(event) {
    try {
        const frameUrl = event?.senderFrame?.url || '';
        if (!frameUrl) return false;

        if (frameUrl.startsWith('file://')) return true;

        const parsed = new URL(frameUrl);
        if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && /^\d+$/.test(parsed.port || '')) {
            return true;
        }
    } catch {
        return false;
    }

    return false;
}

module.exports = {
    validateCustomConfigPath,
    sanitizeOpenDialogOptions,
    validateIpcSender
};
