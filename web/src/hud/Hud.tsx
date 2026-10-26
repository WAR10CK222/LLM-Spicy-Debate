import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { JUDGE, type AudienceAction, type Side } from "@court/shared";
import { useCourt } from "../store/court";
import { SIDE_COLOR } from "../lib/util";
import { Avatar, Chip } from "../ui/ui";
import { VERDICT_STYLE } from "../overlays/Overlays";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function Scoreboard() {
    const p = useCourt((s) => s.participants);
    const scores = useCourt((s) => s.scores);
    const counts = useCourt((s) => s.settings?.counts ?? 2);
    const favor = useCourt((s) => s.crowdFavor);
    if (!p) return <div className="h-14" />;
    const side = (sd: Side) => (
        <div className={`flex min-w-0 items-center gap-2 ${sd === "against" ? "flex-row-reverse text-right" : ""}`}>
            <Avatar persona={p[sd]} size={44} mirrored={sd === "against"} />
            <div className="min-w-0">
                <div className="truncate text-sm font-bold md:text-base">{p[sd].name}</div>
                <div className={`flex items-center gap-1 ${sd === "against" ? "justify-end" : ""}`}>
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: SIDE_COLOR[sd] }}>{sd === "for" ? "For" : "Against"}</span>
                    {Array.from({ length: counts }, (_, i) => (
                        <motion.span key={i} className="inline-block h-2.5 w-2.5 rounded-full border"
                            style={{ borderColor: SIDE_COLOR[sd] }}
                            animate={{ backgroundColor: i < scores[sd] ? SIDE_COLOR[sd] : "rgba(0,0,0,0)" }}
                            transition={{ duration: 0.3 }} />
                    ))}
                </div>
            </div>
        </div>
    );
    return (
        <div className="grid grid-cols-[1fr_minmax(120px,1.2fr)_1fr] items-center gap-3">
            {side("for")}
            <TugOfWar favor={favor} forName={p.for.name} againstName={p.against.name} />
            {side("against")}
        </div>
    );
}

function TugOfWar({ favor, forName, againstName }: { favor: number; forName: string; againstName: string }) {
    const pct = 50 - favor / 2; // favor +100 → knot at the FOR (left) end
    const leader = favor > 8 ? forName : favor < -8 ? againstName : null;
    return (
        <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-parchment/60">Gallery</div>
            <div className="relative mx-auto mt-1 h-3 w-full overflow-hidden rounded-full" style={{ background: `linear-gradient(90deg, ${SIDE_COLOR.for}, #57534e 50%, ${SIDE_COLOR.against})` }}>
                <motion.div className="absolute inset-y-0 left-0 w-full" initial={false}
                    animate={{ transform: `translateX(${pct}%)` }} transition={{ type: "spring", duration: 0.7, bounce: 0.2 }}>
                    <div className="absolute -left-1.5 top-1/2 h-4 w-3 -translate-y-1/2 rounded-sm border-2 border-black bg-brass-light" />
                </motion.div>
            </div>
            <div className="mt-1 truncate text-[11px] text-parchment/70">{leader ? `favours ${leader}` : "undecided"}</div>
        </div>
    );
}

export function RoastMeter() {
    const heat = useCourt((s) => s.roastHeat);
    return (
        <div className="flex items-center gap-2" title="How spicy the last line was">
            <span className={`text-lg ${heat >= 8 ? "flame inline-block" : ""}`} aria-hidden>🔥</span>
            <div className="flex gap-[3px]" role="meter" aria-valuemin={0} aria-valuemax={10} aria-valuenow={heat} aria-label="Roast-o-meter">
                {Array.from({ length: 10 }, (_, i) => (
                    <span key={i} className="h-3 w-2 rounded-sm transition-[background-color,opacity] duration-300"
                        style={{ background: i < heat ? `hsl(${48 - i * 5}, 95%, ${58 - i * 2}%)` : "rgba(255,255,255,0.1)" }} />
                ))}
            </div>
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-parchment/60 sm:inline">Roast-o-meter</span>
        </div>
    );
}

const KIND_LABEL: Record<string, string> = {
    intro: "Court in session", opening: "Opening", turn: "Argument", closing: "Closing", announce: "The Bench",
    objection: "Objection", ruling: "Ruling", verdict: "Verdict", recess: "Recess",
};

export function DialogueBox() {
    const d = useCourt((s) => s.dialogue);
    const count = useCourt((s) => s.countIndex);
    if (!d) {
        return <div className="panel flex min-h-[112px] items-center justify-center rounded-xl text-sm text-parchment/50">The court will now come to order…</div>;
    }
    const color = d.speaker === "for" || d.speaker === "against" ? SIDE_COLOR[d.speaker] : d.speaker === "judge" ? "#d4a24c" : "#eab308";
    const shown = d.text.slice(0, d.shown);
    const done = d.shown >= d.text.length;
    let body: React.ReactNode = shown;
    const at = d.roastLine ? d.text.indexOf(d.roastLine) : -1;
    if (at >= 0 && d.shown > at) {
        const end = Math.min(d.shown, at + d.roastLine!.length);
        body = <>{shown.slice(0, at)}<mark className="roast-glow text-inherit">{shown.slice(at, end)}</mark>{shown.slice(end)}</>;
    }
    const kind = d.kind === "turn" && count !== null ? `Count ${count + 1}` : KIND_LABEL[d.kind] ?? "";
    return (
        <div className="panel relative min-h-[112px] rounded-xl px-4 pb-3 pt-6 md:px-5" aria-live="polite">
            <div className="absolute -top-3.5 left-4 flex items-center gap-2">
                <span className="rounded-md border-2 border-black px-3 py-0.5 font-comic text-lg tracking-wider text-white shadow-[3px_3px_0_rgba(0,0,0,0.6)]" style={{ background: color }}>
                    {d.speaker === "judge" ? JUDGE.name : d.name}
                </span>
                {kind && <Chip>{kind}</Chip>}
            </div>
            <p className="text-[15px] leading-relaxed text-parchment md:text-lg">
                {body}
                {!done && <span className="caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-brass" />}
            </p>
            {done && <span className="hint absolute bottom-2 right-3 text-brass" aria-hidden>▼</span>}
        </div>
    );
}

export function CaseFile({ open, onClose }: { open: boolean; onClose: () => void }) {
    const notes = useCourt((s) => s.notes);
    const lessons = useCourt((s) => s.lessons);
    const caseFile = useCourt((s) => s.caseFile);
    const names = useCourt((s) => s.participants);
    const list = useRef<HTMLDivElement>(null);
    useEffect(() => {
        list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
    }, [notes.length]);
    return (
        <AnimatePresence>
            {open && (
                <motion.aside className="panel flex max-h-[min(78vh,760px)] flex-col overflow-hidden rounded-xl"
                    initial={{ opacity: 0, transform: "translateX(12px)" }} animate={{ opacity: 1, transform: "translateX(0)" }}
                    exit={{ opacity: 0, transform: "translateX(12px)", transition: { duration: 0.15 } }} transition={{ duration: 0.22, ease: EASE_OUT }}>
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                        <div>
                            <div className="font-display text-lg font-extrabold brass-text">Case File</div>
                            <div className="text-[11px] uppercase tracking-widest text-parchment/50">{caseFile?.docket ?? "—"}</div>
                        </div>
                        <button onClick={onClose} className="press rounded-md px-2 py-1 text-parchment/60 hover:text-parchment" aria-label="Close case file">✕</button>
                    </div>
                    <div ref={list} className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3">
                        {caseFile && (
                            <div className="rounded-lg border border-brass/25 bg-black/25 p-3 text-sm">
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-brass">Learning goal</div>
                                <p className="mt-1 text-parchment/85">{caseFile.learningGoal}</p>
                                <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-parchment/70">
                                    {caseFile.counts.map((c) => <li key={c.title}><b className="text-parchment/90">{c.title}:</b> {c.question}</li>)}
                                </ol>
                            </div>
                        )}
                        {notes.length === 0 && <p className="px-1 text-sm text-parchment/50">Fact-checks land here as the lawyers make claims.</p>}
                        <AnimatePresence initial={false}>
                            {notes.map((n) => {
                                const v = VERDICT_STYLE[n.verdict];
                                return (
                                    <motion.div key={n.seq} className="rounded-lg border-l-4 bg-black/30 p-3 text-sm" style={{ borderColor: v.color }}
                                        initial={{ opacity: 0, transform: "translateY(8px)" }} animate={{ opacity: 1, transform: "translateY(0)" }} transition={{ duration: 0.25, ease: EASE_OUT }}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-xs font-semibold" style={{ color: SIDE_COLOR[n.speaker] }}>{names?.[n.speaker].name}</span>
                                            <span className="font-comic text-base tracking-widest" style={{ color: v.color }}>{v.icon} {v.label}</span>
                                        </div>
                                        <p className="mt-1 italic text-parchment/90">“{n.claim}”</p>
                                        <p className="mt-1 text-parchment/70">{n.note}</p>
                                        <div className="mt-2"><Chip>Look up: {n.learnMore}</Chip></div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                        {lessons.length > 0 && (
                            <div className="rounded-lg border border-verdict-solid/30 bg-verdict-solid/5 p-3 text-sm">
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-verdict-solid">The judge's lessons</div>
                                <ul className="mt-1 list-disc space-y-1 pl-5 text-parchment/85">{lessons.map((l, i) => <li key={i}>{l}</li>)}</ul>
                            </div>
                        )}
                    </div>
                </motion.aside>
            )}
        </AnimatePresence>
    );
}

const ACTIONS: { kind: AudienceAction; icon: string; label: string; key: string }[] = [
    { kind: "tomato", icon: "🍅", label: "Tomato", key: "t" },
    { kind: "cheer", icon: "👏", label: "Cheer", key: "c" },
    { kind: "laugh", icon: "😂", label: "Laugh", key: "l" },
    { kind: "fire", icon: "🔥", label: "Burn!", key: "f" },
    { kind: "objection", icon: "✋", label: "OBJECTION!", key: "o" },
];

export function AudienceBar({ onAction, disabled }: { onAction: (kind: AudienceAction) => void; disabled?: boolean }) {
    const [cool, setCool] = useState<Record<string, boolean>>({});
    const fire = (kind: AudienceAction) => {
        if (disabled || cool[kind]) return;
        onAction(kind);
        setCool((c) => ({ ...c, [kind]: true }));
        setTimeout(() => setCool((c) => ({ ...c, [kind]: false })), kind === "objection" ? 8000 : 450);
    };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
            const a = ACTIONS.find((x) => x.key === e.key.toLowerCase());
            if (a) fire(a.kind);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });
    return (
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="React from the gallery">
            <span className="mr-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-parchment/60 md:inline">You, in the gallery</span>
            {ACTIONS.map((a) => (
                <button key={a.kind} onClick={() => fire(a.kind)} disabled={disabled || cool[a.kind]}
                    title={`${a.label} (${a.key.toUpperCase()})`}
                    className={`press flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40 ${a.kind === "objection"
                        ? "border-yellow-600 bg-yellow-400 font-comic text-base tracking-widest text-black"
                        : "border-white/15 bg-white/5 text-parchment"}`}>
                    <span className="text-lg leading-none" aria-hidden>{a.icon}</span>
                    <span className={a.kind === "objection" ? "" : "hidden sm:inline"}>{a.label}</span>
                </button>
            ))}
        </div>
    );
}
