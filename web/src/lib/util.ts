export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Deterministic pseudo-random in [0, 1) from an integer/string seed. */
export function seeded(seed: number | string) {
    let h = typeof seed === "number" ? seed | 0 : [...seed].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 2654435761), 1);
    return () => {
        h = Math.imul(h ^ (h >>> 15), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
}

export const prefersReducedMotion = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function readSetting<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(`roast-court:${key}`);
        return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
        return fallback;
    }
}

export function writeSetting(key: string, value: unknown) {
    try {
        localStorage.setItem(`roast-court:${key}`, JSON.stringify(value));
    } catch { /* private mode: fine */ }
}

export const SIDE_COLOR = { for: "#3b82f6", against: "#ef4444" } as const;
