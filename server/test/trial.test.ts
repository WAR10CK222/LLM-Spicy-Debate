import { describe, expect, it } from "vitest";
import type { DebateEvent, SpeechEvent, VerdictEvent, BriefEvent, RulingEvent } from "@court/shared";
import { MockLlm } from "../src/llm/mock.js";
import { cleanSpeech } from "../src/graph/graph.js";
import { makeCourt, newDebate, SETTINGS } from "./helpers.js";

const fast = () => new MockLlm({ latencyMs: [0, 0] });
const ofType = <T extends DebateEvent>(events: DebateEvent[], type: T["type"]) => events.filter((e) => e.type === type) as T[];

describe("a full trial (mock LLM)", () => {
    it("runs openings, every count, closings, verdict and brief in order", async () => {
        const llm = fast();
        const { repo, events, runner } = makeCourt(llm);
        const id = newDebate(repo);
        await runner.run(id, false);

        const all = events.list(id);
        expect(all.map((e) => e.seq)).toEqual(all.map((_, i) => i + 1));

        const speeches = ofType<SpeechEvent>(all, "speech");
        const byKind = (k: SpeechEvent["kind"]) => speeches.filter((s) => s.kind === k).length;
        expect(byKind("opening")).toBe(2);
        expect(byKind("turn")).toBe(SETTINGS.counts * SETTINGS.turnsPerCount);
        expect(byKind("closing")).toBe(2);
        expect(byKind("intro")).toBe(1);
        expect(byKind("announce")).toBe(SETTINGS.counts + 1);

        // Lawyers alternate within each stage; FOR opens, AGAINST closes first.
        const lawyers = speeches.filter((s) => s.speaker !== "judge");
        expect(lawyers[0].speaker).toBe("for");
        expect(lawyers[1].speaker).toBe("against");
        expect(lawyers.at(-2)!.speaker).toBe("against");
        expect(lawyers.at(-1)!.speaker).toBe("for");

        // Every lawyer speech gets exactly one reaction.
        expect(ofType(all, "reaction")).toHaveLength(lawyers.length);

        const rulings = ofType<RulingEvent>(all, "round_ruling");
        expect(rulings).toHaveLength(SETTINGS.counts);
        expect(rulings.at(-1)!.scores.for + rulings.at(-1)!.scores.against).toBe(SETTINGS.counts);
        rulings.forEach((r) => expect(["for", "against"]).toContain(r.winner));

        const [verdict] = ofType<VerdictEvent>(all, "verdict");
        expect(["for", "against", "hung"]).toContain(verdict.winner);
        const [brief] = ofType<BriefEvent>(all, "brief");
        expect(brief.brief.quiz).toHaveLength(3);
        expect(all.at(-1)).toMatchObject({ type: "phase", phase: "done" });

        expect(repo.status(id)).toBe("finished");
        const lb = repo.leaderboard();
        const games = lb.reduce((n, p) => n + p.wins + p.losses + p.draws, 0);
        expect(games).toBe(2);
        expect(repo.topRoasts().length).toBeGreaterThan(0);

        // 1 frame + lawyers + reactions + rulings + verdict + brief
        expect(llm.calls.total).toBe(1 + lawyers.length * 2 + SETTINGS.counts + 2);
    });

    it("is idempotent: re-running a finished trial makes no LLM calls and no new events", async () => {
        const first = fast();
        const court = makeCourt(first);
        const id = newDebate(court.repo);
        await court.runner.run(id, false);
        const before = court.events.lastSeq(id);
        const eloBefore = court.repo.leaderboard().map((p) => [p.id, p.elo]);

        const second = fast();
        const again = makeCourt(second, { db: court.db });
        await again.runner.run(id, false);
        expect(second.calls.total).toBe(0);
        expect(again.events.lastSeq(id)).toBe(before);
        expect(again.repo.leaderboard().map((p) => [p.id, p.elo])).toEqual(eloBefore);
    });

    it("calls a recess on transient failures and carries on", async () => {
        const llm = new MockLlm({ latencyMs: [0, 0], failFirst: 2 });
        const { repo, events, runner } = makeCourt(llm);
        const id = newDebate(repo);
        await runner.run(id, false);
        const recesses = ofType(events.list(id), "recess");
        expect(recesses).toHaveLength(2);
        expect(repo.status(id)).toBe("finished");
    });

    it("adjourns on a fatal error and can be resumed", async () => {
        const llm = new MockLlm({ latencyMs: [0, 0], failFirst: 1, error: () => ({ status: 401, message: "bad key" }) });
        const { repo, events, runner } = makeCourt(llm);
        const id = newDebate(repo);
        await runner.run(id, false);
        expect(repo.status(id)).toBe("adjourned");
        expect(ofType(events.list(id), "adjourned")).toHaveLength(1);

        await runner.run(id, true);
        expect(repo.status(id)).toBe("finished");
    });

    it("adjourns at once, without recesses, when every model rejects the request (400)", async () => {
        const llm = new MockLlm({ latencyMs: [0, 0], failFirst: 1, error: () => ({ status: 400, message: "unsupported parameter" }) });
        const { repo, events, runner } = makeCourt(llm);
        const id = newDebate(repo);
        await runner.run(id, false);
        const all = events.list(id);
        expect(ofType(all, "recess")).toHaveLength(0);
        expect(ofType(all, "adjourned")[0]).toMatchObject({ reason: expect.stringContaining("unsupported parameter") });
        expect(repo.status(id)).toBe("adjourned");
    });

    it("feeds spectator actions into the next speech and rules on spectator objections", async () => {
        const llm = fast();
        const { repo, events, runner, inbox } = makeCourt(llm);
        const id = newDebate(repo);
        inbox.push(id, "tomato", "for");
        inbox.push(id, "tomato", "for");
        inbox.push(id, "objection", null);
        await runner.run(id, false);
        const all = events.list(id);
        const firstSpeech = ofType<SpeechEvent>(all, "speech").find((s) => s.speaker === "for")!;
        expect(firstSpeech.audienceNote).toMatch(/2 tomatoes thrown at YOU/);
        const objections = ofType(all, "objection");
        expect(objections[0]).toMatchObject({ by: "spectator" });
    });
});

describe("cleanSpeech", () => {
    it("strips stage directions and name prefixes", () => {
        expect(cleanSpeech("Marcus: *adjusts glasses* Cool story.  Who pays?", "Marcus")).toBe("Cool story. Who pays?");
    });
});
