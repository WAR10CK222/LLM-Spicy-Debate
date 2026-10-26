// Expression system shared by the lawyers and the judge. Coordinates are puppet-local (head centre 120,112).
import { motion, useTransform, type MotionValue } from "motion/react";
import type { Emotion, JudgeExpression } from "@court/shared";

export type EyeKind = "open" | "half" | "happy" | "wide" | "angry" | "sad" | "closed" | "x" | "up";
export type BrowKind = "neutral" | "flat" | "raised" | "high" | "smug" | "angry" | "sad" | "think";
export type MouthKind = "line" | "smile" | "smirk" | "frown" | "flat" | "wavy" | "o" | "grimace" | "grin" | "pout" | "puffed";

export interface FaceSpec {
    eyes: EyeKind;
    brows: BrowKind;
    mouth: MouthKind;
    blush: number;
    tint?: { color: string; opacity: number };
    tilt: number;
    anim?: "giggle" | "shiver";
}

export const EMOTION_FACE: Record<Emotion, FaceSpec> = {
    neutral: { eyes: "open", brows: "neutral", mouth: "line", blush: 0, tilt: 0 },
    confident: { eyes: "open", brows: "raised", mouth: "smile", blush: 0, tilt: -3 },
    smug: { eyes: "half", brows: "smug", mouth: "smirk", blush: 0, tilt: 6 },
    smirk: { eyes: "open", brows: "smug", mouth: "smirk", blush: 0, tilt: 4 },
    laughing: { eyes: "happy", brows: "high", mouth: "grin", blush: 0.6, tilt: -8, anim: "giggle" },
    cheerful: { eyes: "happy", brows: "raised", mouth: "smile", blush: 0.45, tilt: -4 },
    thinking: { eyes: "up", brows: "think", mouth: "pout", blush: 0, tilt: 7 },
    nervous: { eyes: "open", brows: "sad", mouth: "wavy", blush: 0, tint: { color: "#93c5fd", opacity: 0.18 }, tilt: -2, anim: "shiver" },
    shocked: { eyes: "wide", brows: "high", mouth: "o", blush: 0, tilt: -5 },
    offended: { eyes: "angry", brows: "angry", mouth: "frown", blush: 0.3, tint: { color: "#ef4444", opacity: 0.14 }, tilt: 9 },
    roasted: { eyes: "x", brows: "sad", mouth: "grimace", blush: 0, tint: { color: "#7c2d12", opacity: 0.55 }, tilt: -6, anim: "shiver" },
    furious: { eyes: "angry", brows: "angry", mouth: "grimace", blush: 0.2, tint: { color: "#dc2626", opacity: 0.3 }, tilt: 0, anim: "shiver" },
    sad: { eyes: "sad", brows: "sad", mouth: "frown", blush: 0, tilt: 10 },
};

export const JUDGE_FACE: Record<JudgeExpression, FaceSpec> = {
    stern: { eyes: "open", brows: "flat", mouth: "line", blush: 0, tilt: 0 },
    unimpressed: { eyes: "half", brows: "flat", mouth: "flat", blush: 0, tilt: 3 },
    amused: { eyes: "open", brows: "raised", mouth: "smirk", blush: 0.15, tilt: -3 },
    stifling_laugh: { eyes: "closed", brows: "high", mouth: "puffed", blush: 0.55, tilt: -4, anim: "giggle" },
    shocked: { eyes: "wide", brows: "high", mouth: "o", blush: 0, tilt: -4 },
    dozing: { eyes: "closed", brows: "neutral", mouth: "line", blush: 0, tilt: 12 },
    pleased: { eyes: "happy", brows: "raised", mouth: "smile", blush: 0.3, tilt: -2 },
};

const INK = "#1c1917";
const EYES = [{ x: 98, y: 108, inner: 1 }, { x: 142, y: 108, inner: -1 }] as const;

function Eye({ kind, x, y, inner, skin }: { kind: EyeKind; x: number; y: number; inner: number; skin: string }) {
    const white = (rx: number, ry: number, px = 0, py = 0, pr = 5) => (
        <g className="blink" style={{ animationDelay: `${(x % 7) * 0.13}s` }}>
            <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#fff" stroke={INK} strokeWidth="1.6" />
            <circle cx={x + px} cy={y + py} r={pr} fill={INK} />
            <circle cx={x + px + 1.8} cy={y + py - 2} r="1.6" fill="#fff" />
        </g>
    );
    switch (kind) {
        case "open": return white(10, 11, inner * 1.5);
        case "up": return white(10, 11, -3, -5);
        case "wide": return white(13, 14.5, 0, 0, 3.4);
        case "half":
            return (
                <g>
                    {white(10, 11, inner * 1.5, 2)}
                    <path d={`M${x - 12} ${y + 1} A12 12 0 0 1 ${x + 12} ${y + 1} Z`} fill={skin} />
                    <line x1={x - 11} y1={y + 1} x2={x + 11} y2={y + 1} stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
                </g>
            );
        case "angry": {
            // inner corner (towards the nose) lower
            const ix = x + inner * 12, ox = x - inner * 12;
            return (
                <g>
                    {white(10, 11, inner * 1.5, 2)}
                    <path d={`M${ox} ${y - 14} L${ix} ${y - 14} L${ix} ${y - 1} L${ox} ${y - 8} Z`} fill={skin} />
                    <line x1={ox} y1={y - 8} x2={ix} y2={y - 1} stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
                </g>
            );
        }
        case "sad": {
            const ix = x + inner * 12, ox = x - inner * 12;
            return (
                <g>
                    {white(10, 11, 0, 4)}
                    <path d={`M${ox} ${y - 14} L${ix} ${y - 14} L${ix} ${y - 8} L${ox} ${y - 1} Z`} fill={skin} />
                    <line x1={ix} y1={y - 8} x2={ox} y2={y - 1} stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
                </g>
            );
        }
        case "happy":
            return <path d={`M${x - 10} ${y + 3} Q${x} ${y - 10} ${x + 10} ${y + 3}`} stroke={INK} strokeWidth="3.6" fill="none" strokeLinecap="round" />;
        case "closed":
            return <path d={`M${x - 10} ${y} Q${x} ${y + 6} ${x + 10} ${y}`} stroke={INK} strokeWidth="3.4" fill="none" strokeLinecap="round" />;
        case "x":
            return (
                <g stroke={INK} strokeWidth="3.6" strokeLinecap="round">
                    <line x1={x - 8} y1={y - 8} x2={x + 8} y2={y + 8} />
                    <line x1={x + 8} y1={y - 8} x2={x - 8} y2={y + 8} />
                </g>
            );
    }
}

function browPath(kind: BrowKind, x: number, y: number, inner: number, index: number) {
    const ix = x + inner * 12, ox = x - inner * 12;
    const arc = (h: number) => `M${x - 12} ${y - h + 3} Q${x} ${y - h - 3} ${x + 12} ${y - h + 3}`;
    switch (kind) {
        case "neutral": return arc(20);
        case "flat": return `M${x - 12} ${y - 19} L${x + 12} ${y - 19}`;
        case "raised": return arc(25);
        case "high": return arc(30);
        case "smug": return index === 0 ? arc(28) : `M${x - 12} ${y - 18} L${x + 12} ${y - 17}`;
        case "think": return index === 0 ? arc(27) : `M${x - 12} ${y - 16} L${x + 12} ${y - 19}`;
        case "angry": return `M${ox} ${y - 24} L${ix} ${y - 15}`;
        case "sad": return `M${ox} ${y - 16} L${ix} ${y - 25}`;
    }
}

function MouthShape({ kind }: { kind: MouthKind }) {
    const stroke = { stroke: INK, strokeWidth: 3.6, fill: "none", strokeLinecap: "round" as const };
    switch (kind) {
        case "line": return <path d="M108 152 L132 152" {...stroke} />;
        case "flat": return <path d="M106 153 L134 153" {...stroke} strokeWidth={4.4} />;
        case "smile": return <path d="M104 147 Q120 163 136 147" {...stroke} />;
        case "smirk": return <path d="M106 154 Q123 157 137 144" {...stroke} />;
        case "frown": return <path d="M106 158 Q120 146 134 158" {...stroke} />;
        case "wavy": return <path d="M104 153 q4 -4 8 0 t8 0 t8 0 t8 0" {...stroke} strokeWidth={3} />;
        case "pout": return <path d="M113 155 Q120 149 127 155" {...stroke} />;
        case "o": return <ellipse cx="120" cy="155" rx="8" ry="10" fill="#4a0d0d" stroke={INK} strokeWidth="2" />;
        case "grimace":
            return (
                <g>
                    <rect x="101" y="145" width="38" height="15" rx="5" fill="#fff" stroke={INK} strokeWidth="2.4" />
                    {[110, 120, 130].map((x) => <line key={x} x1={x} y1="145" x2={x} y2="160" stroke={INK} strokeWidth="1.6" />)}
                    <line x1="101" y1="152.5" x2="139" y2="152.5" stroke={INK} strokeWidth="1.6" />
                </g>
            );
        case "grin":
            return (
                <g>
                    <path d="M101 145 Q120 175 139 145 Z" fill="#4a0d0d" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
                    <path d="M104 146 L136 146 L134 151 L106 151 Z" fill="#fff" />
                    <ellipse cx="120" cy="161" rx="9" ry="4.5" fill="#f87171" />
                </g>
            );
        case "puffed":
            return (
                <g>
                    <circle cx="96" cy="146" r="13" fill="rgba(0,0,0,0.06)" />
                    <circle cx="144" cy="146" r="13" fill="rgba(0,0,0,0.06)" />
                    <path d="M112 152 L128 152" {...stroke} />
                </g>
            );
    }
}

/** An open mouth whose height follows the voice. */
function TalkingMouth({ mouth }: { mouth: MotionValue<number> }) {
    const scaleY = useTransform(mouth, (m) => Math.max(0.001, m));
    const opacity = useTransform(mouth, (m) => (m > 0.04 ? 1 : 0));
    return (
        <motion.g style={{ scaleY, opacity, originX: 0.5, originY: 0.15 }}>
            <ellipse cx="120" cy="156" rx="12" ry="11" fill="#4a0d0d" stroke={INK} strokeWidth="2.2" />
            <ellipse cx="120" cy="162" rx="7" ry="3.5" fill="#f87171" />
            <rect x="111" y="146" width="18" height="4" rx="2" fill="#fff" />
        </motion.g>
    );
}

export function HumanFace({ spec, skin, hair, mouth }: { spec: FaceSpec; skin: string; hair: string; mouth: MotionValue<number> }) {
    const showTalk = spec.mouth !== "grin" && spec.mouth !== "o";
    return (
        <g>
            {spec.blush > 0 && (
                <g opacity={spec.blush}>
                    <ellipse cx="86" cy="134" rx="11" ry="6" fill="#fb7185" />
                    <ellipse cx="154" cy="134" rx="11" ry="6" fill="#fb7185" />
                </g>
            )}
            {EYES.map((e, i) => <Eye key={i} kind={spec.eyes} x={e.x} y={e.y} inner={e.inner} skin={skin} />)}
            <g stroke={hair === "#e5e7eb" || hair === "#f3f4f6" ? "#6b7280" : INK} strokeWidth="4.6" strokeLinecap="round" fill="none">
                {EYES.map((e, i) => <path key={i} d={browPath(spec.brows, e.x, e.y, e.inner, i)} />)}
            </g>
            {/* nose */}
            <path d="M120 116 Q126 130 118 134" stroke="rgba(0,0,0,0.35)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <MouthShape kind={spec.mouth} />
            {showTalk && <TalkingMouth mouth={mouth} />}
        </g>
    );
}

const LED = "#4ade80";

export function RobotFace({ spec, mouth }: { spec: FaceSpec; mouth: MotionValue<number> }) {
    const bars = useTransform(mouth, (m) => 0.25 + m * 0.75);
    const color = spec.eyes === "angry" || spec.eyes === "x" ? "#f87171" : spec.eyes === "sad" ? "#60a5fa" : LED;
    const eye = (x: number, inner: number) => {
        switch (spec.eyes) {
            case "happy": return <path d={`M${x - 10} ${y + 4} L${x} ${y - 6} L${x + 10} ${y + 4}`} stroke={color} strokeWidth="4" fill="none" strokeLinecap="round" />;
            case "closed": return <line x1={x - 10} y1={y + 2} x2={x + 10} y2={y + 2} stroke={color} strokeWidth="4" strokeLinecap="round" />;
            case "wide": return <circle cx={x} cy={y} r="9" fill={color} />;
            case "x": return <g stroke={color} strokeWidth="4" strokeLinecap="round"><line x1={x - 7} y1={y - 7} x2={x + 7} y2={y + 7} /><line x1={x + 7} y1={y - 7} x2={x - 7} y2={y + 7} /></g>;
            case "angry": return <path d={`M${x - 10 * inner} ${y - 6} L${x + 10 * inner} ${y + 2} L${x + 10 * inner} ${y + 6} L${x - 10 * inner} ${y + 6} Z`} fill={color} />;
            case "sad": return <path d={`M${x - 10 * inner} ${y + 2} L${x + 10 * inner} ${y - 6} L${x + 10 * inner} ${y + 6} L${x - 10 * inner} ${y + 6} Z`} fill={color} />;
            case "half": return <rect x={x - 10} y={y} width="20" height="6" rx="2" fill={color} />;
            default: return <rect className="blink" x={x - 9} y={y - 6} width="18" height="12" rx="4" fill={color} />;
        }
    };
    const y = 108;
    return (
        <g>
            <rect x="74" y="88" width="92" height="40" rx="14" fill="#0b1220" stroke="#64748b" strokeWidth="3" />
            <g style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
                {eye(98, 1)}
                {eye(142, -1)}
            </g>
            <rect x="96" y="142" width="48" height="22" rx="6" fill="#0b1220" stroke="#64748b" strokeWidth="2.5" />
            <motion.g style={{ scaleY: bars, originY: 0.5 }}>
                {[103, 112, 121, 130, 139].map((x, i) => (
                    <rect key={x} x={x - 3} y={146 + (i % 2) * 2} width="5" height={14 - (i % 2) * 4} rx="2" fill={color} opacity="0.9" />
                ))}
            </motion.g>
        </g>
    );
}
