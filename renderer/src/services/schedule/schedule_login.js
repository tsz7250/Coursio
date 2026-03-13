async function puppeteerLogin(page, backend) {
    try {
        console.log('🔐 開始Puppeteer登入流程...');

        let loginFailedByDialog = false;
        const onDialog = async (dialog) => {
            try {
                const msg = dialog && dialog.message ? (dialog.message() || '') : '';
                if (msg.includes('Login Failed') || msg.includes('登入失敗')) {
                    loginFailedByDialog = true;
                    await dialog.accept().catch(() => {});
                } else {
                    await dialog.dismiss().catch(() => {});
                }
            } catch (error) {
                void error;
            }
        };

        try { page.on('dialog', onDialog); } catch (error) { void error; }

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            try { page.off('dialog', onDialog); } catch (error) { void error; }
        };

        await page.goto('https://portalx.yzu.edu.tw/PortalSocialVB/Login.aspx', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await page.waitForSelector('#Txt_UserID', { timeout: 10000 });

        const accountStr = String(backend.ALLDATA.original_account || '');
        const passwordStr = String(backend.ALLDATA.original_password || '');
        await page.type('#Txt_UserID', accountStr);
        await page.type('#Txt_Password', passwordStr);

        await page.waitForFunction(() => {
            const hidToken = document.getElementById('hidToken');
            return hidToken && hidToken.value && hidToken.value.length > 10;
        }, { timeout: 10000 });

        await page.click('#ibnSubmit');

        const successWait = page.waitForFunction(() => {
            try {
                const bodyText = document.body && document.body.innerText ? String(document.body.innerText) : '';
                return window.location.href.includes('DefaultPage.aspx') || bodyText.includes('個人portal');
            } catch {
                return false;
            }
        }, { timeout: 20000 }).then(() => 'SUCCESS');

        const failurePoll = async () => {
            const hasFailInFrame = async (f) => {
                try {
                    return await f.evaluate(() => {
                        try {
                            const bodyText = document.body && document.body.innerText ? String(document.body.innerText) : '';
                            if (bodyText.includes('Login Failed') || bodyText.includes('登入失敗')) return true;
                            const selectors = ['.swal2-container', '.swal2-popup', '.modal', '.sweet-alert', '#errorBox'];
                            return selectors.some(sel => document.querySelector(sel));
                        } catch {
                            return false;
                        }
                    });
                } catch {
                    return false;
                }
            };

            try { if (await hasFailInFrame(page.mainFrame())) return true; } catch (error) { void error; }

            try {
                for (const f of page.frames()) {
                    if (!f || f === page.mainFrame()) continue;
                    try { if (await hasFailInFrame(f)) return true; } catch (error) { void error; }
                }
            } catch (error) { void error; }

            return false;
        };

        const dialogOrDomWait = new Promise((resolve) => {
            const tick = async () => {
                if (loginFailedByDialog) return resolve('DIALOG_FAILED');
                try {
                    const failed = await failurePoll();
                    if (failed) return resolve('DOM_FAILED');
                } catch (error) {
                    void error;
                }
                setTimeout(tick, 150);
            };
            tick();
        });

        const outcome = await Promise.race([successWait, dialogOrDomWait]);

        let currentUrl = '';
        let pageContent = '';
        try { currentUrl = String(page.url() || ''); } catch (error) { void error; }
        try { pageContent = String(await page.content() || ''); } catch (error) { void error; }

        if (outcome === 'SUCCESS' || (currentUrl && currentUrl.includes('DefaultPage.aspx')) || (pageContent && pageContent.includes('個人portal'))) {
            cleanup();
            return { success: true };
        }

        cleanup();
        return { success: false, message: loginFailedByDialog ? '登入失敗（對話框）' : '登入失敗，可能是帳號密碼錯誤' };
    } catch (error) {
        return { success: false, message: error.message };
    } finally {
        try { page.removeAllListeners && page.removeAllListeners('dialog'); } catch (error) { void error; }
    }
}

module.exports = { puppeteerLogin };
