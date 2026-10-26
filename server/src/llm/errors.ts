export type LlmErrorKind =
    /** Worth retrying the same model after a back-off (429, 5xx, network, timeout). */
    | "transient"
    /** The model rejected the request or doesn't exist; try the next model in the chain. */
    | "model"
    /** Nothing will fix this without a human (bad API key, permission, billing). */
    | "fatal"
    /** The output didn't match the schema even after a repair attempt. */
    | "invalid_output";

export class LlmError extends Error {
    constructor(
        readonly kind: LlmErrorKind,
        message: string,
        readonly status?: number,
        readonly retryAfterMs?: number,
    ) {
        super(message);
        this.name = "LlmError";
    }
}

interface RawApiError {
    status?: number;
    statusCode?: number;
    code?: string | number;
    body?: unknown;
    message?: string;
    name?: string;
    headers?: Record<string, string> | Headers;
}

function bodyDetails(body: unknown): { message?: string; reason?: string; retryDelay?: string } {
    try {
        const parsed = typeof body === "string" ? JSON.parse(body) : body;
        const err = (Array.isArray(parsed) ? parsed[0] : parsed)?.error;
        if (!err) return {};
        const details: Array<Record<string, unknown>> = err.details ?? [];
        return {
            message: err.message,
            reason: details.find((d) => typeof d.reason === "string")?.reason as string | undefined,
            retryDelay: details.find((d) => typeof d.retryDelay === "string")?.retryDelay as string | undefined,
        };
    } catch {
        return {};
    }
}

function header(headers: RawApiError["headers"], name: string): string | undefined {
    if (!headers) return undefined;
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) ?? undefined;
    return (headers as Record<string, string>)[name];
}

/** Maps whatever the SDK / fetch threw into an LlmError with a retry decision. */
export function classify(e: unknown): LlmError {
    if (e instanceof LlmError) return e;
    const err = (e ?? {}) as RawApiError;
    const status = err.status ?? err.statusCode ?? (typeof err.code === "number" ? err.code : undefined);
    const details = bodyDetails(err.body);
    const message = details.message ?? err.message ?? String(e);

    const retryAfterSec = Number(header(err.headers, "retry-after"));
    const retryAfterMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : details.retryDelay ? parseFloat(details.retryDelay) * 1000 : undefined;

    if (details.reason === "API_KEY_INVALID" || status === 401 || status === 403) {
        return new LlmError("fatal", `Gemini rejected the API key or permissions: ${message}`, status);
    }
    if (status === 429 || (status !== undefined && status >= 500)) {
        return new LlmError("transient", message, status, retryAfterMs);
    }
    if (status === 400 || status === 404) return new LlmError("model", message, status);

    const name = err.name ?? "";
    if (/abort|timeout|connection|network|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(`${name} ${message} ${err.code ?? ""}`)) {
        return new LlmError("transient", message);
    }
    return new LlmError("transient", message, status);
}
