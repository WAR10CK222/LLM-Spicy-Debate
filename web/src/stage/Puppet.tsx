// A lawyer: code-drawn SVG puppet (faces right; the AGAINST side is mirrored).
import { memo, useEffect, useId, useState } from "react";
import { motion, useReducedMotion, type MotionValue, type Transition } from "motion/react";
import type { Emotion, Gesture, PersonaLook } from "@court/shared";
import type { Fx } from "../store/court";
import { EMOTION_FACE, HumanFace, RobotFace, type FaceSpec } from "./Face";
import { seeded } from "../lib/util";

export const PUPPET_BOX = { w: 240, h: 360 };

type Pose = { front: number | number[]; back: number | number[]; frontScale?: number; dur?: number; times?: number[] };

const POSES: Record<Gesture, Pose> = {
    none: { front: -6, back: 6 },
    point: { front: -98, back: 8 },
    slam: { front: [-6, -150, 10, -6], back: [6, 150, -10, 6], dur: 0.85, times: [0, 0.4, 0.58, 1] },
    shrug: { front: -58, back: 58 },
    facepalm: { front: 160, back: 6, frontScale: 0.85 },
    cross_arms: { front: 36, back: -36 },
    mic_drop: { front: [-6, -84, -84, -6], back: [6, 8, 8, 6], dur: 1.6, times: [0, 0.2, 0.75, 1] },
    wave: { front: [-150, -122, -150, -122, -150], back: [6, 6, 6, 6, 6], dur: 1.2 },
    think: { front: 150, back: 8, frontScale: 0.62 },
};

const HOLD = new Set<Gesture>(["cross_arms", "think", "facepalm", "point", "shrug"]);
const spring: Transition = { type: "spring", duration: 0.5, bounce: 0.25 };

function shade(hex: string, amt: number) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
    return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

function Arm({ x, y, suit, skin, rotate, scaleY, transition, children }: {
    x: number; y: number; suit: string; skin: string; rotate: number | number[]; scaleY: number; transition: Transition; children?: React.ReactNode;
}) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <motion.g animate={{ rotate, scaleY }} initial={false} transition={transition} style={{ originX: 0.5, originY: 0.045 }}>
                <rect x="-15" y="-6" width="30" height="112" rx="15" fill={shade(suit, -0.06)} stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
                <rect x="-14" y="94" width="28" height="10" rx="4" fill="#f8fafc" />
                <circle cx="0" cy="118" r="14" fill={skin} stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
                {children}
            </motion.g>
        </g>
    );
}

function BackHair({ look }: { look: PersonaLook }) {
    const h = look.hair;
    switch (look.hairStyle) {
        case "bun": return <ellipse cx="120" cy="98" rx="66" ry="60" fill={h} />;
        case "long": return <rect x="52" y="56" width="136" height="170" rx="52" fill={h} />;
        case "curly": return <g fill={h}>{[...Array(9)].map((_, i) => <circle key={i} cx={60 + i * 15} cy={70 + Math.abs(4 - i) * 8} r="20" />)}</g>;
        case "wig": return <g fill={h}><circle cx="56" cy="100" r="28" /><circle cx="184" cy="100" r="28" /><circle cx="64" cy="66" r="26" /><circle cx="176" cy="66" r="26" /></g>;
        default: return null;
    }
}

function FrontHair({ look }: { look: PersonaLook }) {
    const h = look.hair;
    switch (look.hairStyle) {
        case "bun":
            return (
                <g fill={h}>
                    <path d="M56 106 Q58 40 120 38 Q182 40 184 106 Q164 66 120 64 Q76 66 56 106 Z" />
                    <circle cx="120" cy="32" r="24" />
                    <circle cx="112" cy="26" r="6" fill="rgba(255,255,255,0.18)" />
                </g>
            );
        case "slick":
            return (
                <g>
                    <path d="M57 104 Q56 40 120 38 Q186 40 183 98 Q152 58 96 70 Q72 78 57 104 Z" fill={h} />
                    <path d="M96 52 Q130 44 162 62" stroke="rgba(255,255,255,0.25)" strokeWidth="5" fill="none" strokeLinecap="round" />
                </g>
            );
        case "curly":
            return <g fill={h}>{[...Array(8)].map((_, i) => <circle key={i} cx={64 + i * 16} cy={54 + Math.abs(3.5 - i) * 7} r="16" />)}</g>;
        case "long":
            return <path d="M56 108 Q58 40 120 38 Q182 40 184 108 Q170 64 120 62 Q70 64 56 108 Z" fill={h} />;
        case "spiky":
            return <path d="M57 100 L62 50 L82 72 L90 30 L108 62 L122 22 L135 60 L152 30 L159 70 L180 48 L183 100 Q152 64 120 64 Q88 64 57 100 Z" fill={h} />;
        case "wig":
            return <g fill={h}><circle cx="120" cy="40" r="30" /><circle cx="90" cy="48" r="22" /><circle cx="150" cy="48" r="22" /></g>;
        case "bald":
            return <ellipse cx="104" cy="62" rx="16" ry="8" fill="rgba(255,255,255,0.22)" />;
        case "dome":
            return (
                <g>
                    <path d="M62 82 Q66 34 120 32 Q174 34 178 82 Z" fill={h} />
                    {[78, 100, 140, 162].map((x) => <circle key={x} cx={x} cy="70" r="3" fill="#cbd5e1" />)}
                </g>
            );
    }
}

function FaceAccessory({ look }: { look: PersonaLook }) {
    switch (look.accessory) {
        case "glasses":
            return (
                <g stroke="#111827" strokeWidth="3.2" fill="rgba(186,230,253,0.12)">
                    <rect x="83" y="96" width="30" height="24" rx="8" />
                    <rect x="127" y="96" width="30" height="24" rx="8" />
                    <path d="M113 106 Q120 101 127 106" fill="none" />
                </g>
            );
        case "monocle":
            return (
                <g>
                    <circle cx="142" cy="108" r="16" fill="rgba(186,230,253,0.15)" stroke="#d4a24c" strokeWidth="3.5" />
                    <path d="M157 114 Q172 150 160 186" stroke="#d4a24c" strokeWidth="1.8" fill="none" />
                </g>
            );
        case "shades":
            return (
                <g>
                    <path d="M80 98 H114 L110 120 Q98 126 86 120 Z" fill="#0a0a0a" />
                    <path d="M126 98 H160 L154 120 Q142 126 130 120 Z" fill="#0a0a0a" />
                    <line x1="114" y1="101" x2="126" y2="101" stroke="#0a0a0a" strokeWidth="4" />
                    <line x1="88" y1="103" x2="98" y2="103" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="134" y1="103" x2="144" y2="103" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" />
                </g>
            );
        case "antenna":
            return (
                <g>
                    <line x1="120" y1="34" x2="120" y2="8" stroke="#94a3b8" strokeWidth="4" />
                    <circle className="antenna" cx="120" cy="6" r="7" fill="#4ade80" />
                </g>
            );
        default:
            return null;
    }
}

function HeadFx({ fx }: { fx: Fx[] }) {
    const has = (f: Fx) => fx.includes(f);
    return (
        <g pointerEvents="none">
            {has("steam") && [[54, 96, -14], [186, 96, 14]].map(([x, y, dx], i) => (
                <g key={i}>
                    {[0, 0.35, 0.7].map((d) => (
                        <circle key={d} className="steam" cx={x} cy={y} r="9" fill="#f1f5f9" opacity="0.8"
                            style={{ animationDelay: `${d}s`, ["--dx" as string]: `${dx}px` }} />
                    ))}
                </g>
            ))}
            {has("flames") && (
                <g>
                    {[[78, 0.9], [100, 1.15], [124, 1.3], [148, 1.1], [168, 0.85]].map(([x, s], i) => (
                        <g key={i} transform={`translate(${x} 44) scale(${s})`}>
                            <path className="flame" style={{ animationDelay: `${i * 0.07}s` }}
                                d="M0 0 C-12 -10 -6 -26 0 -40 C6 -26 14 -14 0 0 Z" fill="#f97316" />
                            <path className="flame" style={{ animationDelay: `${i * 0.07 + 0.1}s` }}
                                d="M0 0 C-6 -6 -3 -16 0 -24 C3 -16 7 -8 0 0 Z" fill="#fde047" />
                        </g>
                    ))}
                </g>
            )}
            {has("sweat") && <path className="drip" d="M170 76 q6 10 0 14 q-6 -4 0 -14 Z" fill="#7dd3fc" stroke="#0369a1" strokeWidth="1.2" />}
            {has("tears") && [98, 142].map((x, i) => (
                <path key={x} className="drip" style={{ animationDelay: `${i * 0.4}s` }} d={`M${x} 122 q5 9 0 12 q-5 -3 0 -12 Z`} fill="#60a5fa" />
            ))}
            {has("vein") && (
                <g className="vein" transform="translate(166 60)">
                    <path d="M-9 -2 Q-2 -2 -2 -9 M9 -2 Q2 -2 2 -9 M-9 2 Q-2 2 -2 9 M9 2 Q2 2 2 9" stroke="#dc2626" strokeWidth="3.4" fill="none" strokeLinecap="round" />
                </g>
            )}
            {has("sparkle") && [[34, 70, 0], [206, 58, 0.4], [214, 146, 0.8]].map(([x, y, d]) => (
                <path key={x} className="twinkle" style={{ animationDelay: `${d}s` }}
                    d={`M${x} ${y - 10} L${x + 3} ${y - 3} L${x + 10} ${y} L${x + 3} ${y + 3} L${x} ${y + 10} L${x - 3} ${y + 3} L${x - 10} ${y} L${x - 3} ${y - 3} Z`} fill="#fde68a" />
            ))}
            {has("zzz") && ["Z", "z", "Z"].map((z, i) => (
                <text key={i} className="zzz" style={{ animationDelay: `${i * 0.7}s` }} x="176" y="70" fontFamily="Bangers, Impact, sans-serif" fontSize={22 - i * 3} fill="#e0e7ff">{z}</text>
            ))}
            {has("skull") && <text x="120" y="10" textAnchor="middle" fontSize="30">💀</text>}
        </g>
    );
}

export function Splat({ count }: { count: number }) {
    if (!count) return null;
    const r = seeded(count * 31);
    const cx = 96 + r() * 48, cy = 92 + r() * 50;
    return (
        <g key={count} className="splat">
            <path d={`M${cx} ${cy - 18} q10 4 12 -6 q4 12 14 8 q-6 10 4 16 q-12 2 -8 14 q-10 -8 -16 2 q-4 -12 -16 -6 q6 -10 -4 -16 q12 -2 8 -14 q8 6 6 2 Z`} fill="#dc2626" />
            <circle cx={cx + 22} cy={cy + 20} r="4" fill="#dc2626" />
            <circle cx={cx - 20} cy={cy + 14} r="3" fill="#b91c1c" />
            <ellipse cx={cx - 2} cy={cy - 4} rx="6" ry="3" fill="#fca5a5" opacity="0.7" />
        </g>
    );
}

export interface PuppetProps {
    look: PersonaLook;
    emotion: Emotion;
    gesture: { kind: Gesture; nonce: number };
    fx: Fx[];
    mouth: MotionValue<number>;
    speaking: boolean;
    mirrored?: boolean;
    splats?: number;
    pose?: "win" | "lose" | null;
    /** Static rendering for avatars (no idle animation). */
    still?: boolean;
    face?: FaceSpec;
}

export const Puppet = memo(function Puppet({ look, emotion, gesture, fx, mouth, speaking, mirrored, splats = 0, pose = null, still, face }: PuppetProps) {
    const id = useId().replace(/:/g, "");
    const reduce = useReducedMotion();
    const [active, setActive] = useState<Gesture>("none");

    useEffect(() => {
        if (!gesture.nonce) return;
        setActive(gesture.kind);
        const t = setTimeout(() => setActive("none"), HOLD.has(gesture.kind) ? 2600 : 1800);
        return () => clearTimeout(t);
    }, [gesture.nonce, gesture.kind]);

    const spec = face ?? EMOTION_FACE[emotion];
    const p = pose === "win" ? POSES.wave : POSES[active];
    const armTransition: Transition = reduce
        ? { duration: 0 }
        : p.dur ? { duration: p.dur, times: p.times, ease: "easeInOut" } : spring;
    const skin = look.skin;

    return (
        <svg viewBox={`0 0 ${PUPPET_BOX.w} ${PUPPET_BOX.h}`} width="100%" height="100%" overflow="visible"
            style={{ transform: mirrored ? "scaleX(-1)" : undefined, overflow: "visible" }}>
            <defs>
                <linearGradient id={`suit${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={shade(look.suit, 0.08)} />
                    <stop offset="1" stopColor={shade(look.suit, -0.12)} />
                </linearGradient>
                <radialGradient id={`metal${id}`} cx="0.35" cy="0.3" r="0.9">
                    <stop offset="0" stopColor="#e2e8f0" />
                    <stop offset="1" stopColor="#64748b" />
                </radialGradient>
            </defs>
            <motion.g
                className={still ? undefined : "breathe"}
                animate={{ rotate: speaking && !reduce ? 2.5 : pose === "lose" ? -4 : 0, y: pose === "lose" ? 8 : 0 }}
                transition={spring}
                style={{ originX: 0.5, originY: 1 }}
            >
                {/* back arm */}
                <Arm x={62} y={204} suit={look.suit} skin={skin} rotate={p.back} scaleY={1} transition={armTransition} />

                {/* torso */}
                <path d="M38 360 L46 236 Q52 194 96 186 L120 200 L144 186 Q188 194 194 236 L202 360 Z" fill={`url(#suit${id})`} stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
                <path d="M96 186 L120 254 L144 186 Z" fill={look.robot ? "#cbd5e1" : "#f8fafc"} />
                {look.accessory === "bowtie" ? (
                    <path d="M120 200 L100 190 L100 212 Z M120 200 L140 190 L140 212 Z" fill={look.tie} />
                ) : (
                    <path d="M114 196 L126 196 L131 212 L124 262 L120 270 L116 262 L109 212 Z" fill={look.tie} stroke="rgba(0,0,0,0.25)" strokeWidth="1.5" />
                )}
                <path d="M96 186 L120 254 L102 266 L82 212 Z" fill={shade(look.suit, -0.1)} />
                <path d="M144 186 L120 254 L138 266 L158 212 Z" fill={shade(look.suit, -0.1)} />
                <path d="M158 236 l14 0 l-4 10 z" fill={look.tie} />
                {look.accessory === "pearls" && (
                    <g>{[...Array(9)].map((_, i) => <circle key={i} cx={98 + i * 5.5} cy={190 + Math.sin((i / 8) * Math.PI) * 12} r="3.6" fill="#fdf4ff" stroke="#d8b4fe" strokeWidth="0.8" />)}</g>
                )}

                {/* head */}
                <motion.g
                    animate={{ rotate: reduce ? 0 : spec.tilt }}
                    transition={spring}
                    style={{ originX: 0.5, originY: 0.92 }}
                >
                    <g className={reduce || still ? undefined : spec.anim}>
                        <BackHair look={look} />
                        <rect x="104" y="164" width="32" height="28" fill={shade(skin, -0.08)} />
                        {look.robot ? (
                            <g>
                                <rect x="60" y="44" width="120" height="134" rx="34" fill={`url(#metal${id})`} stroke="#475569" strokeWidth="3" />
                                <circle cx="58" cy="112" r="9" fill="#475569" />
                                <circle cx="182" cy="112" r="9" fill="#475569" />
                            </g>
                        ) : (
                            <g>
                                <ellipse cx="60" cy="116" rx="9" ry="14" fill={shade(skin, -0.05)} />
                                <ellipse cx="180" cy="116" rx="9" ry="14" fill={shade(skin, -0.05)} />
                                <ellipse cx="120" cy="112" rx="60" ry="66" fill={skin} stroke="rgba(0,0,0,0.28)" strokeWidth="2" />
                            </g>
                        )}
                        {spec.tint && (
                            <ellipse cx="120" cy="112" rx="60" ry="66" fill={spec.tint.color} opacity={spec.tint.opacity} style={{ transition: "opacity 300ms ease" }} />
                        )}
                        {look.robot ? <RobotFace spec={spec} mouth={mouth} /> : <HumanFace spec={spec} skin={skin} hair={look.hair} mouth={mouth} />}
                        <FrontHair look={look} />
                        <FaceAccessory look={look} />
                        <Splat count={splats} />
                        <HeadFx fx={fx} />
                    </g>
                </motion.g>

                {/* front arm (nearest the opponent) */}
                <Arm x={178} y={204} suit={look.suit} skin={skin} rotate={p.front} scaleY={p.frontScale ?? 1} transition={armTransition}>
                    {look.accessory === "knitting" && active === "none" && pose !== "win" && (
                        <g>
                            <circle cx="-4" cy="132" r="15" fill="#f472b6" stroke="#be185d" strokeWidth="2" />
                            <path d="M-16 128 Q-4 120 8 132 M-14 138 Q-2 130 10 140" stroke="#be185d" strokeWidth="1.6" fill="none" />
                            <line x1="-24" y1="104" x2="14" y2="150" stroke="#d4a24c" strokeWidth="3" strokeLinecap="round" />
                        </g>
                    )}
                    {active === "mic_drop" && (
                        <motion.g initial={{ y: 0, opacity: 1 }} animate={{ y: 260, opacity: 0, rotate: 140 }} transition={{ delay: 1.1, duration: 0.6, ease: [0.55, 0, 1, 0.45] }}>
                            <rect x="-6" y="120" width="12" height="34" rx="4" fill="#111827" />
                            <circle cx="0" cy="118" r="9" fill="#6b7280" />
                        </motion.g>
                    )}
                </Arm>
            </motion.g>
        </svg>
    );
});
