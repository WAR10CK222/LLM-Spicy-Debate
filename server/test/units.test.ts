import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { updateElo } from "../src/db/elo.js";
import { classify } from "../src/llm/errors.js";
import { GeminiLlm, toGeminiSchema } from "../src/llm/client.js";
import { Pacer } from "../src/runtime/pacer.js";
import type { DebateEvent } from "@court/shared";

describe("elo", () => {
    it("moves equal ratings by K/2 and conserves points", () => {
        expect(updateElo(1200, 1200, 1)).toEqual([1216, 1184]);
        expect(updateElo(1200, 1200, 0.5)).toEqual([1200, 1200]);
        const [a, b] = updateElo(1400, 1200, 0);
        expect(a + b).toBe(2600);
        expect(a).toBeLessThan(1400);
    });
});

describe("classify", () => {
    it("maps API failures to retry decisions", () => {
        expect(classify({ status: 503 }).kind).toBe("transient");
        expect(classify({ status: 429, headers: { "retry-after": "7" } })).toMatchObject({ kind: "transient", retryAfterMs: 7000 });
        expect(classify({ status: 404 }).kind).toBe("model");
        expect(classify({ status: 400, body: JSON.stringify([{ error: { message: "API key not valid", details: [{ reason: "API_KEY_INVALID" }] } }]) }).kind).toBe("fatal");
        expect(classify(new TypeError("fetch failed")).kind).toBe("transient");
    });
});

describe("GeminiLlm retry, fallback and repair", () => {
    const schema = z.object({ joke: z.string(), spice: z.number().int() });
    const base = { task: "debater_turn" as const, tier: "main" as const, schema, system: "s", prompt: "p", mock: { topic: "t", seed: "s" } };
    const make = () => new GeminiLlm({ apiKey: "x", models: { main: ["model-a", "model-b"], lite: ["lite"] }, rpm: 0, timeoutMs: 1000, sleep: async () => {} });

    it("falls back to the next model after repeated 503s", async () => {
        const llm = make();
        const call = vi.fn(async (model: string) => {
            if (model === "model-a") throw { status: 503, message: "overloaded" };
            return { output_text: JSON.stringify({ joke: "ha", spice: 5 }) };
        });
        (llm as unknown as { callOnce: typeof call }).callOnce = call;
        const res = await llm.structured(base);
        expect(res).toMatchObject({ model: "model-b", data: { joke: "ha", spice: 5 } });
        expect(call.mock.calls.filter(([m]) => m === "model-a")).toHaveLength(3);
    });

    it("repairs invalid output once with the validator's message", async () => {
        const llm = make();
        const prompts: string[] = [];
        const call = vi.fn(async (_m: string, _r: unknown, prompt: string) => {
            prompts.push(prompt);
            return { output_text: prompts.length === 1 ? JSON.stringify({ joke: 1 }) : JSON.stringify({ joke: "ok", spice: 2 }) };
        });
        (llm as unknown as { callOnce: typeof call }).callOnce = call;
        const res = await llm.structured(base);
        expect(res.data.joke).toBe("ok");
        expect(prompts[1]).toMatch(/rejected by the validator/);
    });

    it("gives up immediately on a fatal error", async () => {
        const llm = make();
        const call = vi.fn(async () => { throw { status: 403, message: "denied" }; });
        (llm as unknown as { callOnce: typeof call }).callOnce = call;
        await expect(llm.structured(base)).rejects.toMatchObject({ kind: "fatal" });
        expect(call).toHaveBeenCalledTimes(1);
    });

    it("produces a Gemini-friendly JSON schema", () => {
        const js = toGeminiSchema(schema);
        expect(js).not.toHaveProperty("$schema");
        expect(JSON.stringify(js)).not.toContain("additionalProperties");
        expect(js).toMatchObject({ type: "object", required: ["joke", "spice"] });
    });
});

describe("pacer", () => {
    const speech = (seq: number) => ({ debateId: "d", seq, ts: 0, type: "speech" }) as unknown as DebateEvent;

    it("holds generation until the viewer catches up, and while paused or unwatched", async () => {
        const pacer = new Pacer(1);
        let passed = false;
        const wait = () => { passed = false; void pacer.gate("d").then(() => (passed = true)); };

        wait();
        await Promise.resolve();
        expect(passed).toBe(false); // nobody watching
        pacer.viewerJoined("d");
        await Promise.resolve();
        expect(passed).toBe(true);

        pacer.track(speech(1));
        pacer.track(speech(2));
        wait();
        await Promise.resolve();
        expect(passed).toBe(false); // two unplayed beats > lookahead 1
        pacer.ack("d", 1);
        await Promise.resolve();
        expect(passed).toBe(true);

        pacer.setPaused("d", true);
        wait();
        await Promise.resolve();
        expect(passed).toBe(false);
        pacer.setPaused("d", false);
        await Promise.resolve();
        expect(passed).toBe(true);
    });
});
