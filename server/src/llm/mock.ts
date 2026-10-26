// Offline stand-in for Gemini: deterministic, schema-valid, reasonably funny. Used by `--mock` and the tests.
import type { Side } from "@court/shared";
import type { Llm, StructuredRequest, StructuredResult } from "./types.js";

export interface MockContext {
    topic: string;
    /** Makes the output deterministic per call site. */
    seed: string;
    counts?: number;
    speaker?: { id: string; name: string; side: Side; catchphrase: string };
    opponent?: { id: string; name: string };
    stage?: string;
    countIndex?: number;
    factions?: string[];
    forName?: string;
    againstName?: string;
    spectatorObjection?: boolean;
    canObject?: boolean;
    scores?: { for: number; against: number };
    spiceRange?: [number, number];
}

function rng(seed: string) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
}

const ROASTS = [
    "My opponent's argument is like a GPS with no signal: confident, loud, and going nowhere.",
    "I've seen more evidence in a fortune cookie.",
    "That point was so weak it needed a permission slip to leave the room.",
    "If ignoring data were an Olympic sport, my opponent would finally have a medal.",
    "Bless your heart, that was almost an argument.",
    "That rebuttal had the shelf life of an open avocado.",
    "My learned colleague brought a spoon to a sword fight, then forgot the spoon.",
    "That logic runs on vibes and expired coupons.",
    "I'd agree with you, but then we'd both be wrong.",
    "Your argument has the structural integrity of a wet paper napkin.",
];

const FACTS = [
    "Economists call this opportunity cost: every hour or dollar spent here is one not spent somewhere else.",
    "Research on status quo bias shows people overvalue what they already have, simply because they have it.",
    "Second-order effects, the consequences of the consequences, are where most big ideas succeed or fail.",
    "Network effects mean something gets more valuable as more people use it, like phones or group chats.",
    "Survivorship bias: we study the winners and forget the failures that did exactly the same thing.",
    "Diminishing marginal returns: the tenth slice of pizza is worth far less than the first.",
    "Correlation is not causation: ice cream sales and shark attacks both rise in summer.",
    "Incentives drive behaviour: when a measure becomes a target, it stops being a good measure (Goodhart's law).",
];

const EMOTIONS_SPEAK = ["confident", "smug", "smirk", "cheerful", "thinking", "furious"] as const;
const GESTURES = ["point", "slam", "shrug", "cross_arms", "mic_drop", "wave", "think"] as const;
const REACTIONS = ["cheer", "applause", "ooh", "gasp", "laugh", "boo", "murmur"] as const;
const OPP_FACES = ["offended", "roasted", "shocked", "nervous", "smug", "laughing"] as const;
const JUDGE_FACES = ["stern", "unimpressed", "amused", "stifling_laugh", "shocked", "pleased"] as const;
const HECKLES = ["Objection to your whole vibe!", "Sit DOWN!", "Ooooh, call the fire department!", "Sources?!", "My nonna argues better!", "Encore! ENCORE!", "Boooo, that's not a fact!"];
const SENTENCES = [
    "30 days of reading every Terms & Conditions page, out loud, to a houseplant.",
    "community service as a human 'Are you sure?' dialog box.",
    "a lifetime ban from saying 'actually' in group chats.",
    "explaining the blockchain to Grandma Gertrude until she understands it (life sentence).",
];

export class MockLlm implements Llm {
    readonly calls = { total: 0, byTask: {} as Record<string, number> };

    constructor(private opts: { latencyMs?: [number, number]; failFirst?: number; error?: () => unknown } = {}) {}

    async structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        this.calls.total++;
        this.calls.byTask[req.task] = (this.calls.byTask[req.task] ?? 0) + 1;
        if (this.opts.failFirst && this.opts.failFirst > 0) {
            this.opts.failFirst--;
            throw this.opts.error?.() ?? Object.assign(new Error("mock overloaded"), { status: 503 });
        }
        const [lo, hi] = this.opts.latencyMs ?? [250, 900];
        if (hi > 0) await new Promise((r) => setTimeout(r, lo + Math.random() * (hi - lo)));
        const data = req.schema.parse(this.produce(req));
        return { data, model: "mock", sources: [] };
    }

    private produce(req: StructuredRequest<unknown>): unknown {
        const m = req.mock;
        const r = rng(`${req.task}:${m.seed}`);
        const pick = <X>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)];
        const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
        const topic = m.topic.replace(/[?.!]+$/, "");

        switch (req.task) {
            case "frame_case": {
                const n = m.counts ?? 2;
                const short = topic.split(/\s+/).slice(0, 4).join(" ");
                const countBank = [
                    { title: "The Practical Case", question: `Does "${topic}" actually work in practice, day to day?` },
                    { title: "Costs and Trade-offs", question: `Are the costs of "${topic}" worth the benefits?` },
                    { title: "The Long Run", question: `What happens in ten years if we embrace "${topic}"?` },
                ];
                return {
                    dismissed: false,
                    dismissReason: "",
                    title: `The People v. ${short.replace(/\b\w/g, (c) => c.toUpperCase())}`,
                    opening: `All rise! This court will now decide whether "${topic}" holds up. I've cleared my afternoon and lowered my expectations.`,
                    counts: countBank.slice(0, n),
                    factions: [
                        { name: "The True Believers", side: "for", bias: 0.8, sign: "YES YES YES" },
                        { name: "Concerned Citizens", side: "against", bias: 0.7, sign: "NOT ON MY WATCH" },
                        { name: "Confused Interns", side: "neutral", bias: 0.2, sign: "WHICH SIDE?" },
                    ],
                    learningGoal: `Understand the strongest arguments, costs and evidence on both sides of "${topic}".`,
                };
            }
            case "debater_turn": {
                const s = m.speaker!;
                const roast = pick(ROASTS);
                const fact = pick(FACTS);
                const [smin, smax] = m.spiceRange ?? [4, 7];
                const lead = m.stage === "opening"
                    ? `Your Honor, I stand ${s.side === "for" ? "proudly for" : "firmly against"} "${topic}".`
                    : m.stage === "closing"
                        ? `Your Honor, the verdict should be obvious: ${s.side === "for" ? "embrace" : "reject"} "${topic}".`
                        : `${m.opponent?.name ?? "My opponent"} keeps dodging the real question.`;
                const catch_ = r() < 0.2 ? ` ${s.catchphrase}` : "";
                return {
                    speech: `${lead} ${fact} ${roast}${catch_}`,
                    roastLine: roast,
                    claim: fact,
                    emotion: pick(EMOTIONS_SPEAK),
                    gesture: pick(GESTURES),
                    spice: int(smin, smax),
                    ttsStyle: pick(["smug and sarcastic", "fiery and theatrical", "calm, then cutting", "mock-sympathetic"]),
                };
            }
            case "courtroom_reaction": {
                const factions = m.factions ?? [];
                const raised = !!m.spectatorObjection || (!!m.canObject && r() < 0.25);
                const landed = r() < 0.6;
                return {
                    factCheck: {
                        verdict: pick(["solid", "solid", "shaky", "opinion", "false"] as const),
                        note: "Broadly right as a general principle, but the real-world size of the effect depends heavily on context.",
                        learnMore: pick(["opportunity cost", "status quo bias", "second-order effects", "survivorship bias", "Goodhart's law"]),
                    },
                    score: { logic: int(4, 9), evidence: int(3, 8), wit: int(5, 10) },
                    roastLanded: landed,
                    speakerEmotion: landed ? pick(["smug", "smirk", "cheerful"] as const) : pick(["nervous", "thinking"] as const),
                    opponentEmotion: landed ? pick(OPP_FACES.slice(0, 4)) : pick(OPP_FACES.slice(4)),
                    judgeExpression: pick(JUDGE_FACES),
                    crowd: factions.map((f) => ({ faction: f, reaction: pick(REACTIONS), intensity: Math.round(r() * 100) / 100 })),
                    heckles: factions.length && r() < 0.7 ? [{ faction: pick(factions), text: pick(HECKLES) }] : [],
                    crowdSwing: int(-4, 8),
                    objection: {
                        raised,
                        by: m.spectatorObjection ? "spectator" : "opponent",
                        grounds: m.spectatorObjection ? "Spectator feels strongly" : "Misleading generalisation",
                        objectorLine: m.spectatorObjection ? "Objection! I just think it's unfair and also I'm hungry!" : `Objection! ${m.speaker?.name ?? "Counsel"} is treating a vibe as a statistic!`,
                        ruling: m.spectatorObjection ? "overruled" : pick(["sustained", "overruled"] as const),
                        judgeLine: m.spectatorObjection
                            ? "Overruled. The gallery does not get to object. The gallery gets to sit down and eat its tomatoes."
                            : "Sustained. Counsel will cite something sturdier than a feeling.",
                    },
                };
            }
            case "rule_count": {
                const forWins = r() < 0.5;
                const winner = forWins ? m.forName! : m.againstName!;
                return {
                    winner,
                    forScore: { logic: int(4, 9), evidence: int(3, 9), wit: int(4, 10) },
                    againstScore: { logic: int(4, 9), evidence: int(3, 9), wit: int(4, 10) },
                    judgeLine: `This count goes to ${winner}. Not because they were brilliant, but because they were slightly less wrong, which in this courtroom is a landslide.`,
                    lesson: pick(FACTS),
                    summary: `${m.forName} pushed the benefits while ${m.againstName} hammered the costs and risks.`,
                };
            }
            case "verdict": {
                const s = m.scores ?? { for: 0, against: 0 };
                const winner = s.for > s.against ? m.forName! : s.against > s.for ? m.againstName! : r() < 0.5 ? m.forName! : "Hung jury";
                return {
                    winner,
                    judgeLine: winner === "Hung jury"
                        ? "The court finds... that you are both exhausting. This is a hung jury. Nobody wins, especially me."
                        : `The court finds in favour of ${winner}! The arguments were sharper, the evidence was sturdier, and the roasts were, regrettably, funny.`,
                    sentence: pick(SENTENCES),
                    summary: `${m.forName} made the bolder case, ${m.againstName} the more careful one, and the gallery threw an irresponsible amount of produce.`,
                };
            }
            case "case_brief":
                return {
                    steelmanFor: `The best case for "${topic}" is that its benefits compound over time and the status quo has hidden costs of its own.`,
                    steelmanAgainst: `The best case against "${topic}" is that its costs are concrete and immediate while its benefits are speculative.`,
                    takeaways: [
                        "Every choice has an opportunity cost, even doing nothing.",
                        "Look for second-order effects before declaring victory.",
                        "Confident claims still need evidence; ask for the source.",
                    ],
                    corrections: ["A general principle isn't a statistic: the size of an effect depends on context."],
                    glossary: [
                        { term: "Opportunity cost", meaning: "The value of the best alternative you give up when you choose something." },
                        { term: "Status quo bias", meaning: "The tendency to prefer things to stay the same." },
                        { term: "Survivorship bias", meaning: "Drawing conclusions only from the cases that made it through a filter." },
                    ],
                    quiz: [
                        { question: "What is an opportunity cost?", options: ["The price on the tag", "The value of the best alternative given up", "A tax on opportunities", "A sunk cost"], answerIndex: 1, explanation: "It's what you give up by choosing one option over the next best one." },
                        { question: "Ice cream sales and shark attacks both rise in summer. This shows…", options: ["Ice cream causes sharks", "Correlation is not causation", "Sharks like dessert", "Nothing at all"], answerIndex: 1, explanation: "A third factor (warm weather) drives both." },
                        { question: "Studying only successful startups to learn what works risks…", options: ["Survivorship bias", "Inflation", "Network effects", "Diminishing returns"], answerIndex: 0, explanation: "The failures that did the same things are invisible in your sample." },
                    ],
                };
        }
    }
}
