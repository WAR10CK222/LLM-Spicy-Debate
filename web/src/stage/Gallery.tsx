import { memo, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { CrowdReaction, Faction } from "@court/shared";
import { useCourt } from "../store/court";
import { seatMap, GALLERY_SEATS } from "../director/director";
import { seatPosition } from "./layout";
import { seeded } from "../lib/util";

type Mood = CrowdReaction | "idle";

function tint(hex: string, jitter: number) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + jitter))));
    return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

const HATS = ["none", "none", "party", "cap", "beret", "none", "top", "none", "bow"] as const;

function BeanFace({ mood }: { mood: Mood }) {
    const ink = "#1c1917";
    const eyes = (() => {
        switch (mood) {
            case "cheer": case "applause": case "laugh":
                return <g stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round"><path d="M24 48 q6 -7 12 0" /><path d="M44 48 q6 -7 12 0" /></g>;
            case "gasp": case "ooh":
                return <g><circle cx="30" cy="46" r="6" fill="#fff" stroke={ink} strokeWidth="1.5" /><circle cx="50" cy="46" r="6" fill="#fff" stroke={ink} strokeWidth="1.5" /><circle cx="30" cy="46" r="2.2" fill={ink} /><circle cx="50" cy="46" r="2.2" fill={ink} /></g>;
            case "boo":
                return <g><circle cx="30" cy="48" r="3.4" fill={ink} /><circle cx="50" cy="48" r="3.4" fill={ink} /><path d="M23 38 l12 5 M57 38 l-12 5" stroke={ink} strokeWidth="3" strokeLinecap="round" /></g>;
            case "murmur":
                return <g><circle cx="27" cy="47" r="3.4" fill={ink} /><circle cx="47" cy="47" r="3.4" fill={ink} /></g>;
            default:
                return <g><circle cx="30" cy="47" r="3.4" fill={ink} /><circle cx="50" cy="47" r="3.4" fill={ink} /></g>;
        }
    })();
    const mouth = (() => {
        switch (mood) {
            case "cheer": return <path d="M28 58 Q40 76 52 58 Z" fill="#4a0d0d" />;
            case "laugh": return <path d="M25 57 Q40 80 55 57 Z" fill="#4a0d0d" />;
            case "applause": return <path d="M30 60 Q40 68 50 60" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />;
            case "gasp": return <ellipse cx="40" cy="64" rx="7" ry="9" fill="#4a0d0d" />;
            case "ooh": return <ellipse cx="40" cy="63" rx="4.5" ry="5.5" fill="#4a0d0d" />;
            case "boo": return <path d="M30 68 Q40 56 50 68 Z" fill="#4a0d0d" />;
            case "murmur": return <path d="M30 62 q3 -3 6 0 t6 0 t6 0" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />;
            default: return <path d="M33 61 Q40 65 47 61" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />;
        }
    })();
    return <g>{eyes}{mouth}</g>;
}

function Arms({ mood, color }: { mood: Mood; color: string }) {
    const arm = (d: string) => <path d={d} stroke={color} strokeWidth="11" strokeLinecap="round" fill="none" />;
    switch (mood) {
        case "cheer": return <g>{arm("M14 70 L4 30")}{arm("M66 70 L76 30")}</g>;
        case "applause": return <g>{arm("M14 74 L34 66")}{arm("M66 74 L46 66")}</g>;
        case "gasp": return <g>{arm("M14 76 L22 56")}{arm("M66 76 L58 56")}</g>;
        case "laugh": return <g>{arm("M14 76 L28 88")}{arm("M66 76 L52 88")}</g>;
        case "boo":
            return (
                <g>
                    {arm("M14 74 L8 92")}{arm("M66 74 L72 92")}
                    <path d="M8 92 v8 M72 92 v8" stroke="#1c1917" strokeWidth="3" strokeLinecap="round" />
                </g>
            );
        default: return <g>{arm("M14 74 L10 90")}{arm("M66 74 L70 90")}</g>;
    }
}

function Hat({ kind, color }: { kind: (typeof HATS)[number]; color: string }) {
    switch (kind) {
        case "party": return <g><path d="M30 22 L40 -6 L50 22 Z" fill={color} stroke="#fff" strokeWidth="1.5" /><circle cx="40" cy="-7" r="4" fill="#fde047" /></g>;
        case "cap": return <g><path d="M18 26 Q40 2 62 26 Z" fill={color} /><rect x="44" y="22" width="26" height="6" rx="3" fill={color} /></g>;
        case "beret": return <ellipse cx="38" cy="20" rx="22" ry="8" fill="#1f2937" />;
        case "top": return <g><rect x="27" y="-8" width="26" height="28" rx="2" fill="#111827" /><rect x="20" y="18" width="40" height="5" rx="2" fill="#111827" /><rect x="27" y="10" width="26" height="4" fill={color} /></g>;
        case "bow": return <path d="M40 22 l-12 -8 v16 Z M40 22 l12 -8 v16 Z" fill="#f472b6" />;
        default: return null;
    }
}

const Bean = memo(function Bean({ index, faction, mood, nonce, intensity }: {
    index: number; faction: Faction; mood: Mood; nonce: number; intensity: number;
}) {
    const r = useMemo(() => seeded(index * 97 + 13), [index]);
    const look = useMemo(() => ({
        body: tint(faction.color, (r() - 0.5) * 0.5),
        hat: HATS[Math.floor(r() * HATS.length)],
        sign: r() < 0.5 && index % 3 === 0,
        bob: 2.2 + r() * 1.4,
        delay: -r() * 3,
        react: r() * 0.25,
    }), [faction.color, r]);
    const pos = seatPosition(index);
    const n = Math.max(1, Math.round(1 + intensity * 3));
    return (
        <div className="absolute" style={{ left: pos.x - 40, top: pos.y - 60, width: 80, height: 110, transform: `scale(${pos.scale})`, transformOrigin: "50% 100%", zIndex: pos.row }}>
            <div className="bean-idle h-full w-full" style={{ ["--bob" as string]: `${look.bob}s`, ["--delay" as string]: `${look.delay}s` }}>
                <div key={nonce} className={`bean-body h-full w-full ${mood !== "idle" ? `r-${mood}` : ""}`}
                    style={{ ["--n" as string]: n, ["--a" as string]: 0.6 + intensity * 0.6, ["--delay" as string]: `${look.react}s` }}>
                    <svg viewBox="0 0 80 110" width="80" height="110" overflow="visible">
                        {look.sign && (
                            <g transform="translate(0 -30)">
                                <line x1="40" y1="30" x2="40" y2="58" stroke="#7a4a2c" strokeWidth="4" />
                                <rect x="-6" y="0" width="92" height="30" rx="4" fill="#fff8e7" stroke={faction.color} strokeWidth="3" />
                                <text x="40" y="21" textAnchor="middle" fontFamily="Bangers, Impact, sans-serif" fontSize={faction.sign.length > 12 ? 11 : 14} fill="#1c1917">{faction.sign}</text>
                            </g>
                        )}
                        <Arms mood={mood} color={look.body} />
                        <rect x="12" y="20" width="56" height="88" rx="28" fill={look.body} stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
                        <ellipse cx="40" cy="86" rx="18" ry="14" fill="rgba(255,255,255,0.14)" />
                        <BeanFace mood={mood} />
                        <Hat kind={look.hat} color={faction.color} />
                    </svg>
                </div>
            </div>
        </div>
    );
});

export function Gallery() {
    const caseFile = useCourt((s) => s.caseFile);
    const crowd = useCourt((s) => s.crowd);
    const [live, setLive] = useState<Record<string, boolean>>({});

    const factions = caseFile?.factions;
    const seats = useMemo(() => (factions ? seatMap(factions) : Array.from({ length: GALLERY_SEATS }, () => "")), [factions]);
    const byId = useMemo(() => new Map((factions ?? []).map((f) => [f.id, f])), [factions]);

    const nonces = Object.entries(crowd).map(([k, v]) => `${k}:${v.nonce}`).join("|");
    useEffect(() => {
        const ids = Object.keys(crowd);
        if (!ids.length) return;
        setLive(Object.fromEntries(ids.map((id) => [id, true])));
        const t = setTimeout(() => setLive({}), 2900);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nonces]);

    const placeholder: Faction = { id: "", name: "", side: "neutral", bias: 0, color: "#8b5a33", sign: "", share: 1 };
    // Back rows first so the front row overlaps them.
    const order = [...Array(GALLERY_SEATS).keys()].sort((a, b) => seatPosition(a).row - seatPosition(b).row);
    return (
        <div className="pointer-events-none absolute inset-0">
            {order.map((i) => {
                const f = byId.get(seats[i]) ?? placeholder;
                const c = crowd[f.id];
                const mood: Mood = c && live[f.id] ? c.reaction : "idle";
                return <Bean key={i} index={i} faction={f} mood={mood === "silence" ? "idle" : mood} nonce={c?.nonce ?? 0} intensity={c?.intensity ?? 0} />;
            })}
            <Pews />
        </div>
    );
}

function Pews() {
    return (
        <svg viewBox="0 0 1600 900" className="absolute inset-0 h-full w-full" aria-hidden style={{ zIndex: 5 }}>
            <rect x="0" y="808" width="1600" height="16" fill="#6b3d22" />
            <rect x="0" y="808" width="1600" height="3" fill="#d4a24c" opacity="0.4" />
            <rect x="0" y="824" width="1600" height="90" fill="#3a2013" />
        </svg>
    );
}

export function Heckles() {
    const heckles = useCourt((s) => s.heckles);
    return (
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 20 }}>
            <AnimatePresence>
                {heckles.map((h) => {
                    const p = seatPosition(h.seat);
                    const left = Math.min(1600 - 240, Math.max(10, p.x - 110));
                    return (
                        <motion.div key={h.id} className="absolute" style={{ left, top: p.y - 150, width: 240 }}
                            initial={{ opacity: 0, transform: "translateY(10px) scale(0.92)" }}
                            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
                            exit={{ opacity: 0, transform: "translateY(-6px) scale(0.96)", transition: { duration: 0.15 } }}
                            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
                            <div className="relative rounded-2xl border-[3px] border-black bg-white px-3 py-2 text-center font-comic text-[22px] leading-tight tracking-wide text-black shadow-[4px_4px_0_rgba(0,0,0,0.6)]">
                                {h.text}
                                <span className="absolute -bottom-[14px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[14px] border-x-transparent border-t-black" />
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
