/** Playback time that honours pause, speed and "skip this beat". */
export class Clock {
    speed = 1;
    paused = false;
    private skipListeners = new Set<() => void>();
    private resumeListeners = new Set<() => void>();

    pause() {
        this.paused = true;
    }

    resume() {
        this.paused = false;
        for (const fn of [...this.resumeListeners]) fn();
    }

    /** Ends every pending sleep and the current line immediately. */
    skip() {
        for (const fn of [...this.skipListeners]) fn();
    }

    onSkip(fn: () => void) {
        this.skipListeners.add(fn);
        return () => this.skipListeners.delete(fn);
    }

    untilResumed(): Promise<void> {
        if (!this.paused) return Promise.resolve();
        return new Promise((resolve) => {
            const fn = () => { this.resumeListeners.delete(fn); resolve(); };
            this.resumeListeners.add(fn);
        });
    }

    sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            let remaining = ms / this.speed;
            let last = performance.now();
            const finish = () => {
                clearInterval(id);
                off();
                resolve();
            };
            const id = setInterval(() => {
                const now = performance.now();
                if (!this.paused) remaining -= now - last;
                last = now;
                if (remaining <= 0) finish();
            }, 30);
            const off = this.onSkip(finish);
        });
    }
}
