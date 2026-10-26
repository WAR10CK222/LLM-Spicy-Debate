import { PACED_EVENT_TYPES, type DebateEvent } from "@court/shared";

interface PaceState {
    acked: number;
    pacedSeqs: number[];
    paused: boolean;
    viewers: number;
    waiters: Set<() => void>;
}

export class Aborted extends Error {
    constructor() { super("aborted"); }
}

/**
 * Keeps generation at most `lookahead` beats ahead of what the browser has finished playing.
 * While the current line plays, the next one is generated, which hides LLM latency without
 * running the whole trial ahead of the audience. Holds entirely while paused or unwatched.
 */
export class Pacer {
    private states = new Map<string, PaceState>();

    constructor(private lookahead: number, private enabled = true) {}

    private state(id: string): PaceState {
        let s = this.states.get(id);
        if (!s) {
            s = { acked: 0, pacedSeqs: [], paused: false, viewers: 0, waiters: new Set() };
            this.states.set(id, s);
        }
        return s;
    }

    /** Restores state after a restart: what was already played, and the paced events after it. */
    hydrate(id: string, playedSeq: number, events: DebateEvent[]) {
        const s = this.state(id);
        s.acked = Math.max(s.acked, playedSeq);
        s.pacedSeqs = events.filter((e) => PACED_EVENT_TYPES.has(e.type) && e.seq > s.acked).map((e) => e.seq);
    }

    track(e: DebateEvent) {
        if (PACED_EVENT_TYPES.has(e.type)) this.state(e.debateId).pacedSeqs.push(e.seq);
    }

    ack(id: string, seq: number) {
        const s = this.state(id);
        if (seq <= s.acked) return;
        s.acked = seq;
        s.pacedSeqs = s.pacedSeqs.filter((x) => x > seq);
        this.wake(s);
    }

    acked(id: string) {
        return this.state(id).acked;
    }

    setPaused(id: string, paused: boolean) {
        const s = this.state(id);
        s.paused = paused;
        this.wake(s);
    }

    isPaused(id: string) {
        return this.state(id).paused;
    }

    viewerJoined(id: string) {
        const s = this.state(id);
        s.viewers++;
        this.wake(s);
    }

    viewerLeft(id: string) {
        const s = this.state(id);
        s.viewers = Math.max(0, s.viewers - 1);
    }

    private ready(s: PaceState) {
        return !s.paused && s.viewers > 0 && s.pacedSeqs.length <= this.lookahead;
    }

    private wake(s: PaceState) {
        if (!this.ready(s)) return;
        for (const w of [...s.waiters]) w();
    }

    /** Resolves once the next beat may be generated. */
    gate(id: string, signal?: AbortSignal): Promise<void> {
        if (!this.enabled) return Promise.resolve();
        const s = this.state(id);
        if (this.ready(s)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const done = () => {
                s.waiters.delete(done);
                signal?.removeEventListener("abort", abort);
                resolve();
            };
            const abort = () => {
                s.waiters.delete(done);
                reject(new Aborted());
            };
            if (signal?.aborted) return abort();
            signal?.addEventListener("abort", abort, { once: true });
            s.waiters.add(done);
        });
    }

    forget(id: string) {
        this.states.delete(id);
    }
}
