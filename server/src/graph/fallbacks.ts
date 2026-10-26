// Heuristic stand-ins so the show goes on when a non-essential LLM call keeps failing.
import type { CaseBrief, CaseFile, CrowdReaction, Rubric, Side } from "@court/shared";
import type { ReactionOut } from "./schemas.js";
import type { Court, LastSpeech, SideMap } from "./state.js";

export function heuristicReaction(state: Court, s: LastSpeech, spectatorObjection: boolean): ReactionOut {
    const c = state.caseFile as CaseFile;
    const hot = s.spice >= 6;
    const crowd = c.factions.map((f) => {
        const loyal = f.side === s.side;
        const rival = f.side !== "neutral" && !loyal;
        const reaction: CrowdReaction = loyal ? (hot ? "cheer" : "applause") : rival ? (f.bias > 0.5 ? "boo" : "murmur") : hot ? "ooh" : "laugh";
        return { faction: f.name, reaction, intensity: Math.min(1, 0.3 + f.bias * 0.5 + (hot ? 0.2 : 0)) };
    });
    return {
        factCheck: { verdict: "opinion", note: "The fact-checker's coffee machine broke, so treat this one with healthy scepticism.", learnMore: "how to evaluate a claim's source" },
        score: { logic: 6, evidence: 5, wit: Math.min(10, 4 + Math.round(s.spice / 2)) },
        roastLanded: hot,
        speakerEmotion: hot ? "smug" : "confident",
        opponentEmotion: hot ? "offended" : "thinking",
        judgeExpression: hot ? "stifling_laugh" : "stern",
        crowd,
        heckles: [],
        crowdSwing: hot ? 3 : 1,
        objection: {
            raised: spectatorObjection,
            by: "spectator",
            grounds: "Vibes",
            objectorLine: "Objection! I don't know why, it just felt right!",
            ruling: "overruled",
            judgeLine: "Overruled. Spectators may boo, cheer or throw produce. They may not object.",
        },
    };
}

export function rubricWinner(r: SideMap<Rubric>): Side {
    const total = (x: Rubric) => x.logic * 1.2 + x.evidence * 1.2 + x.wit;
    return total(r.for) >= total(r.against) ? "for" : "against";
}

export function fallbackBrief(state: Court): CaseBrief {
    return {
        steelmanFor: `Supporters of "${state.settings.topic}" argue that its benefits outweigh its costs over time.`,
        steelmanAgainst: `Critics of "${state.settings.topic}" argue that its costs and risks are larger or more certain than its benefits.`,
        takeaways: state.lessons.length ? state.lessons : ["Weigh costs against benefits, and ask for evidence behind confident claims."],
        corrections: state.factChecks.filter((f) => f.verdict === "false" || f.verdict === "shaky").map((f) => `${f.claim}: ${f.note}`).slice(0, 4),
        glossary: [...new Set(state.factChecks.map((f) => f.learnMore))].slice(0, 5).map((term) => ({ term, meaning: "Worth looking up: it came up during the trial." })),
        quiz: [],
        sources: [],
    };
}
