import dotenv from 'dotenv';
dotenv.config();

// src/graph.ts
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
// import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { logger } from "./logger.js";
import {
    argumentsSchema,
    argumentJudgementSchema,
    finalVerdictSchema,
} from "./state.js";
import { DEBATE_PARTICIPANTS, JUDGE_CONFIG, DEBATE_RULES } from "./config.js";
import { EventEmitter } from 'events';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HarmBlockThreshold, HarmCategory, TaskType } from "@google/generative-ai";

// Event Emitter for real-time handling
export const debateEmitter = new EventEmitter();

// Initialize LLMs
const judgeLlm = new ChatGoogleGenerativeAI({
    model: JUDGE_CONFIG.model,
    temperature: 0.5,
    maxRetries: 0,
    maxOutputTokens: 8192,
    safetySettings: [
        {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
        },
        {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
        }
    ],
    apiKey: process.env.GOOGLE_API_KEY
});
const participantLlmMap = {
    [DEBATE_PARTICIPANTS[0].model]: new ChatGoogleGenerativeAI({
        model: DEBATE_PARTICIPANTS[0].model,
        temperature: 0.7,
        maxRetries: 0,
        maxOutputTokens: 8192,
        safetySettings: [
            {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
            },
            {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
            }
        ],
        apiKey: process.env.GOOGLE_API_KEY
    }),
    [DEBATE_PARTICIPANTS[1].model]: new ChatGoogleGenerativeAI({
        model: DEBATE_PARTICIPANTS[1].model,
        temperature: 0.7,
        maxRetries: 0,
        maxOutputTokens: 8192,
        safetySettings: [
            {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
            },
            {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
            }
        ],
        apiKey: process.env.GOOGLE_API_KEY
    }),
};

// --- STATE ---
const StateAnnotation = Annotation.Root({
    topic: Annotation<string>,
    participants: Annotation<typeof DEBATE_PARTICIPANTS>,
    scores: Annotation<any>,
    arguments: Annotation<string[]>,
    current_argument_index: Annotation<number>,
    turn_count: Annotation<number>,
    current_speaker_index: Annotation<number>,
    current_dialogue_history: Annotation<string[]>,
    full_log: Annotation<string[]>,
    final_verdict: Annotation<z.infer<typeof finalVerdictSchema> | undefined>,
});

// --- GRAPH NODES ---

// 1. Initialize the debate state
async function initializeDebate(state: typeof StateAnnotation.State) {
    logger.info("Initializing debate state...");
    return {
        participants: DEBATE_PARTICIPANTS,
        scores: { [DEBATE_PARTICIPANTS[0].name]: 0, [DEBATE_PARTICIPANTS[1].name]: 0 },
        current_argument_index: 0,
        turn_count: 0,
        current_speaker_index: 0,
        current_dialogue_history: [],
        full_log: [`Debate Topic: ${state.topic}`],
    };
}

// 2. Judge generates the arguments to be debated
async function generateArgumentsNode(state: typeof StateAnnotation.State) {
    logger.info("Judge is generating arguments...");
    const structuredLlm = judgeLlm.withStructuredOutput(argumentsSchema);
    const prompt = `You are ${JUDGE_CONFIG.name}, a neutral and highly educated debate judge. 
  Based on the topic "${state.topic}", generate ${DEBATE_RULES.max_arguments} distinct, balanced, and debatable arguments.`;

    const { arguments: generatedArgs } = await structuredLlm.invoke(prompt);

    debateEmitter.emit('judgement', {
        speaker: JUDGE_CONFIG.name,
        message: `I have prepared ${generatedArgs.length} arguments for our debate. They are: \n- ${generatedArgs.join('\n- ')}`,
        ttsOptions: JUDGE_CONFIG.ttsOptions,
    });

    return { arguments: generatedArgs, full_log: [...state.full_log, `Arguments: ${generatedArgs.join(", ")}`] };
}

// 3. A participant generates a response
async function generateResponseNode(state: typeof StateAnnotation.State) {
    const { current_speaker_index, participants, topic, arguments: args, current_argument_index, current_dialogue_history } = state;
    const currentSpeaker = participants[current_speaker_index];
    const llm = participantLlmMap[currentSpeaker.model];
    const currentArgument = args[current_argument_index];

    logger.info(`Turn ${state.turn_count + 1}: ${currentSpeaker.name}'s turn to speak on "${currentArgument}"`);

    const prompt = `You are ${currentSpeaker.name}. Your stance is: ${currentSpeaker.stance}.
  The main debate topic is "${topic}".
  The current argument to debate is: "${currentArgument}".
  
  Dialogue History so far for this argument:
  ${current_dialogue_history.join("\n") || "This is the opening statement."}
  
  Your turn. Provide a concise, persuasive statement. Do not greet or introduce yourself. Just state your point.`;

    const response = await llm.invoke(prompt);
    const message = response.content as string;

    debateEmitter.emit('turn', {
        speaker: currentSpeaker.name,
        message,
        ttsOptions: currentSpeaker.ttsOptions
    });

    const newHistory = [...current_dialogue_history, `${currentSpeaker.name}: ${message}`];
    return {
        turn_count: state.turn_count + 1,
        current_speaker_index: (current_speaker_index + 1) % participants.length,
        current_dialogue_history: newHistory,
        full_log: [...state.full_log, `${currentSpeaker.name}: ${message}`]
    };
}

// 4. Judge evaluates a single argument
async function judgeArgumentNode(state: typeof StateAnnotation.State) {
    logger.info(`Judge is evaluating argument: "${state.arguments[state.current_argument_index]}"`);
    const structuredLlm = judgeLlm.withStructuredOutput(argumentJudgementSchema);
    const prompt = `You are ${JUDGE_CONFIG.name}, a neutral debate judge.
  The debate topic is "${state.topic}".
  The argument just concluded was: "${state.arguments[state.current_argument_index]}".
  
  Here is the full transcript for this argument:
  ${state.current_dialogue_history.join("\n")}
  
  Evaluate the transcript and decide who won THIS specific argument. Be objective.
  Your output must be in the specified JSON format.`;

    const { winnerName, justification } = await structuredLlm.invoke(prompt);

    const newScores = { ...state.scores };
    if (newScores[winnerName] !== undefined) {
        newScores[winnerName]++;
    }

    const message = `After careful consideration of the argument on "${state.arguments[state.current_argument_index]}", the winner is ${winnerName}. Justification: ${justification}`;
    debateEmitter.emit('judgement', {
        speaker: JUDGE_CONFIG.name,
        message,
        ttsOptions: JUDGE_CONFIG.ttsOptions,
    });

    return {
        scores: newScores,
        current_argument_index: state.current_argument_index + 1,
        turn_count: 0, // Reset for next argument
        current_dialogue_history: [], // Reset for next argument
        full_log: [...state.full_log, `JUDGEMENT: ${message}`]
    };
}

// 5. Judge provides the final summary
async function summarizeFinalResultsNode(state: typeof StateAnnotation.State) {
    logger.info("Judge is summarizing the final results.");
    const structuredLlm = judgeLlm.withStructuredOutput(finalVerdictSchema);
    const prompt = `You are ${JUDGE_CONFIG.name}. The debate on "${state.topic}" has concluded.
    The final scores are: ${JSON.stringify(state.scores)}.
    Here is the full log of the debate:
    ${state.full_log.join("\n\n")}

    Based on the scores and the overall quality of argumentation, declare a final winner and provide a summary of the entire debate.
    Your output must be in the specified JSON format.`;

    const final_verdict = await structuredLlm.invoke(prompt);

    debateEmitter.emit('judgement', {
        speaker: JUDGE_CONFIG.name,
        message: `The debate has concluded. The final winner is ${final_verdict.finalWinner}. ${final_verdict.summary}`,
        ttsOptions: JUDGE_CONFIG.ttsOptions,
    });

    return { final_verdict };
}


// --- CONDITIONAL EDGES ---

// Determines if the dialogue for the current argument should continue
function shouldContinueDialogue(state: typeof StateAnnotation.State): "generate_response" | "judge_argument" {
    logger.info(`Checking dialogue continuation. Turn: ${state.turn_count}/${DEBATE_RULES.max_turns_per_argument}`);
    if (state.turn_count < DEBATE_RULES.max_turns_per_argument) {
        return "generate_response";
    }
    return "judge_argument";
}

// Determines if the entire debate should continue to the next argument
function shouldContinueDebate(state: typeof StateAnnotation.State): "generate_response" | "summarize_final_results" {
    logger.info(`Checking debate continuation. Argument: ${state.current_argument_index}/${DEBATE_RULES.max_arguments}`);
    if (state.current_argument_index < DEBATE_RULES.max_arguments) {
        return "generate_response";
    }
    return "summarize_final_results";
}

// --- GRAPH ASSEMBLY ---

const workflow = new StateGraph(StateAnnotation)

    // Add nodes to the graph
    .addNode("initialize_debate", initializeDebate)
    .addNode("generate_arguments", generateArgumentsNode)
    .addNode("generate_response", generateResponseNode)
    .addNode("judge_argument", judgeArgumentNode)
    .addNode("summarize_final_results", summarizeFinalResultsNode)

    // Define the graph's flow (edges)
    .addEdge(START, "initialize_debate")
    .addEdge("initialize_debate", "generate_arguments")
    .addEdge("generate_arguments", "generate_response")

    .addConditionalEdges("generate_response", shouldContinueDialogue,
        ["generate_response", "judge_argument"])

    .addConditionalEdges("judge_argument", shouldContinueDebate,
        ["generate_response", "summarize_final_results"])

    .addEdge("summarize_final_results", END);

// Compile the graph into a runnable app
export const app = workflow.compile();