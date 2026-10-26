import { z } from "zod";
import {
    AudienceAction, CaseBrief, CaseFile, CrowdReaction, DebateSettings, Emotion, FactCheck,
    Gesture, JudgeExpression, Persona, Phase, Rubric, Side,
} from "./domain.js";

// Every event in a trial is persisted with a monotonically increasing `seq` per debate.
// The browser plays them in order and acks each one; the server uses the acks to pace generation.

const base = {
    debateId: z.string(),
    seq: z.number().int(),
    ts: z.number(),
};

export const Speaker = z.union([Side, z.literal("judge")]);
export type Speaker = z.infer<typeof Speaker>;

export const SPEECH_KINDS = ["intro", "opening", "turn", "closing", "announce", "recess"] as const;

export const SpeechEvent = z.object({
    ...base,
    type: z.literal("speech"),
    speaker: Speaker,
    kind: z.enum(SPEECH_KINDS),
    text: z.string(),
    /** The single most savage line inside `text`, highlighted on screen. */
    roastLine: z.string().nullable(),
    /** 0..10 how spicy the line is. */
    spice: z.number(),
    /** The checkable factual core of the speech (fact-checked by the referee). */
    claim: z.string().nullable(),
    emotion: Emotion,
    gesture: Gesture,
    /** Short delivery direction for expressive TTS, e.g. "smug and sarcastic". */
    ttsStyle: z.string(),
    countIndex: z.number().int().nullable(),
    /** What the audience did since this speaker last spoke (fed into the prompt). */
    audienceNote: z.string().nullable(),
});
export type SpeechEvent = z.infer<typeof SpeechEvent>;

export const ReactionEvent = z.object({
    ...base,
    type: z.literal("reaction"),
    toSeq: z.number().int(),
    speaker: Side,
    speakerEmotion: Emotion,
    opponentEmotion: Emotion,
    judgeExpression: JudgeExpression,
    crowd: z.array(z.object({ factionId: z.string(), reaction: CrowdReaction, intensity: z.number() })),
    heckles: z.array(z.object({ factionId: z.string(), text: z.string() })),
    factCheck: FactCheck.nullable(),
    /** The referee's score for this one speech, 0..10 each. */
    score: Rubric,
    roastLanded: z.boolean(),
    /** Gallery favour after this reaction, -100 (all AGAINST) .. +100 (all FOR). */
    crowdFavor: z.number(),
});
export type ReactionEvent = z.infer<typeof ReactionEvent>;

export const ObjectionEvent = z.object({
    ...base,
    type: z.literal("objection"),
    by: z.union([Side, z.literal("spectator")]),
    against: Side,
    objectorLine: z.string(),
    grounds: z.string(),
    ruling: z.enum(["sustained", "overruled"]),
    judgeLine: z.string(),
});
export type ObjectionEvent = z.infer<typeof ObjectionEvent>;

export const PhaseEvent = z.object({
    ...base,
    type: z.literal("phase"),
    phase: Phase,
    countIndex: z.number().int().nullable(),
    label: z.string(),
});
export type PhaseEvent = z.infer<typeof PhaseEvent>;

export const CaseFramedEvent = z.object({
    ...base,
    type: z.literal("case_framed"),
    case: CaseFile,
    participants: z.object({ for: Persona, against: Persona }),
    settings: DebateSettings,
});
export type CaseFramedEvent = z.infer<typeof CaseFramedEvent>;

export const DismissedEvent = z.object({
    ...base,
    type: z.literal("dismissed"),
    reason: z.string(),
    judgeLine: z.string(),
});
export type DismissedEvent = z.infer<typeof DismissedEvent>;

export const RulingEvent = z.object({
    ...base,
    type: z.literal("round_ruling"),
    countIndex: z.number().int(),
    winner: Side,
    rubric: z.object({ for: Rubric, against: Rubric }),
    judgeLine: z.string(),
    lesson: z.string(),
    scores: z.object({ for: z.number(), against: z.number() }),
});
export type RulingEvent = z.infer<typeof RulingEvent>;

export const VerdictEvent = z.object({
    ...base,
    type: z.literal("verdict"),
    winner: z.union([Side, z.literal("hung")]),
    judgeLine: z.string(),
    sentence: z.string(),
    summary: z.string(),
    scores: z.object({ for: z.number(), against: z.number() }),
    crowdFavor: z.number(),
    peoplesChoice: z.union([Side, z.literal("split")]),
    elo: z.object({
        for: z.object({ before: z.number(), after: z.number() }),
        against: z.object({ before: z.number(), after: z.number() }),
    }),
});
export type VerdictEvent = z.infer<typeof VerdictEvent>;

export const BriefEvent = z.object({ ...base, type: z.literal("brief"), brief: CaseBrief });
export type BriefEvent = z.infer<typeof BriefEvent>;

export const RecessEvent = z.object({
    ...base,
    type: z.literal("recess"),
    reason: z.string(),
    attempt: z.number().int(),
    retryInMs: z.number(),
});
export type RecessEvent = z.infer<typeof RecessEvent>;

export const AdjournedEvent = z.object({ ...base, type: z.literal("adjourned"), reason: z.string() });
export type AdjournedEvent = z.infer<typeof AdjournedEvent>;

export const DebateEvent = z.discriminatedUnion("type", [
    SpeechEvent, ReactionEvent, ObjectionEvent, PhaseEvent, CaseFramedEvent, DismissedEvent,
    RulingEvent, VerdictEvent, BriefEvent, RecessEvent, AdjournedEvent,
]);
export type DebateEvent = z.infer<typeof DebateEvent>;
export type DebateEventType = DebateEvent["type"];
/** An event before the store assigns debateId/seq/ts. */
export type EventDraft<T extends DebateEvent = DebateEvent> = T extends DebateEvent ? Omit<T, "debateId" | "seq" | "ts"> : never;

/** Events that take noticeable playback time; the pacer keeps generation at most a little ahead of these. */
export const PACED_EVENT_TYPES: ReadonlySet<DebateEventType> = new Set(["speech", "round_ruling", "verdict", "objection"]);

// --- Socket.IO contract ---

export type DebateStatus = "running" | "paused" | "recess" | "finished" | "dismissed" | "adjourned";

export interface AudienceEcho {
    debateId: string;
    kind: AudienceAction;
    /** Who it was aimed at (the side currently speaking), if anyone. */
    target: Side | null;
    at: number;
}

export interface ServerToClient {
    event: (e: DebateEvent) => void;
    audience: (a: AudienceEcho) => void;
    status: (s: { debateId: string; status: DebateStatus; paused: boolean }) => void;
    problem: (p: { message: string }) => void;
}

export interface ClientToServer {
    join: (p: { debateId: string; lastSeq: number }) => void;
    leave: (p: { debateId: string }) => void;
    ack: (p: { debateId: string; seq: number }) => void;
    /** `target` is the side currently speaking on the viewer's screen. */
    audience: (p: { debateId: string; kind: AudienceAction; target: Side | null }) => void;
    pause: (p: { debateId: string }) => void;
    resume: (p: { debateId: string }) => void;
    retry: (p: { debateId: string }) => void;
}
