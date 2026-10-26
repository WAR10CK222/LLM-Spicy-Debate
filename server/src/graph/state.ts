// src/graph/state.ts
import { Annotation } from "@langchain/langgraph";
import type { CaseFile, DebateSettings, FactCheck, Persona, Rubric, Side } from "@court/shared";

export type Stage = "framing" | "opening" | "count" | "closing" | "deliberation" | "brief" | "done" | "dismissed";

export interface Line {
    side: Side;
    name: string;
    text: string;
    stage: Stage;
    countIndex: number | null;
}

export interface LastSpeech {
    seq: number;
    no: number;
    side: Side;
    text: string;
    claim: string;
    roastLine: string;
    spice: number;
}

export type SideMap<T> = { for: T; against: T };
export const zeroRubric = (): Rubric => ({ logic: 0, evidence: 0, wit: 0 });

// Every channel is "last value wins": nodes return the fields they change.
export const CourtState = Annotation.Root({
    debateId: Annotation<string>,
    settings: Annotation<DebateSettings>,
    participants: Annotation<SideMap<Persona>>,
    caseFile: Annotation<CaseFile | null>,
    stage: Annotation<Stage>,
    countIndex: Annotation<number>,
    /** Speeches delivered in the current stage (opening/count/closing). */
    turnInStage: Annotation<number>,
    /** Global speech counter; part of every event key. */
    speechNo: Annotation<number>,
    nextSpeaker: Annotation<Side>,
    transcript: Annotation<Line[]>,
    countSummaries: Annotation<string[]>,
    lastSpeech: Annotation<LastSpeech | null>,
    /** Referee scores summed over the current count / the whole trial. */
    countRubric: Annotation<SideMap<Rubric>>,
    totalRubric: Annotation<SideMap<Rubric>>,
    /** Counts won. */
    scores: Annotation<SideMap<number>>,
    /** -100 (gallery all AGAINST) .. +100 (all FOR). */
    crowdFavor: Annotation<number>,
    warnings: Annotation<SideMap<string[]>>,
    objectionsThisCount: Annotation<number>,
    factChecks: Annotation<FactCheck[]>,
    lessons: Annotation<string[]>,
});

export type Court = typeof CourtState.State;
export type CourtUpdate = typeof CourtState.Update;

export function initialState(debateId: string, settings: DebateSettings, participants: SideMap<Persona>): Court {
    return {
        debateId,
        settings,
        participants,
        caseFile: null,
        stage: "framing",
        countIndex: 0,
        turnInStage: 0,
        speechNo: 0,
        nextSpeaker: "for",
        transcript: [],
        countSummaries: [],
        lastSpeech: null,
        countRubric: { for: zeroRubric(), against: zeroRubric() },
        totalRubric: { for: zeroRubric(), against: zeroRubric() },
        scores: { for: 0, against: 0 },
        crowdFavor: Math.round(settings.crowdBias * 30),
        warnings: { for: [], against: [] },
        objectionsThisCount: 0,
        factChecks: [],
        lessons: [],
    };
}
