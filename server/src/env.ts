import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const SERVER_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const REPO_ROOT = path.resolve(SERVER_ROOT, "..");

dotenv.config({ path: path.join(REPO_ROOT, ".env"), quiet: true });

const list = (value: string | undefined, fallback: string[]) =>
    value ? value.split(",").map((s) => s.trim()).filter(Boolean) : fallback;

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const mock = process.argv.includes("--mock") || process.env.LLM_MODE === "mock";

export const env = {
    port: Number(process.env.PORT ?? 4310),
    mock,
    apiKey,
    /** First entry is preferred; the rest are fallbacks used when a model keeps failing. */
    models: {
        main: list(process.env.LLM_MODELS_MAIN, ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]),
        lite: list(process.env.LLM_MODELS_LITE, ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]),
    },
    rpm: Number(process.env.LLM_RPM ?? 8),
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 45_000),
    ttsModel: process.env.TTS_MODEL ?? "gemini-3.8-flash-lite-tts",
    geminiTts: !mock && !!apiKey && process.env.GEMINI_TTS !== "off",
    grounding: process.env.GROUNDING === "on",
    dataDir: path.resolve(SERVER_ROOT, process.env.DATA_DIR ?? "data"),
    /** How many unplayed "beats" the server may generate ahead of the browser. */
    lookahead: Number(process.env.LOOKAHEAD ?? 1),
};
