function ensureObject(payload, fieldName = 'payload') {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(`${fieldName} 必須是 object`);
    }
    return payload;
}

function ensureString(value, fieldName) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${fieldName} 必須是非空字串`);
    }
    return value;
}

function ensureOptionalString(value, fieldName) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} 必須是字串`);
    }
    return value;
}

function ensureNumber(value, fieldName) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`${fieldName} 必須是數字`);
    }
    return value;
}

module.exports = {
    ensureObject,
    ensureString,
    ensureOptionalString,
    ensureNumber
};
