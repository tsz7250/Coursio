const cheerio = require('cheerio');

function findSubmitButton(html) {
    const $ = cheerio.load(html);
    let btnName = null, btnValue = null, btnIsImage = false;
    $('input[type=submit], input[type=image], button').each((_, element) => {
        const $el = $(element);
        const text = ($el.attr('value') || $el.text() || '').trim();
        if (text.includes('確定') || text.includes('送出') || text.includes('查詢')) {
            btnName = $el.attr('name');
            btnValue = $el.attr('value') || text;
            btnIsImage = $el.attr('type') === 'image';
            return false;
        }
    });
    return { btnName, btnValue, btnIsImage };
}

function generateCheckCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function ensureCheckCodeCookie(cookieStore) {
    if (!cookieStore.CheckCode) cookieStore.CheckCode = generateCheckCode();
}

function parseHiddenFields(html) {
    const $ = cheerio.load(html);
    const pick = (name) => $(`input[name="${name}"]`).val() || '';
    return {
        __EVENTTARGET: '',
        __EVENTARGUMENT: '',
        __LASTFOCUS: '',
        __VIEWSTATE: pick('__VIEWSTATE'),
        __VIEWSTATEGENERATOR: pick('__VIEWSTATEGENERATOR'),
        __EVENTVALIDATION: pick('__EVENTVALIDATION')
    };
}

function parseHiddenFieldsComplete(html) {
    const $ = cheerio.load(html);
    const form = $('#form1');
    if (form.length === 0) throw new Error('找不到 form1');

    const data = {};
    form.find("input[type='hidden']").each((_, element) => {
        const name = $(element).attr('name');
        if (name) data[name] = $(element).attr('value') || '';
    });
    form.find('select').each((_, element) => {
        const name = $(element).attr('name');
        if (!name) return;
        const selected = $(element).find('option[selected]').first();
        if (selected.length > 0) data[name] = selected.attr('value') || '';
    });

    const action = form.attr('action') || './index.aspx?D=G';
    return { data, action };
}

function assertNotRedirectLoop(response) {
    if (response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers.location || '';
        if (location.includes('cosSelect/Index.aspx?D=G') || location.includes('cosSelect/index.aspx?D=G')) {
            throw new Error('伺服器重導回查詢首頁，通常是缺少 CheckCode 或隱藏欄位不正確造成。');
        }
    }
}

function buildForm(hiddenFields, additionalFields = {}) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(hiddenFields)) form.set(key, value);
    for (const [key, value] of Object.entries(additionalFields)) form.set(key, value);
    return form;
}

function buildFullUrl(baseUrl, action) {
    if (action.startsWith('http')) return action;
    return new URL(action, baseUrl).href;
}

module.exports = {
    findSubmitButton,
    generateCheckCode,
    ensureCheckCodeCookie,
    parseHiddenFields,
    parseHiddenFieldsComplete,
    assertNotRedirectLoop,
    buildForm,
    buildFullUrl
};
