/**
 * LoginService — 登入與 RSA 驗證專責服務
 *
 * 從 BackendService 中抽離 NewPortal 登入流程，
 * 包含：_setSidSpwd / _getRSAKey / _encryptData / loginService。
 */

const { default: Axios } = require('axios');
const NodeRSA = require('node-rsa');

class LoginService {
    constructor(backend) {
        this.backend = backend;
    }

    _setSidSpwd(sid, spwd) {
        this.backend.ALLDATA['account'] = sid;
        this.backend.ALLDATA['password'] = spwd;
        // 保留未加密憑證供後續流程使用
        this.backend.ALLDATA['original_account'] = sid;
        this.backend.ALLDATA['original_password'] = spwd;
    }

    loginService(sid, spwd) {
        this._setSidSpwd(sid, spwd);

        return this._getRSAKey()
            .then((service) => service._encryptData(sid, spwd))
            .then((service) => {
                console.log('登入成功');
                return service;
            })
            .catch((error) => {
                console.error('登入失敗:', error.message);
                throw error;
            });
    }

    _getRSAKey() {
        const url = this.backend.root_url + this.backend.urls.getRSAAPIKeyByAPPIDUrl;
        const ss = this.backend.ALLDATA['APIkey'] + ':' + this.backend.ALLDATA['Password'];

        const headers = {
            Accept: 'application/json',
            Authorization: 'Basic ' + Buffer.from(ss).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        this.backend.ALLDATA['Authorization'] = headers.Authorization;
        this.backend.ALLDATA['Accept'] = headers.Accept;

        const params = new URLSearchParams();
        params.append('AppId', this.backend.ALLDATA['AppId']);
        params.append('Content-Type', 'application/x-www-form-urlencoded');

        const axiosConfig = {
            headers,
            timeout: 30000,
            maxRedirects: 0,
            validateStatus(status) {
                return status >= 200 && status < 500;
            }
        };

        return Axios.post(url, params, axiosConfig).then((response) => {
            if (response.status >= 300 && response.status < 400) {
                let location = response.headers.location || response.headers.Location;
                console.warn('收到重定向回應，狀態碼:', response.status);
                console.warn('重定向位置:', location);

                if (location && (location.includes('Login') || location.includes('login'))) {
                    throw new Error('伺服器要求重新登入，請檢查 API 認證資訊');
                }

                if (location && !location.startsWith('http')) {
                    const baseUrl = url.substring(0, url.indexOf('/NewPortal/') + '/NewPortal/'.length);
                    location = baseUrl + location;
                }

                if (!location) {
                    throw new Error('收到重定向回應但沒有 Location header');
                }

                console.log('嘗試跟隨重定向到:', location);
                const redirectHeaders = Object.assign({}, headers, { Referer: url });

                return Axios.post(location, params, {
                    headers: redirectHeaders,
                    timeout: 30000,
                    maxRedirects: 0,
                    validateStatus(status) {
                        return status >= 200 && status < 500;
                    }
                }).then((redirectResponse) => {
                    if (redirectResponse.status >= 200 && redirectResponse.status < 300) {
                        this.backend.ALLDATA['PublicKeyXml'] = redirectResponse.data['RSAkey'];
                        this.backend.ALLDATA['Modulus'] = redirectResponse.data['Modulus'];
                        this.backend.ALLDATA['Exponent'] = redirectResponse.data['Exponent'];
                        return this.backend;
                    }

                    if (redirectResponse.status >= 300 && redirectResponse.status < 400) {
                        throw new Error('重定向循環：收到第二次重定向回應');
                    }

                    throw new Error(`重定向後收到意外的回應狀態碼: ${redirectResponse.status}`);
                });
            }

            if (response.status >= 200 && response.status < 300) {
                this.backend.ALLDATA['PublicKeyXml'] = response.data['RSAkey'];
                this.backend.ALLDATA['Modulus'] = response.data['Modulus'];
                this.backend.ALLDATA['Exponent'] = response.data['Exponent'];
                return Promise.resolve(this.backend);
            }

            throw new Error(`意外的回應狀態碼: ${response.status}`);
        }).catch((error) => {
            console.error('RSA Key 取得失敗:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            if (error.response) {
                console.error('回應狀態:', error.response.status);
                console.error('回應資料:', error.response.data);
                console.error('回應標頭:', error.response.headers);
            } else if (error.request) {
                console.error('請求配置:', error.config);
                console.error('沒有收到回應，請求詳情:', error.request);
            }
            return Promise.reject(error);
        });
    }

    _encryptData(account, password) {
        console.log('---------- Login');

        this._setSidSpwd(account, password);

        const key = new NodeRSA();
        key.setOptions({ encryptionScheme: 'pkcs1' });

        key.importKey({
            n: Buffer.from(this.backend.ALLDATA['Modulus'], 'base64'),
            e: 65537
        }, 'components-public');

        this.backend.ALLDATA['account'] = key.encrypt(Buffer.from(account, 'ascii'), 'base64');
        this.backend.ALLDATA['password'] = key.encrypt(Buffer.from(password, 'ascii'), 'base64');

        return Promise.resolve(this.backend);
    }
}

module.exports = LoginService;
