import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AudienceAction, ServerInfo, Side } from "@court/shared";
import { useCourt } from "../store/court";
import { getSocket } from "../lib/socket";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { readSetting, writeSetting } from "../lib/util";
import { Director } from "../director/director";
import { sfx } from "../audio/sfx";
import { tts, type VoiceMode } from "../tts/tts";
import { Stage } from "../stage/Stage";
import { AudienceBar, CaseFile, DialogueBox, RoastMeter, Scoreboard } from "../hud/Hud";
import { BannerOverlay, CenterCard, ObjectionOverlay, RecessOverlay, RulingCard, VerdictReveal } from "../overlays/Overlays";
import { ResultsPanel } from "../overlays/Results";
import { Button, Chip } from "../ui/ui";

const SPEEDS = [1, 1.5, 2] as const;

export function Courtroom({ id }: { id: string }) {
    const director = useRef<Director | null>(null);
    const [entered, setEntered] = useState(() => sfx.unlocked);
    const [info, setInfo] = useState<ServerInfo | null>(null);
    const [paused, setPaused] = useState(false);
    const [backlog, setBacklog] = useState(0);
    const [toast, setToast] = useState<string | null>(null);
    const [muted, setMuted] = useState(() => readSetting("muted", false));
    const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(() => readSetting("speed", 1));
    const [voice, setVoice] = useState<VoiceMode>(() => readSetting("voice", "web"));
    const [fileOpen, setFileOpen] = useState(() => readSetting("caseFileOpen", true));
    const [missing, setMissing] = useState(false);

    const caseFile = useCourt((s) => s.caseFile);
    const phaseLabel = useCourt((s) => s.phaseLabel);
    const status = useCourt((s) => s.status);
    const adjourned = useCourt((s) => s.adjourned);
    const dismissed = useCourt((s) => s.dismissed);
    const finished = useCourt((s) => s.finished);

    const enteredRef = useRef(entered);
    enteredRef.current = entered;

    const boot = useCallback((replayAll: boolean) => {
        director.current?.destroy();
        useCourt.getState().reset(id);
        const socket = getSocket();
        const d = new Director((seq) => socket.emit("ack", { debateId: id, seq }));
        d.clock.speed = speed;
        if (!enteredRef.current) d.pause();
        director.current = d;
        if (replayAll) void api.events(id).then((events) => events.forEach((e) => d.push(e)));
        return d;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        void api.info().then(setInfo).catch(() => {});
        void api.debate(id).catch(() => setMissing(true));
        boot(false);
        const socket = getSocket();
        const join = () => socket.emit("join", { debateId: id, lastSeq: 0 });
        const onEvent = (e: Parameters<Director["push"]>[0]) => {
            if (e.debateId !== id) return;
            director.current?.push(e);
        };
        const onStatus = (s: { debateId: string; status: typeof status; paused: boolean }) => {
            if (s.debateId === id) useCourt.getState().patch({ status: s.status, paused: s.paused });
        };
        const onAudience = (a: { debateId: string; kind: AudienceAction; target: Side | null }) => {
            if (a.debateId !== id) return;
            if (a.kind === "tomato" && a.target) useCourt.getState().throwAt(a.target, Math.floor(Math.random() * 36));
        };
        socket.on("event", onEvent);
        socket.on("status", onStatus);
        socket.on("audience", onAudience);
        socket.on("connect", join);
        if (socket.connected) join();
        const backlogTimer = setInterval(() => setBacklog(director.current?.backlog ?? 0), 500);
        return () => {
            clearInterval(backlogTimer);
            socket.emit("leave", { debateId: id });
            socket.off("event", onEvent);
            socket.off("status", onStatus);
            socket.off("audience", onAudience);
            socket.off("connect", join);
            director.current?.destroy();
            director.current = null;
            tts.cancel();
            sfx.stopAmbience();
        };
    }, [id, boot]);

    useEffect(() => {
        sfx.setMuted(muted);
        tts.setMode(muted ? "silent" : voice === "gemini" && !info?.geminiTts ? "web" : voice);
        writeSetting("muted", muted);
        writeSetting("voice", voice);
    }, [muted, voice, info]);

    useEffect(() => {
        if (director.current) director.current.clock.speed = speed;
        writeSetting("speed", speed);
    }, [speed]);

    useEffect(() => {
        writeSetting("caseFileOpen", fileOpen);
    }, [fileOpen]);

    const enter = () => {
        sfx.unlock();
        sfx.startAmbience();
        setEntered(true);
        director.current?.resume();
    };

    const togglePause = () => {
        const socket = getSocket();
        if (paused) {
            director.current?.resume();
            socket.emit("resume", { debateId: id });
        } else {
            director.current?.pause();
            socket.emit("pause", { debateId: id });
        }
        setPaused(!paused);
    };

    const flash = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
    };

    const onAction = (kind: AudienceAction) => {
        const s = useCourt.getState();
        const speaker = s.speaking ?? s.dialogue?.speaker;
        const target: Side | null = speaker === "for" || speaker === "against" ? speaker : null;
        getSocket().emit("audience", { debateId: id, kind, target });
        switch (kind) {
            case "tomato":
                s.throwAt(target ?? "judge", -1);
                if (!target) flash("You threw a tomato at the JUDGE. Bold. The court will remember this.");
                break;
            case "cheer": sfx.play("cheer", 0.35); break;
            case "laugh": sfx.play("laugh", 0.35); break;
            case "fire": sfx.play("ooh", 0.45); s.patch({ roastHeat: Math.min(10, s.roastHeat + 1) }); break;
            case "objection":
                sfx.play("slam", 0.5);
                s.shakeScreen();
                flash("You shouted OBJECTION! from the gallery. The judge will rule on it shortly…");
                break;
        }
    };

    if (missing) {
        return (
            <div className="mx-auto max-w-lg p-8 text-center">
                <div className="text-5xl">🗂️</div>
                <h1 className="mt-3 font-display text-3xl font-extrabold brass-text">No such case</h1>
                <p className="mt-2 text-parchment/70">This docket number isn't in the court's records.</p>
                <Button variant="brass" className="mt-4" onClick={() => navigate("/")}>Back to the docket</Button>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1520px] px-3 pb-8 pt-3 md:px-5">
            <header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button onClick={() => navigate("/")} className="press flex items-center gap-2" aria-label="Back to the docket">
                    <span className="text-2xl" aria-hidden>⚖️</span>
                    <span className="font-display text-xl font-extrabold brass-text">Roast Court</span>
                </button>
                <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                    <div className="truncate font-display text-lg font-bold text-parchment md:text-xl">{caseFile?.title ?? "Filing the case…"}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-parchment/60">
                        {caseFile && <span>Docket {caseFile.docket}</span>}
                        <span>· {phaseLabel}</span>
                        {status === "recess" && <Chip color="#f59e0b">Recess</Chip>}
                        {(status === "paused" || paused) && <Chip color="#93c5fd">Paused</Chip>}
                        {finished && <Chip color="#22c55e">Concluded</Chip>}
                        {info?.mode === "mock" && <Chip color="#a78bfa">Mock mode</Chip>}
                    </div>
                </div>
                <Button className="ml-auto sm:ml-0" onClick={() => setFileOpen(!fileOpen)} aria-pressed={fileOpen}>📁 Case file</Button>
                <Button onClick={() => navigate("/hall")}>🏛 Hall of Fame</Button>
            </header>

            <div className={`grid gap-4 ${fileOpen ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
                <main className="min-w-0 space-y-3">
                    <Scoreboard />
                    <Stage>
                        <BannerOverlay />
                        <RulingCard />
                        <ObjectionOverlay />
                        <VerdictReveal />
                        <RecessOverlay />
                        <ResultsPanel onReplay={() => {
                            const d = boot(true);
                            d.resume();
                        }} />
                        {adjourned && (
                            <CenterCard icon="🔨" title="Case adjourned" body={adjourned}>
                                <Button variant="brass" onClick={() => {
                                    useCourt.getState().patch({ adjourned: null });
                                    getSocket().emit("retry", { debateId: id });
                                }}>Resume the trial</Button>
                                <Button onClick={() => navigate("/")}>Back to the docket</Button>
                            </CenterCard>
                        )}
                        {dismissed && (
                            <CenterCard icon="🚫" title="Case dismissed" body={dismissed}>
                                <Button variant="brass" onClick={() => navigate("/")}>File another case</Button>
                            </CenterCard>
                        )}
                        <AnimatePresence>
                            {!entered && (
                                <motion.div className="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm"
                                    exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                                    <div className="font-display text-3xl font-extrabold brass-text md:text-5xl">All rise!</div>
                                    <p className="max-w-sm px-4 text-center text-sm text-parchment/75">Court is about to be in session. Turn your sound on for the full experience.</p>
                                    <Button variant="brass" className="px-6 py-3 text-base" onClick={enter} autoFocus>⚖️ Enter the courtroom</Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <AnimatePresence>
                            {toast && (
                                <motion.div className="pointer-events-none absolute bottom-[4%] left-1/2 z-[60] w-[min(90%,520px)] -translate-x-1/2"
                                    initial={{ opacity: 0, transform: "translateY(8px)" }} animate={{ opacity: 1, transform: "translateY(0)" }}
                                    exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
                                    <div className="rounded-lg border border-yellow-500/60 bg-black/85 px-3 py-2 text-center text-sm text-yellow-200">{toast}</div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Stage>
                    <DialogueBox />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <AudienceBar onAction={onAction} disabled={!entered || finished} />
                        <div className="flex flex-wrap items-center gap-2">
                            <RoastMeter />
                            <Button onClick={togglePause} aria-label={paused ? "Resume" : "Pause"}>{paused ? "▶ Resume" : "⏸ Pause"}</Button>
                            <Button onClick={() => director.current?.skip()} aria-label="Skip this line">⏭ Skip</Button>
                            <Button onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])} aria-label="Playback speed">{speed}×</Button>
                            <select value={voice} onChange={(e) => setVoice(e.target.value as VoiceMode)} aria-label="Voices"
                                className="rounded-lg border border-white/15 bg-walnut-900 px-2 py-2 text-sm text-parchment">
                                <option value="web">🗣 Browser voices</option>
                                <option value="gemini" disabled={!info?.geminiTts}>✨ Gemini voices{info?.geminiTts ? "" : " (off)"}</option>
                                <option value="silent">💬 Text only</option>
                            </select>
                            <Button onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"}>{muted ? "🔇" : "🔊"}</Button>
                            {backlog > 8 && <Button variant="brass" onClick={() => director.current?.catchUp()}>⏩ Catch up ({backlog})</Button>}
                        </div>
                    </div>
                </main>
                <CaseFile open={fileOpen} onClose={() => setFileOpen(false)} />
            </div>
        </div>
    );
}
