import type { DebateEvent, EventDraft } from "@court/shared";
import type { Db } from "../db/db.js";

type Listener = (e: DebateEvent) => void;

/**
 * Append-only, per-debate event log. Every event has a deterministic `key` so that a graph node
 * re-run after a crash finds its earlier output instead of calling the LLM (and emitting) again.
 */
export class EventStore {
    private listeners = new Set<Listener>();
    private stmt;

    constructor(private db: Db) {
        this.stmt = {
            byKey: db.prepare(`SELECT payload_json FROM events WHERE debate_id = ? AND key = ?`),
            last: db.prepare(`SELECT COALESCE(MAX(seq), 0) AS s FROM events WHERE debate_id = ?`),
            insert: db.prepare(`INSERT INTO events (debate_id, seq, key, type, payload_json, ts) VALUES (?, ?, ?, ?, ?, ?)`),
            after: db.prepare(`SELECT payload_json FROM events WHERE debate_id = ? AND seq > ? ORDER BY seq`),
        };
    }

    onAppend(fn: Listener) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    find<T extends DebateEvent = DebateEvent>(debateId: string, key: string): T | undefined {
        const row = this.stmt.byKey.get(debateId, key) as { payload_json: string } | undefined;
        return row ? (JSON.parse(row.payload_json) as T) : undefined;
    }

    lastSeq(debateId: string): number {
        return (this.stmt.last.get(debateId) as { s: number }).s;
    }

    list(debateId: string, afterSeq = 0): DebateEvent[] {
        return (this.stmt.after.all(debateId, afterSeq) as { payload_json: string }[]).map((r) => JSON.parse(r.payload_json));
    }

    /** Idempotent: if `key` was already appended, returns the stored event and notifies nobody. */
    append<T extends DebateEvent>(debateId: string, key: string, draft: EventDraft<T>): T {
        const existing = this.find<T>(debateId, key);
        if (existing) return existing;
        const event = this.db.transaction(() => {
            const seq = this.lastSeq(debateId) + 1;
            const e = { ...draft, debateId, seq, ts: Date.now() } as unknown as T;
            this.stmt.insert.run(debateId, seq, key, e.type, JSON.stringify(e), e.ts);
            return e;
        })();
        for (const fn of this.listeners) fn(event);
        return event;
    }
}
