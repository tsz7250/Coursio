class RequestQueue {
    constructor(concurrency = 2) {
        this.concurrency = concurrency;
        this.running = 0;
        this.highQueue = [];
        this.lowQueue = [];
    }

    enqueue(fn, priority = 'low') {
        return new Promise((resolve, reject) => {
            const item = { fn, resolve, reject };
            if (priority === 'high') {
                this.highQueue.push(item);
            } else {
                this.lowQueue.push(item);
            }
            this.next();
        });
    }

    async next() {
        if (this.running >= this.concurrency) {
            return;
        }

        // 優先處理 High 佇列
        if (this.highQueue.length > 0) {
            const item = this.highQueue.shift();
            this.running++;
            try {
                const res = await item.fn();
                item.resolve(res);
            } catch (err) {
                item.reject(err);
            } finally {
                this.running--;
                this.next();
            }
            return;
        }

        // 只有當沒有任何等待的 High 任務時，才處理 Low 佇列
        if (this.lowQueue.length > 0) {
            const item = this.lowQueue.shift();
            this.running++;
            try {
                const res = await item.fn();
                item.resolve(res);
            } catch (err) {
                item.reject(err);
            } finally {
                this.running--;
                this.next();
            }
        }
    }

    clearLowQueue() {
        const remaining = this.lowQueue;
        this.lowQueue = [];
        remaining.forEach(item => item.reject(new Error('Queue cleared')));
    }
}

export const requestQueue = new RequestQueue(5); // 限制最大併發數為 5
