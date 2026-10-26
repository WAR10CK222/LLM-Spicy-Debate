import { motionValue } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Emotion, Persona } from "@court/shared";
import { Puppet } from "../stage/Puppet";

type Variant = "brass" | "ghost" | "danger" | "side-for" | "side-against";

const VARIANTS: Record<Variant, string> = {
    brass: "bg-gradient-to-b from-brass-light to-brass text-walnut-950 border-brass-dark shadow-[0_2px_0_#6b4a17,0_10px_24px_-10px_rgba(212,162,76,0.6)]",
    ghost: "bg-white/5 text-parchment border-white/15 hover:bg-white/10",
    danger: "bg-red-600 text-white border-red-800",
    "side-for": "bg-side-for text-white border-blue-800",
    "side-against": "bg-side-against text-white border-red-800",
};

export function Button({ variant = "ghost", className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
    return (
        <button
            {...rest}
            className={`press inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass ${VARIANTS[variant]} ${className}`}
        >
            {children}
        </button>
    );
}

const still = motionValue(0);
const noGesture = { kind: "none" as const, nonce: 0 };

/** A lawyer's portrait: the stage puppet, cropped to head and shoulders. */
export function Avatar({ persona, size = 64, mirrored = false, emotion = "confident" }: { persona: Persona; size?: number; mirrored?: boolean; emotion?: Emotion }) {
    return (
        <div className="relative shrink-0 overflow-hidden rounded-full bg-gradient-to-b from-walnut-600 to-walnut-900 ring-2 ring-brass/40" style={{ width: size, height: size }}>
            <div className="absolute" style={{ width: size * 1.55, height: size * 2.3, left: -size * 0.275, top: -size * 0.04 }}>
                <Puppet look={persona.look} emotion={emotion} gesture={noGesture} fx={[]} mouth={still} speaking={false} mirrored={mirrored} still />
            </div>
        </div>
    );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
    value: T; options: { value: T; label: ReactNode; hint?: string }[]; onChange: (v: T) => void; label: string;
}) {
    return (
        <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-black/25 p-1">
            {options.map((o) => (
                <button key={String(o.value)} role="radio" aria-checked={o.value === value} title={o.hint} onClick={() => onChange(o.value)}
                    className={`press flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${o.value === value ? "bg-brass text-walnut-950 shadow" : "text-parchment/75 hover:text-parchment"}`}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function Chip({ children, color }: { children: ReactNode; color?: string }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ borderColor: color ?? "rgba(212,162,76,0.4)", color: color ?? "var(--color-brass-light)" }}>
            {children}
        </span>
    );
}
