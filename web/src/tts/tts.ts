// Voices for the trial. Each provider reports progress (for the typewriter) and drives a mouth value (for lip-sync).
import { animate, motionValue, type MotionValue } from "motion/react";
import type { PersonaVoice } from "@court/shared";
import { api } from "../lib/api";
import { sfx } from "../audio/sfx";

export type Mouth = "for" | "against" | "judge" | "spectator";
export const mouths: Record<Mouth, MotionValue<number>> = {
    for: motionValue(0),
    against: motionValue(0),
    judge: motionValue(0),
    spectator: motionValue(0),
};

export interface SpeakRequest {
    key: string;
    text: string;
    who: Mouth;
    voice: PersonaVoice;
    style: string;
}

export interface SpeakOptions {
    rate: number;
    onProgress: (chars: number) => void;
    signal: AbortSignal;
}

interface Provider {
    speak(req: SpeakRequest, opts: SpeakOptions): Promise<void>;
    pause(): void;
    resume(): void;
    cancel(): void;
    prefetch?(req: SpeakRequest): void;
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
/** Rough natural reading time for a line. */
export const readingMs = (text: string, rate = 1) => Math.max(1200, (words(text) / 2.7) * 1000) / rate;

/** Synthetic mouth flapping for providers that can't tell us when words happen. */
function flap(who: Mouth, signal: AbortSignal, isPaused: () => boolean) {
    const mv = mouths[who];
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
        if (signal.aborted) return void mv.set(0);
        const t = (now - start) / 1000;
        mv.set(isPaused() ? 0 : Math.max(0, 0.45 + 0.4 * Math.sin(t * 17) * Math.sin(t * 5.3 + 1)));
        raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
        cancelAnimationFrame(raf);
        mv.set(0);
    };
}

/** Advances "chars shown" at reading speed, honouring pause. Resolves when the whole line is shown. */
function ticker(text: string, rate: number, opts: SpeakOptions, isPaused: () => boolean, durationMs = readingMs(text, rate)) {
    return new Promise<void>((resolve) => {
        let elapsed = 0;
        let last = performance.now();
        const id = setInterval(() => {
            const now = performance.now();
            if (!isPaused()) elapsed += now - last;
            last = now;
            const chars = Math.min(text.length, Math.ceil((elapsed / durationMs) * text.length));
            opts.onProgress(chars);
            if (chars >= text.length || opts.signal.aborted) {
                clearInterval(id);
                resolve();
            }
        }, 40);
    });
}

// --- silent (muted, or no speech engine) ---

class SilentProvider implements Provider {
    private paused = false;
    async speak(req: SpeakRequest, opts: SpeakOptions) {
        const stop = flap(req.who, opts.signal, () => this.paused);
        await ticker(req.text, opts.rate, opts, () => this.paused);
        stop();
    }
    pause() { this.paused = true; }
    resume() { this.paused = false; }
    cancel() {}
}

// --- Web Speech API (free, offline-capable, voices depend on the OS/browser) ---

class WebSpeechProvider implements Provider {
    private voices: SpeechSynthesisVoice[] = [];
    private paused = false;
    private current: SpeechSynthesisUtterance | null = null;

    constructor() {
        const load = () => (this.voices = speechSynthesis.getVoices());
        load();
        speechSynthesis.addEventListener?.("voiceschanged", load);
    }

    static supported() {
        return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    }

    pick(prefer: string[]): SpeechSynthesisVoice | undefined {
        const english = this.voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
        const pool = english.length ? english : this.voices;
        for (const want of prefer) {
            const w = want.toLowerCase();
            const hit = pool.find((v) => v.name.toLowerCase().includes(w) && /natural|online|neural/i.test(v.name))
                ?? pool.find((v) => v.name.toLowerCase().includes(w));
            if (hit) return hit;
        }
        return pool.find((v) => v.default) ?? pool[0];
    }

    private chunks(text: string) {
        const sentences = text.match(/[^.!?…]+[.!?…]*["')\]]*\s*/g) ?? [text];
        const out: string[] = [];
        for (const s of sentences) {
            if (out.length && (out[out.length - 1] + s).length < 180) out[out.length - 1] += s;
            else out.push(s);
        }
        return out;
    }

    async speak(req: SpeakRequest, opts: SpeakOptions) {
        const voice = this.pick(req.voice.web.prefer);
        let offset = 0;
        let sawBoundary = false;
        const mv = mouths[req.who];
        const stopFlap = flap(req.who, opts.signal, () => this.paused || sawBoundary);
        try {
            for (const chunk of this.chunks(req.text)) {
                if (opts.signal.aborted) break;
                const base = offset;
                await new Promise<void>((resolve) => {
                    const u = new SpeechSynthesisUtterance(chunk);
                    this.current = u;
                    if (voice) u.voice = voice;
                    u.lang = voice?.lang ?? "en-US";
                    u.pitch = req.voice.web.pitch;
                    u.rate = Math.min(2, req.voice.web.rate * opts.rate);
                    let done = false;
                    const finish = () => {
                        if (done) return;
                        done = true;
                        clearTimeout(watchdog);
                        clearInterval(estimate);
                        opts.onProgress(base + chunk.length);
                        resolve();
                    };
                    // Some voices never fire boundary events: estimate progress from time too, never going backwards.
                    const started = performance.now();
                    const est = readingMs(chunk, u.rate) * 1.05;
                    let shown = base;
                    const estimate = setInterval(() => {
                        if (this.paused) return;
                        const c = base + Math.floor(Math.min(1, (performance.now() - started) / est) * chunk.length * 0.95);
                        if (c > shown) opts.onProgress((shown = c));
                    }, 60);
                    u.onboundary = (ev) => {
                        if (ev.name && ev.name !== "word") return;
                        sawBoundary = true;
                        const c = base + ev.charIndex + (ev.charLength || 4);
                        if (c > shown) opts.onProgress((shown = c));
                        mv.set(0.95);
                        animate(mv, 0.12, { duration: 0.18, ease: [0.23, 1, 0.32, 1] });
                    };
                    u.onend = finish;
                    u.onerror = finish;
                    const watchdog = setTimeout(finish, est * 2.2 + 3000);
                    opts.signal.addEventListener("abort", finish, { once: true });
                    speechSynthesis.speak(u);
                });
                offset += chunk.length;
            }
        } finally {
            stopFlap();
            this.current = null;
        }
    }

    pause() {
        this.paused = true;
        speechSynthesis.pause();
    }
    resume() {
        this.paused = false;
        speechSynthesis.resume();
    }
    cancel() {
        this.current = null;
        speechSynthesis.cancel();
    }
}

// --- Gemini TTS via the server (expressive, cached, costs API quota) ---

class GeminiProvider implements Provider {
    private cache = new Map<string, Promise<string>>();
    private audio: HTMLAudioElement | null = null;

    constructor(private fallback: Provider) {}

    private styled(req: SpeakRequest) {
        return { text: req.text, style: req.style };
    }

    prefetch(req: SpeakRequest) {
        if (this.cache.has(req.key)) return;
        const { text, style } = this.styled(req);
        const job = api.tts(text, req.voice.gemini, style).then((blob) => URL.createObjectURL(blob));
        job.catch(() => this.cache.delete(req.key));
        this.cache.set(req.key, job);
    }

    async speak(req: SpeakRequest, opts: SpeakOptions) {
        this.prefetch(req);
        let url: string;
        try {
            url = await this.cache.get(req.key)!;
        } catch {
            return this.fallback.speak(req, opts);
        }
        if (opts.signal.aborted) return;
        const audio = new Audio(url);
        this.audio = audio;
        audio.playbackRate = opts.rate;
        const ctx = sfx.context;
        let analyser: AnalyserNode | null = null;
        if (ctx && sfx.voiceOut) {
            const src = ctx.createMediaElementSource(audio);
            analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            src.connect(analyser).connect(sfx.voiceOut);
        }
        const mv = mouths[req.who];
        const data = new Uint8Array(analyser?.fftSize ?? 0);
        let raf = 0;
        const tick = () => {
            if (analyser) {
                analyser.getByteTimeDomainData(data);
                let sum = 0;
                for (const v of data) sum += ((v - 128) / 128) ** 2;
                mv.set(Math.min(1, Math.sqrt(sum / data.length) * 5.5));
            }
            if (audio.duration) opts.onProgress(Math.ceil((audio.currentTime / audio.duration) * req.text.length));
            raf = requestAnimationFrame(tick);
        };
        await new Promise<void>((resolve) => {
            const done = () => {
                cancelAnimationFrame(raf);
                mv.set(0);
                opts.onProgress(req.text.length);
                resolve();
            };
            audio.onended = done;
            audio.onerror = done;
            opts.signal.addEventListener("abort", () => { audio.pause(); done(); }, { once: true });
            audio.play().then(() => (raf = requestAnimationFrame(tick)), () => this.fallback.speak(req, opts).then(done));
        });
        this.audio = null;
    }

    pause() { this.audio?.pause(); }
    resume() { void this.audio?.play(); }
    cancel() { this.audio?.pause(); }
}

// --- hub ---

export type VoiceMode = "web" | "gemini" | "silent";

class TtsHub {
    private silent = new SilentProvider();
    private web = WebSpeechProvider.supported() ? new WebSpeechProvider() : null;
    private gemini = new GeminiProvider(this.web ?? this.silent);
    private mode: VoiceMode = this.web ? "web" : "silent";

    setMode(mode: VoiceMode) {
        this.cancel();
        this.mode = mode === "web" && !this.web ? "silent" : mode;
    }

    get webAvailable() {
        return !!this.web;
    }

    private get provider(): Provider {
        return this.mode === "gemini" ? this.gemini : this.mode === "web" && this.web ? this.web : this.silent;
    }

    speak(req: SpeakRequest, opts: SpeakOptions) {
        return this.provider.speak(req, opts);
    }
    prefetch(req: SpeakRequest) {
        this.provider.prefetch?.(req);
    }
    pause() {
        this.provider.pause();
    }
    resume() {
        this.provider.resume();
    }
    cancel() {
        this.web?.cancel();
        this.gemini.cancel();
    }
}

export const tts = new TtsHub();
