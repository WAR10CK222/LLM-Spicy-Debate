import type {
    DebateDetail, DebateEvent, DebateSettings, DebateSummary, Persona, QuizResult, ServerInfo, TopRoast,
} from "@court/shared";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
    }
    return res.json() as Promise<T>;
}

export const api = {
    info: () => req<ServerInfo>("/info"),
    personas: () => req<Persona[]>("/personas"),
    leaderboard: () => req<Persona[]>("/leaderboard"),
    debates: () => req<DebateSummary[]>("/debates"),
    debate: (id: string) => req<DebateDetail>(`/debates/${id}`),
    events: (id: string, after = 0) => req<DebateEvent[]>(`/debates/${id}/events?after=${after}`),
    create: (settings: DebateSettings) => req<{ id: string }>("/debates", { method: "POST", body: JSON.stringify(settings) }),
    resume: (id: string) => req<{ resumed: boolean }>(`/debates/${id}/resume`, { method: "POST" }),
    quiz: (id: string, answers: number[]) => req<QuizResult>(`/debates/${id}/quiz`, { method: "POST", body: JSON.stringify({ answers }) }),
    topRoasts: () => req<TopRoast[]>("/roasts/top"),
    vote: (id: number) => req<{ votes: number }>(`/roasts/${id}/vote`, { method: "POST" }),
    tts: async (text: string, voice: string, style: string, signal?: AbortSignal) => {
        const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voice, style }),
            signal,
        });
        if (!res.ok) throw new Error(`TTS failed (${res.status})`);
        return res.blob();
    },
};
