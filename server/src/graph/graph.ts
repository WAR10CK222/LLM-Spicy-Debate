// src/graph/graph.ts — the trial as a LangGraph state machine.
//
//  START → frame_case ─(dismissed)→ END
//              ↓
//        debater_turn ⇄ courtroom_reaction   (openings, each count, closings)
//              ↓ (after openings / between counts)
//        announce_count → debater_turn …  → rule_count → announce_count | announce_closing
//              ↓ (after closings)
//        deliberate → case_brief → END
//
// Every node first looks for its own output in the event store (by deterministic key), so re-running a
// node after a crash or an adjournment never repeats an LLM call or emits a duplicate event.

import { END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import {
    otherSide,
    type CaseFile, type CaseFramedEvent, type DismissedEvent, type EventDraft, type Faction, type ObjectionEvent,
    type ReactionEvent, type RulingEvent, type Side, type SpeechEvent, type VerdictEvent, type BriefEvent,
} from "@court/shared";
import { DEBATE_RULES, SPICE_PRESETS } from "../config.js";
import { classify } from "../llm/errors.js";
import type { Llm } from "../llm/types.js";
import type { MockContext } from "../llm/mock.js";
import type { Repo } from "../db/repo.js";
import type { EventStore } from "../runtime/eventStore.js";
import type { Pacer } from "../runtime/pacer.js";
import type { AudienceInbox } from "../runtime/audience.js";
import { logger } from "../logger.js";
import { CourtState, zeroRubric, type Court, type CourtUpdate, type Stage } from "./state.js";
import {
    briefSchema, debaterSchema, frameCaseSchema, HUNG, reactionSchema, rulingSchema, verdictSchema,
    type FrameCaseOut, type ReactionOut,
} from "./schemas.js";
import { briefPrompt, debaterPrompt, frameCasePrompt, reactionPrompt, rulingPrompt, verdictPrompt } from "./prompts.js";
import { fallbackBrief, heuristicReaction, rubricWinner } from "./fallbacks.js";

export interface CourtDeps {
    llm: Llm;
    events: EventStore;
    repo: Repo;
    pacer: Pacer;
    inbox: AudienceInbox;
    /** Retries `fn` through "court recesses" (with back-off) and throws once they are exhausted. */
    withRecess: <T>(debateId: string, key: string, fn: () => Promise<T>) => Promise<T>;
    signalFor: (debateId: string) => AbortSignal | undefined;
    grounding: boolean;
}

const SIDE_COLORS = { for: "#3b82f6", against: "#ef4444", neutral: "#eab308" } as const;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Removes stage directions and "Name:" prefixes that models sometimes add anyway. */
export function cleanSpeech(text: string, name: string) {
    return text
        .replace(/\*[^*]{1,80}\*/g, "")
        .replace(new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i"), "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

export function normalizeCase(out: FrameCaseOut, state: Court): CaseFile {
    const { counts, crowdBias } = state.settings;
    const fallbackCounts = [
        { title: "The Core Question", question: `Is "${state.settings.topic}" right on the merits?` },
        { title: "Costs and Trade-offs", question: "Are the costs worth the benefits?" },
        { title: "The Long Run", question: "What happens in ten years?" },
    ];
    const caseCounts = [...out.counts, ...fallbackCounts].slice(0, counts);

    const bySide = (side: Faction["side"]) => out.factions.find((f) => f.side === side);
    const defaults = { for: "Team Yes", against: "Team Absolutely Not", neutral: "The Undecided" };
    const baseShare = { for: 0.35 + 0.25 * crowdBias, against: 0.35 - 0.25 * crowdBias, neutral: 0.3 };
    const factions: Faction[] = (["for", "against", "neutral"] as const).map((side, i) => {
        const f = bySide(side);
        return {
            id: `f${i}`,
            name: f?.name || defaults[side],
            side,
            bias: clamp(side === "neutral" ? Math.min(f?.bias ?? 0.2, 0.4) : (f?.bias ?? 0.7), 0, 1),
            color: SIDE_COLORS[side],
            sign: (f?.sign || (side === "neutral" ? "???" : side === "for" ? "YES!" : "NO!")).slice(0, 24),
            share: clamp(baseShare[side], 0.08, 0.8),
        };
    });
    const docket = `RC-${new Date().getFullYear()}-${state.debateId.slice(0, 4).toUpperCase()}`;
    return { title: out.title, docket, opening: out.opening, counts: caseCounts, factions, learningGoal: out.learningGoal };
}

const speechDraft = (p: Omit<EventDraft<SpeechEvent>, "type" | "roastLine" | "spice" | "claim" | "audienceNote" | "countIndex"> & Partial<EventDraft<SpeechEvent>>): EventDraft<SpeechEvent> => ({
    type: "speech", roastLine: null, spice: 0, claim: null, audienceNote: null, countIndex: null, ...p,
});

export function buildCourtGraph(deps: CourtDeps, checkpointer?: BaseCheckpointSaver) {
    const { llm, events, repo, pacer, inbox, withRecess } = deps;
    const gate = (id: string) => pacer.gate(id, deps.signalFor(id));
    const mockBase = (s: Court, seed: string): MockContext => ({
        topic: s.settings.topic, seed: `${s.debateId}:${seed}`,
        forName: s.participants.for.name, againstName: s.participants.against.name,
    });

    // 1. The judge frames the case (replaces initializeDebate + generateArgumentsNode).
    async function frameCase(state: Court): Promise<CourtUpdate> {
        const id = state.debateId;
        const dismissed = events.find<DismissedEvent>(id, "dismissed");
        if (dismissed) return { stage: "dismissed" };
        let framed = events.find<CaseFramedEvent>(id, "case");
        if (!framed) {
            events.append(id, "phase:framing", { type: "phase", phase: "framing", countIndex: null, label: "Court is now in session" });
            await gate(id);
            const { system, prompt } = frameCasePrompt(state);
            const { data } = await withRecess(id, "frame", () => llm.structured({
                task: "frame_case", tier: "main", schema: frameCaseSchema(state.settings.counts), system, prompt, temperature: 0.9,
                signal: deps.signalFor(id), mock: { ...mockBase(state, "frame"), counts: state.settings.counts },
            }));
            if (data.dismissed) {
                events.append(id, "dismissed", {
                    type: "dismissed", reason: data.dismissReason || "This case breaks the house rules.",
                    judgeLine: `Case dismissed! ${data.dismissReason || "This court doesn't hear that kind of case."} Next!`,
                });
                repo.finish(id, null, "dismissed");
                return { stage: "dismissed" };
            }
            const caseFile = normalizeCase(data, state);
            repo.setCase(id, caseFile);
            framed = events.append<CaseFramedEvent>(id, "case", { type: "case_framed", case: caseFile, participants: state.participants, settings: state.settings });
            events.append(id, "intro", speechDraft({
                speaker: "judge", kind: "intro", emotion: "neutral", gesture: "none", ttsStyle: "stern, booming, theatrical",
                text: `All rise! ${caseFile.title}. ${caseFile.opening.replace(/^\s*all rise[!.,]?\s*/i, "")} We begin with opening statements. ${state.participants.for.name}, the floor is yours.`,
            }));
            events.append(id, "phase:opening", { type: "phase", phase: "opening", countIndex: null, label: "Opening statements" });
        }
        return { caseFile: framed.case, stage: "opening", turnInStage: 0, nextSpeaker: "for" };
    }

    // 2. A lawyer speaks (openings, count turns and closings).
    async function debaterTurn(state: Court): Promise<CourtUpdate> {
        const id = state.debateId;
        const side = state.nextSpeaker;
        const me = state.participants[side];
        const no = state.speechNo + 1;
        const key = `speech:${no}`;
        let favorShift = 0;
        let ev = events.find<SpeechEvent>(id, key);
        if (!ev) {
            await gate(id);
            const digest = inbox.drain(id, side);
            favorShift = digest.favorShift;
            const { system, prompt } = debaterPrompt(state, side, digest.note);
            const range = SPICE_PRESETS[state.settings.spice].range;
            const { data } = await withRecess(id, key, () => llm.structured({
                task: "debater_turn", tier: "main", schema: debaterSchema, system, prompt, temperature: 0.95,
                signal: deps.signalFor(id),
                mock: {
                    ...mockBase(state, key), stage: state.stage, countIndex: state.countIndex, spiceRange: range,
                    speaker: { id: me.id, name: me.name, side, catchphrase: me.catchphrase },
                    opponent: { id: state.participants[otherSide(side)].id, name: state.participants[otherSide(side)].name },
                },
            }));
            const text = cleanSpeech(data.speech, me.name);
            ev = events.append<SpeechEvent>(id, key, speechDraft({
                speaker: side,
                kind: state.stage === "opening" ? "opening" : state.stage === "closing" ? "closing" : "turn",
                text,
                roastLine: data.roastLine.trim() || null,
                spice: clamp(Math.round(data.spice), 0, 10),
                claim: data.claim.trim() || null,
                emotion: data.emotion,
                gesture: data.gesture,
                ttsStyle: data.ttsStyle.slice(0, 60),
                countIndex: state.stage === "count" ? state.countIndex : null,
                audienceNote: digest.note,
            }));
        }
        return {
            speechNo: no,
            turnInStage: state.turnInStage + 1,
            nextSpeaker: otherSide(side),
            transcript: [...state.transcript, { side, name: me.name, text: ev.text, stage: state.stage, countIndex: state.stage === "count" ? state.countIndex : null }],
            lastSpeech: { seq: ev.seq, no, side, text: ev.text, claim: ev.claim ?? "", roastLine: ev.roastLine ?? "", spice: ev.spice },
            crowdFavor: clamp(state.crowdFavor + favorShift, -100, 100),
        };
    }

    // 3. Referee: fact-check, crowd + faces, live score, maybe an objection. Never blocks the show.
    async function courtroomReaction(state: Court): Promise<CourtUpdate> {
        const id = state.debateId;
        const s = state.lastSpeech!;
        const c = state.caseFile!;
        const key = `react:${s.no}`;
        let rx = events.find<ReactionEvent>(id, key);
        let obj = events.find<ObjectionEvent>(id, `objection:${s.no}`);
        if (!rx) {
            const spectator = inbox.takeObjection(id);
            const names = c.factions.map((f) => f.name) as [string, ...string[]];
            const { system, prompt } = reactionPrompt(state, spectator);
            const canObject = state.objectionsThisCount < DEBATE_RULES.max_objections_per_count;
            let out: ReactionOut;
            try {
                out = (await llm.structured({
                    task: "courtroom_reaction", tier: "lite", schema: reactionSchema(names), system, prompt, temperature: 0.8,
                    signal: deps.signalFor(id),
                    mock: {
                        ...mockBase(state, key), factions: names, spectatorObjection: spectator, canObject,
                        speaker: { id: state.participants[s.side].id, name: state.participants[s.side].name, side: s.side, catchphrase: "" },
                    },
                })).data;
            } catch (e) {
                const err = classify(e);
                if (err.kind === "fatal" || deps.signalFor(id)?.aborted) throw err;
                logger.warn(`referee fell back to heuristics for ${id}/${key}: ${err.message}`);
                out = heuristicReaction(state, s, spectator);
            }
            const idByName = new Map(c.factions.map((f) => [f.name, f.id]));
            const seen = new Set<string>();
            const crowd = out.crowd
                .filter((x) => idByName.has(x.faction) && !seen.has(x.faction) && seen.add(x.faction))
                .map((x) => ({ factionId: idByName.get(x.faction)!, reaction: x.reaction, intensity: clamp(x.intensity, 0, 1) }));
            const sign = s.side === "for" ? 1 : -1;
            const crowdFavor = clamp(state.crowdFavor + sign * out.crowdSwing * 2, -100, 100);
            rx = events.append<ReactionEvent>(id, key, {
                type: "reaction", toSeq: s.seq, speaker: s.side,
                speakerEmotion: out.speakerEmotion, opponentEmotion: out.opponentEmotion, judgeExpression: out.judgeExpression,
                crowd,
                heckles: out.heckles.filter((h) => idByName.has(h.faction)).slice(0, 2).map((h) => ({ factionId: idByName.get(h.faction)!, text: h.text })),
                factCheck: s.claim ? { claim: s.claim, ...out.factCheck } : null,
                score: out.score,
                roastLanded: out.roastLanded,
                crowdFavor,
            });
            if (out.objection.raised && (spectator || canObject)) {
                obj = events.append<ObjectionEvent>(id, `objection:${s.no}`, {
                    type: "objection",
                    by: spectator || out.objection.by === "spectator" ? "spectator" : otherSide(s.side),
                    against: s.side,
                    objectorLine: out.objection.objectorLine,
                    grounds: out.objection.grounds,
                    ruling: out.objection.ruling,
                    judgeLine: out.objection.judgeLine,
                });
            }
            if (s.roastLine) {
                const loud = crowd.filter((x) => ["laugh", "cheer", "ooh", "applause", "gasp"].includes(x.reaction));
                const crowdScore = clamp((loud.reduce((a, x) => a + x.intensity, 0) / Math.max(1, crowd.length)) + (out.roastLanded ? 0.35 : 0), 0, 1);
                repo.saveRoast(id, s.seq, state.participants[s.side].id, s.roastLine, s.spice, Math.round(crowdScore * 100) / 100);
            }
        }
        const add = (a: Court["countRubric"], side: Side) => ({
            ...a,
            [side]: { logic: a[side].logic + rx!.score.logic, evidence: a[side].evidence + rx!.score.evidence, wit: a[side].wit + rx!.score.wit },
        });
        const sustained = obj && obj.ruling === "sustained";
        return {
            countRubric: add(state.countRubric, s.side),
            totalRubric: add(state.totalRubric, s.side),
            crowdFavor: rx.crowdFavor,
            factChecks: rx.factCheck ? [...state.factChecks, rx.factCheck] : state.factChecks,
            objectionsThisCount: state.objectionsThisCount + (obj && obj.by !== "spectator" ? 1 : 0),
            warnings: sustained ? { ...state.warnings, [s.side]: [...state.warnings[s.side], obj!.grounds] } : state.warnings,
        };
    }

    // 4. The judge opens a count.
    async function announceCount(state: Court): Promise<CourtUpdate> {
        const id = state.debateId;
        const i = state.stage === "count" ? state.countIndex + 1 : 0;
        const count = state.caseFile!.counts[i];
        const starter: Side = i % 2 === 0 ? "for" : "against";
        if (!events.find(id, `count:${i}`)) {
            await gate(id);
            events.append(id, `phase:count:${i}`, { type: "phase", phase: "count", countIndex: i, label: `Count ${i + 1}: ${count.title}` });
            events.append(id, `count:${i}`, speechDraft({
                speaker: "judge", kind: "announce", emotion: "neutral", gesture: "none", ttsStyle: "formal and commanding", countIndex: i,
                text: `Count ${i + 1}: ${count.title}. ${count.question} ${state.participants[starter].name}, you're up.`,
            }));
        }
        return { stage: "count", countIndex: i, turnInStage: 0, nextSpeaker: starter, objectionsThisCount: 0, countRubric: { for: zeroRubric(), against: zeroRubric() } };
    }

    // 5. The judge rules on a count (fixes the old free-text winnerName: the schema only allows the two names).
    async function ruleCount(state: Court): Promise<CourtUpdate> {
        const id = state.debateId;
        const i = state.countIndex;
        const key = `ruling:${i}`;
        const p = state.participants;
        let ev = events.find<RulingEvent>(id, key);
        if (!ev) {
            await gate(id);
            const { system, prompt } = rulingPrompt(state);
            let winner: Side;
            let rubric: RulingEvent["rubric"];
            let judgeLine: string;
            let lesson: string;
            let summary: string;
            try {
                const { data } = await withRecess(id, key, () => llm.structured({
                    task: "rule_count", tier: "main", schema: rulingSchema(p.for.name, p.against.name), system, prompt, temperature: 0.6,
                    signal: deps.signalFor(id), mock: mockBase(state, key),
                }));
                winner = data.winner === p.for.name ? "for" : "against";
                rubric = { for: data.forScore, against: data.againstScore };
                ({ judgeLine, lesson, summary } = data);
            } catch (e) {
                if (classify(e).kind === "fatal" || deps.signalFor(id)?.aborted) throw e;
                winner = rubricWinner(state.countRubric);
                rubric = state.countRubric;
                judgeLine = `My notes have caught fire, so the referee's scorecard decides: this count goes to ${p[winner].name}.`;
                lesson = state.factChecks.at(-1)?.note ?? "Evidence beats volume.";
                summary = `${p[winner].name} edged count ${i + 1} on the scorecard.`;
            }
            const scores = { ...state.scores, [winner]: state.scores[winner] + 1 };
            ev = events.append<RulingEvent>(id, key, { type: "round_ruling", countIndex: i, winner, rubric, judgeLine, lesson, scores });
            repo.saveRound(id, i, state.caseFile!.counts[i].title, winner, rubric, judgeLine, lesson);
            return { scores, countSummaries: [...state.countSummaries, `Count ${i + 1} (${state.caseFile!.counts[i].title}): ${summary} Won by ${p[winner].name}.`], lessons: [...state.lessons, lesson] };
        }
        return {
            scores: ev.scores,
            countSummaries: [...state.countSummaries, `Count ${i + 1}: won by ${p[ev.winner].name}.`],
            lessons: [...state.lessons, ev.lesson],
        };
    }

    // 6. Closing statements: AGAINST first, FOR gets the last word.
    async function announceClosing(state: Court): Promise<CourtUpdate> {
        const id = state.debateId;
        if (!events.find(id, "closing")) {
            await gate(id);
            events.append(id, "phase:closing", { type: "phase", phase: "closing", countIndex: null, label: "Closing statements" });
            events.append(id, "closing", speechDraft({
                speaker: "judge", kind: "announce", emotion: "neutral", gesture: "none", ttsStyle: "weary but formal",
                text: `That concludes the counts. Closing statements: ${state.participants.against.name} first, then ${state.participants.for.name} gets the last word. Make it count. Or at least make it short.`,
            }));
        }
        return { stage: "closing", turnInStage: 0, nextSpeaker: "against" };
    }

    // 7. Deliberation and the verdict, plus Elo, applied atomically with the verdict event.
    async function deliberate(state: Court): Promise<CourtUpdate> {
        const id = state.debateId;
        const p = state.participants;
        if (!events.find(id, "verdict")) {
            events.append(id, "phase:deliberation", { type: "phase", phase: "deliberation", countIndex: null, label: "The judge is deliberating…" });
            await gate(id);
            const { system, prompt } = verdictPrompt(state);
            let winner: Side | "hung";
            let judgeLine: string;
            let sentence: string;
            let summary: string;
            try {
                const { data } = await withRecess(id, "verdict", () => llm.structured({
                    task: "verdict", tier: "main", schema: verdictSchema(p.for.name, p.against.name), system, prompt, temperature: 0.7,
                    signal: deps.signalFor(id), mock: { ...mockBase(state, "verdict"), scores: state.scores },
                }));
                winner = data.winner === HUNG ? "hung" : data.winner === p.for.name ? "for" : "against";
                ({ judgeLine, sentence, summary } = data);
            } catch (e) {
                if (classify(e).kind === "fatal" || deps.signalFor(id)?.aborted) throw e;
                winner = state.scores.for === state.scores.against ? rubricWinner(state.totalRubric) : state.scores.for > state.scores.against ? "for" : "against";
                judgeLine = `The court finds in favour of ${p[winner].name}, by the numbers, because my brain has left the building.`;
                sentence = "writing 'I will cite my sources' one hundred times.";
                summary = `${p[winner].name} won more counts.`;
            }
            const peoplesChoice: Side | "split" = state.crowdFavor > 8 ? "for" : state.crowdFavor < -8 ? "against" : "split";
            repo.db.transaction(() => {
                const elo = repo.applyVerdict(id, winner, peoplesChoice);
                events.append<VerdictEvent>(id, "verdict", {
                    type: "verdict", winner, judgeLine, sentence, summary, scores: state.scores,
                    crowdFavor: state.crowdFavor, peoplesChoice, elo,
                });
            })();
        }
        return { stage: "deliberation" };
    }

    // 8. The clerk's educational brief + quiz. Optionally grounded with Google Search.
    async function caseBrief(state: Court): Promise<CourtUpdate> {
        const id = state.debateId;
        if (!events.find(id, "brief")) {
            const { system, prompt } = briefPrompt(state);
            let brief;
            try {
                const { data, sources } = await withRecess(id, "brief", () => llm.structured({
                    task: "case_brief", tier: "main", schema: briefSchema, system, prompt, temperature: 0.3,
                    grounded: deps.grounding, signal: deps.signalFor(id), mock: mockBase(state, "brief"),
                }));
                brief = {
                    ...data,
                    quiz: data.quiz.filter((q) => q.options.length >= 2 && q.answerIndex < q.options.length).slice(0, 3),
                    sources: sources.slice(0, 6),
                };
            } catch (e) {
                if (classify(e).kind === "fatal" || deps.signalFor(id)?.aborted) throw e;
                brief = fallbackBrief(state);
            }
            repo.finish(id, brief);
            events.append(id, "phase:brief", { type: "phase", phase: "brief", countIndex: null, label: "Case brief" });
            events.append<BriefEvent>(id, "brief", { type: "brief", brief });
            events.append(id, "phase:done", { type: "phase", phase: "done", countIndex: null, label: "Court adjourned" });
        } else {
            repo.finish(id, repo.brief(id));
        }
        return { stage: "done" };
    }

    // --- CONDITIONAL EDGES (the original routers, now phase-aware) ---

    // Determines if the dialogue for the current stage should continue.
    function shouldContinueDialogue(state: Court): "debater_turn" | "announce_count" | "rule_count" | "deliberate" {
        const perStage: Record<string, number> = { opening: 2, count: state.settings.turnsPerCount, closing: 2 };
        if (state.turnInStage < (perStage[state.stage] ?? 0)) return "debater_turn";
        if (state.stage === "opening") return "announce_count";
        if (state.stage === "count") return "rule_count";
        return "deliberate";
    }

    // Determines if the trial should continue to the next count.
    function shouldContinueDebate(state: Court): "announce_count" | "announce_closing" {
        return state.countIndex + 1 < state.settings.counts ? "announce_count" : "announce_closing";
    }

    const afterFrame = (state: Court) => (state.stage === ("dismissed" as Stage) ? END : "debater_turn");

    const workflow = new StateGraph(CourtState)
        .addNode("frame_case", frameCase)
        .addNode("debater_turn", debaterTurn)
        .addNode("courtroom_reaction", courtroomReaction)
        .addNode("announce_count", announceCount)
        .addNode("rule_count", ruleCount)
        .addNode("announce_closing", announceClosing)
        .addNode("deliberate", deliberate)
        .addNode("case_brief", caseBrief)

        .addEdge(START, "frame_case")
        .addConditionalEdges("frame_case", afterFrame, ["debater_turn", END])
        .addEdge("debater_turn", "courtroom_reaction")
        .addConditionalEdges("courtroom_reaction", shouldContinueDialogue, ["debater_turn", "announce_count", "rule_count", "deliberate"])
        .addEdge("announce_count", "debater_turn")
        .addConditionalEdges("rule_count", shouldContinueDebate, ["announce_count", "announce_closing"])
        .addEdge("announce_closing", "debater_turn")
        .addEdge("deliberate", "case_brief")
        .addEdge("case_brief", END);

    return workflow.compile({ checkpointer });
}

export type CourtGraph = ReturnType<typeof buildCourtGraph>;
