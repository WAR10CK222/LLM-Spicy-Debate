import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, motionValue } from "motion/react";
import type { DebateSummary, Depth, JudgeMood, Persona, ServerInfo, Spice } from "@court/shared";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { readSetting, SIDE_COLOR, writeSetting } from "../lib/util";
import { sfx } from "../audio/sfx";
import { TOPICS } from "../data/topics";
import { Puppet } from "../stage/Puppet";
import { Avatar, Button, Chip, Segmented } from "../ui/ui";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const idle = motionValue(0);
const noGesture = { kind: "none" as const, nonce: 0 };

function Matchup({ a, b }: { a?: Persona; b?: Persona }) {
    return (
        <div className="relative flex items-end justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-b from-walnut-700/60 to-walnut-950 px-4 pt-4 ring-1 ring-brass/25">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[radial-gradient(60%_80%_at_50%_0%,rgba(255,233,184,0.18),transparent)]" />
            {[a, b].map((p, i) => (
                <div key={i} className="relative h-[170px] w-[120px] sm:h-[210px] sm:w-[150px]">
                    <AnimatePresence mode="popLayout">
                        {p && (
                            <motion.div key={p.id} className="absolute inset-0"
                                initial={{ opacity: 0, transform: `translateX(${i ? 24 : -24}px)` }} animate={{ opacity: 1, transform: "translateX(0px)" }}
                                exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.28, ease: EASE_OUT }}>
                                <Puppet look={p.look} emotion={i ? "smug" : "confident"} gesture={noGesture} fx={[]} mouth={idle} speaking={false} mirrored={i === 1} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-walnut-950 to-transparent" />
                </div>
            ))}
            <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 rotate-[-6deg] rounded-md border-[3px] border-black bg-yellow-400 px-3 font-comic text-3xl tracking-widest text-black shadow-[4px_4px_0_rgba(0,0,0,0.6)] sm:text-4xl">VS</div>
        </div>
    );
}

function LawyerPicker({ side, personas, value, other, onChange }: {
    side: "for" | "against"; personas: Persona[]; value: string; other: string; onChange: (id: string) => void;
}) {
    return (
        <fieldset className="min-w-0">
            <legend className="mb-2 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: SIDE_COLOR[side] }}>
                {side === "for" ? "Arguing FOR" : "Arguing AGAINST"}
            </legend>
            <div className="grid grid-cols-1 gap-2">
                {personas.map((p) => {
                    const selected = p.id === value;
                    const taken = p.id === other;
                    return (
                        <button key={p.id} disabled={taken} onClick={() => onChange(p.id)} aria-pressed={selected}
                            className={`press flex w-full min-w-0 items-center gap-3 rounded-xl border p-2 text-left disabled:opacity-35 ${selected ? "bg-white/[0.07]" : "border-white/10 bg-black/20 hover:bg-white/5"}`}
                            style={selected ? { borderColor: SIDE_COLOR[side], boxShadow: `0 0 0 1px ${SIDE_COLOR[side]}` } : undefined}>
                            <Avatar persona={p} size={46} mirrored={side === "against"} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="truncate font-semibold">{p.name}</span>
                                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-brass-light">{p.elo}</span>
                                </div>
                                <div className="truncate text-xs text-parchment/60">{p.title} · {p.tagline}</div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}

const STATUS_COLOR: Record<string, string> = { running: "#22c55e", paused: "#93c5fd", recess: "#f59e0b", finished: "#d4a24c", dismissed: "#9ca3af", adjourned: "#ef4444" };

export function Lobby() {
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [recent, setRecent] = useState<DebateSummary[]>([]);
    const [info, setInfo] = useState<ServerInfo | null>(null);
    const [topic, setTopic] = useState(() => readSetting("topic", ""));
    const [forId, setForId] = useState(() => readSetting("forId", "eleonora"));
    const [againstId, setAgainstId] = useState(() => readSetting("againstId", "marcus"));
    const [spice, setSpice] = useState<Spice>(() => readSetting("spice", "roast"));
    const [judgeMood, setJudgeMood] = useState<JudgeMood>(() => readSetting("judgeMood", "fair"));
    const [crowdBias, setCrowdBias] = useState(() => readSetting("crowdBias", 0));
    const [depth, setDepth] = useState<Depth>(() => readSetting("depth", "quick"));
    const [counts, setCounts] = useState(() => readSetting("counts", 2));
    const [turns, setTurns] = useState(() => readSetting("turns", 4));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [spinning, setSpinning] = useState(false);

    useEffect(() => {
        void api.personas().then(setPersonas).catch((e) => setError(`Can't reach the court server: ${(e as Error).message}`));
        void api.debates().then(setRecent).catch(() => {});
        void api.info().then(setInfo).catch(() => {});
    }, []);

    const suggestions = useMemo(() => [...TOPICS].sort(() => Math.random() - 0.5).slice(0, 4), []);
    const byId = (id: string) => personas.find((p) => p.id === id);
    const calls = 1 + (2 + counts * turns + 2) * 2 + counts + 2;

    const spin = () => {
        if (spinning) return;
        sfx.unlock();
        setSpinning(true);
        let n = 0;
        const id = setInterval(() => {
            setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)]);
            sfx.play("pop", 0.3);
            if (++n >= 9) {
                clearInterval(id);
                setSpinning(false);
                sfx.play("ding", 0.6);
            }
        }, 70);
    };

    const randomMatch = () => {
        const ids = [...personas].sort(() => Math.random() - 0.5).map((p) => p.id);
        setForId(ids[0]);
        setAgainstId(ids[1]);
    };

    const file = async () => {
        sfx.unlock();
        setError(null);
        if (topic.trim().length < 5) return setError("Give the court a proper motion (at least a few words).");
        setBusy(true);
        const settings = { topic: topic.trim(), forId, againstId, spice, judgeMood, crowdBias, depth, counts, turnsPerCount: turns };
        Object.entries({ topic: topic.trim(), forId, againstId, spice, judgeMood, crowdBias, depth, counts, turns }).forEach(([k, v]) => writeSetting(k, v));
        try {
            const { id } = await api.create(settings);
            sfx.play("gavel", 0.9);
            navigate(`/court/${id}`);
        } catch (e) {
            setError((e as Error).message);
            setBusy(false);
        }
    };

    const biasLabel = crowdBias > 0.33 ? `Stacked for ${byId(forId)?.name ?? "FOR"}` : crowdBias < -0.33 ? `Stacked for ${byId(againstId)?.name ?? "AGAINST"}` : "A fair-ish gallery";

    return (
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 md:pt-10">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-4xl" aria-hidden>⚖️</span>
                    <div>
                        <h1 className="font-display text-4xl font-extrabold leading-none brass-text md:text-5xl">Roast Court</h1>
                        <p className="mt-1 text-sm text-parchment/70">Where arguments are judged and egos are sentenced.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {info?.mode === "mock" && <Chip color="#a78bfa">Mock mode · no API calls</Chip>}
                    {info?.mode === "live" && <Chip color="#22c55e">Live · {info.models.main}</Chip>}
                    <Button onClick={() => navigate("/hall")}>🏛 Hall of Fame</Button>
                </div>
            </header>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                <section className="panel rounded-2xl p-4 md:p-6" aria-labelledby="file-heading">
                    <Matchup a={byId(forId)} b={byId(againstId)} />

                    <h2 id="file-heading" className="mt-6 font-display text-2xl font-bold text-parchment">File a case</h2>
                    <label className="mt-3 block text-xs font-bold uppercase tracking-[0.2em] text-parchment/60" htmlFor="topic">The motion</label>
                    <div className="mt-1 flex gap-2">
                        <textarea id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} rows={2}
                            placeholder="e.g. Pineapple belongs on pizza"
                            className="min-h-[56px] flex-1 resize-y rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-lg text-parchment placeholder:text-parchment/35 focus:border-brass focus:outline-none" />
                        <Button onClick={spin} aria-label="Random case" className="shrink-0 self-stretch px-3 text-xl" title="Random case">🎲</Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {suggestions.map((s) => (
                            <button key={s} onClick={() => setTopic(s)} className="press rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-parchment/75 hover:text-parchment">{s}</button>
                        ))}
                    </div>

                    <div className="mt-6 flex items-center justify-between">
                        <h3 className="font-display text-xl font-bold">Choose your counsel</h3>
                        <Button onClick={randomMatch} disabled={personas.length < 2}>🎲 Random matchup</Button>
                    </div>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <LawyerPicker side="for" personas={personas} value={forId} other={againstId} onChange={setForId} />
                        <LawyerPicker side="against" personas={personas} value={againstId} other={forId} onChange={setAgainstId} />
                    </div>

                    <h3 className="mt-6 font-display text-xl font-bold">Courtroom rules</h3>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <div>
                            <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-parchment/60">Spice level</div>
                            <Segmented label="Spice level" value={spice} onChange={setSpice} options={[
                                { value: "cordial", label: "🌶️ Cordial", hint: "Gentle teasing" },
                                { value: "roast", label: "🌶️🌶️ Roast", hint: "Comedy-roast energy" },
                                { value: "scorched", label: "🌶️🌶️🌶️ Scorched", hint: "Savage (still PG-13)" },
                            ]} />
                        </div>
                        <div>
                            <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-parchment/60">Judge's mood</div>
                            <Segmented label="Judge's mood" value={judgeMood} onChange={setJudgeMood} options={[
                                { value: "grumpy", label: "😤 Grumpy" }, { value: "fair", label: "🧐 Fair" }, { value: "amused", label: "😆 Amused" },
                            ]} />
                        </div>
                        <div className="md:col-span-2">
                            <div className="mb-1 flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-parchment/60">
                                <label htmlFor="bias">Stack the gallery</label>
                                <span className="normal-case tracking-normal text-parchment/80">{biasLabel}</span>
                            </div>
                            <input id="bias" type="range" min={-1} max={1} step={0.05} value={crowdBias} onChange={(e) => setCrowdBias(Number(e.target.value))}
                                className="w-full accent-[#d4a24c]" style={{ direction: "rtl" }} aria-valuetext={biasLabel} />
                            <div className="flex justify-between text-[11px] text-parchment/50">
                                <span style={{ color: SIDE_COLOR.for }}>◀ FOR fans</span><span style={{ color: SIDE_COLOR.against }}>AGAINST fans ▶</span>
                            </div>
                        </div>
                        <div>
                            <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-parchment/60">Depth</div>
                            <Segmented label="Depth" value={depth} onChange={setDepth} options={[{ value: "quick", label: "Quick bites" }, { value: "deep", label: "Deep dive" }]} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-parchment/60">Counts</div>
                                <Segmented label="Counts" value={counts} onChange={setCounts} options={[1, 2, 3].map((n) => ({ value: n, label: n }))} />
                            </div>
                            <div>
                                <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-parchment/60">Turns / count</div>
                                <Segmented label="Turns per count" value={turns} onChange={setTurns} options={[2, 4, 6].map((n) => ({ value: n, label: n }))} />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <Button variant="brass" className="px-6 py-3 text-base" onClick={file} disabled={busy || personas.length < 2}>
                            {busy ? "Filing…" : "⚖️ File the case"}
                        </Button>
                        <span className="text-xs text-parchment/55">≈{calls} AI calls{info?.mode === "mock" ? " (simulated)" : ""}</span>
                        {error && <span role="alert" className="text-sm text-verdict-false">{error}</span>}
                    </div>
                </section>

                <aside className="space-y-4">
                    <div className="panel rounded-2xl p-4">
                        <h2 className="font-display text-lg font-bold">How it works</h2>
                        <ol className="mt-2 space-y-1.5 text-sm text-parchment/75">
                            <li>🧑‍⚖️ The judge frames your topic into counts and seats a biased gallery.</li>
                            <li>🔥 Two AI lawyers argue, rebut and roast each other.</li>
                            <li>🔍 A referee fact-checks every claim into your Case File.</li>
                            <li>🍅 You heckle from the gallery. The lawyers notice.</li>
                            <li>📜 Verdict, sentencing, then a brief and a quiz on what was true.</li>
                        </ol>
                    </div>
                    <div className="panel rounded-2xl p-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-display text-lg font-bold">Recent cases</h2>
                            <button onClick={() => navigate("/hall/cases")} className="text-xs text-brass-light underline-offset-2 hover:underline">All</button>
                        </div>
                        {recent.length === 0 && <p className="mt-2 text-sm text-parchment/50">No cases yet. Be the first to waste the court's time.</p>}
                        <ul className="mt-2 space-y-2">
                            {recent.slice(0, 6).map((d) => (
                                <li key={d.id}>
                                    <button onClick={() => navigate(`/court/${d.id}`)} className="press w-full rounded-lg border border-white/10 bg-black/20 p-2 text-left hover:bg-white/5">
                                        <div className="truncate text-sm font-semibold">{d.title ?? d.topic}</div>
                                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-parchment/60">
                                            <span className="truncate">{d.forPersona.name} v. {d.againstPersona.name}</span>
                                            <span className="ml-auto shrink-0" style={{ color: STATUS_COLOR[d.status] }}>
                                                {d.status === "finished" && d.winner ? (d.winner === "hung" ? "hung jury" : `${d.winner === "for" ? d.forPersona.name : d.againstPersona.name} won`) : d.status}
                                            </span>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </aside>
            </div>
        </div>
    );
}
