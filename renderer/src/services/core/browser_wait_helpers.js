async function waitForTargetFrame(page, includePatterns, excludePatterns = ['iframesub', 'iframeright', 'clickmenulog', 'about:blank'], timeout = 15000) {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        const frames = page.frames();
        for (const frame of frames) {
            const url = frame.url().toLowerCase();
            if (!url || url === 'about:blank') continue;

            const included = includePatterns.some(p => url.includes(p.toLowerCase()));
            if (!included) continue;

            const excluded = excludePatterns.some(p => url.includes(p.toLowerCase()));
            if (excluded) continue;

            try {
                await frame.waitForSelector('body', { timeout: 5000 });
                return frame;
            } catch {
                // wait next round
            }
        }
        await new Promise(r => setTimeout(r, 300));
    }

    return null;
}

async function waitForNetworkIdle(page, idleMs = 600, timeoutMs = 8000) {
    let inflightRequests = 0;
    let idleTimer = null;
    let resolved = false;

    const cleanup = () => {
        try {
            page.off('request', onRequestStarted);
            page.off('requestfinished', onRequestCompleted);
            page.off('requestfailed', onRequestCompleted);
        } catch {
            // ignore
        }
        if (idleTimer) clearTimeout(idleTimer);
    };

    const onRequestStarted = () => {
        inflightRequests++;
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
    };

    const onRequestCompleted = () => {
        inflightRequests = Math.max(0, inflightRequests - 1);
        if (inflightRequests === 0 && !resolved) {
            idleTimer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolver();
                }
            }, idleMs);
        }
    };

    page.on('request', onRequestStarted);
    page.on('requestfinished', onRequestCompleted);
    page.on('requestfailed', onRequestCompleted);

    let resolver;
    const idlePromise = new Promise((resolve) => { resolver = resolve; });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => {
        if (!resolved) {
            resolved = true;
            cleanup();
            reject(new Error('network idle timeout'));
        }
    }, timeoutMs));

    try {
        await Promise.race([idlePromise, timeoutPromise]);
    } finally {
        cleanup();
    }
}

module.exports = {
    waitForTargetFrame,
    waitForNetworkIdle
};
