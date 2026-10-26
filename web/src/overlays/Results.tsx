import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { otherSide, type CaseBrief, type QuizResult, type Side } from "@court/shared";
import { useCourt } from "../store/court";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { SIDE_COLOR } from "../lib/util";
import { sfx } from "../audio/sfx";
import { Avatar, Button, Chip } from "../ui/ui";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function Delta({ before, after }: { before: number; after: number }) {
    const d = after - before;
    return (
        <span className="tabular-nums">
            {after} <span className={d > 0 ? "text-verdict-solid" : d < 0 ? "text-verdict-false" : "text-parchment/50"}>({d > 0 ? "+" : ""}{d})</span>
        </span>
    );
}

export function ResultsPanel({ onReplay }: { onReplay: () => void }) {
    const v = useCourt((s) => s.verdict);
    const stage = useCourt((s) => s.verdictStage);
    const p = useCourt((s) => s.participants);
    const brief = useCourt((s) => s.brief);
    const debateId = useCourt((s) => s.debateId);
    const [showBrief, setShowBrief] = useState(false);
    if (!v || !p || stage !== "results") return null;
    const loser: Side | null = v.winner === "hung" ? null : otherSide(v.winner);
    const pc = v.peoplesChoice;

    return (
        <motion.div className="absolute inset-0 z-50 overflow-y-auto bg-black/70 p-3 backdrop-blur-[2px] md:p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <AnimatePresence mode="wait">
                {!showBrief ? (
                    <motion.div key="results" className="panel mx-auto max-w-2xl rounded-2xl p-4 md:p-6"
                        initial={{ opacity: 0, transform: "translateY(10px)" }} animate={{ opacity: 1, transform: "translateY(0)" }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
                        <div className="text-center text-[11px] font-bold uppercase tracking-[0.3em] text-parchment/60">Verdict</div>
                        <div className="mt-1 text-center font-display text-3xl font-extrabold brass-text md:text-4xl">
                            {v.winner === "hung" ? "Hung Jury" : `${p[v.winner].name} wins`}
                        </div>
                        <p className="mx-auto mt-2 max-w-prose text-center text-sm text-parchment/80">{v.summary}</p>

                        <div className="mt-5 grid grid-cols-2 gap-3">
                            {(["for", "against"] as Side[]).map((side) => (
                                <div key={side} className="flex items-center gap-3 rounded-xl border bg-black/25 p-3" style={{ borderColor: v.winner === side ? "#d4a24c" : "rgba(255,255,255,0.1)" }}>
                                    <Avatar persona={p[side]} size={52} mirrored={side === "against"} emotion={v.winner === side ? "laughing" : v.winner === "hung" ? "shocked" : "roasted"} />
                                    <div className="min-w-0 text-sm">
                                        <div className="truncate font-bold" style={{ color: SIDE_COLOR[side] }}>{p[side].name}</div>
                                        <div className="text-parchment/70">Counts won: <b className="text-parchment">{v.scores[side]}</b></div>
                                        <div className="text-parchment/70">Elo: <Delta {...v.elo[side]} /></div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {loser && (
                            <div className="mt-4 rounded-xl border-2 border-dashed border-verdict-false/50 bg-verdict-false/5 p-3 text-sm">
                                <div className="font-comic text-lg tracking-widest text-verdict-false">⚖️ Sentencing</div>
                                <p className="text-parchment/90"><b>{p[loser].name}</b> is hereby sentenced to {v.sentence}</p>
                            </div>
                        )}
                        <div className="mt-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm">
                            <div className="font-comic text-lg tracking-widest text-yellow-400">🍅 People's Choice</div>
                            <p className="text-parchment/90">
                                {pc === "split" ? "The gallery couldn't agree on anything except that tomatoes are fun."
                                    : pc === v.winner ? `The gallery agrees with the judge: ${p[pc].name}!`
                                        : `The gallery loved ${p[pc].name}, but the judge wasn't buying it.`}
                            </p>
                        </div>

                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                            <Button variant="brass" onClick={() => setShowBrief(true)} disabled={!brief}>{brief ? "📜 Case brief & quiz" : "📜 Clerk is writing the brief…"}</Button>
                            <Button onClick={onReplay}>🔁 Replay</Button>
                            <Button onClick={() => navigate("/")}>⚖️ New case</Button>
                            <Button onClick={() => navigate("/hall")}>🏛 Hall of Fame</Button>
                        </div>
                    </motion.div>
                ) : (
                    brief && debateId && <BriefPanel key="brief" brief={brief} debateId={debateId} onBack={() => setShowBrief(false)} />
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export function BriefPanel({ brief, debateId, onBack }: { brief: CaseBrief; debateId: string; onBack?: () => void }) {
    const [answers, setAnswers] = useState<(number | null)[]>(() => brief.quiz.map(() => null));
    const [result, setResult] = useState<QuizResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const submit = async () => {
        try {
            const r = await api.quiz(debateId, answers.map((a) => a ?? -1));
            setResult(r);
            sfx.play(r.score === r.total ? "tada" : r.score === 0 ? "buzzer" : "ding");
            if (r.score === r.total) useCourt.getState().patch({ confetti: { nonce: useCourt.getState().confetti.nonce + 1, side: "both" } });
        } catch (e) {
            setError((e as Error).message);
        }
    };
    return (
        <motion.div className="panel mx-auto max-w-3xl rounded-2xl p-4 md:p-6"
            initial={{ opacity: 0, transform: "translateY(10px)" }} animate={{ opacity: 1, transform: "translateY(0)" }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
            <div className="flex items-center justify-between gap-2">
                <div className="font-display text-2xl font-extrabold brass-text md:text-3xl">📜 The Case Brief</div>
                {onBack && <Button onClick={onBack}>← Verdict</Button>}
            </div>
            <p className="mt-1 text-sm text-parchment/60">The comedy's over. Here's what was actually true.</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-side-for/40 bg-side-for/5 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-side-for">Strongest case for</div>
                    <p className="mt-1 text-sm text-parchment/90">{brief.steelmanFor}</p>
                </div>
                <div className="rounded-xl border border-side-against/40 bg-side-against/5 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-side-against">Strongest case against</div>
                    <p className="mt-1 text-sm text-parchment/90">{brief.steelmanAgainst}</p>
                </div>
            </div>

            <h3 className="mt-5 font-display text-lg font-bold text-brass-light">Key takeaways</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-parchment/90">{brief.takeaways.map((t, i) => <li key={i}>{t}</li>)}</ul>

            {brief.corrections.length > 0 && (
                <>
                    <h3 className="mt-4 font-display text-lg font-bold text-brass-light">Corrections</h3>
                    <ul className="mt-1 space-y-1 text-sm text-parchment/85">{brief.corrections.map((c, i) => <li key={i} className="flex gap-2"><span className="text-verdict-shaky">⚠</span>{c}</li>)}</ul>
                </>
            )}

            {brief.glossary.length > 0 && (
                <>
                    <h3 className="mt-4 font-display text-lg font-bold text-brass-light">Glossary</h3>
                    <dl className="mt-1 grid gap-2 text-sm sm:grid-cols-2">
                        {brief.glossary.map((g) => (
                            <div key={g.term} className="rounded-lg bg-black/25 p-2">
                                <dt className="font-semibold text-parchment">{g.term}</dt>
                                <dd className="text-parchment/75">{g.meaning}</dd>
                            </div>
                        ))}
                    </dl>
                </>
            )}

            {brief.sources.length > 0 && (
                <>
                    <h3 className="mt-4 font-display text-lg font-bold text-brass-light">Sources</h3>
                    <ul className="mt-1 space-y-1 text-sm">
                        {brief.sources.map((s) => <li key={s.url}><a className="text-brass-light underline underline-offset-2" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}
                    </ul>
                </>
            )}

            {brief.quiz.length > 0 && (
                <div className="mt-6 rounded-xl border border-brass/30 bg-black/25 p-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-display text-xl font-bold brass-text">Pop quiz, counsel</h3>
                        {result && <Chip color={result.score === result.total ? "#22c55e" : "#f59e0b"}>{result.score}/{result.total} correct</Chip>}
                    </div>
                    <ol className="mt-3 space-y-4">
                        {brief.quiz.map((q, qi) => (
                            <li key={qi}>
                                <p className="font-semibold text-parchment">{qi + 1}. {q.question}</p>
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                    {q.options.map((opt, oi) => {
                                        const picked = answers[qi] === oi;
                                        const correct = result && oi === q.answerIndex;
                                        const wrong = result && picked && oi !== q.answerIndex;
                                        return (
                                            <button key={oi} disabled={!!result}
                                                onClick={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))}
                                                className={`press rounded-lg border px-3 py-2 text-left text-sm ${correct ? "border-verdict-solid bg-verdict-solid/15" : wrong ? "border-verdict-false bg-verdict-false/15" : picked ? "border-brass bg-brass/15" : "border-white/10 bg-white/5"}`}>
                                                {opt}
                                            </button>
                                        );
                                    })}
                                </div>
                                {result && <p className="mt-1 text-xs text-parchment/70">{q.explanation}</p>}
                            </li>
                        ))}
                    </ol>
                    {!result && (
                        <div className="mt-4 flex items-center gap-3">
                            <Button variant="brass" disabled={answers.some((a) => a === null)} onClick={submit}>Submit answers</Button>
                            {error && <span className="text-sm text-verdict-false">{error}</span>}
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
}
