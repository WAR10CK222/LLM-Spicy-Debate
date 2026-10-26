import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { DebateSummary, Persona, TopRoast } from "@court/shared";
import { api } from "../lib/api";
import { navigate, type Route } from "../lib/router";
import { Avatar, Button, Chip } from "../ui/ui";

type Tab = Extract<Route, { name: "hall" }>["tab"];
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function HallOfFame({ tab }: { tab: Tab }) {
    const [lawyers, setLawyers] = useState<Persona[]>([]);
    const [roasts, setRoasts] = useState<TopRoast[]>([]);
    const [cases, setCases] = useState<DebateSummary[]>([]);
    const [voted, setVoted] = useState<Set<number>>(new Set());

    useEffect(() => {
        void api.leaderboard().then(setLawyers).catch(() => {});
        void api.topRoasts().then(setRoasts).catch(() => {});
        void api.debates().then(setCases).catch(() => {});
    }, []);

    const vote = async (r: TopRoast) => {
        if (voted.has(r.id)) return;
        setVoted(new Set(voted).add(r.id));
        const { votes } = await api.vote(r.id);
        setRoasts((rs) => rs.map((x) => (x.id === r.id ? { ...x, votes } : x)));
    };

    const tabs: { id: Tab; label: string }[] = [
        { id: "lawyers", label: "🏆 Lawyers" },
        { id: "roasts", label: "🔥 Top roasts" },
        { id: "cases", label: "🗂 Case archive" },
    ];

    return (
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 md:pt-10">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => navigate("/")} className="press flex items-center gap-3 text-left">
                    <span className="text-4xl" aria-hidden>🏛</span>
                    <div>
                        <h1 className="font-display text-4xl font-extrabold leading-none brass-text">Hall of Fame</h1>
                        <p className="mt-1 text-sm text-parchment/70">Legends, burns and the cases that made them.</p>
                    </div>
                </button>
                <Button variant="brass" onClick={() => navigate("/")}>⚖️ File a new case</Button>
            </header>

            <nav className="mt-6 flex gap-1 rounded-xl border border-white/10 bg-black/25 p-1" aria-label="Hall of Fame sections">
                {tabs.map((t) => (
                    <button key={t.id} onClick={() => navigate(`/hall/${t.id}`)} aria-current={tab === t.id}
                        className={`press flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${tab === t.id ? "bg-brass text-walnut-950" : "text-parchment/75 hover:text-parchment"}`}>
                        {t.label}
                    </button>
                ))}
            </nav>

            <motion.div key={tab} className="mt-4" initial={{ opacity: 0, transform: "translateY(6px)" }} animate={{ opacity: 1, transform: "translateY(0)" }} transition={{ duration: 0.22, ease: EASE_OUT }}>
                {tab === "lawyers" && (
                    <ol className="space-y-2">
                        {lawyers.map((p, i) => {
                            const games = p.wins + p.losses + p.draws;
                            return (
                                <li key={p.id} className="panel flex items-center gap-4 rounded-xl p-3">
                                    <span className={`w-8 text-center font-display text-2xl font-extrabold ${i === 0 ? "brass-text" : "text-parchment/50"}`}>{i === 0 ? "👑" : i + 1}</span>
                                    <Avatar persona={p} size={56} emotion={i === 0 ? "smug" : "confident"} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-semibold">{p.name} <span className="text-sm font-normal text-parchment/60">· {p.title}</span></div>
                                        <div className="truncate text-xs italic text-parchment/60">“{p.catchphrase}”</div>
                                    </div>
                                    <div className="hidden text-right text-xs text-parchment/70 sm:block">
                                        <div>{p.wins}W · {p.losses}L · {p.draws}D</div>
                                        <div>{games ? Math.round((p.wins / games) * 100) : 0}% wins · {p.roastsLanded} roasts landed</div>
                                    </div>
                                    <div className="w-16 text-right">
                                        <div className="font-display text-2xl font-extrabold tabular-nums brass-text">{p.elo}</div>
                                        <div className="text-[10px] uppercase tracking-widest text-parchment/50">Elo</div>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}

                {tab === "roasts" && (
                    <div className="grid gap-3 md:grid-cols-2">
                        {roasts.length === 0 && <p className="text-parchment/60">No roasts on record yet. Go start some trouble.</p>}
                        {roasts.map((r) => (
                            <figure key={r.id} className="panel flex flex-col rounded-xl p-4">
                                <blockquote className="flex-1 font-display text-lg italic leading-snug text-parchment">“{r.text}”</blockquote>
                                <figcaption className="mt-3 flex items-center gap-2 text-xs text-parchment/65">
                                    <span className="font-semibold text-parchment">{r.personaName}</span>
                                    <span className="truncate">· {r.caseTitle ?? "Untitled case"}</span>
                                    <span className="ml-auto" title="Spice">{"🌶️".repeat(Math.max(1, Math.round(r.spice / 3.4)))}</span>
                                </figcaption>
                                <div className="mt-3 flex items-center gap-2">
                                    <Chip>Crowd {Math.round(r.crowdScore * 100)}%</Chip>
                                    <button onClick={() => vote(r)} disabled={voted.has(r.id)}
                                        className="press ml-auto rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-sm disabled:opacity-60">
                                        🔥 {r.votes}
                                    </button>
                                    <button onClick={() => navigate(`/court/${r.debateId}`)} className="text-xs text-brass-light underline-offset-2 hover:underline">Watch case</button>
                                </div>
                            </figure>
                        ))}
                    </div>
                )}

                {tab === "cases" && (
                    <ul className="space-y-2">
                        {cases.length === 0 && <p className="text-parchment/60">The archive is empty.</p>}
                        {cases.map((d) => (
                            <li key={d.id}>
                                <button onClick={() => navigate(`/court/${d.id}`)} className="press panel flex w-full items-center gap-3 rounded-xl p-3 text-left">
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-semibold">{d.title ?? d.topic}</div>
                                        <div className="truncate text-xs text-parchment/60">{d.topic} · {d.forPersona.name} v. {d.againstPersona.name} · {new Date(d.createdAt).toLocaleString()}</div>
                                    </div>
                                    <Chip color={d.status === "finished" ? "#d4a24c" : d.status === "adjourned" ? "#ef4444" : "#22c55e"}>
                                        {d.status === "finished" && d.winner ? (d.winner === "hung" ? "Hung jury" : `${d.winner === "for" ? d.forPersona.name : d.againstPersona.name} won`) : d.status}
                                    </Chip>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </motion.div>
        </div>
    );
}
