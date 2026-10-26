import { create } from "zustand";
import type {
    CaseBrief, CaseFile, CrowdReaction, DebateSettings, DebateStatus, Emotion, FactCheck, Gesture, JudgeExpression,
    ObjectionEvent, Persona, Phase, RecessEvent, RulingEvent, Side, Speaker, VerdictEvent,
} from "@court/shared";

export type Shot = "wide" | "for" | "against" | "judge" | "gallery" | "closeup-for" | "closeup-against" | "closeup-judge";

export type Fx = "steam" | "flames" | "sweat" | "sparkle" | "tears" | "vein" | "blush" | "zzz" | "skull";

export interface Dialogue {
    id: number;
    speaker: Speaker | "spectator";
    name: string;
    text: string;
    shown: number;
    roastLine: string | null;
    kind: string;
}

export interface Heckle {
    id: number;
    factionId: string;
    seat: number;
    text: string;
}

export interface Projectile {
    id: number;
    target: Side | "judge";
    /** Seat index it was thrown from, or -1 for "you, the viewer". */
    from: number;
}

export interface Banner {
    id: number;
    kind: "count" | "phase" | "stamp";
    title: string;
    subtitle?: string;
    tone?: "gold" | "green" | "red" | "violet";
}

export interface CaseNote extends FactCheck {
    seq: number;
    speaker: Side;
}

export interface CourtScene {
    debateId: string | null;
    status: DebateStatus;
    paused: boolean;
    phase: Phase;
    phaseLabel: string;
    countIndex: number | null;
    caseFile: CaseFile | null;
    participants: { for: Persona; against: Persona } | null;
    settings: DebateSettings | null;

    shot: Shot;
    speaking: Speaker | "spectator" | null;
    emotion: Record<Side, Emotion>;
    gesture: Record<Side, { kind: Gesture; nonce: number }>;
    fx: Record<Side, Fx[]>;
    judge: { expression: JudgeExpression; gavel: number; fx: Fx[] };
    splats: Record<Side | "judge", number>;
    winnerPose: Side | "hung" | null;

    dialogue: Dialogue | null;
    crowd: Record<string, { reaction: CrowdReaction; intensity: number; nonce: number }>;
    heckles: Heckle[];
    projectiles: Projectile[];
    crowdFavor: number;
    roastHeat: number;
    scores: Record<Side, number>;
    notes: CaseNote[];
    lessons: string[];

    banner: Banner | null;
    objection: (ObjectionEvent & { stage: "shout" | "ruling" }) | null;
    ruling: RulingEvent | null;
    verdict: VerdictEvent | null;
    verdictStage: "none" | "drumroll" | "reveal" | "results";
    brief: CaseBrief | null;
    recess: RecessEvent | null;
    adjourned: string | null;
    dismissed: string | null;
    lightsDim: boolean;
    shake: number;
    flash: number;
    confetti: { nonce: number; side: Side | "both" };
    finished: boolean;
}

const initial = (): CourtScene => ({
    debateId: null,
    status: "running",
    paused: false,
    phase: "framing",
    phaseLabel: "Court is now in session",
    countIndex: null,
    caseFile: null,
    participants: null,
    settings: null,
    shot: "wide",
    speaking: null,
    emotion: { for: "neutral", against: "neutral" },
    gesture: { for: { kind: "none", nonce: 0 }, against: { kind: "none", nonce: 0 } },
    fx: { for: [], against: [] },
    judge: { expression: "stern", gavel: 0, fx: [] },
    splats: { for: 0, against: 0, judge: 0 },
    winnerPose: null,
    dialogue: null,
    crowd: {},
    heckles: [],
    projectiles: [],
    crowdFavor: 0,
    roastHeat: 0,
    scores: { for: 0, against: 0 },
    notes: [],
    lessons: [],
    banner: null,
    objection: null,
    ruling: null,
    verdict: null,
    verdictStage: "none",
    brief: null,
    recess: null,
    adjourned: null,
    dismissed: null,
    lightsDim: false,
    shake: 0,
    flash: 0,
    confetti: { nonce: 0, side: "both" },
    finished: false,
});

let uid = 1;
export const nextId = () => uid++;

interface CourtActions {
    reset: (debateId: string) => void;
    patch: (p: Partial<CourtScene>) => void;
    setEmotion: (side: Side, e: Emotion, fx?: Fx[]) => void;
    playGesture: (side: Side, g: Gesture) => void;
    bangGavel: () => void;
    addHeckle: (h: Omit<Heckle, "id">, ttlMs: number) => void;
    throwAt: (target: Side | "judge", from: number) => void;
    landProjectile: (id: number) => void;
    shakeScreen: () => void;
}

export const useCourt = create<CourtScene & CourtActions>()((set, get) => ({
    ...initial(),
    reset: (debateId) => set({ ...initial(), debateId }),
    patch: (p) => set(p),
    setEmotion: (side, e, fx) => set((s) => ({ emotion: { ...s.emotion, [side]: e }, fx: fx ? { ...s.fx, [side]: fx } : s.fx })),
    playGesture: (side, g) => set((s) => ({ gesture: { ...s.gesture, [side]: { kind: g, nonce: s.gesture[side].nonce + 1 } } })),
    bangGavel: () => set((s) => ({ judge: { ...s.judge, gavel: s.judge.gavel + 1 } })),
    addHeckle: (h, ttlMs) => {
        const id = nextId();
        set((s) => ({ heckles: [...s.heckles.slice(-3), { ...h, id }] }));
        setTimeout(() => set((s) => ({ heckles: s.heckles.filter((x) => x.id !== id) })), ttlMs);
    },
    throwAt: (target, from) => set((s) => ({ projectiles: [...s.projectiles.slice(-8), { id: nextId(), target, from }] })),
    landProjectile: (id) => {
        const p = get().projectiles.find((x) => x.id === id);
        set((s) => ({
            projectiles: s.projectiles.filter((x) => x.id !== id),
            splats: p ? { ...s.splats, [p.target]: s.splats[p.target] + 1 } : s.splats,
        }));
    },
    shakeScreen: () => set((s) => ({ shake: s.shake + 1 })),
}));

/** Playback preferences, persisted per browser. */
export interface Prefs {
    muted: boolean;
    volume: number;
    speed: 1 | 1.5 | 2;
    voice: "web" | "gemini";
    caseFileOpen: boolean;
}
