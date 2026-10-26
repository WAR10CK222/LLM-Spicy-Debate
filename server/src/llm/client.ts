import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { logger } from "../logger.js";
import { classify, LlmError } from "./errors.js";
import { RateLimiter } from "./rateLimit.js";
import type { Llm, StructuredRequest, StructuredResult } from "./types.js";

export interface GeminiOptions {
    apiKey: string;
    models: { main: string[]; lite: string[] };
    rpm: number;
    timeoutMs: number;
    /** Attempts per model on transient errors before falling back to the next model. */
    attemptsPerModel?: number;
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Gemini doesn't accept every JSON Schema keyword; keep the useful subset. */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
    const strip = (node: unknown): unknown => {
        if (Array.isArray(node)) return node.map(strip);
        if (!node || typeof node !== "object") return node;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node)) {
            if (k === "$schema" || k === "additionalProperties" || k === "default" || k === "$id") continue;
            out[k] = strip(v);
        }
        return out;
    };
    return strip(z.toJSONSchema(schema, { io: "output", unrepresentable: "any" })) as Record<string, unknown>;
}

/** Walks the raw interaction to collect any URL citations (from Google Search grounding). */
function collectCitations(node: unknown, out = new Map<string, string>()): Map<string, string> {
    if (Array.isArray(node)) node.forEach((n) => collectCitations(n, out));
    else if (node && typeof node === "object") {
        const o = node as Record<string, unknown>;
        if (o.type === "url_citation" && typeof o.url === "string") out.set(o.url, (o.title as string) || o.url);
        Object.values(o).forEach((v) => collectCitations(v, out));
    }
    return out;
}

function extractJson(text: string): unknown {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    return JSON.parse(trimmed);
}

export class GeminiLlm implements Llm {
    private ai: GoogleGenAI;
    private limiter: RateLimiter;
    private sleep: (ms: number) => Promise<void>;
    readonly calls = { total: 0, failed: 0, byModel: {} as Record<string, number> };

    constructor(private opts: GeminiOptions) {
        this.ai = new GoogleGenAI({ apiKey: opts.apiKey });
        this.limiter = new RateLimiter(opts.rpm);
        this.sleep = opts.sleep ?? defaultSleep;
    }

    // No `safety_settings` here: the Gemini API rejects that parameter (it is Enterprise-only), so the API's
    // default safety filters apply, on top of the house rules in every prompt.
    private async callOnce(model: string, req: StructuredRequest<unknown>, prompt: string) {
        await this.limiter.acquire();
        this.calls.total++;
        this.calls.byModel[model] = (this.calls.byModel[model] ?? 0) + 1;
        const started = Date.now();
        const res = await this.ai.interactions.create({
            model,
            system_instruction: req.system,
            input: prompt,
            response_format: { type: "text", mime_type: "application/json", schema: toGeminiSchema(req.schema) },
            generation_config: { temperature: req.temperature ?? 0.8, thinking_level: req.tier === "lite" ? "minimal" : "low" },
            tools: req.grounded ? [{ type: "google_search" }] : undefined,
            store: false,
        }, { timeout: this.opts.timeoutMs, maxRetries: 0, signal: req.signal });
        logger.info(`llm ${req.task} via ${model} in ${Date.now() - started}ms`);
        return res;
    }

    async structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        const chain = this.opts.models[req.tier];
        const attempts = this.opts.attemptsPerModel ?? 3;
        let last: LlmError = new LlmError("transient", "no model attempted");

        for (const model of chain) {
            let prompt = req.prompt;
            let repaired = false;
            for (let attempt = 1; attempt <= attempts; attempt++) {
                if (req.signal?.aborted) throw new LlmError("transient", "aborted");
                try {
                    const res = await this.callOnce(model, req as StructuredRequest<unknown>, prompt);
                    const text = res.output_text ?? "";
                    let parsed: z.ZodSafeParseResult<T>;
                    try {
                        parsed = req.schema.safeParse(extractJson(text));
                    } catch (jsonErr) {
                        parsed = { success: false, error: new z.ZodError([{ code: "custom", path: [], message: `not JSON: ${String(jsonErr)}`, input: text }]) } as z.ZodSafeParseResult<T>;
                    }
                    if (parsed.success) {
                        const sources = req.grounded ? [...collectCitations(res)].map(([url, title]) => ({ url, title })) : [];
                        return { data: parsed.data, model, sources };
                    }
                    if (repaired) throw new LlmError("invalid_output", z.prettifyError(parsed.error));
                    // One repair round-trip: show the model exactly what was wrong.
                    repaired = true;
                    attempt--;
                    prompt = `${req.prompt}\n\nYour previous reply was rejected by the validator:\n${z.prettifyError(parsed.error)}\nReply again with JSON that matches the schema exactly.`;
                    logger.warn(`llm ${req.task} via ${model}: invalid output, repairing`);
                } catch (e) {
                    last = classify(e);
                    this.calls.failed++;
                    logger.warn(`llm ${req.task} via ${model} attempt ${attempt} failed (${last.kind}${last.status ? " " + last.status : ""}): ${last.message.slice(0, 200)}`);
                    if (last.kind === "fatal") throw last;
                    if (last.kind !== "transient") break; // next model
                    if (attempt < attempts) {
                        const backoff = Math.min(30_000, last.retryAfterMs ?? 1000 * 2 ** (attempt - 1) * (2 + Math.random()));
                        await this.sleep(backoff);
                    }
                }
            }
        }
        throw last;
    }
}
