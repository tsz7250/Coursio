const https = require('https');
const http = require('http');

// M-01 重試設定
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

// 判斷是否值得重試的狀態碼或錯誤類型
function _isRetryable(err, statusCode) {
    if (err) {
        // 網路錯誤、逾時、連線中斷均可重試
        return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE'].includes(err.code);
    }
    return statusCode >= 500 || statusCode === 429;
}

class HttpClient {
    constructor() {
        // M-07: cookieStore 結構由 { name: value } 改為 { name: { value, expiresAt } }
        // expiresAt = null 代表 session cookie（瀏覽器關閉後消失，不需主動過期）
        this._cookieStore = {};
    }

    _updateCookiesFromResponse(res) {
        const setCookie = res.headers['set-cookie'];
        if (!setCookie || !Array.isArray(setCookie)) return;
        const now = Date.now();
        setCookie.forEach((cookieStr) => {
            const parts = cookieStr.split(';');
            const pair = parts[0];
            const eq = pair.indexOf('=');
            if (eq <= 0) return;
            const name = pair.substring(0, eq).trim();
            const value = pair.substring(eq + 1).trim();

            // M-07: 解析 Max-Age / Expires 決定過期時間
            let expiresAt = null;
            for (let i = 1; i < parts.length; i++) {
                const attr = parts[i].trim();
                const attrLower = attr.toLowerCase();
                if (attrLower.startsWith('max-age=')) {
                    const seconds = parseInt(attr.slice('max-age='.length), 10);
                    if (!isNaN(seconds)) expiresAt = now + seconds * 1000;
                    break;
                } else if (attrLower.startsWith('expires=')) {
                    const ts = Date.parse(attr.slice('expires='.length));
                    if (!isNaN(ts)) expiresAt = ts;
                    break;
                }
            }
            this._cookieStore[name] = { value, expiresAt };
        });
    }

    _getCookieHeader() {
        const now = Date.now();
        const pairs = [];
        for (const [name, entry] of Object.entries(this._cookieStore || {})) {
            // M-07: 跳過已過期的 Cookie
            if (entry.expiresAt !== null && entry.expiresAt <= now) continue;
            pairs.push(`${name}=${entry.value}`);
        }
        return pairs.join('; ');
    }

    // M-01: 指數退避重試包裝器
    async _withRetry(fn, maxRetries = MAX_RETRIES, baseDelay = RETRY_BASE_DELAY_MS) {
        let lastErr;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await fn();
                // 5xx / 429 需重試
                if (_isRetryable(null, result.statusCode) && attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.warn(`⚠️ HTTP ${result.statusCode}，${delay}ms 後重試（${attempt + 1}/${maxRetries}）`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                return result;
            } catch (err) {
                lastErr = err;
                if (_isRetryable(err, null) && attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.warn(`⚠️ 網路錯誤 (${err.code})，${delay}ms 後重試（${attempt + 1}/${maxRetries}）`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    throw err;
                }
            }
        }
        throw lastErr;
    }

    // 簡易 GET：使用 Node https/http 並支援重導向
    get(urlString, headers = {}, redirectCount = 0) {
        return this._withRetry(() => this._doGet(urlString, headers, redirectCount));
    }

    _doGet(urlString, headers = {}, redirectCount = 0) {
        return new Promise((resolve, reject) => {
            try {
                const url = new URL(urlString);
                const isHttps = url.protocol === 'https:';
                const mod = isHttps ? https : http;
                
                const mergedHeaders = Object.assign({}, headers || {});
                const cookieHeader = this._getCookieHeader();
                if (cookieHeader) mergedHeaders['Cookie'] = cookieHeader;

                const req = mod.request({
                    protocol: url.protocol,
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname + (url.search || ''),
                    method: 'GET',
                    headers: mergedHeaders,
                    rejectUnauthorized: !(url.hostname === 'yzu.edu.tw' || url.hostname.endsWith('.yzu.edu.tw')),
                }, (res) => {
                    const status = res.statusCode || 0;
                    this._updateCookiesFromResponse(res);

                    if (status >= 300 && status < 400 && res.headers.location) {
                        if (redirectCount >= 5) return reject(new Error('Too many redirects'));
                        const next = new URL(res.headers.location, urlString).toString();
                        res.resume();
                        return resolve(this._doGet(next, headers, redirectCount + 1));
                    }

                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                    res.on('end', () => {
                        const body = Buffer.concat(chunks).toString('utf8');
                        resolve({ statusCode: status, headers: res.headers, body });
                    });
                });
                req.on('error', reject);
                req.end();
            } catch (e) {
                reject(e);
            }
        });
    }

    // 簡易 POST Form
    postForm(urlString, form, headers = {}, redirectCount = 0) {
        return this._withRetry(() => this._doPostForm(urlString, form, headers, redirectCount));
    }

    _doPostForm(urlString, form, headers = {}, redirectCount = 0) {
        return new Promise((resolve, reject) => {
            try {
                const url = new URL(urlString);
                const isHttps = url.protocol === 'https:';
                const mod = isHttps ? https : http;
                const body = new URLSearchParams(form || {}).toString();

                const mergedHeaders = Object.assign({
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(body),
                }, headers || {});

                const cookieHeader = this._getCookieHeader();
                if (cookieHeader) mergedHeaders['Cookie'] = cookieHeader;

                const req = mod.request({
                    protocol: url.protocol,
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname + (url.search || ''),
                    method: 'POST',
                    headers: mergedHeaders,
                    rejectUnauthorized: !(url.hostname === 'yzu.edu.tw' || url.hostname.endsWith('.yzu.edu.tw')),
                }, (res) => {
                    const status = res.statusCode || 0;
                    this._updateCookiesFromResponse(res);

                    if (status >= 300 && status < 400 && res.headers.location) {
                        if (redirectCount >= 5) return reject(new Error('Too many redirects'));
                        const next = new URL(res.headers.location, urlString).toString();
                        res.resume();
                        return resolve(this._doGet(next, headers, redirectCount + 1));
                    }

                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                    res.on('end', () => {
                        const respBody = Buffer.concat(chunks).toString('utf8');
                        resolve({ statusCode: status, headers: res.headers, body: respBody });
                    });
                });
                req.on('error', reject);
                req.write(body);
                req.end();
            } catch (e) {
                reject(e);
            }
        });
    }
}

module.exports = HttpClient;
