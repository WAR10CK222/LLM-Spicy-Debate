import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import confetti from "canvas-confetti";
import { useCourt } from "../store/court";
import { mouths } from "../tts/tts";
import { SIDE_COLOR } from "../lib/util";
import { BackdropSvg, BenchSvg, LecternsSvg } from "./Set";
import { Puppet, PUPPET_BOX } from "./Puppet";
import { Judge } from "./Judge";
import { Gallery, Heckles } from "./Gallery";
import { Projectiles } from "./Projectiles";
import { cameraTransform, POS, WORLD } from "./layout";

const LAWYER_SCALE = 1.1;

function Lawyer({ side }: { side: "for" | "against" }) {
    const persona = useCourt((s) => s.participants?.[side]);
    const emotion = useCourt((s) => s.emotion[side]);
    const gesture = useCourt((s) => s.gesture[side]);
    const fx = useCourt((s) => s.fx[side]);
    const splats = useCourt((s) => s.splats[side]);
    const speaking = useCourt((s) => s.speaking === side);
    const winner = useCourt((s) => s.winnerPose);
    if (!persona) return null;
    const w = PUPPET_BOX.w * LAWYER_SCALE, h = PUPPET_BOX.h * LAWYER_SCALE;
    const pose = winner && winner !== "hung" ? (winner === side ? "win" : "lose") : null;
    return (
        <div className="absolute" style={{ left: POS[side].x - w / 2, top: POS[side].y - 118 * LAWYER_SCALE, width: w, height: h }}>
            <Puppet look={persona.look} emotion={emotion} gesture={gesture} fx={fx} mouth={mouths[side]}
                speaking={speaking} mirrored={side === "against"} splats={splats} pose={pose} />
        </div>
    );
}

function JudgeSlot() {
    const judge = useCourt((s) => s.judge);
    const speaking = useCourt((s) => s.speaking === "judge");
    const splats = useCourt((s) => s.splats.judge);
    const scale = 1.05;
    const w = PUPPET_BOX.w * scale, h = PUPPET_BOX.h * scale;
    return (
        <div className="absolute" style={{ left: POS.judge.x - w / 2, top: POS.judge.y - 118 * scale, width: w, height: h }}>
            <Judge expression={judge.expression} gavel={judge.gavel} fx={judge.fx} mouth={mouths.judge} speaking={speaking} splats={splats} />
        </div>
    );
}

function useConfetti() {
    const c = useCourt((s) => s.confetti);
    useEffect(() => {
        if (!c.nonce) return;
        const colors = c.side === "both" ? ["#d4a24c", "#f2cc7d", "#ffffff"] : ["#d4a24c", "#f2cc7d", SIDE_COLOR[c.side], "#ffffff"];
        const x = c.side === "for" ? 0.25 : c.side === "against" ? 0.75 : 0.5;
        void confetti({ particleCount: 140, spread: 80, startVelocity: 48, origin: { x, y: 0.6 }, colors, disableForReducedMotion: true, zIndex: 60 });
        const t = setTimeout(() => void confetti({ particleCount: 80, spread: 120, origin: { x, y: 0.5 }, colors, disableForReducedMotion: true, zIndex: 60 }), 260);
        return () => clearTimeout(t);
    }, [c]);
}

/** The courtroom: a fixed 1600×900 world, scaled to fit and framed by a moving camera. */
export function Stage({ children }: { children?: ReactNode }) {
    const wrap = useRef<HTMLDivElement>(null);
    const shaker = useRef<HTMLDivElement>(null);
    const [fit, setFit] = useState(0.5);
    const shot = useCourt((s) => s.shot);
    const shake = useCourt((s) => s.shake);
    const flash = useCourt((s) => s.flash);
    const dim = useCourt((s) => s.lightsDim);
    const names = useCourt((s) => s.participants);
    const reduce = useReducedMotion();
    useConfetti();

    useLayoutEffect(() => {
        const el = wrap.current!;
        const ro = new ResizeObserver(([entry]) => setFit(entry.contentRect.width / WORLD.w));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        if (!shake || reduce || !shaker.current) return;
        shaker.current.animate(
            [
                { transform: "translate(0,0)" }, { transform: "translate(-10px,5px)" }, { transform: "translate(9px,-6px)" },
                { transform: "translate(-6px,3px)" }, { transform: "translate(4px,-2px)" }, { transform: "translate(0,0)" },
            ],
            { duration: 420, easing: "linear" },
        );
    }, [shake, reduce]);

    return (
        <div ref={wrap} className="relative w-full overflow-hidden rounded-xl bg-black shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] ring-1 ring-brass/30" style={{ aspectRatio: "16 / 9" }}>
            <div ref={shaker} className="absolute inset-0">
                <div className="absolute left-0 top-0 origin-top-left" style={{ width: WORLD.w, height: WORLD.h, transform: `scale(${fit})` }}>
                    <motion.div className="stage-world absolute inset-0" initial={false}
                        animate={{ transform: cameraTransform(shot) }}
                        transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.77, 0, 0.175, 1] }}
                        style={{ transformOrigin: "50% 50%" }}>
                        <BackdropSvg />
                        <JudgeSlot />
                        <BenchSvg />
                        <Lawyer side="for" />
                        <Lawyer side="against" />
                        <LecternsSvg forName={names?.for.name ?? "Counsel"} againstName={names?.against.name ?? "Counsel"} />
                        <Gallery />
                        <Heckles />
                        <Projectiles />
                    </motion.div>
                </div>
            </div>

            {/* lighting */}
            <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
            <div className="pointer-events-none absolute inset-0 transition-opacity duration-700"
                style={{ opacity: dim ? 1 : 0, background: "radial-gradient(30% 40% at 50% 30%, transparent 0%, rgba(5,2,1,0.82) 100%)" }} />
            <motion.div key={flash} className="pointer-events-none absolute inset-0 bg-white"
                initial={{ opacity: flash ? 0.85 : 0 }} animate={{ opacity: 0 }} transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }} />
            {children}
        </div>
    );
}
