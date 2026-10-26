// The courtroom set, in layers so characters can stand *behind* the bench and the lecterns.
import { memo } from "react";
import { seeded } from "../lib/util";
import { SIDE_COLOR } from "../lib/util";

const full = { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" } as const;

function Window({ cx }: { cx: number }) {
    const w = 190, top = 70, bottom = 360;
    const left = cx - w / 2, right = cx + w / 2;
    const arch = `M${left},${bottom} V${top + w / 2} A${w / 2},${w / 2} 0 0 1 ${right},${top + w / 2} V${bottom} Z`;
    return (
        <g>
            <path d={arch} fill="url(#sky)" />
            <path d={arch} fill="url(#windowGlow)" opacity="0.9" />
            {/* mullions */}
            <g stroke="#2a170e" strokeWidth="7" opacity="0.9">
                <line x1={cx} y1={top + 4} x2={cx} y2={bottom} />
                <line x1={left} y1={top + w / 2 + 40} x2={right} y2={top + w / 2 + 40} />
                <line x1={left} y1={bottom - 70} x2={right} y2={bottom - 70} />
            </g>
            <path d={arch} fill="none" stroke="#7a4a2c" strokeWidth="14" />
            <path d={arch} fill="none" stroke="#d4a24c" strokeWidth="2" opacity="0.5" />
            <rect x={left - 14} y={bottom} width={w + 28} height="16" rx="3" fill="#5a3420" />
        </g>
    );
}

export const BackdropSvg = memo(function BackdropSvg() {
    const rnd = seeded(7);
    const motes = Array.from({ length: 22 }, (_, i) => ({
        x: (i % 2 ? 1270 : 330) + (rnd() - 0.5) * 260,
        y: 380 + rnd() * 260,
        r: 1 + rnd() * 1.8,
        t: 7 + rnd() * 7,
        d: -rnd() * 10,
        dx: (rnd() - 0.5) * 60,
    }));
    return (
        <svg viewBox="0 0 1600 900" style={full} aria-hidden>
            <defs>
                <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#5b331d" />
                    <stop offset="0.65" stopColor="#3a2013" />
                    <stop offset="1" stopColor="#24130b" />
                </linearGradient>
                <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f59e5b" />
                    <stop offset="0.55" stopColor="#fcd38d" />
                    <stop offset="1" stopColor="#fff1c9" />
                </linearGradient>
                <radialGradient id="windowGlow" cx="0.5" cy="0.7" r="0.7">
                    <stop offset="0" stopColor="#fffbe8" stopOpacity="0.9" />
                    <stop offset="1" stopColor="#fff2cc" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="shaft" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ffe9b8" stopOpacity="0.42" />
                    <stop offset="1" stopColor="#ffe9b8" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="curtain" x1="0" y1="0" x2="1" y2="0">
                    {[0, 0.18, 0.36, 0.54, 0.72, 0.9].map((o, i) => (
                        <stop key={o} offset={o} stopColor={i % 2 ? "#5c1414" : "#8f2323"} />
                    ))}
                </linearGradient>
                <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#5a3420" />
                    <stop offset="1" stopColor="#2a170e" />
                </linearGradient>
                <radialGradient id="brass" cx="0.35" cy="0.3" r="0.8">
                    <stop offset="0" stopColor="#fbe3a6" />
                    <stop offset="0.5" stopColor="#d4a24c" />
                    <stop offset="1" stopColor="#7d561b" />
                </radialGradient>
                <linearGradient id="leather" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#7f1d1d" />
                    <stop offset="1" stopColor="#3f0d0d" />
                </linearGradient>
                <path id="sealText" d="M 745 80 A 55 55 0 1 1 855 80" />
                <pattern id="planks" width="140" height="40" patternUnits="userSpaceOnUse">
                    <rect width="140" height="40" fill="transparent" />
                    <line x1="0" y1="39" x2="140" y2="39" stroke="#1e100a" strokeWidth="2" opacity="0.6" />
                    <line x1="70" y1="0" x2="70" y2="40" stroke="#1e100a" strokeWidth="2" opacity="0.4" />
                </pattern>
            </defs>

            {/* wall */}
            <rect width="1600" height="640" fill="url(#wall)" />
            {Array.from({ length: 17 }, (_, i) => (
                <rect key={i} x={i * 100} y="40" width="2" height="380" fill="#000" opacity="0.18" />
            ))}
            {/* cornice + motto */}
            <rect width="1600" height="44" fill="#2a170e" />
            <rect y="40" width="1600" height="6" fill="#d4a24c" opacity="0.55" />
            <text x="560" y="31" textAnchor="middle" fontFamily="Playfair Display, serif" fontWeight="800" fontSize="22" letterSpacing="10" fill="#e8c37a">IN ROAST</text>
            <text x="1040" y="31" textAnchor="middle" fontFamily="Playfair Display, serif" fontWeight="800" fontSize="22" letterSpacing="10" fill="#e8c37a">WE TRUST</text>

            {/* pilasters */}
            {[150, 560, 1040, 1450].map((x) => (
                <g key={x}>
                    <rect x={x - 22} y="46" width="44" height="380" fill="#6b3d22" />
                    <rect x={x - 22} y="46" width="8" height="380" fill="#8b5a33" opacity="0.6" />
                    <rect x={x - 30} y="46" width="60" height="18" fill="#7a4a2c" />
                </g>
            ))}

            <Window cx={330} />
            <Window cx={1270} />

            {/* judge's chair */}
            <rect x="690" y="132" width="220" height="210" rx="40" fill="url(#leather)" />
            <rect x="690" y="132" width="220" height="210" rx="40" fill="none" stroke="#d4a24c" strokeWidth="3" opacity="0.6" />
            {Array.from({ length: 9 }, (_, i) => (
                <circle key={i} cx={712 + i * 22} cy="150" r="3.5" fill="url(#brass)" />
            ))}

            {/* seal */}
            <g>
                <circle cx="800" cy="95" r="64" fill="url(#brass)" />
                <circle cx="800" cy="95" r="52" fill="#2a170e" />
                <circle cx="800" cy="95" r="49" fill="none" stroke="#d4a24c" strokeWidth="1.5" opacity="0.7" />
                <text fontFamily="Playfair Display, serif" fontSize="11" fontWeight="800" letterSpacing="2.5" fill="#f2cc7d">
                    <textPath href="#sealText" startOffset="50%" textAnchor="middle">SUPREME ROAST COURT</textPath>
                </text>
                {/* scales of justice */}
                <g stroke="#f2cc7d" strokeWidth="2.5" fill="none" strokeLinecap="round">
                    <line x1="800" y1="78" x2="800" y2="120" />
                    <line x1="776" y1="86" x2="824" y2="86" />
                    <path d="M776 86 l-9 18 h18 z" />
                    <path d="M824 86 l-9 18 h18 z" />
                    <line x1="788" y1="120" x2="812" y2="120" />
                </g>
                <circle cx="800" cy="76" r="3.5" fill="#f2cc7d" />
            </g>

            {/* wainscot */}
            <rect y="420" width="1600" height="220" fill="#2e190f" />
            <rect y="420" width="1600" height="8" fill="#7a4a2c" />
            {Array.from({ length: 10 }, (_, i) => (
                <rect key={i} x={20 + i * 160} y="450" width="130" height="160" rx="4" fill="none" stroke="#6b3d22" strokeWidth="3" opacity="0.8" />
            ))}

            {/* floor */}
            <rect y="636" width="1600" height="264" fill="url(#floor)" />
            <rect y="636" width="1600" height="264" fill="url(#planks)" />
            <path d="M650 636 L950 636 L1120 900 L480 900 Z" fill="#6b1a1a" opacity="0.85" />
            <path d="M650 636 L950 636 L1120 900 L480 900 Z" fill="none" stroke="#d4a24c" strokeWidth="3" opacity="0.45" />

            {/* curtains */}
            <path d="M0 0 H92 Q70 300 96 640 H0 Z" fill="url(#curtain)" />
            <path d="M1600 0 H1508 Q1530 300 1504 640 H1600 Z" fill="url(#curtain)" />
            <path d="M0 330 Q60 345 96 320" stroke="#d4a24c" strokeWidth="6" fill="none" />
            <path d="M1600 330 Q1540 345 1504 320" stroke="#d4a24c" strokeWidth="6" fill="none" />

            {/* light shafts + dust */}
            <g className="shafts" style={{ mixBlendMode: "screen" }}>
                <path d="M240 360 L420 360 L640 900 L300 900 Z" fill="url(#shaft)" />
                <path d="M1180 360 L1360 360 L1300 900 L960 900 Z" fill="url(#shaft)" />
            </g>
            {motes.map((m, i) => (
                <circle key={i} className="dust" cx={m.x} cy={m.y} r={m.r} fill="#fff4d6"
                    style={{ ["--t" as string]: `${m.t}s`, ["--dx" as string]: `${m.dx}px`, animationDelay: `${m.d}s` }} />
            ))}

            {/* the bar (balustrade separating the gallery) */}
            <rect y="672" width="1600" height="14" fill="#7a4a2c" />
            {Array.from({ length: 40 }, (_, i) => (
                <rect key={i} x={10 + i * 40} y="686" width="12" height="40" rx="5" fill="#5a3420" />
            ))}
        </svg>
    );
});

export const BenchSvg = memo(function BenchSvg() {
    return (
        <svg viewBox="0 0 1600 900" style={full} aria-hidden>
            <defs>
                <linearGradient id="bench" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#7a4a2c" />
                    <stop offset="1" stopColor="#3a2013" />
                </linearGradient>
                <linearGradient id="brassPlate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fbe3a6" />
                    <stop offset="1" stopColor="#9a6f26" />
                </linearGradient>
            </defs>
            <rect x="470" y="318" width="660" height="24" rx="6" fill="#8b5a33" />
            <rect x="470" y="318" width="660" height="4" fill="#f2cc7d" opacity="0.6" />
            <rect x="490" y="340" width="620" height="290" fill="url(#bench)" />
            {[0, 1, 2].map((i) => (
                <rect key={i} x={515 + i * 200} y="440" width="170" height="160" rx="6" fill="none" stroke="#2a170e" strokeWidth="4" opacity="0.7" />
            ))}
            <rect x="650" y="372" width="300" height="46" rx="6" fill="url(#brassPlate)" />
            <text x="800" y="403" textAnchor="middle" fontFamily="Playfair Display, serif" fontWeight="800" fontSize="19" letterSpacing="2" fill="#3a2013">HON. JUDGE ATHENA</text>
            {/* gavel block */}
            <ellipse cx="980" cy="318" rx="34" ry="8" fill="#3a2013" />
            <rect x="946" y="306" width="68" height="12" rx="4" fill="#5a3420" />
        </svg>
    );
});

function Lectern({ cx, side, name }: { cx: number; side: "for" | "against"; name: string }) {
    const color = SIDE_COLOR[side];
    return (
        <g>
            <path d={`M${cx - 110} 562 L${cx + 110} 562 L${cx + 120} 584 L${cx - 120} 584 Z`} fill="#8b5a33" />
            <path d={`M${cx - 104} 584 L${cx + 104} 584 L${cx + 88} 820 L${cx - 88} 820 Z`} fill="url(#lectern)" />
            <path d={`M${cx - 104} 584 L${cx + 104} 584 L${cx + 101} 616 L${cx - 101} 616 Z`} fill={color} opacity="0.92" />
            <text x={cx} y="607" textAnchor="middle" fontFamily="Bangers, Impact, sans-serif" fontSize="22" letterSpacing="3" fill="#fff">
                {side === "for" ? "FOR THE MOTION" : "AGAINST THE MOTION"}
            </text>
            <rect x={cx - 74} y="624" width="148" height="32" rx="5" fill="url(#plate)" />
            <text x={cx} y="646" textAnchor="middle" fontFamily="Playfair Display, serif" fontWeight="800" fontSize={17} fill="#3a2013"
                {...(name.length > 11 ? { textLength: 134, lengthAdjust: "spacingAndGlyphs" } : {})}>
                {name.toUpperCase()}
            </text>
            {/* microphone */}
            <path d={`M${cx + (side === "for" ? 60 : -60)} 562 q 0 -40 ${side === "for" ? -22 : 22} -58`} stroke="#9ca3af" strokeWidth="4" fill="none" />
            <rect x={cx + (side === "for" ? 30 : -46)} y="494" width="16" height="22" rx="8" fill="#374151" transform={`rotate(${side === "for" ? -30 : 30} ${cx + (side === "for" ? 38 : -38)} 505)`} />
        </g>
    );
}

export const LecternsSvg = memo(function LecternsSvg({ forName, againstName }: { forName: string; againstName: string }) {
    return (
        <svg viewBox="0 0 1600 900" style={full} aria-hidden>
            <defs>
                <linearGradient id="lectern" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#6b3d22" />
                    <stop offset="1" stopColor="#2e190f" />
                </linearGradient>
                <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fbe3a6" />
                    <stop offset="1" stopColor="#b8862f" />
                </linearGradient>
            </defs>
            <Lectern cx={330} side="for" name={forName} />
            <Lectern cx={1270} side="against" name={againstName} />
        </svg>
    );
});
