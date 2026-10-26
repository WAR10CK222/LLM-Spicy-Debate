import type { DebateSettings } from "@court/shared";
import { openDb } from "../src/db/db.js";
import { Repo } from "../src/db/repo.js";
import { EventStore } from "../src/runtime/eventStore.js";
import { Pacer } from "../src/runtime/pacer.js";
import { AudienceInbox } from "../src/runtime/audience.js";
import { DebateRunner } from "../src/runtime/debateRunner.js";
import type { Llm } from "../src/llm/types.js";

export const SETTINGS: DebateSettings = {
    topic: "Pineapple belongs on pizza",
    forId: "eleonora",
    againstId: "marcus",
    spice: "roast",
    judgeMood: "fair",
    crowdBias: 0.5,
    depth: "quick",
    counts: 2,
    turnsPerCount: 4,
};

export function makeCourt(llm: Llm, opts: { db?: ReturnType<typeof openDb>; pacer?: Pacer } = {}) {
    const db = opts.db ?? openDb(":memory:");
    const repo = new Repo(db);
    const events = new EventStore(db);
    const pacer = opts.pacer ?? new Pacer(1, false);
    const inbox = new AudienceInbox();
    const runner = new DebateRunner({
        llm, repo, events, pacer, inbox,
        recessBackoffMs: [5, 5, 5],
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    });
    return { db, repo, events, pacer, inbox, runner };
}

export function newDebate(repo: Repo, id = "case0001aaaa", settings: DebateSettings = SETTINGS) {
    repo.createDebate(id, settings);
    return id;
}
