// Turns the server's event stream into a show: camera cuts, faces, voices, crowd, sound, then an ack.
import {
    JUDGE, otherSide,
    type CrowdReaction, type DebateEvent, type Emotion, type ObjectionEvent, type PersonaVoice, type ReactionEvent,
    type RulingEvent, type Side, type SpeechEvent, type VerdictEvent,
} from "@court/shared";
import { useCourt, nextId, type Fx } from "../store/court";
import { sfx, type SfxName } from "../audio/sfx";
import { tts, type Mouth } from "../tts/tts";
import { Clock } from "./clock";

const SPECTATOR_VOICE: PersonaVoice = { web: { prefer: ["Ryan", "Thomas", "George", "Male"], pitch: 1.45, rate: 1.15 }, gemini: "Puck" };
const JUDGE_VOICE: PersonaVoice = { web: { prefer: [...JUDGE.voice.web.prefer], pitch: JUDGE.voice.web.pitch, rate: JUDGE.voice.web.rate }, gemini: JUDGE.voice.gemini };

export function fxFor(e: Emotion): Fx[] {
    switch (e) {
        case "roasted": return ["flames", "steam"];
        case "furious": return ["steam", "vein"];
        case "offended": return ["vein"];
        case "nervous":
        case "shocked": return ["sweat"];
        case "sad": return ["tears"];
        case "cheerful":
        case "smug": return ["sparkle"];
        case "laughing": return ["blush"];
        default: return [];
    }
}

const CROWD_SFX: Partial<Record<CrowdReaction, SfxName>> = {
    cheer: "cheer", applause: "applause", ooh: "ooh", gasp: "gasp", laugh: "laugh", boo: "boo", murmur: "murmur",
};

const get = () => useCourt.getState();

export class Director {
    readonly clock = new Clock();
    private queue: DebateEvent[] = [];
    private lastQueued = 0;
    private running = false;
    private destroyed = false;
    /** Events up to this seq are applied instantly (catching up on a replay or a late join). */
    private instantUntil = 0;

    constructor(private ack: (seq: number) => void) {}

    get backlog() {
        return this.queue.length;
    }

    push(e: DebateEvent) {
        if (this.destroyed || e.seq <= this.lastQueued) return;
        this.lastQueued = e.seq;
        this.queue.push(e);
        // Case metadata is shown straight away (header, scoreboard, set dressing), even before playback starts.
        if (e.type === "case_framed" && !get().caseFile) get().patch({ caseFile: e.case, participants: e.participants, settings: e.settings });
        if (e.type === "speech") tts.prefetch(this.speakRequest(e));
        if (!this.running) void this.loop();
    }

    /** Fast-forward through everything already received, except the last couple of beats. */
    catchUp() {
        this.instantUntil = Math.max(this.instantUntil, this.lastQueued - 2);
        this.skip();
    }

    skip() {
        this.clock.skip();
        tts.cancel();
    }

    pause() {
        this.clock.pause();
        tts.pause();
    }

    resume() {
        this.clock.resume();
        tts.resume();
    }

    destroy() {
        this.destroyed = true;
        this.queue = [];
        this.skip();
        sfx.tension(false);
    }

    private async loop() {
        this.running = true;
        while (this.queue.length && !this.destroyed) {
            const e = this.queue.shift()!;
            await this.clock.untilResumed();
            try {
                if (get().recess && e.type !== "recess") get().patch({ recess: null });
                await this.play(e, e.seq <= this.instantUntil);
            } catch (err) {
                console.error("beat failed", e, err);
            }
            if (!this.destroyed) this.ack(e.seq);
        }
        this.running = false;
    }

    private voiceFor(who: Mouth): PersonaVoice {
        const p = get().participants;
        if (who === "judge") return JUDGE_VOICE;
        if (who === "spectator" || !p) return SPECTATOR_VOICE;
        return p[who].voice;
    }

    private speakRequest(e: SpeechEvent) {
        return { key: `s${e.seq}`, text: e.text, who: e.speaker as Mouth, voice: this.voiceFor(e.speaker), style: e.ttsStyle };
    }

    private nameOf(who: Mouth) {
        if (who === "judge") return JUDGE.name;
        if (who === "spectator") return "Someone in the gallery";
        return get().participants?.[who].name ?? who;
    }

    /** Shows a line in the dialogue box and speaks it; resolves when it has been said (or skipped). */
    private async say(who: Mouth, text: string, opts: { key: string; style?: string; roastLine?: string | null; kind?: string }) {
        const id = nextId();
        get().patch({ dialogue: { id, speaker: who, name: this.nameOf(who), text, shown: 0, roastLine: opts.roastLine ?? null, kind: opts.kind ?? "turn" }, speaking: who });
        sfx.duck(true);
        const ac = new AbortController();
        const off = this.clock.onSkip(() => ac.abort());
        try {
            await tts.speak(
                { key: opts.key, text, who, voice: this.voiceFor(who), style: opts.style ?? "" },
                {
                    rate: this.clock.speed,
                    signal: ac.signal,
                    onProgress: (shown) => useCourt.setState((s) => (s.dialogue?.id === id && shown > s.dialogue.shown ? { dialogue: { ...s.dialogue, shown } } : {})),
                },
            );
        } finally {
            off();
            sfx.duck(false);
            useCourt.setState((s) => (s.dialogue?.id === id ? { dialogue: { ...s.dialogue, shown: text.length }, speaking: null } : { speaking: null }));
        }
        await this.clock.sleep(320);
    }

    private wait(ms: number) {
        return this.clock.sleep(ms);
    }

    private async play(e: DebateEvent, instant: boolean) {
        const s = get();
        switch (e.type) {
            case "case_framed":
                s.patch({
                    caseFile: e.case, participants: e.participants, settings: e.settings,
                    crowdFavor: Math.round(e.settings.crowdBias * 30), shot: "wide",
                });
                if (!instant) {
                    sfx.startAmbience();
                    sfx.play("murmur", 0.8);
                    sfx.play("applause", 0.5);
                    await this.wait(1400);
                }
                return;

            case "phase": {
                s.patch({ phase: e.phase, phaseLabel: e.label, countIndex: e.countIndex ?? s.countIndex, finished: e.phase === "done" });
                if (instant) {
                    if (e.phase === "deliberation") s.patch({ lightsDim: true });
                    return;
                }
                if (e.phase === "opening" || e.phase === "closing") {
                    s.patch({ banner: { id: nextId(), kind: "phase", title: e.phase === "opening" ? "Opening Statements" : "Closing Statements" }, shot: "wide" });
                    sfx.play("whoosh");
                    await this.wait(1700);
                    s.patch({ banner: null });
                } else if (e.phase === "count" && e.countIndex !== null) {
                    const count = s.caseFile?.counts[e.countIndex];
                    s.patch({ banner: { id: nextId(), kind: "count", title: `Count ${e.countIndex + 1}`, subtitle: count?.title }, shot: "wide" });
                    sfx.play("stamp");
                    await this.wait(1900);
                    s.patch({ banner: null });
                } else if (e.phase === "deliberation") {
                    s.patch({ lightsDim: true, shot: "judge", judge: { ...s.judge, expression: "stern" } });
                    sfx.tension(true);
                    await this.wait(1500);
                } else if (e.phase === "done") {
                    sfx.stopAmbience();
                }
                return;
            }

            case "speech":
                return this.speech(e, instant);
            case "reaction":
                return this.reaction(e, instant);
            case "objection":
                return this.objection(e, instant);
            case "round_ruling":
                return this.ruling(e, instant);
            case "verdict":
                return this.verdict(e, instant);

            case "brief":
                s.patch({ brief: e.brief });
                return;

            case "recess":
                s.patch({ recess: e, judge: { ...s.judge, expression: "dozing", fx: ["zzz"] } });
                return;

            case "adjourned":
                s.patch({ adjourned: e.reason, lightsDim: false });
                sfx.tension(false);
                return;

            case "dismissed":
                s.patch({ shot: "judge" });
                if (!instant) {
                    s.bangGavel();
                    sfx.play("gavel3");
                    await this.wait(700);
                    await this.say("judge", e.judgeLine, { key: `d${e.seq}`, style: "exasperated, booming" });
                }
                s.patch({ dismissed: e.reason });
                return;
        }
    }

    private async speech(e: SpeechEvent, instant: boolean) {
        const s = get();
        if (instant) {
            s.patch({ dialogue: { id: nextId(), speaker: e.speaker, name: this.nameOf(e.speaker), text: e.text, shown: e.text.length, roastLine: e.roastLine, kind: e.kind } });
            if (e.speaker !== "judge") s.setEmotion(e.speaker, e.emotion, fxFor(e.emotion));
            return;
        }
        if (e.speaker === "judge") {
            s.patch({ shot: "judge", judge: { ...s.judge, expression: "stern", fx: [] } });
            if (e.kind === "intro") {
                for (let i = 0; i < 3; i++) setTimeout(() => get().bangGavel(), i * 320);
                sfx.play("gavel3");
                await this.wait(1100);
            } else {
                s.bangGavel();
                sfx.play("gavel");
                await this.wait(450);
            }
            await this.say("judge", e.text, { key: `s${e.seq}`, style: e.ttsStyle, kind: e.kind });
            return;
        }
        const side = e.speaker;
        s.patch({ shot: side, roastHeat: e.spice });
        sfx.play("whoosh", 0.4);
        await this.wait(420);
        s.setEmotion(side, e.emotion, fxFor(e.emotion));
        s.playGesture(side, e.gesture);
        if (e.gesture === "slam") {
            setTimeout(() => { sfx.play("slam", 0.4); get().shakeScreen(); }, 380);
        }
        await this.say(side, e.text, { key: `s${e.seq}`, style: e.ttsStyle, roastLine: e.roastLine, kind: e.kind });
    }

    private async reaction(e: ReactionEvent, instant: boolean) {
        const s = get();
        const opp = otherSide(e.speaker);
        const note = e.factCheck ? { ...e.factCheck, seq: e.seq, speaker: e.speaker } : null;
        const crowd = { ...s.crowd };
        for (const c of e.crowd) crowd[c.factionId] = { reaction: c.reaction, intensity: c.intensity, nonce: (crowd[c.factionId]?.nonce ?? 0) + 1 };

        if (instant) {
            s.patch({ crowdFavor: e.crowdFavor, notes: note ? [...s.notes, note] : s.notes, judge: { ...s.judge, expression: e.judgeExpression, fx: [] } });
            s.setEmotion(opp, e.opponentEmotion, fxFor(e.opponentEmotion));
            s.setEmotion(e.speaker, e.speakerEmotion, fxFor(e.speakerEmotion));
            return;
        }

        // 1. Cut to the victim's face.
        const burned = e.roastLanded && s.roastHeat >= 5;
        const oppFx = fxFor(e.opponentEmotion);
        if (burned && s.roastHeat >= 8 && !oppFx.includes("flames")) oppFx.push("flames");
        s.patch({ shot: `closeup-${opp}` });
        s.setEmotion(opp, e.opponentEmotion, oppFx);
        if (burned) sfx.play(s.roastHeat >= 7 ? "sting" : "scratch", 0.8);
        else if (e.score.wit <= 3) sfx.play("trombone", 0.5);
        await this.wait(burned ? 1300 : 900);

        // 2. The gallery erupts (each faction its own way).
        s.patch({ shot: "gallery", crowd, crowdFavor: e.crowdFavor, judge: { ...s.judge, expression: e.judgeExpression, fx: e.judgeExpression === "dozing" ? ["zzz"] : [] } });
        const factions = s.caseFile?.factions ?? [];
        const weight = new Map<CrowdReaction, number>();
        for (const c of e.crowd) {
            const share = factions.find((f) => f.id === c.factionId)?.share ?? 0.33;
            weight.set(c.reaction, (weight.get(c.reaction) ?? 0) + c.intensity * share * 3);
        }
        const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1]);
        ranked.slice(0, 2).forEach(([r, w], i) => {
            const name = CROWD_SFX[r];
            if (name && (i === 0 || w > 0.35)) setTimeout(() => sfx.play(name, Math.min(1, w)), i * 220);
        });
        e.heckles.forEach((h, i) => {
            setTimeout(() => {
                const seat = seatFor(h.factionId);
                get().addHeckle({ factionId: h.factionId, seat, text: h.text }, 2600);
                sfx.play("pop", 0.5);
            }, 350 + i * 650);
        });
        for (const c of e.crowd) {
            if (c.reaction === "boo" && c.intensity >= 0.6) {
                const throws = c.intensity > 0.85 ? 2 : 1;
                for (let i = 0; i < throws; i++) setTimeout(() => get().throwAt(e.speaker, seatFor(c.factionId)), 500 + i * 380);
            }
        }
        if (note) {
            s.patch({ notes: [...get().notes, note] });
            setTimeout(() => {
                const id = nextId();
                get().patch({ banner: { id, kind: "stamp", title: note.verdict, subtitle: note.note } });
                sfx.play("stamp", 0.5);
                // The stamp clears itself, so a skipped beat never leaves it hanging around.
                setTimeout(() => { if (get().banner?.id === id) get().patch({ banner: null }); }, 1900);
            }, 900);
        }
        await this.wait(2100);

        // 3. Back to the room.
        s.patch({ shot: "wide" });
        s.setEmotion(e.speaker, e.speakerEmotion, fxFor(e.speakerEmotion));
        await this.wait(350);
    }

    private async objection(e: ObjectionEvent, instant: boolean) {
        const s = get();
        if (instant) return;
        const objector: Mouth = e.by === "spectator" ? "spectator" : e.by;
        s.patch({ objection: { ...e, stage: "shout" }, shot: e.by === "spectator" ? "gallery" : e.by, flash: s.flash + 1 });
        s.shakeScreen();
        sfx.play("slam", 1);
        if (e.by !== "spectator") {
            s.playGesture(e.by, "point");
            s.setEmotion(e.by, "furious", fxFor("furious"));
        }
        await this.wait(1100);
        await this.say(objector, e.objectorLine, { key: `o${e.seq}`, style: "outraged, shouting", kind: "objection" });
        get().patch({ objection: { ...e, stage: "ruling" }, shot: "judge" });
        get().bangGavel();
        sfx.play("gavel");
        await this.wait(250);
        sfx.play("stamp", 0.9);
        await this.say("judge", e.judgeLine, { key: `r${e.seq}`, style: "firm, dry", kind: "ruling" });
        if (e.ruling === "sustained") get().setEmotion(e.against, "nervous", ["sweat"]);
        else if (e.by !== "spectator") get().setEmotion(e.by, "offended", ["vein"]);
        get().patch({ objection: null });
    }

    private async ruling(e: RulingEvent, instant: boolean) {
        const s = get();
        const loser = otherSide(e.winner);
        if (instant) {
            s.patch({ scores: e.scores, lessons: [...s.lessons, e.lesson] });
            return;
        }
        s.patch({ shot: "judge", ruling: e });
        sfx.play("drumroll", 0.8);
        await this.wait(1800);
        s.patch({ scores: e.scores, shot: "wide", confetti: { nonce: s.confetti.nonce + 1, side: e.winner } });
        s.setEmotion(e.winner, "cheerful", ["sparkle"]);
        s.setEmotion(loser, "sad", ["tears"]);
        s.playGesture(e.winner, "wave");
        sfx.play("ding");
        sfx.play("cheer", 0.6);
        await this.wait(900);
        s.patch({ shot: "judge" });
        await this.say("judge", e.judgeLine, { key: `ru${e.seq}`, style: "formal, a hint of amusement", kind: "ruling" });
        get().patch({ lessons: [...get().lessons, e.lesson], ruling: null, shot: "wide" });
    }

    private async verdict(e: VerdictEvent, instant: boolean) {
        const s = get();
        if (instant) {
            s.patch({ verdict: e, verdictStage: "results", scores: e.scores, crowdFavor: e.crowdFavor, winnerPose: e.winner, lightsDim: false });
            return;
        }
        s.patch({ verdict: e, verdictStage: "drumroll", shot: "closeup-judge" });
        sfx.play("drumroll", 1);
        await this.wait(2000);
        await this.say("judge", e.judgeLine, { key: `v${e.seq}`, style: "slow, dramatic, booming", kind: "verdict" });
        for (let i = 0; i < 3; i++) setTimeout(() => get().bangGavel(), i * 320);
        sfx.play("gavel3", 1);
        sfx.tension(false);
        await this.wait(900);
        const winner = e.winner;
        get().patch({ verdictStage: "reveal", winnerPose: winner, lightsDim: false, shot: "wide", scores: e.scores, confetti: { nonce: get().confetti.nonce + 1, side: winner === "hung" ? "both" : winner } });
        if (winner !== "hung") {
            const loser = otherSide(winner as Side);
            get().setEmotion(winner, "laughing", ["sparkle", "blush"]);
            get().playGesture(winner, "mic_drop");
            get().setEmotion(loser, "roasted", ["flames", "tears"]);
            sfx.play("fanfare", 1);
            sfx.play("cheer", 1);
            setTimeout(() => sfx.play("trombone", 0.6), 2400);
        } else {
            get().setEmotion("for", "shocked", ["sweat"]);
            get().setEmotion("against", "shocked", ["sweat"]);
            sfx.play("gasp", 1);
        }
        await this.wait(3600);
        get().patch({ verdictStage: "results" });
    }
}

/** A stable-ish seat for a faction member (the Gallery lays seats out by faction share). */
function seatFor(factionId: string) {
    const seats = useCourt.getState().caseFile ? seatMap(useCourt.getState().caseFile!.factions) : [];
    const mine = seats.flatMap((f, i) => (f === factionId ? [i] : []));
    return mine.length ? mine[Math.floor(Math.random() * mine.length)] : 0;
}

export const GALLERY_SEATS = 36;

const SIDE_ORDER = { for: 0, neutral: 1, against: 2 } as const;

/**
 * Seat index → faction id, proportional to each faction's share. FOR fans sit on the left (by their lawyer),
 * neutrals in the middle, AGAINST fans on the right. Shared with the Gallery renderer.
 */
export function seatMap(factions: { id: string; share: number; side: "for" | "against" | "neutral" }[]): string[] {
    const ordered = [...factions].sort((a, b) => SIDE_ORDER[a.side] - SIDE_ORDER[b.side]);
    const total = ordered.reduce((a, f) => a + f.share, 0) || 1;
    const counts = ordered.map((f) => Math.round((f.share / total) * GALLERY_SEATS));
    let diff = GALLERY_SEATS - counts.reduce((a, b) => a + b, 0);
    for (let i = 0; diff !== 0; i = (i + 1) % counts.length) {
        counts[i] += Math.sign(diff);
        diff -= Math.sign(diff);
    }
    const out: string[] = [];
    ordered.forEach((f, i) => { for (let n = 0; n < counts[i]; n++) out.push(f.id); });
    return out;
}
