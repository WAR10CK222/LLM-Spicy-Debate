// Live checks against the real Gemini API. Only run by `yarn test:live` (they spend quota), skipped by `yarn test`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BriefEvent, DebateEvent, ReactionEvent, RulingEvent, SpeechEvent, VerdictEvent } from "@court/shared";
import { env } from "../src/env.js";
import { openDb } from "../src/db/db.js";
import { Repo } from "../src/db/repo.js";
import { GeminiLlm } from "../src/llm/client.js";
import { AudienceInbox } from "../src/runtime/audience.js";
import { DebateRunner } from "../src/runtime/debateRunner.js";
import { EventStore } from "../src/runtime/eventStore.js";
import { Pacer } from "../src/runtime/pacer.js";
import { GeminiTts } from "../src/tts/gemini.js";
import { SETTINGS } from "./helpers.js";

const live = process.env.npm_lifecycle_event === "test:live" && !!env.apiKey;
const ofType = <T extends DebateEvent>(all: DebateEvent[], type: T["type"]) => all.filter((e) => e.type === type) as T[];

describe.runIf(live)("live Gemini", () => {
    it("runs a short trial end to end with valid structured output at every step", async () => {
        const llm = new GeminiLlm({ apiKey: env.apiKey, models: env.models, rpm: env.rpm, timeoutMs: env.timeoutMs });
        const db = openDb(":memory:");
        const repo = new Repo(db);
        const events = new EventStore(db);
        const runner = new DebateRunner({ llm, repo, events, pacer: new Pacer(1, false), inbox: new AudienceInbox() });
        const settings = { ...SETTINGS, topic: "Remote work is better than working in an office", forId: "chad", againstId: "gertrude", counts: 1, turnsPerCount: 2 };
        repo.createDebate("live0001", settings);

        const started = Date.now();
        await runner.run("live0001", false);
        const all = events.list("live0001");

        // Readable transcript for a human to judge the comedy and the facts.
        const out = path.join(os.tmpdir(), "roast-court-live-transcript.md");
        const names = { for: "Chad", against: "Gertrude", judge: "Judge" } as const;
        const lines = all.map((e) => {
            switch (e.type) {
                case "case_framed": return `# ${e.case.title}\n_${e.case.learningGoal}_\nFactions: ${e.case.factions.map((f) => `${f.name} (${f.side}, "${f.sign}")`).join("; ")}`;
                case "speech": return `**${names[e.speaker]}** [${e.emotion}/${e.gesture}, spice ${e.spice}]: ${e.text}${e.roastLine ? `\n  🔥 ${e.roastLine}` : ""}`;
                case "reaction": return `  ↳ fact-check ${e.factCheck?.verdict}: ${e.factCheck?.note}\n  ↳ crowd ${e.crowd.map((c) => `${c.reaction}:${c.intensity}`).join(", ")} | heckles: ${e.heckles.map((h) => h.text).join(" / ") || "none"} | opponent ${e.opponentEmotion}, judge ${e.judgeExpression}`;
                case "objection": return `  ⚡ OBJECTION (${e.by}) ${e.objectorLine} → ${e.ruling}: ${e.judgeLine}`;
                case "round_ruling": return `**RULING**: ${e.winner} — ${e.judgeLine}\n  lesson: ${e.lesson}`;
                case "verdict": return `**VERDICT**: ${e.winner} — ${e.judgeLine}\n  sentence: ${e.sentence}\n  people's choice: ${e.peoplesChoice}`;
                case "brief": return `**BRIEF** takeaways: ${e.brief.takeaways.join(" | ")}\n  quiz: ${e.brief.quiz.map((q) => q.question).join(" | ")}`;
                case "recess": return `☕ RECESS: ${e.reason}`;
                case "adjourned": return `🔨 ADJOURNED: ${e.reason}`;
                default: return null;
            }
        }).filter(Boolean);
        fs.writeFileSync(out, `${lines.join("\n\n")}\n\n---\nLLM calls: ${JSON.stringify(llm.calls)} in ${Math.round((Date.now() - started) / 1000)}s\n`);
        console.log(`transcript: ${out}\nllm calls: ${JSON.stringify(llm.calls)} in ${Math.round((Date.now() - started) / 1000)}s`);

        expect(ofType(all, "adjourned")).toHaveLength(0);
        expect(repo.status("live0001")).toBe("finished");

        const lawyer = ofType<SpeechEvent>(all, "speech").filter((s) => s.speaker !== "judge");
        expect(lawyer).toHaveLength(2 + 2 + 2);
        for (const s of lawyer) {
            expect(s.text.length).toBeGreaterThan(20);
            expect(s.text).not.toMatch(/^\s*(Chad|Grandma Gertrude)\s*:/);
        }
        const reactions = ofType<ReactionEvent>(all, "reaction");
        expect(reactions).toHaveLength(lawyer.length);
        expect(reactions.every((r) => r.crowd.length >= 1)).toBe(true);
        expect(ofType<RulingEvent>(all, "round_ruling")).toHaveLength(1);
        const [verdict] = ofType<VerdictEvent>(all, "verdict");
        expect(["for", "against", "hung"]).toContain(verdict.winner);
        const [brief] = ofType<BriefEvent>(all, "brief");
        expect(brief.brief.quiz.length).toBeGreaterThanOrEqual(1);
        for (const q of brief.brief.quiz) expect(q.answerIndex).toBeLessThan(q.options.length);
    }, 15 * 60_000);

    it("speaks a line with Gemini TTS (WAV, cached)", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-tts-"));
        const tts = new GeminiTts(env.apiKey, env.ttsModel, dir);
        const started = Date.now();
        const wav = await tts.synth("Objection! That argument has the structural integrity of a wet paper napkin.", "Kore", "outraged, theatrical");
        const firstMs = Date.now() - started;
        expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
        expect(wav.length).toBeGreaterThan(10_000);
        const again = Date.now();
        await tts.synth("Objection! That argument has the structural integrity of a wet paper napkin.", "Kore", "outraged, theatrical");
        console.log(`tts: ${wav.length} bytes in ${firstMs}ms, cached replay in ${Date.now() - again}ms`);
        expect(Date.now() - again).toBeLessThan(500);
    }, 120_000);
});
