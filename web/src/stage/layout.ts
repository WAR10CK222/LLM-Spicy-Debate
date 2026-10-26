// Design space of the courtroom: everything on stage is laid out in a fixed 1600×900 world,
// then the whole world is scaled to fit and moved by the camera.
import type { Shot } from "../store/court";

export const WORLD = { w: 1600, h: 900 } as const;

export const POS = {
    judge: { x: 800, y: 205 },
    for: { x: 330, y: 445 },
    against: { x: 1270, y: 445 },
} as const;

const SHOTS: Record<Shot, { x: number; y: number; zoom: number }> = {
    wide: { x: 800, y: 450, zoom: 1 },
    judge: { x: 800, y: 300, zoom: 1.7 },
    for: { x: 360, y: 470, zoom: 1.65 },
    against: { x: 1240, y: 470, zoom: 1.65 },
    "closeup-for": { x: 330, y: 430, zoom: 2.7 },
    "closeup-against": { x: 1270, y: 430, zoom: 2.7 },
    "closeup-judge": { x: 800, y: 235, zoom: 2.5 },
    gallery: { x: 800, y: 735, zoom: 1.55 },
};

/** CSS transform that frames a shot, clamped so the camera never shows past the set's edges. */
export function cameraTransform(shot: Shot) {
    const { zoom } = SHOTS[shot];
    const halfW = WORLD.w / 2 / zoom;
    const halfH = WORLD.h / 2 / zoom;
    const x = Math.min(WORLD.w - halfW, Math.max(halfW, SHOTS[shot].x));
    const y = Math.min(WORLD.h - halfH, Math.max(halfH, SHOTS[shot].y));
    const tx = (WORLD.w / 2 - x) * zoom;
    const ty = (WORLD.h / 2 - y) * zoom;
    return `translate(${tx}px, ${ty}px) scale(${zoom})`;
}

// Gallery: 12 columns × 3 rows, filled column by column so each faction sits in its own block.
export const GALLERY = { cols: 12, rows: 3 } as const;

export function seatPosition(index: number) {
    const col = Math.floor(index / GALLERY.rows);
    const row = index % GALLERY.rows; // 0 = back row
    const scale = 0.82 + row * 0.12;
    const x = 70 + col * 132 + (row % 2 ? 30 : 0);
    const y = 712 + row * 52;
    return { x, y, scale, row, col };
}
