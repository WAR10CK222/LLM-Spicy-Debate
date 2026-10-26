// Judge Athena: robe, jabot, barrister's wig and a gavel that bangs on cue.
import { memo, useEffect } from "react";
import { motion, useAnimate, useReducedMotion, type MotionValue } from "motion/react";
import type { JudgeExpression } from "@court/shared";
import type { Fx } from "../store/court";
import { HumanFace, JUDGE_FACE } from "./Face";
import { Splat } from "./Puppet";

const SKIN = "#e9b78f";
const WIG = "#f3f4f6";

function WigBack() {
    return (
        <g fill={WIG} stroke="#cbd5e1" strokeWidth="2">
            {[0, 1, 2, 3].map((i) => <circle key={`l${i}`} cx={56} cy={110 + i * 22} r="14" />)}
            {[0, 1, 2, 3].map((i) => <circle key={`r${i}`} cx={184} cy={110 + i * 22} r="14" />)}
        </g>
    );
}

function WigFront() {
    return (
        <g fill={WIG} stroke="#cbd5e1" strokeWidth="2">
            <path d="M54 100 Q56 30 120 28 Q184 30 186 100 Q170 62 120 60 Q70 62 54 100 Z" />
            {[0, 1, 2, 3, 4].map((i) => <ellipse key={i} cx={74 + i * 23} cy={50 - Math.sin((i / 4) * Math.PI) * 10} rx="13" ry="9" />)}
        </g>
    );
}

export const Judge = memo(function Judge({ expression, gavel, fx, mouth, speaking, splats = 0 }: {
    expression: JudgeExpression; gavel: number; fx: Fx[]; mouth: MotionValue<number>; speaking: boolean; splats?: number;
}) {
    const [scope, animate] = useAnimate();
    const reduce = useReducedMotion();

    useEffect(() => {
        if (!gavel || !scope.current) return;
        void animate(scope.current, { rotate: reduce ? [-100, -100] : [-100, -158, -76, -100] }, { duration: 0.42, times: [0, 0.35, 0.55, 1], ease: "easeInOut" });
    }, [gavel, animate, scope, reduce]);

    const spec = JUDGE_FACE[expression];
    return (
        <svg viewBox="0 0 240 360" width="100%" height="100%" overflow="visible" style={{ overflow: "visible" }}>
            <motion.g className="breathe" animate={{ rotate: speaking && !reduce ? -1.5 : 0 }} transition={{ type: "spring", duration: 0.5, bounce: 0.2 }} style={{ originX: 0.5, originY: 1 }}>
                {/* robe */}
                <path d="M20 360 L36 232 Q46 192 98 184 L120 196 L142 184 Q194 192 204 232 L220 360 Z" fill="#111827" stroke="#000" strokeWidth="2" />
                <path d="M60 250 L60 360 M180 250 L180 360" stroke="#1f2937" strokeWidth="6" />
                {/* jabot */}
                <path d="M104 190 L136 190 L130 238 Q120 246 110 238 Z" fill="#fff" stroke="#d1d5db" strokeWidth="1.5" />
                {[204, 216, 228].map((y) => <path key={y} d={`M108 ${y} Q120 ${y + 6} 132 ${y}`} stroke="#d1d5db" strokeWidth="1.5" fill="none" />)}

                {/* head */}
                <motion.g animate={{ rotate: reduce ? 0 : spec.tilt }} transition={{ type: "spring", duration: 0.6, bounce: 0.2 }} style={{ originX: 0.5, originY: 0.92 }}>
                    <g className={reduce ? undefined : spec.anim}>
                        <WigBack />
                        <rect x="104" y="164" width="32" height="26" fill="#d9a47c" />
                        <ellipse cx="120" cy="112" rx="58" ry="64" fill={SKIN} stroke="rgba(0,0,0,0.28)" strokeWidth="2" />
                        {spec.tint && <ellipse cx="120" cy="112" rx="58" ry="64" fill={spec.tint.color} opacity={spec.tint.opacity} />}
                        <HumanFace spec={spec} skin={SKIN} hair="#9ca3af" mouth={mouth} />
                        {/* half-moon reading glasses */}
                        <g stroke="#a16207" strokeWidth="2.6" fill="rgba(254,243,199,0.08)">
                            <path d="M84 112 h28 q-2 14 -14 14 q-12 0 -14 -14 Z" />
                            <path d="M128 112 h28 q-2 14 -14 14 q-12 0 -14 -14 Z" />
                            <path d="M112 113 q8 -4 16 0" fill="none" />
                        </g>
                        <WigFront />
                        <Splat count={splats} />
                        {fx.includes("zzz") && ["Z", "z", "Z"].map((z, i) => (
                            <text key={i} className="zzz" style={{ animationDelay: `${i * 0.7}s` }} x="178" y="66" fontFamily="Bangers, Impact, sans-serif" fontSize={24 - i * 3} fill="#e0e7ff">{z}</text>
                        ))}
                    </g>
                </motion.g>

                {/* gavel arm */}
                <g transform="translate(186 206)">
                    <motion.g ref={scope} initial={{ rotate: -100 }} style={{ originX: 0.5, originY: 0.04 }}>
                        <rect x="-16" y="-6" width="32" height="104" rx="16" fill="#111827" stroke="#000" strokeWidth="2" />
                        <circle cx="0" cy="108" r="14" fill={SKIN} />
                        <rect x="-4" y="100" width="8" height="58" rx="3" fill="#7a4a2c" transform="rotate(90 0 112)" />
                        <rect x="-30" y="98" width="22" height="30" rx="6" fill="#5a3420" stroke="#2a170e" strokeWidth="2" transform="rotate(90 0 112)" />
                        <rect x="-30" y="104" width="22" height="4" fill="#d4a24c" transform="rotate(90 0 112)" />
                    </motion.g>
                </g>
            </motion.g>
        </svg>
    );
});
