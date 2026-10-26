import { motion, useReducedMotion } from "motion/react";
import { useCourt } from "../store/court";
import { sfx } from "../audio/sfx";
import { POS, seatPosition } from "./layout";

function Tomato() {
    return (
        <svg viewBox="0 0 40 40" width="40" height="40">
            <circle cx="20" cy="22" r="15" fill="#dc2626" stroke="#7f1d1d" strokeWidth="2" />
            <ellipse cx="14" cy="17" rx="5" ry="3" fill="#fca5a5" opacity="0.8" />
            <path d="M20 8 l-6 -3 l5 6 l-4 1 l6 1 l1 5 l2 -5 l6 -1 l-5 -1 l4 -5 z" fill="#16a34a" />
        </svg>
    );
}

/** Tomatoes flying from the gallery (or from you) at whoever is speaking. */
export function Projectiles() {
    const projectiles = useCourt((s) => s.projectiles);
    const land = useCourt((s) => s.landProjectile);
    const reduce = useReducedMotion();
    return (
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 30 }}>
            {projectiles.map((p) => {
                const from = p.from < 0 ? { x: 800, y: 980 } : seatPosition(p.from);
                const to = POS[p.target];
                const peak = Math.min(from.y, to.y) - 220;
                const mid = (from.x + to.x) / 2;
                const t = (x: number, y: number, r: number) => `translate(${x - 20}px, ${y - 20}px) rotate(${r}deg)`;
                return (
                    <motion.div key={p.id} className="absolute left-0 top-0"
                        initial={{ transform: t(from.x, from.y, 0), opacity: 1 }}
                        animate={reduce
                            ? { transform: t(to.x, to.y, 0), opacity: [1, 1, 0] }
                            : { transform: [t(from.x, from.y, 0), t(mid, peak, 300), t(to.x, to.y, 620)] }}
                        transition={{ duration: reduce ? 0.3 : 0.7, times: reduce ? undefined : [0, 0.5, 1], ease: ["easeOut", "easeIn"] }}
                        onAnimationComplete={() => {
                            sfx.play("splat", 0.8);
                            land(p.id);
                        }}>
                        <Tomato />
                    </motion.div>
                );
            })}
        </div>
    );
}
