import type { DebateSettings, Persona, Side } from "./domain.js";
import type { DebateStatus } from "./events.js";

// REST DTOs

export interface DebateSummary {
    id: string;
    topic: string;
    title: string | null;
    status: DebateStatus;
    forPersona: Pick<Persona, "id" | "name">;
    againstPersona: Pick<Persona, "id" | "name">;
    winner: Side | "hung" | null;
    peoplesChoice: Side | "split" | null;
    createdAt: number;
    finishedAt: number | null;
}

export interface DebateDetail extends DebateSummary {
    settings: DebateSettings;
    lastSeq: number;
    quizBest: number | null;
}

export interface TopRoast {
    id: number;
    debateId: string;
    caseTitle: string | null;
    personaId: string;
    personaName: string;
    text: string;
    spice: number;
    crowdScore: number;
    votes: number;
    createdAt: number;
}

export interface QuizResult {
    score: number;
    total: number;
}

export interface ServerInfo {
    mode: "live" | "mock";
    geminiTts: boolean;
    models: { main: string; lite: string };
}

export type Leaderboard = Persona[];
