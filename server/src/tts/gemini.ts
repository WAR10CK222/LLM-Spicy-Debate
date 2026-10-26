import { GoogleGenAI } from "@google/genai";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { classify } from "../llm/errors.js";
import { RateLimiter } from "../llm/rateLimit.js";
import { logger } from "../logger.js";

/** Wraps raw 16-bit little-endian PCM in a WAV header. */
export function pcmToWav(pcm: Buffer, sampleRate = 24_000, channels = 1): Buffer {
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * channels * 2;
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(channels * 2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

/** Expressive voices for the lawyers via Gemini TTS, cached on disk so replays cost nothing. */
export class GeminiTts {
    private ai: GoogleGenAI;
    private limiter = new RateLimiter(10);
    private inflight = new Map<string, Promise<Buffer>>();

    constructor(apiKey: string, private model: string, private cacheDir: string) {
        this.ai = new GoogleGenAI({ apiKey });
    }

    async synth(text: string, voice: string, style: string): Promise<Buffer> {
        const key = createHash("sha1").update(`${this.model}|${voice}|${style}|${text}`).digest("hex");
        const file = path.join(this.cacheDir, `${key}.wav`);
        try {
            return await fs.readFile(file);
        } catch { /* not cached yet */ }
        let job = this.inflight.get(key);
        if (!job) {
            job = this.generate(text, voice, style)
                .then(async (wav) => {
                    await fs.mkdir(this.cacheDir, { recursive: true });
                    await fs.writeFile(file, wav);
                    return wav;
                })
                .finally(() => this.inflight.delete(key));
            this.inflight.set(key, job);
        }
        return job;
    }

    private async generate(text: string, voice: string, style: string): Promise<Buffer> {
        await this.limiter.acquire();
        const started = Date.now();
        try {
            const res = await this.ai.interactions.create({
                model: this.model,
                input: [{ type: "text", text, annotations: style ? [{ type: "speech_metadata", style }] : undefined }],
                response_format: { type: "audio", mime_type: "audio/wav" },
                generation_config: { speech_config: [{ voice }] },
                store: false,
            }, { timeout: 60_000, maxRetries: 1 });
            const audio = res.output_audio;
            if (!audio?.data) throw new Error("TTS returned no audio");
            const bytes = Buffer.from(audio.data, "base64");
            logger.info(`tts ${voice} ${text.length} chars in ${Date.now() - started}ms`);
            const isWav = bytes.subarray(0, 4).toString("ascii") === "RIFF";
            return isWav ? bytes : pcmToWav(bytes, audio.sample_rate ?? 24_000, audio.channels ?? 1);
        } catch (e) {
            throw classify(e);
        }
    }
}
