import type { z } from "zod";
import type { MockContext } from "./mock.js";

export type LlmTask = "frame_case" | "debater_turn" | "courtroom_reaction" | "rule_count" | "verdict" | "case_brief";

export interface StructuredRequest<T> {
    task: LlmTask;
    /** "main" for the lawyers and the judge, "lite" for the high-volume referee. */
    tier: "main" | "lite";
    schema: z.ZodType<T>;
    system: string;
    prompt: string;
    temperature?: number;
    grounded?: boolean;
    signal?: AbortSignal;
    /** Structured facts the offline mock uses to produce a plausible answer. */
    mock: MockContext;
}

export interface StructuredResult<T> {
    data: T;
    model: string;
    sources: { title: string; url: string }[];
}

export interface Llm {
    structured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}
