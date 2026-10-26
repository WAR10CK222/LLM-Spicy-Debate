// src/graph/schemas.ts — zod schemas for every structured LLM call (successor of src/state.ts)
import { z } from "zod";
import { CrowdReaction, Emotion, FactVerdict, Gesture, JudgeExpression } from "@court/shared";

const score = z.number().int().min(0).max(10);
const rubric = z.object({ logic: score, evidence: score, wit: score });

export const frameCaseSchema = (counts: number) => z.object({
    dismissed: z.boolean().describe("true ONLY if the topic is hateful, sexual, harasses a private individual, or seeks dangerous instructions"),
    dismissReason: z.string().describe("If dismissed: a short, funny but clear reason. Otherwise an empty string."),
    title: z.string().describe('A funny but clear case name, e.g. "The People v. Pineapple Pizza"'),
    opening: z.string().describe("The judge's opening: 2 sentences that state the motion plainly and add one dry joke."),
    counts: z.array(z.object({
        title: z.string().describe("2-5 word title for this count"),
        question: z.string().describe("The precise, debatable sub-question for this count, one sentence"),
    })).describe(`Exactly ${counts} distinct, balanced sub-questions that together cover the motion`),
    factions: z.array(z.object({
        name: z.string().describe("Funny, topical faction name, 2-4 words"),
        side: z.enum(["for", "against", "neutral"]),
        bias: z.number().min(0).max(1).describe("Loyalty 0..1. 1 = boos the other side no matter what"),
        sign: z.string().describe("Protest-sign text, max 3 words"),
    })).describe("Exactly 3 gallery factions: one loyal FOR the motion, one loyal AGAINST, one neutral"),
    learningGoal: z.string().describe("One sentence: what a viewer should understand by the end"),
});
export type FrameCaseOut = z.infer<ReturnType<typeof frameCaseSchema>>;

export const debaterSchema = z.object({
    speech: z.string().describe("Exactly what you say out loud. No stage directions, no asterisks, no name prefix."),
    roastLine: z.string().describe("Your single best roast sentence, copied verbatim from speech, or an empty string"),
    claim: z.string().describe("The specific checkable fact, mechanism or example you asserted, paraphrased in one sentence"),
    emotion: Emotion.describe("Your facial expression while saying it"),
    gesture: Gesture.describe("Your body language while saying it"),
    spice: score.describe("How savage this line is, 0..10"),
    ttsStyle: z.string().describe("Delivery direction for a voice actor, max 6 words"),
});
export type DebaterOut = z.infer<typeof debaterSchema>;

export const reactionSchema = (factionNames: [string, ...string[]]) => z.object({
    factCheck: z.object({
        verdict: FactVerdict.describe("solid = accurate; shaky = oversimplified or unsupported; false = wrong; opinion = a value judgement"),
        note: z.string().describe("One sentence: what is accurate or inaccurate, and the correct picture"),
        learnMore: z.string().describe("A concept or term worth looking up (no URLs)"),
    }),
    score: rubric.describe("This single speech's quality"),
    roastLanded: z.boolean().describe("Did the roast genuinely land?"),
    speakerEmotion: Emotion.describe("The speaker's face right after the line"),
    opponentEmotion: Emotion.describe("The opponent's face: offended/roasted/shocked if burned, smug/laughing if the line flopped"),
    judgeExpression: JudgeExpression,
    crowd: z.array(z.object({
        faction: z.enum(factionNames),
        reaction: CrowdReaction,
        intensity: z.number().min(0).max(1),
    })).describe("Exactly one entry per faction"),
    heckles: z.array(z.object({
        faction: z.enum(factionNames),
        text: z.string().describe("A short heckle, max 8 words, PG-13"),
    })).describe("0 to 2 heckles"),
    crowdSwing: z.number().int().min(-10).max(10).describe("Net change in gallery support for the SPEAKER"),
    objection: z.object({
        raised: z.boolean(),
        by: z.enum(["opponent", "spectator"]),
        grounds: z.string().describe("e.g. Misleading statistic, Strawman, Badgering the witness"),
        objectorLine: z.string().describe('What the objector shouts, starting with "Objection!"'),
        ruling: z.enum(["sustained", "overruled"]),
        judgeLine: z.string().describe("The judge's ruling, with a quip"),
    }),
});
export type ReactionOut = z.infer<ReturnType<typeof reactionSchema>>;

export const rulingSchema = (forName: string, againstName: string) => z.object({
    winner: z.enum([forName, againstName]),
    forScore: rubric.describe(`${forName}'s overall performance this count`),
    againstScore: rubric.describe(`${againstName}'s overall performance this count`),
    judgeLine: z.string().describe("2-3 sentences that announce this count's winner and why, with one joke"),
    lesson: z.string().describe("One sentence: the real takeaway about the topic from this count"),
    summary: z.string().describe("One neutral sentence summarising the exchange"),
});
export type RulingOut = z.infer<ReturnType<typeof rulingSchema>>;

export const HUNG = "Hung jury";
export const verdictSchema = (forName: string, againstName: string) => z.object({
    winner: z.enum([forName, againstName, HUNG]),
    judgeLine: z.string().describe('3 dramatic sentences beginning "The court finds..."'),
    sentence: z.string().describe("A funny, harmless 'sentence' for the losing lawyer (both, if hung)"),
    summary: z.string().describe("2-3 sentences: who argued what best and why"),
});
export type VerdictOut = z.infer<ReturnType<typeof verdictSchema>>;

export const briefSchema = z.object({
    steelmanFor: z.string().describe("The strongest honest case FOR the motion, 2-3 sentences"),
    steelmanAgainst: z.string().describe("The strongest honest case AGAINST the motion, 2-3 sentences"),
    takeaways: z.array(z.string()).describe("3-5 key things the viewer should now understand"),
    corrections: z.array(z.string()).describe("0-4 misconceptions from the trial, each corrected in one sentence"),
    glossary: z.array(z.object({ term: z.string(), meaning: z.string() })).describe("3-5 key terms"),
    quiz: z.array(z.object({
        question: z.string(),
        options: z.array(z.string()).describe("Exactly 4 options"),
        answerIndex: z.number().int().min(0).max(3),
        explanation: z.string().describe("One sentence explaining the answer"),
    })).describe("Exactly 3 multiple-choice questions about the topic (not about the show)"),
});
export type BriefOut = z.infer<typeof briefSchema>;
