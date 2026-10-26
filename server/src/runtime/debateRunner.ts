import { randomUUID } from "node:crypto";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { DebateSettings, DebateStatus } from "@court/shared";
import { DEBATE_RULES } from "../config.js";
import type { Repo } from "../db/repo.js";
import { buildCourtGraph, type CourtGraph } from "../graph/graph.js";
import { initialState } from "../graph/state.js";
import { classify, LlmError } from "../llm/errors.js";
import type { Llm } from "../llm/types.js";
import { logger } from "../logger.js";
import type { AudienceInbox } from "./audience.js";
import type { EventStore } from "./eventStore.js";
import { Aborted, type Pacer } from "./pacer.js";

export interface RunnerDeps {
    llm: Llm;
    repo: Repo;
    events: EventStore;
    pacer: Pacer;
    inbox: AudienceInbox;
    checkpointer?: BaseCheckpointSaver;
    grounding?: boolean;
    onStatus?: (debateId: string, status: DebateStatus) => void;
    /** Overridable for tests. */
    recessBackoffMs?: number[];
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const abortableSleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new Aborted()); };
    signal?.addEventListener("abort", onAbort, { once: true });
});

function humanReason(e: LlmError) {
    if (e.status === 429) return "The court's AI has hit its rate limit. The judge is taking a coffee break.";
    if (e.status && e.status >= 500) return "The court's AI is overloaded. The judge is calling a short recess.";
    if (e.kind === "invalid_output") return "A lawyer mumbled something unintelligible. The court will hear it again.";
    return "Technical difficulties in the courtroom. A short recess.";
}

export class DebateRunner {
    readonly graph: CourtGraph;
    private active = new Map<string, AbortController>();
    private backoff: number[];
    private sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

    constructor(private deps: RunnerDeps) {
        this.backoff = deps.recessBackoffMs ?? DEBATE_RULES.recess_backoff_ms;
        this.sleep = deps.sleep ?? abortableSleep;
        this.graph = buildCourtGraph({
            llm: deps.llm,
            events: deps.events,
            repo: deps.repo,
            pacer: deps.pacer,
            inbox: deps.inbox,
            grounding: !!deps.grounding,
            signalFor: (id) => this.active.get(id)?.signal,
            withRecess: (id, key, fn) => this.withRecess(id, key, fn),
        }, deps.checkpointer);
    }

    private setStatus(id: string, status: DebateStatus, error: string | null = null) {
        this.deps.repo.setStatus(id, status, error);
        this.deps.onStatus?.(id, status);
    }

    /** Retries through "recesses" so a 503 or 429 pauses the show instead of killing it. */
    private async withRecess<T>(id: string, key: string, fn: () => Promise<T>): Promise<T> {
        for (let attempt = 0; ; attempt++) {
            try {
                const result = await fn();
                if (attempt > 0) this.setStatus(id, "running");
                return result;
            } catch (e) {
                const err = classify(e);
                const signal = this.active.get(id)?.signal;
                // Only failures that can fix themselves (overload, rate limit, a garbled reply) are worth a recess.
                const retryable = err.kind === "transient" || err.kind === "invalid_output";
                if (!retryable || signal?.aborted || attempt >= this.backoff.length) throw err;
                const wait = this.backoff[attempt];
                logger.warn(`recess ${attempt + 1} for ${id}/${key}: ${err.message.slice(0, 200)}`);
                this.deps.events.append(id, `recess:${key}:${attempt}`, {
                    type: "recess", reason: humanReason(err), attempt: attempt + 1, retryInMs: wait,
                });
                this.setStatus(id, "recess");
                await this.sleep(wait, signal);
            }
        }
    }

    create(settings: DebateSettings): string {
        const { repo } = this.deps;
        const pf = repo.persona(settings.forId);
        const pa = repo.persona(settings.againstId);
        if (!pf || !pa) throw new Error("Unknown lawyer.");
        const id = randomUUID().replace(/-/g, "").slice(0, 12);
        repo.createDebate(id, settings);
        void this.run(id, false);
        return id;
    }

    isActive(id: string) {
        return this.active.has(id);
    }

    /** Runs (or resumes from its last checkpoint) a trial until it finishes, adjourns or is aborted. */
    async run(id: string, resume: boolean): Promise<void> {
        if (this.active.has(id)) return;
        const { repo, events, pacer } = this.deps;
        const settings = repo.settings(id);
        if (!settings) return;
        const ac = new AbortController();
        this.active.set(id, ac);
        pacer.hydrate(id, repo.playedSeq(id), events.list(id, repo.playedSeq(id)));
        const config = { configurable: { thread_id: id }, recursionLimit: 1000, signal: ac.signal };
        try {
            this.setStatus(id, "running");
            const snapshot = resume && this.deps.checkpointer ? await this.graph.getState(config) : null;
            const hasCheckpoint = !!snapshot?.next?.length;
            const input = hasCheckpoint ? null : initialState(id, settings, {
                for: repo.persona(settings.forId)!,
                against: repo.persona(settings.againstId)!,
            });
            await this.graph.invoke(input, config);
            const status = repo.status(id);
            if (status === "running" || status === "recess") this.setStatus(id, "finished");
            else if (status) this.deps.onStatus?.(id, status);
        } catch (e) {
            if (ac.signal.aborted || e instanceof Aborted) {
                logger.info(`trial ${id} suspended`);
                return;
            }
            const err = classify(e);
            logger.error(`trial ${id} adjourned: ${err.message}`, { stack: (e as Error)?.stack });
            const reason = err.kind === "fatal"
                ? `The court can't reach its AI: ${err.message}`
                : err.kind === "model"
                    ? `The court's AI rejected the request: ${err.message}`
                    : "The court's AI kept failing, so the case is adjourned. You can resume it.";
            events.append(id, `adjourned:${Date.now()}`, { type: "adjourned", reason });
            this.setStatus(id, "adjourned", err.message);
        } finally {
            this.active.delete(id);
        }
    }

    /** Resumes an adjourned trial (or one that was mid-flight when the server stopped). */
    resume(id: string) {
        const status = this.deps.repo.status(id);
        if (!status || status === "finished" || status === "dismissed") return false;
        void this.run(id, true);
        return true;
    }

    resumeUnfinished() {
        for (const id of this.deps.repo.unfinishedDebates()) {
            logger.info(`resuming trial ${id} from its last checkpoint`);
            this.resume(id);
        }
    }

    async shutdown() {
        for (const ac of this.active.values()) ac.abort();
        const deadline = Date.now() + 3000;
        while (this.active.size && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    }
}
