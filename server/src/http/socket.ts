import type { Server, Socket } from "socket.io";
import { AudienceAction, Side, type ClientToServer, type DebateStatus, type ServerToClient } from "@court/shared";
import type { Repo } from "../db/repo.js";
import type { AudienceInbox } from "../runtime/audience.js";
import type { DebateRunner } from "../runtime/debateRunner.js";
import type { EventStore } from "../runtime/eventStore.js";
import type { Pacer } from "../runtime/pacer.js";

export interface SocketDeps {
    repo: Repo;
    events: EventStore;
    pacer: Pacer;
    inbox: AudienceInbox;
    runner: DebateRunner;
}

const room = (id: string) => `debate:${id}`;
const AUDIENCE_COOLDOWN_MS = 300;

export function attachSockets(io: Server<ClientToServer, ServerToClient>, deps: SocketDeps) {
    const { repo, events, pacer, inbox, runner } = deps;

    events.onAppend((e) => {
        pacer.track(e);
        io.to(room(e.debateId)).emit("event", e);
    });

    const broadcastStatus = (debateId: string, status?: DebateStatus) => {
        const s = status ?? repo.status(debateId);
        if (s) io.to(room(debateId)).emit("status", { debateId, status: s, paused: pacer.isPaused(debateId) });
    };

    io.on("connection", (socket: Socket<ClientToServer, ServerToClient>) => {
        const joined = new Set<string>();
        let lastAudienceAt = 0;

        socket.on("join", ({ debateId, lastSeq }) => {
            if (typeof debateId !== "string" || !repo.status(debateId)) return socket.emit("problem", { message: "No such case." });
            if (!joined.has(debateId)) {
                joined.add(debateId);
                socket.join(room(debateId));
                pacer.viewerJoined(debateId);
            }
            for (const e of events.list(debateId, Number(lastSeq) || 0)) socket.emit("event", e);
            const status = repo.status(debateId)!;
            // A trial that was mid-flight but isn't running (e.g. after a crash) picks up again when watched.
            if ((status === "running" || status === "recess" || status === "paused") && !runner.isActive(debateId)) runner.resume(debateId);
            socket.emit("status", { debateId, status, paused: pacer.isPaused(debateId) });
        });

        socket.on("leave", ({ debateId }) => {
            if (!joined.delete(debateId)) return;
            socket.leave(room(debateId));
            pacer.viewerLeft(debateId);
        });

        socket.on("ack", ({ debateId, seq }) => {
            if (!joined.has(debateId) || !Number.isInteger(seq)) return;
            if (seq > pacer.acked(debateId)) {
                pacer.ack(debateId, seq);
                repo.setPlayed(debateId, seq);
            }
        });

        socket.on("audience", ({ debateId, kind, target }) => {
            const now = Date.now();
            if (!joined.has(debateId) || now - lastAudienceAt < AUDIENCE_COOLDOWN_MS) return;
            const k = AudienceAction.safeParse(kind);
            const t = Side.nullable().safeParse(target ?? null);
            if (!k.success || !t.success) return;
            lastAudienceAt = now;
            inbox.push(debateId, k.data, t.data);
            socket.to(room(debateId)).emit("audience", { debateId, kind: k.data, target: t.data, at: now });
        });

        socket.on("pause", ({ debateId }) => {
            if (!joined.has(debateId)) return;
            pacer.setPaused(debateId, true);
            if (repo.status(debateId) === "running") repo.setStatus(debateId, "paused");
            broadcastStatus(debateId);
        });

        socket.on("resume", ({ debateId }) => {
            if (!joined.has(debateId)) return;
            pacer.setPaused(debateId, false);
            if (repo.status(debateId) === "paused") repo.setStatus(debateId, "running");
            broadcastStatus(debateId);
        });

        socket.on("retry", ({ debateId }) => {
            if (!joined.has(debateId)) return;
            runner.resume(debateId);
        });

        socket.on("disconnect", () => {
            for (const id of joined) pacer.viewerLeft(id);
            joined.clear();
        });
    });

    return { broadcastStatus };
}
