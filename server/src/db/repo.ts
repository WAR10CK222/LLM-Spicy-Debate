import type {
    CaseBrief, CaseFile, DebateDetail, DebateSettings, DebateStatus, DebateSummary, Persona, Rubric, Side, TopRoast,
} from "@court/shared";
import type { Db } from "./db.js";
import { updateElo } from "./elo.js";

interface PersonaRow {
    id: string; name: string; title: string; tagline: string; catchphrase: string; style: string;
    look_json: string; voice_json: string; elo: number; wins: number; losses: number; draws: number; roasts_landed: number;
}

interface DebateRow {
    id: string; topic: string; settings_json: string; title: string | null; case_json: string | null; status: DebateStatus;
    for_id: string; against_id: string; winner: string | null; peoples_choice: string | null; brief_json: string | null;
    error: string | null; played_seq: number; created_at: number; finished_at: number | null;
    for_name: string; against_name: string;
}

const toPersona = (r: PersonaRow): Persona => ({
    id: r.id, name: r.name, title: r.title, tagline: r.tagline, catchphrase: r.catchphrase, style: r.style,
    look: JSON.parse(r.look_json), voice: JSON.parse(r.voice_json),
    elo: Math.round(r.elo), wins: r.wins, losses: r.losses, draws: r.draws, roastsLanded: r.roasts_landed,
});

const DEBATE_SELECT = `
    SELECT d.*, pf.name AS for_name, pa.name AS against_name
    FROM debates d JOIN personas pf ON pf.id = d.for_id JOIN personas pa ON pa.id = d.against_id`;

const toSummary = (r: DebateRow): DebateSummary => ({
    id: r.id, topic: r.topic, title: r.title, status: r.status,
    forPersona: { id: r.for_id, name: r.for_name },
    againstPersona: { id: r.against_id, name: r.against_name },
    winner: (r.winner as DebateSummary["winner"]) ?? null,
    peoplesChoice: (r.peoples_choice as DebateSummary["peoplesChoice"]) ?? null,
    createdAt: r.created_at, finishedAt: r.finished_at,
});

export class Repo {
    constructor(readonly db: Db) {}

    // --- personas ---

    personas(): Persona[] {
        return (this.db.prepare(`SELECT * FROM personas ORDER BY sort`).all() as PersonaRow[]).map(toPersona);
    }

    leaderboard(): Persona[] {
        return (this.db.prepare(`SELECT * FROM personas ORDER BY elo DESC, wins DESC`).all() as PersonaRow[]).map(toPersona);
    }

    persona(id: string): Persona | undefined {
        const row = this.db.prepare(`SELECT * FROM personas WHERE id = ?`).get(id) as PersonaRow | undefined;
        return row && toPersona(row);
    }

    // --- debates ---

    createDebate(id: string, settings: DebateSettings, now = Date.now()) {
        this.db.prepare(`
            INSERT INTO debates (id, topic, settings_json, status, for_id, against_id, created_at)
            VALUES (?, ?, ?, 'running', ?, ?, ?)
        `).run(id, settings.topic, JSON.stringify(settings), settings.forId, settings.againstId, now);
    }

    private row(id: string) {
        return this.db.prepare(`${DEBATE_SELECT} WHERE d.id = ?`).get(id) as DebateRow | undefined;
    }

    debate(id: string): DebateDetail | undefined {
        const r = this.row(id);
        if (!r) return undefined;
        const lastSeq = (this.db.prepare(`SELECT COALESCE(MAX(seq), 0) AS s FROM events WHERE debate_id = ?`).get(id) as { s: number }).s;
        const quiz = this.db.prepare(`SELECT MAX(score) AS best FROM quiz_attempts WHERE debate_id = ?`).get(id) as { best: number | null };
        return { ...toSummary(r), settings: JSON.parse(r.settings_json), lastSeq, quizBest: quiz.best };
    }

    settings(id: string): DebateSettings | undefined {
        const r = this.db.prepare(`SELECT settings_json FROM debates WHERE id = ?`).get(id) as { settings_json: string } | undefined;
        return r && JSON.parse(r.settings_json);
    }

    status(id: string): DebateStatus | undefined {
        return (this.db.prepare(`SELECT status FROM debates WHERE id = ?`).get(id) as { status: DebateStatus } | undefined)?.status;
    }

    playedSeq(id: string): number {
        return (this.db.prepare(`SELECT played_seq FROM debates WHERE id = ?`).get(id) as { played_seq: number } | undefined)?.played_seq ?? 0;
    }

    listDebates(limit = 50): DebateSummary[] {
        return (this.db.prepare(`${DEBATE_SELECT} ORDER BY d.created_at DESC LIMIT ?`).all(limit) as DebateRow[]).map(toSummary);
    }

    /** Debates that were mid-trial when the server last stopped. */
    unfinishedDebates(): string[] {
        return (this.db.prepare(`SELECT id FROM debates WHERE status IN ('running', 'paused', 'recess')`).all() as { id: string }[]).map((r) => r.id);
    }

    setStatus(id: string, status: DebateStatus, error: string | null = null) {
        this.db.prepare(`UPDATE debates SET status = ?, error = ? WHERE id = ?`).run(status, error, id);
    }

    setCase(id: string, c: CaseFile) {
        this.db.prepare(`UPDATE debates SET title = ?, case_json = ? WHERE id = ?`).run(c.title, JSON.stringify(c), id);
    }

    setPlayed(id: string, seq: number) {
        this.db.prepare(`UPDATE debates SET played_seq = MAX(played_seq, ?) WHERE id = ?`).run(seq, id);
    }

    // --- rounds, roasts, verdict ---

    saveRound(id: string, idx: number, countTitle: string, winner: Side, rubric: { for: Rubric; against: Rubric }, judgeLine: string, lesson: string) {
        this.db.prepare(`
            INSERT OR REPLACE INTO rounds (debate_id, idx, count_title, winner, rubric_json, judge_line, lesson)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, idx, countTitle, winner, JSON.stringify(rubric), judgeLine, lesson);
    }

    saveRoast(debateId: string, seq: number, personaId: string, text: string, spice: number, crowdScore: number) {
        this.db.prepare(`
            INSERT INTO roasts (debate_id, seq, persona_id, text, spice, crowd_score, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(debate_id, seq) DO UPDATE SET crowd_score = excluded.crowd_score
        `).run(debateId, seq, personaId, text, Math.round(spice), crowdScore, Date.now());
        if (crowdScore >= 0.6) this.db.prepare(`UPDATE personas SET roasts_landed = roasts_landed + 1 WHERE id = ?`).run(personaId);
    }

    topRoasts(limit = 30): TopRoast[] {
        return this.db.prepare(`
            SELECT r.id, r.debate_id AS debateId, d.title AS caseTitle, r.persona_id AS personaId, p.name AS personaName,
                   r.text, r.spice, r.crowd_score AS crowdScore, r.votes, r.created_at AS createdAt
            FROM roasts r JOIN personas p ON p.id = r.persona_id JOIN debates d ON d.id = r.debate_id
            ORDER BY (r.crowd_score * 10 + r.votes * 3 + r.spice) DESC, r.created_at DESC
            LIMIT ?
        `).all(limit) as TopRoast[];
    }

    voteRoast(id: number): number | undefined {
        this.db.prepare(`UPDATE roasts SET votes = votes + 1 WHERE id = ?`).run(id);
        return (this.db.prepare(`SELECT votes FROM roasts WHERE id = ?`).get(id) as { votes: number } | undefined)?.votes;
    }

    /** Applies the verdict to persona stats + Elo atomically. Returns the Elo change. */
    applyVerdict(id: string, winner: Side | "hung", peoplesChoice: Side | "split") {
        return this.db.transaction(() => {
            const d = this.row(id)!;
            const pf = this.persona(d.for_id)!;
            const pa = this.persona(d.against_id)!;
            const scoreFor = winner === "for" ? 1 : winner === "against" ? 0 : 0.5;
            const [eloFor, eloAgainst] = updateElo(pf.elo, pa.elo, scoreFor);
            const stat = this.db.prepare(`
                UPDATE personas SET elo = ?, wins = wins + ?, losses = losses + ?, draws = draws + ? WHERE id = ?`);
            stat.run(eloFor, +(winner === "for"), +(winner === "against"), +(winner === "hung"), pf.id);
            stat.run(eloAgainst, +(winner === "against"), +(winner === "for"), +(winner === "hung"), pa.id);
            this.db.prepare(`UPDATE debates SET winner = ?, peoples_choice = ? WHERE id = ?`).run(winner, peoplesChoice, id);
            return {
                for: { before: pf.elo, after: eloFor },
                against: { before: pa.elo, after: eloAgainst },
            };
        })();
    }

    finish(id: string, brief: CaseBrief | null, status: DebateStatus = "finished") {
        this.db.prepare(`UPDATE debates SET brief_json = ?, status = ?, error = NULL, finished_at = ? WHERE id = ?`)
            .run(brief ? JSON.stringify(brief) : null, status, Date.now(), id);
    }

    saveQuiz(debateId: string, score: number, total: number, answers: number[]) {
        this.db.prepare(`INSERT INTO quiz_attempts (debate_id, score, total, answers_json, created_at) VALUES (?, ?, ?, ?, ?)`)
            .run(debateId, score, total, JSON.stringify(answers), Date.now());
    }

    brief(id: string): CaseBrief | null {
        const r = this.db.prepare(`SELECT brief_json FROM debates WHERE id = ?`).get(id) as { brief_json: string | null } | undefined;
        return r?.brief_json ? JSON.parse(r.brief_json) : null;
    }
}
