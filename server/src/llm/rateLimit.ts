/** Simple token bucket: at most `rpm` requests per rolling minute, waiting callers queue in order. */
export class RateLimiter {
    private tokens: number;
    private last = Date.now();
    private queue: Array<() => void> = [];
    private timer: NodeJS.Timeout | null = null;

    constructor(private rpm: number) {
        this.tokens = Math.max(1, Math.min(rpm, 3)); // small initial burst
    }

    private refill() {
        const now = Date.now();
        this.tokens = Math.min(this.rpm, this.tokens + ((now - this.last) / 60_000) * this.rpm);
        this.last = now;
    }

    private pump() {
        this.timer = null;
        this.refill();
        while (this.queue.length && this.tokens >= 1) {
            this.tokens -= 1;
            this.queue.shift()!();
        }
        if (this.queue.length) {
            const waitMs = Math.ceil(((1 - this.tokens) / this.rpm) * 60_000);
            this.timer = setTimeout(() => this.pump(), waitMs);
        }
    }

    acquire(): Promise<void> {
        if (this.rpm <= 0) return Promise.resolve();
        return new Promise((resolve) => {
            this.queue.push(resolve);
            if (!this.timer) this.pump();
        });
    }
}
