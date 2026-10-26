// Procedural courtroom soundboard (Web Audio). Real recordings listed in /audio/manifest.json override any
// sound by name, so you can drop CC0 files into web/public/audio/ without touching code.
import { Howl } from "howler";

export type SfxName =
    | "gavel" | "gavel3" | "sting" | "whoosh" | "ding" | "drumroll" | "scratch" | "ooh" | "boo" | "laugh"
    | "cheer" | "gasp" | "applause" | "splat" | "slam" | "fanfare" | "trombone" | "pop" | "stamp" | "buzzer" | "tada" | "murmur";

type Vowel = { f1: number; f2: number };
const VOWEL: Record<"u" | "a" | "o" | "e", Vowel> = {
    u: { f1: 320, f2: 870 },
    o: { f1: 500, f2: 900 },
    a: { f1: 760, f2: 1250 },
    e: { f1: 560, f2: 1750 },
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

class Sfx {
    private ctx: AudioContext | null = null;
    private master!: GainNode;
    private dry!: GainNode;
    private hall!: ConvolverNode;
    private ambience!: GainNode;
    private voiceBus!: GainNode;
    private noise = new Map<string, AudioBuffer>();
    private files = new Map<string, Howl>();
    private ambienceNodes: AudioScheduledSourceNode[] = [];
    private tensionTimer: number | null = null;
    private _muted = false;
    private _volume = 0.8;

    get context() {
        return this.ctx;
    }

    /** Must be called from a user gesture (click) at least once. */
    unlock() {
        if (!this.ctx) {
            const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (!Ctx) return;
            this.ctx = new Ctx();
            this.master = this.ctx.createGain();
            this.master.connect(this.ctx.destination);
            this.dry = this.ctx.createGain();
            this.dry.connect(this.master);
            this.hall = this.ctx.createConvolver();
            this.hall.buffer = this.impulse(1.8);
            const wet = this.ctx.createGain();
            wet.gain.value = 0.32;
            this.hall.connect(wet).connect(this.master);
            this.ambience = this.ctx.createGain();
            this.ambience.gain.value = 0;
            this.ambience.connect(this.master);
            this.voiceBus = this.ctx.createGain();
            this.voiceBus.connect(this.master);
            this.applyVolume();
            void this.loadManifest();
        }
        if (this.ctx.state === "suspended") void this.ctx.resume();
    }

    /** Where spoken (Gemini TTS) audio is routed, so volume and mute apply to it too. */
    get voiceOut(): AudioNode | null {
        return this.ctx ? this.voiceBus : null;
    }

    get unlocked() {
        return !!this.ctx && this.ctx.state === "running";
    }

    setMuted(m: boolean) {
        this._muted = m;
        this.applyVolume();
    }

    setVolume(v: number) {
        this._volume = v;
        this.applyVolume();
    }

    private applyVolume() {
        if (!this.ctx) return;
        const target = this._muted ? 0 : this._volume;
        this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
        for (const h of this.files.values()) h.volume(target);
    }

    private async loadManifest() {
        try {
            const res = await fetch("/audio/manifest.json");
            if (!res.ok) return;
            const manifest = (await res.json()) as Record<string, string>;
            for (const [name, file] of Object.entries(manifest)) {
                this.files.set(name, new Howl({ src: [`/audio/${file}`], volume: this._muted ? 0 : this._volume, preload: true }));
            }
        } catch { /* synth only */ }
    }

    // --- building blocks ---

    private impulse(seconds: number) {
        const ctx = this.ctx!;
        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
        }
        return buf;
    }

    private noiseBuffer(kind: "white" | "pink" | "brown", seconds = 2) {
        const key = `${kind}:${seconds}`;
        const cached = this.noise.get(key);
        if (cached) return cached;
        const ctx = this.ctx!;
        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, last = 0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            if (kind === "white") d[i] = w;
            else if (kind === "pink") {
                b0 = 0.99765 * b0 + w * 0.099046;
                b1 = 0.963 * b1 + w * 0.2965164;
                b2 = 0.57 * b2 + w * 1.0526913;
                d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
            } else {
                last = (last + 0.02 * w) / 1.02;
                d[i] = last * 3.5;
            }
        }
        this.noise.set(key, buf);
        return buf;
    }

    private out(wet = 0.5) {
        const g = this.ctx!.createGain();
        g.connect(this.dry);
        if (wet > 0) {
            const s = this.ctx!.createGain();
            s.gain.value = wet;
            g.connect(s).connect(this.hall);
        }
        return g;
    }

    private env(g: GainNode, t: number, attack: number, hold: number, release: number, peak = 1) {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + attack);
        g.gain.setValueAtTime(peak, t + attack + hold);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    }

    private noiseHit(t: number, dur: number, filter: BiquadFilterType, freq: number, peak: number, dest: AudioNode, q = 1) {
        const ctx = this.ctx!;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer("white");
        const f = ctx.createBiquadFilter();
        f.type = filter;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = ctx.createGain();
        this.env(g, t, 0.002, 0, dur, peak);
        src.connect(f).connect(g).connect(dest);
        src.start(t, Math.random());
        src.stop(t + dur + 0.05);
        return f;
    }

    private tone(t: number, type: OscillatorType, from: number, to: number, dur: number, peak: number, dest: AudioNode, attack = 0.005) {
        const ctx = this.ctx!;
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(from, t);
        if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
        const g = ctx.createGain();
        this.env(g, t, attack, 0, dur, peak);
        o.connect(g).connect(dest);
        o.start(t);
        o.stop(t + dur + 0.05);
        return o;
    }

    private brass(t: number, freq: number, dur: number, peak: number, dest: AudioNode) {
        const ctx = this.ctx!;
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
        f.frequency.exponentialRampToValueAtTime(900, t + dur);
        const g = ctx.createGain();
        this.env(g, t, 0.02, dur * 0.6, dur * 0.4, peak);
        f.connect(g).connect(dest);
        for (const detune of [-7, 0, 7]) {
            const o = ctx.createOscillator();
            o.type = "sawtooth";
            o.frequency.value = freq;
            o.detune.value = detune;
            o.connect(f);
            o.start(t);
            o.stop(t + dur + 0.1);
        }
    }

    /** One synthetic voice: a buzzy source through two vowel formants, with vibrato and a pitch contour. */
    private voice(t: number, dur: number, f0: number, vowel: Vowel, contour: number[], peak: number, dest: AudioNode, pulseHz = 0) {
        const ctx = this.ctx!;
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        const step = dur / Math.max(1, contour.length - 1);
        o.frequency.setValueAtTime(f0 * contour[0], t);
        contour.forEach((c, i) => i && o.frequency.linearRampToValueAtTime(f0 * c, t + i * step));
        const vib = ctx.createOscillator();
        vib.frequency.value = rand(4.5, 6.5);
        const vibGain = ctx.createGain();
        vibGain.gain.value = f0 * 0.02;
        vib.connect(vibGain).connect(o.frequency);

        const mix = ctx.createGain();
        for (const [freq, q, gain] of [[vowel.f1, 6, 1], [vowel.f2, 9, 0.5]] as const) {
            const bp = ctx.createBiquadFilter();
            bp.type = "bandpass";
            bp.frequency.value = freq * rand(0.92, 1.08);
            bp.Q.value = q;
            const g = ctx.createGain();
            g.gain.value = gain;
            o.connect(bp).connect(g).connect(mix);
        }
        const env = ctx.createGain();
        this.env(env, t, Math.min(0.08, dur / 4), dur * 0.5, dur * 0.5, peak);
        if (pulseHz > 0) {
            // "ha-ha-ha": amplitude pulses
            const am = ctx.createGain();
            am.gain.value = 0;
            const lfo = ctx.createOscillator();
            lfo.type = "square";
            lfo.frequency.value = pulseHz;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 0.5;
            const dc = ctx.createConstantSource();
            dc.offset.value = 0.5;
            lfo.connect(lfoGain).connect(am.gain);
            dc.connect(am.gain);
            mix.connect(am).connect(env);
            lfo.start(t);
            dc.start(t);
            lfo.stop(t + dur + 0.1);
            dc.stop(t + dur + 0.1);
        } else {
            mix.connect(env);
        }
        env.connect(dest);
        o.start(t);
        vib.start(t);
        o.stop(t + dur + 0.1);
        vib.stop(t + dur + 0.1);
    }

    private crowdOf(n: number, fn: (i: number, t: number) => void, spread = 0.18) {
        const t0 = this.ctx!.currentTime + 0.02;
        for (let i = 0; i < n; i++) fn(i, t0 + Math.random() * spread);
    }

    private applause(t: number, dur: number, peak: number, dest: AudioNode) {
        const ctx = this.ctx!;
        const len = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        const claps = Math.floor(dur * 260);
        for (let c = 0; c < claps; c++) {
            const start = Math.floor(Math.random() * (len - 800));
            const amp = rand(0.2, 1) * (1 - start / len) ** 0.6;
            for (let i = 0; i < 700; i++) d[start + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / 90);
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1800;
        bp.Q.value = 0.7;
        const g = ctx.createGain();
        this.env(g, t, 0.15, dur * 0.5, dur * 0.4, peak * 0.25);
        src.connect(bp).connect(g).connect(dest);
        src.start(t);
    }

    // --- public API ---

    play(name: SfxName, intensity = 0.7) {
        if (!this.ctx || this._muted) return;
        const file = this.files.get(name);
        if (file) {
            file.volume(this._volume * (0.5 + intensity / 2));
            file.play();
            return;
        }
        const t = this.ctx.currentTime + 0.01;
        const k = 0.4 + intensity * 0.6;
        switch (name) {
            case "gavel": {
                const o = this.out(0.6);
                this.tone(t, "sine", 190, 65, 0.22, 0.9 * k, o);
                this.tone(t, "triangle", 420, 160, 0.06, 0.4 * k, o);
                this.noiseHit(t, 0.04, "bandpass", 2600, 0.6 * k, o, 2);
                break;
            }
            case "gavel3":
                [0, 0.32, 0.64].forEach((d) => setTimeout(() => this.play("gavel", intensity), d * 1000));
                break;
            case "stamp": {
                const o = this.out(0.3);
                this.tone(t, "sine", 120, 50, 0.18, 0.8 * k, o);
                this.noiseHit(t, 0.08, "lowpass", 1200, 0.5 * k, o);
                break;
            }
            case "slam": {
                const o = this.out(0.8);
                this.tone(t, "sine", 90, 38, 0.7, 1 * k, o);
                this.noiseHit(t, 0.25, "highpass", 1800, 0.7 * k, o);
                this.brass(t + 0.02, 146.8, 0.5, 0.25 * k, o);
                this.brass(t + 0.02, 220, 0.5, 0.2 * k, o);
                break;
            }
            case "sting": {
                const o = this.out(0.6);
                this.brass(t, 196, 0.2, 0.35 * k, o);
                this.brass(t + 0.26, 196, 0.2, 0.35 * k, o);
                this.brass(t + 0.52, 155.6, 1.1, 0.45 * k, o);
                this.brass(t + 0.52, 233, 1.1, 0.25 * k, o);
                break;
            }
            case "fanfare": {
                const o = this.out(0.6);
                [261.6, 329.6, 392, 523.3].forEach((f, i) => this.brass(t + i * 0.13, f, 0.16, 0.3 * k, o));
                [523.3, 659.3, 784].forEach((f) => this.brass(t + 0.55, f, 1.3, 0.22 * k, o));
                break;
            }
            case "trombone": {
                const o = this.out(0.5);
                [233, 220, 207.7].forEach((f, i) => this.brass(t + i * 0.42, f, 0.36, 0.35 * k, o));
                const last = this.ctx.createOscillator();
                last.type = "sawtooth";
                last.frequency.value = 196;
                const vib = this.ctx.createOscillator();
                vib.frequency.value = 5;
                const vg = this.ctx.createGain();
                vg.gain.value = 6;
                vib.connect(vg).connect(last.frequency);
                const lp = this.ctx.createBiquadFilter();
                lp.type = "lowpass";
                lp.frequency.value = 900;
                const g = this.ctx.createGain();
                this.env(g, t + 1.26, 0.03, 0.9, 0.5, 0.3 * k);
                last.connect(lp).connect(g).connect(o);
                last.start(t + 1.26);
                vib.start(t + 1.26);
                last.stop(t + 2.8);
                vib.stop(t + 2.8);
                break;
            }
            case "whoosh": {
                const o = this.out(0.2);
                const f = this.noiseHit(t, 0.4, "bandpass", 400, 0.5 * k, o, 3);
                f.frequency.exponentialRampToValueAtTime(3200, t + 0.3);
                break;
            }
            case "scratch": {
                const o = this.out(0.1);
                const f = this.noiseHit(t, 0.35, "bandpass", 3000, 0.9 * k, o, 6);
                f.frequency.exponentialRampToValueAtTime(500, t + 0.15);
                f.frequency.exponentialRampToValueAtTime(2200, t + 0.32);
                break;
            }
            case "ding": {
                const o = this.out(0.5);
                this.tone(t, "sine", 1318, 1318, 0.9, 0.35 * k, o);
                this.tone(t, "sine", 2637, 2637, 0.5, 0.12 * k, o);
                break;
            }
            case "pop": {
                const o = this.out(0.1);
                this.tone(t, "sine", 520, 980, 0.07, 0.25 * k, o);
                break;
            }
            case "tada": {
                const o = this.out(0.5);
                [659.3, 830.6, 987.8, 1318.5].forEach((f, i) => this.tone(t + i * 0.07, "triangle", f, f, 0.5, 0.18 * k, o));
                break;
            }
            case "buzzer": {
                const o = this.out(0.2);
                this.tone(t, "square", 140, 120, 0.45, 0.22 * k, o, 0.01);
                break;
            }
            case "splat": {
                const o = this.out(0.3);
                this.noiseHit(t, 0.2, "lowpass", 900, 0.9 * k, o);
                this.tone(t, "sine", 320, 55, 0.18, 0.6 * k, o);
                break;
            }
            case "drumroll": {
                const o = this.out(0.5);
                const dur = 1.6;
                for (let i = 0, n = Math.floor(dur * 24); i < n; i++) {
                    this.noiseHit(t + i / 24 + rand(0, 0.008), 0.05, "highpass", 1400, (0.12 + 0.5 * (i / n)) * k, o);
                }
                this.noiseHit(t + dur, 1.4, "highpass", 5000, 0.5 * k, o);
                this.tone(t + dur, "sine", 110, 45, 0.6, 0.9 * k, o);
                break;
            }
            case "ooh": {
                const o = this.out(0.6);
                this.crowdOf(10, (_, tt) => this.voice(tt, rand(0.9, 1.3), rand(120, 260), VOWEL.u, [0.9, 1.25, 1.1, 0.85], 0.1 * k, o));
                break;
            }
            case "boo": {
                const o = this.out(0.6);
                this.crowdOf(12, (_, tt) => this.voice(tt, rand(1.1, 1.5), rand(85, 170), VOWEL.u, [1, 1, 0.92, 0.8], 0.1 * k, o));
                break;
            }
            case "laugh": {
                const o = this.out(0.6);
                this.crowdOf(9, (_, tt) => this.voice(tt, rand(1.2, 1.8), rand(130, 300), Math.random() < 0.5 ? VOWEL.a : VOWEL.e, [1.15, 1.05, 0.95, 0.85], 0.12 * k, o, rand(4.2, 6.2)), 0.3);
                break;
            }
            case "cheer": {
                const o = this.out(0.6);
                this.crowdOf(10, (_, tt) => this.voice(tt, rand(0.9, 1.4), rand(160, 320), Math.random() < 0.5 ? VOWEL.a : VOWEL.e, [0.9, 1.3, 1.25, 1.0], 0.09 * k, o));
                if (intensity > 0.6) this.tone(t + 0.1, "sine", 1900, 2500, 0.5, 0.06 * k, o, 0.05);
                this.applause(t, 2, k, o);
                break;
            }
            case "applause":
                this.applause(t, 2.4, k, this.out(0.6));
                break;
            case "gasp": {
                const o = this.out(0.5);
                this.crowdOf(8, (_, tt) => {
                    const f = this.noiseHit(tt, 0.32, "bandpass", rand(1500, 3200), 0.25 * k, o, 1.5);
                    f.frequency.linearRampToValueAtTime(rand(2500, 4000), tt + 0.3);
                }, 0.1);
                break;
            }
            case "murmur": {
                const o = this.out(0.6);
                this.crowdOf(7, (_, tt) => this.voice(tt, rand(0.8, 1.4), rand(100, 200), [VOWEL.a, VOWEL.o, VOWEL.e][Math.floor(rand(0, 3))], [1, 1.05, 0.95, 1], 0.05 * k, o, rand(3, 5)), 0.8);
                break;
            }
        }
    }

    /** Low room tone + distant gallery murmur under everything. */
    startAmbience() {
        if (!this.ctx || this.ambienceNodes.length) return;
        const ctx = this.ctx;
        const room = ctx.createBufferSource();
        room.buffer = this.noiseBuffer("brown", 4);
        room.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 380;
        const rg = ctx.createGain();
        rg.gain.value = 0.18;
        room.connect(lp).connect(rg).connect(this.ambience);

        const babble = ctx.createBufferSource();
        babble.buffer = this.noiseBuffer("pink", 4);
        babble.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 550;
        bp.Q.value = 1.2;
        const bg = ctx.createGain();
        bg.gain.value = 0.05;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.23;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.03;
        lfo.connect(lfoGain).connect(bg.gain);
        babble.connect(bp).connect(bg).connect(this.ambience);

        room.start();
        babble.start();
        lfo.start();
        this.ambienceNodes = [room, babble, lfo];
        this.ambience.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    }

    stopAmbience() {
        if (!this.ctx) return;
        this.ambience.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
        const nodes = this.ambienceNodes;
        this.ambienceNodes = [];
        setTimeout(() => nodes.forEach((n) => n.stop()), 1200);
        this.tension(false);
    }

    /** Turn the ambience down while someone is talking. */
    duck(on: boolean) {
        if (!this.ctx || !this.ambienceNodes.length) return;
        this.ambience.gain.setTargetAtTime(on ? 0.35 : 1, this.ctx.currentTime, 0.25);
    }

    /** Heartbeat-like low drum loop for deliberation. */
    tension(on: boolean) {
        if (this.tensionTimer !== null) {
            clearInterval(this.tensionTimer);
            this.tensionTimer = null;
        }
        if (!on || !this.ctx) return;
        const beat = () => {
            if (!this.ctx || this._muted) return;
            const o = this.out(0.5);
            const t = this.ctx.currentTime;
            this.tone(t, "sine", 70, 42, 0.25, 0.6, o);
            this.tone(t + 0.22, "sine", 66, 40, 0.25, 0.45, o);
        };
        beat();
        this.tensionTimer = window.setInterval(beat, 1100);
    }
}

export const sfx = new Sfx();
