// src/index.ts
import dotenv from 'dotenv';
dotenv.config();

import say from 'say';
import { app, debateEmitter } from './graph.js';
import { logger } from './logger.js';
import { DEBATE_PARTICIPANTS, JUDGE_CONFIG } from './config.js';

// --- Event Handlers for Real-time Output ---

// Utility to handle printing and TTS

// TTS Queue Implementation
type TTSRequest = { speaker: string; message: string; ttsOptions: any };
const ttsQueue: TTSRequest[] = [];
let ttsActive = false;

function processTTSQueue() {
    if (ttsActive || ttsQueue.length === 0) return;
    ttsActive = true;
    const { speaker, message, ttsOptions } = ttsQueue.shift()!;
    console.log(`\n--- ${speaker} ---\n${message}`);
    say.speak(message, ttsOptions?.voice, ttsOptions?.speed ?? 1.0, (err: any) => {
        if (err) {
            logger.error('Error during TTS:', err);
        }
        ttsActive = false;
        processTTSQueue();
    });
}

function handleOutput(speaker: string, message: string, ttsOptions: any) {
    ttsQueue.push({ speaker, message, ttsOptions });
    processTTSQueue();
}

// say.getInstalledVoices(console.log);

debateEmitter.on('turn', ({ speaker, message, ttsOptions }) => {
    handleOutput(speaker, message, ttsOptions);
});

debateEmitter.on('judgement', ({ speaker, message, ttsOptions }) => {
    handleOutput(speaker, message, ttsOptions);
});

// --- Main Application Logic ---

async function runDebate() {
    const debateTopic: string = "Did Donald Trump's tariff war ultimately strengthen or weaken the U.S. economy?" //"A twitter post with message: \"I like cold showers\" but in the image attached to the post shows that a hot shower was taken recently as there is precipitation on a bathroom glass wall.";

    console.log('=============================================');
    console.log(`||   STARTING LLM DEBATE ENGINE            ||`);
    console.log('=============================================');
    console.log(`Topic: ${debateTopic}\n`);

    try {
        const finalState = await app.invoke({ topic: debateTopic });

        console.log('\n=============================================');
        console.log('||   DEBATE CONCLUDED                      ||');
        console.log('=============================================');
        console.log("\nFinal Scores:", finalState.scores);
        console.log("Final Winner:", finalState.final_verdict!.finalWinner);
        console.log("Judge's Summary:", finalState.final_verdict!.summary);

    } catch (error) {
        logger.error("An error occurred during the debate:", error);
    }
}

runDebate();