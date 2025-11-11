// src/config.ts
export const DEBATE_PARTICIPANTS = [
    {
        name: "Eleonora",
        stance: "FOR the topic, arguing with passion, logic, and citing potential future benefits.",
        model: "gemini-2.5-flash",
        ttsOptions: { voice: "Microsoft Zira Desktop" } // Example voice for node-say
    },
    {
        name: "Marcus",
        stance: "AGAINST the topic, arguing with pragmatism, caution, and pointing out potential risks.",
        model: "gemini-2.5-flash",
        ttsOptions: { voice: "Microsoft David Desktop" } // Example voice for node-say
    },
];

export const JUDGE_CONFIG = {
    name: "Judge Athena",
    model: "gemini-2.5-flash",
    ttsOptions: { voice: "Microsoft Hazel Desktop" }
};

export const DEBATE_RULES = {
    max_arguments: 2, // Using 2 for a quicker demo, can be set to 5
    max_turns_per_argument: 4, // Using 4 for a quicker demo, can be set to 10
};