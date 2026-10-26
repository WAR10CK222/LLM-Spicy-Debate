import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { FactVerdict, Side } from "@court/shared";
import { useCourt } from "../store/court";
import { SIDE_COLOR } from "../lib/util";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const pop = { type: "spring", duration: 0.45, bounce: 0.35 } as const;

export const VERDICT_STYLE: Record<FactVerdict, { color: string; label: string; icon: string }> = {
    solid: { color: "#22c55e", label: "SOLID", icon: "✓" },
    shaky: { color: "#f59e0b", label: "SHAKY", icon: "~" },
    false: { color: "#ef4444", label: "FALSE", icon: "✗" },
    opinion: { color: "#a78bfa", label: "OPINION", icon: "?" },
};

function starburst(spikes: number, outer: number, inner: number, cx = 0, cy = 0) {
    const pts: string[] = [];
    for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 ? inner * (0.86 + ((i * 37) % 10) / 60) : outer;
        const a = (Math.PI * i) / spikes;
        pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r * 0.62}`);
    }
    return pts.join(" ");
}

/** "COUNT 2", "OPENING STATEMENTS" title cards and the fact-check stamp. */
export function BannerOverlay() {
    const banner = useCourt((s) => s.banner);
    const reduce = useReducedMotion();
    return (
        <AnimatePresence>
            {banner && banner.kind !== "stamp" && (
                <motion.div key={banner.id} className="pointer-events-none absolute inset-x-0 top-1/2 z-40 -translate-y-1/2"
                    initial={{ opacity: 0, transform: reduce ? "translateX(0%)" : "translateX(-100%)" }}
                    animate={{ opacity: 1, transform: "translateX(0%)" }}
                    exit={{ opacity: 0, transform: reduce ? "translateX(0%)" : "translateX(100%)", transition: { duration: 0.25, ease: EASE_OUT } }}
                    transition={{ duration: 0.38, ease: EASE_OUT }}>
                    <div className="relative overflow-hidden border-y-4 border-brass bg-black/85 py-[2.2%] text-center">
                        <div className="speedlines absolute inset-0 opacity-60" />
                        <div className="relative font-display text-[clamp(28px,6.5vw,88px)] font-extrabold uppercase italic tracking-wide brass-text drop-shadow">{banner.title}</div>
                        {banner.subtitle && <div className="relative mt-1 font-comic text-[clamp(16px,2.6vw,36px)] tracking-widest text-parchment">{banner.subtitle}</div>}
                    </div>
                </motion.div>
            )}
            {banner && banner.kind === "stamp" && <FactStamp key={banner.id} verdict={banner.title as FactVerdict} note={banner.subtitle ?? ""} />}
        </AnimatePresence>
    );
}

function FactStamp({ verdict, note }: { verdict: FactVerdict; note: string }) {
    const v = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.opinion;
    return (
        <motion.div className="pointer-events-none absolute right-[2%] top-[4%] z-40 w-[min(42%,340px)]"
            initial={{ opacity: 0, transform: "scale(1.35) rotate(-14deg)" }}
            animate={{ opacity: 1, transform: "scale(1) rotate(-6deg)" }}
            exit={{ opacity: 0, transform: "scale(0.96) rotate(-6deg)", transition: { duration: 0.18 } }}
            transition={pop}>
            <div className="rounded-lg border-4 bg-black/75 px-3 py-2 backdrop-blur-sm" style={{ borderColor: v.color }}>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-parchment/70">Fact check</span>
                    <span className="ml-auto font-comic text-2xl tracking-widest md:text-3xl" style={{ color: v.color }}>{v.icon} {v.label}</span>
                </div>
                <p className="mt-1 text-xs leading-snug text-parchment/90 md:text-sm">{note}</p>
            </div>
        </motion.div>
    );
}

export function ObjectionOverlay() {
    const o = useCourt((s) => s.objection);
    const names = useCourt((s) => s.participants);
    const color = o ? (o.by === "spectator" ? "#eab308" : SIDE_COLOR[o.by]) : "#fff";
    const points = useMemo(() => starburst(22, 300, 210, 320, 200), []);
    return (
        <AnimatePresence>
            {o && (
                <motion.div key={`${o.seq}-${o.stage}`} className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                    {o.stage === "shout" ? (
                        <motion.div className="relative w-[78%] max-w-[760px]"
                            initial={{ transform: "scale(0.6) rotate(-14deg)" }} animate={{ transform: "scale(1) rotate(-4deg)" }} transition={pop}>
                            <svg viewBox="0 0 640 400" className="w-full drop-shadow-[0_10px_0_rgba(0,0,0,0.5)]">
                                <polygon points={points} fill={color} stroke="#000" strokeWidth="10" strokeLinejoin="round" />
                                <text x="320" y="232" textAnchor="middle" fontFamily="Bangers, Impact, sans-serif" fontSize="120" fill="#fff" stroke="#000" strokeWidth="9" paintOrder="stroke" letterSpacing="4">OBJECTION!</text>
                            </svg>
                            <div className="absolute inset-x-0 bottom-[8%] text-center font-comic text-[clamp(14px,2.2vw,28px)] tracking-widest text-white [text-shadow:0_2px_0_#000]">
                                {o.by === "spectator" ? "— from the gallery —" : `— ${names?.[o.by].name ?? ""} · ${o.grounds} —`}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div className="rounded-xl border-[6px] bg-black/70 px-8 py-3 font-comic text-[clamp(40px,9vw,120px)] tracking-widest"
                            style={{ color: o.ruling === "sustained" ? "#22c55e" : "#ef4444", borderColor: o.ruling === "sustained" ? "#22c55e" : "#ef4444" }}
                            initial={{ transform: "scale(1.6) rotate(-16deg)", opacity: 0 }} animate={{ transform: "scale(1) rotate(-7deg)", opacity: 1 }} transition={pop}>
                            {o.ruling === "sustained" ? "SUSTAINED!" : "OVERRULED!"}
                        </motion.div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function Bar({ label, value, color, delay }: { label: string; value: number; color: string; delay: number }) {
    return (
        <div className="flex items-center gap-2 text-xs md:text-sm">
            <span className="w-16 text-parchment/70">{label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full w-full origin-left rounded-full" style={{ background: color }}
                    initial={{ transform: "scaleX(0)" }} animate={{ transform: `scaleX(${Math.min(1, value / 10)})` }}
                    transition={{ duration: 0.7, delay, ease: EASE_OUT }} />
            </div>
            <span className="w-6 text-right font-semibold tabular-nums">{value}</span>
        </div>
    );
}

export function RulingCard() {
    const r = useCourt((s) => s.ruling);
    const names = useCourt((s) => s.participants);
    return (
        <AnimatePresence>
            {r && names && (
                <motion.div key={r.seq} className="pointer-events-none absolute inset-x-0 top-[6%] z-40 mx-auto w-[min(92%,620px)]"
                    initial={{ opacity: 0, transform: "translateY(-12px) scale(0.97)" }} animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
                    exit={{ opacity: 0, transform: "translateY(-8px)", transition: { duration: 0.2 } }} transition={{ duration: 0.3, ease: EASE_OUT }}>
                    <div className="panel rounded-xl p-3 md:p-4">
                        <div className="text-center font-display text-lg font-extrabold uppercase tracking-[0.2em] brass-text md:text-2xl">Ruling on Count {r.countIndex + 1}</div>
                        <div className="mt-3 grid grid-cols-2 gap-4">
                            {(["for", "against"] as Side[]).map((side, i) => (
                                <div key={side} className="relative rounded-lg border border-white/10 bg-black/30 p-2">
                                    <div className="mb-1 truncate font-semibold" style={{ color: SIDE_COLOR[side] }}>{names[side].name}</div>
                                    <Bar label="Logic" value={r.rubric[side].logic} color={SIDE_COLOR[side]} delay={0.1 + i * 0.06} />
                                    <Bar label="Evidence" value={r.rubric[side].evidence} color={SIDE_COLOR[side]} delay={0.16 + i * 0.06} />
                                    <Bar label="Wit" value={r.rubric[side].wit} color={SIDE_COLOR[side]} delay={0.22 + i * 0.06} />
                                    {r.winner === side && (
                                        <motion.div className="absolute -right-2 -top-3 rounded border-[3px] border-verdict-solid bg-black px-2 font-comic text-lg tracking-widest text-verdict-solid"
                                            initial={{ opacity: 0, transform: "scale(1.6) rotate(-12deg)" }} animate={{ opacity: 1, transform: "scale(1) rotate(8deg)" }}
                                            transition={{ ...pop, delay: 1.7 }}>
                                            WINS THE COUNT
                                        </motion.div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function VerdictReveal() {
    const stage = useCourt((s) => s.verdictStage);
    const v = useCourt((s) => s.verdict);
    const names = useCourt((s) => s.participants);
    if (!v || !names || stage === "results" || stage === "none") return null;
    const winnerName = v.winner === "hung" ? "Hung Jury" : names[v.winner].name;
    return (
        <div className="pointer-events-none absolute inset-0 z-40">
            <motion.div className="absolute inset-x-0 top-0 h-[11%] bg-black" initial={{ transform: "translateY(-100%)" }} animate={{ transform: "translateY(0%)" }} transition={{ duration: 0.5, ease: EASE_OUT }} />
            <motion.div className="absolute inset-x-0 bottom-0 h-[11%] bg-black" initial={{ transform: "translateY(100%)" }} animate={{ transform: "translateY(0%)" }} transition={{ duration: 0.5, ease: EASE_OUT }} />
            <AnimatePresence mode="wait">
                {stage === "drumroll" ? (
                    <motion.div key="finds" className="absolute inset-x-0 top-[13%] text-center font-display text-[clamp(22px,4.5vw,60px)] font-extrabold italic tracking-wide text-parchment [text-shadow:0_4px_20px_#000]"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
                        The court finds…
                    </motion.div>
                ) : (
                    <motion.div key="reveal" className="absolute inset-x-0 top-[12%] text-center"
                        initial={{ opacity: 0, transform: "scale(0.9)" }} animate={{ opacity: 1, transform: "scale(1)" }} transition={pop}>
                        <div className="font-display text-[clamp(34px,8vw,120px)] font-extrabold uppercase leading-none brass-text [filter:drop-shadow(0_6px_0_rgba(0,0,0,0.6))]">
                            {v.winner === "hung" ? "Hung Jury" : <>👑 {winnerName}</>}
                        </div>
                        <div className="mt-2 font-comic text-[clamp(18px,3.4vw,46px)] tracking-[0.25em] text-white [text-shadow:0_3px_0_#000]">
                            {v.winner === "hung" ? "Nobody wins. Especially the judge." : "Wins the case!"}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function RecessOverlay() {
    const r = useCourt((s) => s.recess);
    const [left, setLeft] = useState(0);
    useEffect(() => {
        if (!r) return;
        const end = Date.now() + r.retryInMs;
        setLeft(Math.ceil(r.retryInMs / 1000));
        const id = setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250);
        return () => clearInterval(id);
    }, [r]);
    return (
        <AnimatePresence>
            {r && (
                <motion.div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <div className="panel max-w-md rounded-xl p-5 text-center">
                        <div className="text-5xl">☕</div>
                        <div className="mt-2 font-display text-2xl font-extrabold uppercase tracking-widest brass-text">Court in recess</div>
                        <p className="mt-2 text-sm text-parchment/80">{r.reason}</p>
                        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-parchment/60">
                            {left > 0 ? `Resuming in ${left}s · attempt ${r.attempt}` : "Resuming…"}
                        </p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function CenterCard({ icon, title, body, children }: { icon: string; title: string; body: string; children?: React.ReactNode }) {
    return (
        <motion.div className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            <motion.div className="panel w-full max-w-md rounded-xl p-5 text-center"
                initial={{ transform: "scale(0.96)" }} animate={{ transform: "scale(1)" }} transition={{ duration: 0.25, ease: EASE_OUT }}>
                <div className="text-5xl">{icon}</div>
                <div className="mt-2 font-display text-2xl font-extrabold uppercase tracking-widest brass-text">{title}</div>
                <p className="mt-2 text-sm text-parchment/80">{body}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>
            </motion.div>
        </motion.div>
    );
}
