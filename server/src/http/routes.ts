import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { DebateSettings, type QuizResult, type ServerInfo } from "@court/shared";
import type { Repo } from "../db/repo.js";
import type { EventStore } from "../runtime/eventStore.js";
import type { DebateRunner } from "../runtime/debateRunner.js";
import type { GeminiTts } from "../tts/gemini.js";
import { LlmError } from "../llm/errors.js";
import { logger } from "../logger.js";

export interface RouteDeps {
    repo: Repo;
    events: EventStore;
    runner: DebateRunner;
    tts: GeminiTts | null;
    info: ServerInfo;
}

const TtsBody = z.object({ text: z.string().min(1).max(1200), voice: z.string().min(1).max(40), style: z.string().max(80).default("") });
const QuizBody = z.object({ answers: z.array(z.number().int()) });

export function apiRouter({ repo, events, runner, tts, info }: RouteDeps) {
    const r = express.Router();
    r.use(express.json({ limit: "64kb" }));

    r.get("/info", (_req, res) => res.json(info));
    r.get("/personas", (_req, res) => res.json(repo.personas()));
    r.get("/leaderboard", (_req, res) => res.json(repo.leaderboard()));
    r.get("/roasts/top", (req, res) => res.json(repo.topRoasts(Math.min(100, Number(req.query.limit ?? 30)))));

    r.post("/roasts/:id/vote", (req, res) => {
        const votes = repo.voteRoast(Number(req.params.id));
        if (votes === undefined) return res.status(404).json({ error: "No such roast." });
        res.json({ votes });
    });

    r.get("/debates", (req, res) => res.json(repo.listDebates(Math.min(200, Number(req.query.limit ?? 50)))));

    r.post("/debates", (req, res) => {
        const parsed = DebateSettings.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) });
        res.status(201).json({ id: runner.create(parsed.data) });
    });

    r.get("/debates/:id", (req, res) => {
        const d = repo.debate(req.params.id);
        if (!d) return res.status(404).json({ error: "No such case." });
        res.json(d);
    });

    r.get("/debates/:id/events", (req, res) => res.json(events.list(req.params.id, Number(req.query.after ?? 0))));

    r.post("/debates/:id/resume", (req, res) => res.json({ resumed: runner.resume(req.params.id) }));

    r.post("/debates/:id/quiz", (req, res) => {
        const brief = repo.brief(req.params.id);
        const parsed = QuizBody.safeParse(req.body);
        if (!brief || !brief.quiz.length) return res.status(404).json({ error: "This case has no quiz." });
        if (!parsed.success) return res.status(400).json({ error: "Bad answers." });
        const score = brief.quiz.reduce((n, q, i) => n + (parsed.data.answers[i] === q.answerIndex ? 1 : 0), 0);
        repo.saveQuiz(req.params.id, score, brief.quiz.length, parsed.data.answers);
        res.json({ score, total: brief.quiz.length } satisfies QuizResult);
    });

    r.post("/tts", async (req, res, next) => {
        if (!tts) return res.status(503).json({ error: "Gemini TTS is not enabled on this server." });
        const parsed = TtsBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) });
        try {
            const wav = await tts.synth(parsed.data.text, parsed.data.voice, parsed.data.style);
            res.setHeader("Content-Type", "audio/wav");
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            res.send(wav);
        } catch (e) {
            next(e);
        }
    });

    r.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        const status = err instanceof LlmError && err.status ? (err.status === 429 ? 429 : 502) : 500;
        logger.error(`api error: ${(err as Error)?.message ?? err}`);
        if (!res.headersSent) res.status(status).json({ error: (err as Error)?.message ?? "Internal error" });
    });

    return r;
}
