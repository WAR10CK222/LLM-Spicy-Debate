// src/graph/prompts.ts
import { JUDGE, otherSide, type Faction, type Persona, type Side } from "@court/shared";
import { DEBATE_RULES, DEPTH_PRESETS, HOUSE_RULES, JUDGE_MOODS, SPICE_PRESETS } from "../config.js";
import type { Court } from "./state.js";
import { HUNG } from "./schemas.js";

const sideLabel = (s: Side) => (s === "for" ? "FOR" : "AGAINST");
const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();

/** True once this lawyer has said (roughly) their catchphrase in the trial. */
function usedCatchphrase(state: Court, side: Side) {
    const key = normalize(state.participants[side].catchphrase).split(" ").slice(0, 3).join(" ");
    return state.transcript.some((l) => l.side === side && normalize(l.text).includes(key));
}

const judgeSystem = (state: Court) =>
    `${HOUSE_RULES}\n\nYou are ${JUDGE.name}, ${JUDGE.title}. ${JUDGE_MOODS[state.settings.judgeMood]} You are neutral on the motion itself.`;

function factionList(factions: Faction[]) {
    return factions.map((f) => `- ${f.name} (${f.side === "neutral" ? "neutral" : `loyal ${sideLabel(f.side)}`}, bias ${f.bias.toFixed(1)})`).join("\n");
}

function stageLine(state: Court) {
    const c = state.caseFile!;
    if (state.stage === "opening") return "Stage: OPENING STATEMENT. Set out your core case and take one early shot at your opponent.";
    if (state.stage === "closing") return "Stage: CLOSING STATEMENT. Sum up why you won the trial, rebut their best point, and finish with a mic-drop line.";
    const count = c.counts[state.countIndex];
    return `Stage: COUNT ${state.countIndex + 1} of ${c.counts.length}, "${count.title}": ${count.question}`;
}

function recentLines(state: Court) {
    const lines = state.transcript
        .filter((l) => l.stage === state.stage && (state.stage !== "count" || l.countIndex === state.countIndex))
        .slice(-DEBATE_RULES.transcript_window);
    return lines.length ? lines.map((l) => `${l.name} (${sideLabel(l.side)}): ${l.text}`).join("\n") : "(nobody has spoken yet in this stage)";
}

export function frameCasePrompt(state: Court) {
    const { topic, counts } = state.settings;
    const p = state.participants;
    return {
        system: judgeSystem(state),
        prompt: `A new case has been filed with the Roast Court.
Motion (the topic): "${topic}"
Arguing FOR: ${p.for.name}, "${p.for.title}". Arguing AGAINST: ${p.against.name}, "${p.against.title}".

Frame the case: a case title, your opening line, exactly ${counts} counts (balanced, distinct sub-questions that teach the topic's real substance), exactly 3 gallery factions with funny topical names, and a learning goal.
Dismiss the case only if the topic itself breaks the house rules. Controversial or political topics are fine: frame them fairly.`,
    };
}

export function debaterPrompt(state: Court, side: Side, audienceNote: string | null) {
    const me: Persona = state.participants[side];
    const opp: Persona = state.participants[otherSide(side)];
    const c = state.caseFile!;
    const spice = SPICE_PRESETS[state.settings.spice];
    const favorForMe = side === "for" ? state.crowdFavor : -state.crowdFavor;
    const warnings = state.warnings[side];
    const last = state.lastSpeech && state.lastSpeech.side !== side ? state.lastSpeech : null;

    return {
        system: `${HOUSE_RULES}

You are ${me.name}, "${me.title}". ${me.style}
${usedCatchphrase(state, side)
        ? `You have already used your catchphrase ("${me.catchphrase}"). Do NOT use it again; find a fresh line.`
        : `Catchphrase: "${me.catchphrase}". Use it at most once in the whole trial, and only when it lands.`}
Your opponent is ${opp.name}, "${opp.title}": ${opp.style}
Roast intensity: ${spice.label}. ${spice.prompt} Aim for spice ${spice.range[0]}-${spice.range[1]}.
${DEPTH_PRESETS[state.settings.depth]}`,
        prompt: `Case: ${c.title}. Motion: "${state.settings.topic}". You argue ${sideLabel(side)} the motion.
${stageLine(state)}

Gallery factions:
${factionList(c.factions)}
Gallery support for you right now: ${favorForMe > 0 ? "+" : ""}${favorForMe} (range -100..100).
${audienceNote ? `${audienceNote} React to it briefly, in character.` : ""}
${warnings.length ? `The judge has warned you: ${warnings.slice(-2).join(" / ")}. Don't repeat it.` : ""}
${state.countSummaries.length ? `Earlier counts: ${state.countSummaries.join(" ")}` : ""}

Exchange so far:
${recentLines(state)}

${last ? `Directly rebut ${opp.name}'s last point first: "${last.text}"` : "You speak first in this stage."}
Then land your own point, with at least one specific, checkable fact, mechanism or example, and one roast aimed at the argument or at ${opp.name}'s persona.
Don't greet, don't introduce yourself, and don't narrate actions.`,
    };
}

export function reactionPrompt(state: Court, spectatorObjection: boolean) {
    const s = state.lastSpeech!;
    const speaker = state.participants[s.side];
    const opp = state.participants[otherSide(s.side)];
    const c = state.caseFile!;
    const canObject = state.objectionsThisCount < DEBATE_RULES.max_objections_per_count;

    const objectionRule = spectatorObjection
        ? `A SPECTATOR in the gallery just shouted "OBJECTION!". Set objection.raised = true and by = "spectator", with a funny objectorLine from that spectator. ${JUDGE.name} (${state.settings.judgeMood} mood) usually overrules spectators with a quip about the gallery; sustain only if the speech really was unfair.`
        : canObject
            ? `Set objection.raised = true (by = "opponent", objector = ${opp.name}, in character) ONLY if the speech contains a false claim, a strawman, or a cheap personal shot. Otherwise raised = false and leave the other objection fields as short placeholders.`
            : `No more objections this count: set objection.raised = false and leave the other objection fields as short placeholders.`;

    return {
        system: `${HOUSE_RULES}

You are the Roast Court's referee system: a rigorous fact-checker, a crowd simulator and a live scorer, all in one.`,
        prompt: `Motion: "${state.settings.topic}". ${stageLine(state)}
Speaker: ${speaker.name} (${sideLabel(s.side)}). Opponent: ${opp.name}.
Speech: "${s.text}"
Claimed fact: "${s.claim}"
Self-rated spice: ${s.spice}/10.

Gallery factions:
${factionList(c.factions)}
Biased factions cheer their own side even for weak points and boo the other side even for good ones (more so the higher the bias). Neutral factions react to wit and substance.

1. Fact-check the claimed fact accurately. Use "opinion" for value claims, "shaky" for oversimplified or unsupported ones, "false" for wrong ones. Be strict: this is where viewers learn.
2. Score the speech, decide whether the roast landed, and pick the faces: speaker, opponent and judge (${state.settings.judgeMood} mood; "dozing" if the speech was boring). Vary the faces with the content: the judge is "amused" or "stifling_laugh" only for a genuinely clever roast, "unimpressed" for weak or repetitive points, "stern" otherwise.
3. Give exactly one crowd entry per faction, 0-2 heckles, and the crowd swing for the speaker.
4. Objection: ${objectionRule}`,
    };
}

export function rulingPrompt(state: Court) {
    const c = state.caseFile!;
    const count = c.counts[state.countIndex];
    const lines = state.transcript.filter((l) => l.countIndex === state.countIndex && l.stage === "count");
    const p = state.participants;
    const r = state.countRubric;
    return {
        system: judgeSystem(state),
        prompt: `Case: ${c.title}. Motion: "${state.settings.topic}".
Count ${state.countIndex + 1}, "${count.title}": ${count.question}
${p.for.name} argues FOR; ${p.against.name} argues AGAINST.

Transcript of this count:
${lines.map((l) => `${l.name}: ${l.text}`).join("\n")}

Referee's running tallies (logic/evidence/wit): ${p.for.name} ${r.for.logic}/${r.for.evidence}/${r.for.wit}, ${p.against.name} ${r.against.logic}/${r.against.evidence}/${r.against.wit}.
Rule on THIS count. Substance (logic and evidence) outweighs wit, but wit breaks ties. Score both lawyers 0-10 on each rubric line.`,
    };
}

export function verdictPrompt(state: Court) {
    const c = state.caseFile!;
    const p = state.participants;
    const t = state.totalRubric;
    return {
        system: judgeSystem(state),
        prompt: `Case: ${c.title}. Motion: "${state.settings.topic}". The trial has concluded.
Counts won: ${p.for.name} (FOR) ${state.scores.for}, ${p.against.name} (AGAINST) ${state.scores.against}.
Count summaries: ${state.countSummaries.join(" ")}
Whole-trial referee totals (logic/evidence/wit): ${p.for.name} ${t.for.logic}/${t.for.evidence}/${t.for.wit}, ${p.against.name} ${t.against.logic}/${t.against.evidence}/${t.against.wit}.
Closing statements:
${state.transcript.filter((l) => l.stage === "closing").map((l) => `${l.name}: ${l.text}`).join("\n")}

Deliver the final verdict. Normally the lawyer with more counts wins; if counts are tied, decide on overall quality, and declare a "${HUNG}" only if it is genuinely even.
The gallery's mood must NOT influence you: the People's Choice award is separate.`,
    };
}

export function briefPrompt(state: Court) {
    const c = state.caseFile!;
    return {
        system: `${HOUSE_RULES}\n\nYou are the Roast Court's clerk, writing the educational case brief that viewers read after the show. Be accurate, balanced and genuinely informative. Drop the comedy here.`,
        prompt: `Motion: "${state.settings.topic}". Case: ${c.title}. Learning goal: ${c.learningGoal}
Counts: ${c.counts.map((x, i) => `${i + 1}. ${x.title}: ${x.question}`).join(" ")}
Lessons the judge drew: ${state.lessons.join(" ")}
Fact-checks during the trial:
${state.factChecks.map((f) => `- [${f.verdict}] ${f.claim}: ${f.note}`).join("\n") || "(none)"}

Write the brief: a steelman for each side, takeaways, corrections for any misconceptions above that were shaky or false, a glossary, and a 3-question quiz about the topic itself.`,
    };
}
