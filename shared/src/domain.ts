import { z } from "zod";

// --- Vocabulary shared by the LLM schemas, the event stream and the animation system ---

export const SIDES = ["for", "against"] as const;
export const Side = z.enum(SIDES);
export type Side = z.infer<typeof Side>;
export const otherSide = (s: Side): Side => (s === "for" ? "against" : "for");

export const EMOTIONS = [
    "neutral", "confident", "smug", "smirk", "laughing", "cheerful", "thinking",
    "nervous", "shocked", "offended", "roasted", "furious", "sad",
] as const;
export const Emotion = z.enum(EMOTIONS);
export type Emotion = z.infer<typeof Emotion>;

export const GESTURES = ["none", "point", "slam", "shrug", "facepalm", "cross_arms", "mic_drop", "wave", "think"] as const;
export const Gesture = z.enum(GESTURES);
export type Gesture = z.infer<typeof Gesture>;

export const JUDGE_EXPRESSIONS = ["stern", "unimpressed", "amused", "stifling_laugh", "shocked", "dozing", "pleased"] as const;
export const JudgeExpression = z.enum(JUDGE_EXPRESSIONS);
export type JudgeExpression = z.infer<typeof JudgeExpression>;

export const CROWD_REACTIONS = ["cheer", "applause", "ooh", "gasp", "laugh", "boo", "murmur", "silence"] as const;
export const CrowdReaction = z.enum(CROWD_REACTIONS);
export type CrowdReaction = z.infer<typeof CrowdReaction>;

export const FACT_VERDICTS = ["solid", "shaky", "false", "opinion"] as const;
export const FactVerdict = z.enum(FACT_VERDICTS);
export type FactVerdict = z.infer<typeof FactVerdict>;

export const SPICE_LEVELS = ["cordial", "roast", "scorched"] as const;
export const Spice = z.enum(SPICE_LEVELS);
export type Spice = z.infer<typeof Spice>;

export const JUDGE_MOODS = ["grumpy", "fair", "amused"] as const;
export const JudgeMood = z.enum(JUDGE_MOODS);
export type JudgeMood = z.infer<typeof JudgeMood>;

export const DEPTHS = ["quick", "deep"] as const;
export const Depth = z.enum(DEPTHS);
export type Depth = z.infer<typeof Depth>;

export const AUDIENCE_ACTIONS = ["tomato", "cheer", "laugh", "fire", "objection"] as const;
export const AudienceAction = z.enum(AUDIENCE_ACTIONS);
export type AudienceAction = z.infer<typeof AudienceAction>;

export const PHASES = ["framing", "opening", "count", "closing", "deliberation", "verdict", "brief", "done", "dismissed", "adjourned"] as const;
export const Phase = z.enum(PHASES);
export type Phase = z.infer<typeof Phase>;

// --- Personas ---

export const HAIR_STYLES = ["bun", "slick", "bald", "curly", "long", "spiky", "dome", "wig"] as const;
export const ACCESSORIES = ["none", "glasses", "monocle", "knitting", "hoodie", "antenna", "bowtie", "pearls", "shades"] as const;

export const PersonaLook = z.object({
    skin: z.string(),
    hair: z.string(),
    hairStyle: z.enum(HAIR_STYLES),
    suit: z.string(),
    tie: z.string(),
    accessory: z.enum(ACCESSORIES),
    robot: z.boolean().default(false),
});
export type PersonaLook = z.infer<typeof PersonaLook>;

export const PersonaVoice = z.object({
    /** Substrings matched (in order) against speechSynthesis voice names. */
    web: z.object({ prefer: z.array(z.string()), pitch: z.number(), rate: z.number() }),
    /** Prebuilt Gemini TTS voice name. */
    gemini: z.string(),
});
export type PersonaVoice = z.infer<typeof PersonaVoice>;

export const Persona = z.object({
    id: z.string(),
    name: z.string(),
    title: z.string(),
    tagline: z.string(),
    catchphrase: z.string(),
    style: z.string(),
    look: PersonaLook,
    voice: PersonaVoice,
    elo: z.number(),
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    roastsLanded: z.number(),
});
export type Persona = z.infer<typeof Persona>;

export const JUDGE = {
    id: "judge-athena",
    name: "Judge Athena",
    title: "Presiding Judge of the Supreme Roast Court",
    voice: { web: { prefer: ["Sonia", "Libby", "Hazel", "UK English Female", "Female"], pitch: 0.9, rate: 0.95 }, gemini: "Kore" },
} as const;

// --- Case setup ---

export const DebateSettings = z.object({
    topic: z.string().trim().min(5).max(300),
    forId: z.string(),
    againstId: z.string(),
    spice: Spice.default("roast"),
    judgeMood: JudgeMood.default("fair"),
    /** -1 = the gallery is stacked AGAINST the motion, +1 = stacked FOR it. */
    crowdBias: z.number().min(-1).max(1).default(0),
    depth: Depth.default("quick"),
    counts: z.number().int().min(1).max(3).default(2),
    turnsPerCount: z.number().int().min(2).max(6).default(4),
}).refine((s) => s.forId !== s.againstId, { message: "A lawyer cannot argue against themselves (yet)." });
export type DebateSettings = z.infer<typeof DebateSettings>;

export const Faction = z.object({
    id: z.string(),
    name: z.string(),
    side: z.enum(["for", "against", "neutral"]),
    /** 0..1, how blindly loyal the faction is to its side. */
    bias: z.number().min(0).max(1),
    color: z.string(),
    sign: z.string(),
    /** Share of the gallery seats, 0..1. */
    share: z.number().min(0).max(1),
});
export type Faction = z.infer<typeof Faction>;

export const CaseCount = z.object({ title: z.string(), question: z.string() });
export type CaseCount = z.infer<typeof CaseCount>;

export const CaseFile = z.object({
    title: z.string(),
    docket: z.string(),
    opening: z.string(),
    counts: z.array(CaseCount),
    factions: z.array(Faction),
    learningGoal: z.string(),
});
export type CaseFile = z.infer<typeof CaseFile>;

export const Rubric = z.object({ logic: z.number(), evidence: z.number(), wit: z.number() });
export type Rubric = z.infer<typeof Rubric>;

export const FactCheck = z.object({
    claim: z.string(),
    verdict: FactVerdict,
    note: z.string(),
    learnMore: z.string(),
});
export type FactCheck = z.infer<typeof FactCheck>;

export const QuizQuestion = z.object({
    question: z.string(),
    options: z.array(z.string()).min(2).max(4),
    answerIndex: z.number().int().min(0),
    explanation: z.string(),
});
export type QuizQuestion = z.infer<typeof QuizQuestion>;

export const CaseBrief = z.object({
    steelmanFor: z.string(),
    steelmanAgainst: z.string(),
    takeaways: z.array(z.string()),
    corrections: z.array(z.string()),
    glossary: z.array(z.object({ term: z.string(), meaning: z.string() })),
    quiz: z.array(QuizQuestion),
    sources: z.array(z.object({ title: z.string(), url: z.string() })).default([]),
});
export type CaseBrief = z.infer<typeof CaseBrief>;
