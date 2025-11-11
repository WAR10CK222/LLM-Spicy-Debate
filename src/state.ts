// src/state.ts
import { z } from 'zod';
import { DEBATE_PARTICIPANTS } from './config.js';

// Zod schema for generating initial arguments
export const argumentsSchema = z.object({
    arguments: z.array(z.string()).describe("An array of debate arguments/points, each as a string."),
});

// Zod schema for judging a single argument
export const argumentJudgementSchema = z.object({
    winnerName: z.string().describe("The name of the participant who won the argument."),
    justification: z.string().describe("A brief, neutral justification for the decision."),
});

// Zod schema for the final verdict
export const finalVerdictSchema = z.object({
    finalWinner: z.string().describe("The name of the overall debate winner."),
    summary: z.string().describe("A summary of the entire debate and the reasoning for the final decision."),
});

// The main state object that will be passed between graph nodes
export interface DebateState {
    topic: string;
    participants: typeof DEBATE_PARTICIPANTS;
    scores: Record<string, number>;

    // Tracks the flow
    arguments: string[];
    current_argument_index: number;
    turn_count: number;
    current_speaker_index: number;

    // History and logs
    current_dialogue_history: string[];
    full_log: string[]; // A log of all major events and statements

    // Final result
    final_verdict?: z.infer<typeof finalVerdictSchema>;
}