// src/index.ts — Roast Court server: REST + Socket.IO in front of the LangGraph trial engine.
import express from "express";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Server } from "socket.io";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { ClientToServer, DebateStatus, ServerInfo, ServerToClient } from "@court/shared";
import { env, REPO_ROOT } from "./env.js";
import { logger } from "./logger.js";
import { openDb } from "./db/db.js";
import { Repo } from "./db/repo.js";
import { GeminiLlm } from "./llm/client.js";
import { MockLlm } from "./llm/mock.js";
import { EventStore } from "./runtime/eventStore.js";
import { Pacer } from "./runtime/pacer.js";
import { AudienceInbox } from "./runtime/audience.js";
import { DebateRunner } from "./runtime/debateRunner.js";
import { GeminiTts } from "./tts/gemini.js";
import { apiRouter } from "./http/routes.js";
import { attachSockets } from "./http/socket.js";

if (!env.mock && !env.apiKey) {
    logger.error("No GEMINI_API_KEY / GOOGLE_API_KEY found in .env. Start with `yarn dev:mock` to run offline.");
    process.exit(1);
}

const db = openDb(path.join(env.dataDir, env.mock ? "court-mock.db" : "court.db"));
const repo = new Repo(db);
const events = new EventStore(db);
const pacer = new Pacer(env.lookahead);
const inbox = new AudienceInbox();
const checkpointer = SqliteSaver.fromConnString(path.join(env.dataDir, env.mock ? "checkpoints-mock.db" : "checkpoints.db"));
const llm = env.mock
    ? new MockLlm({ latencyMs: [400, 1400] })
    : new GeminiLlm({ apiKey: env.apiKey, models: env.models, rpm: env.rpm, timeoutMs: env.timeoutMs });
const tts = env.geminiTts ? new GeminiTts(env.apiKey, env.ttsModel, path.join(env.dataDir, "tts-cache")) : null;

let broadcastStatus: (id: string, status?: DebateStatus) => void = () => {};
const runner = new DebateRunner({
    llm, repo, events, pacer, inbox, checkpointer,
    grounding: env.grounding,
    onStatus: (id, status) => broadcastStatus(id, status),
});

const info: ServerInfo = {
    mode: env.mock ? "mock" : "live",
    geminiTts: !!tts,
    models: { main: env.mock ? "mock" : env.models.main[0], lite: env.mock ? "mock" : env.models.lite[0] },
};

const app = express();
app.disable("x-powered-by");
app.use("/api", apiRouter({ repo, events, runner, tts, info }));

// In production, serve the built web app (yarn build).
const webDist = path.join(REPO_ROOT, "web", "dist");
if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

const server = http.createServer(app);
const io = new Server<ClientToServer, ServerToClient>(server, { cors: { origin: true } });
({ broadcastStatus } = attachSockets(io, { repo, events, pacer, inbox, runner }));

server.listen(env.port, () => {
    logger.info(`⚖️  Roast Court is in session on http://localhost:${env.port} (${info.mode} mode, models ${info.models.main} / ${info.models.lite}${tts ? ", Gemini TTS on" : ""})`);
    runner.resumeUnfinished();
});

let closing = false;
async function shutdown(signal: string) {
    if (closing) return;
    closing = true;
    logger.info(`${signal}: suspending trials (they resume on next start)...`);
    await runner.shutdown();
    io.close();
    server.close();
    db.close();
    process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
