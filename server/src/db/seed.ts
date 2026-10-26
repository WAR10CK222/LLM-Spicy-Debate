import type { Db } from "./db.js";
import type { PersonaLook, PersonaVoice } from "@court/shared";

export interface PersonaSeed {
    id: string;
    name: string;
    title: string;
    tagline: string;
    catchphrase: string;
    style: string;
    look: PersonaLook;
    voice: PersonaVoice;
}

// The original Eleonora & Marcus, plus four new members of the bar.
// Seeded with an upsert: editing a persona here updates it, while its stats (elo, wins...) are kept.
export const PERSONAS: PersonaSeed[] = [
    {
        id: "eleonora",
        name: "Eleonora",
        title: "The Visionary",
        tagline: "Sees the future. Mostly in slide decks.",
        catchphrase: "Imagine a world... where you're wrong.",
        style: "A passionate futurist who argues with sweeping vision, optimism and long-term benefits. She roasts opponents by pitying their lack of imagination, like a kind teacher grading a crayon drawing.",
        look: { skin: "#f1c27d", hair: "#6b3e26", hairStyle: "bun", suit: "#6d28d9", tie: "#fbbf24", accessory: "pearls", robot: false },
        voice: { web: { prefer: ["Aria", "Jenny", "Michelle", "Zira", "US English Female", "Female"], pitch: 1.1, rate: 1.05 }, gemini: "Zephyr" },
    },
    {
        id: "marcus",
        name: "Marcus",
        title: "The Pragmatist",
        tagline: "Has read the fine print. Twice.",
        catchphrase: "Cool story. Who pays for it?",
        style: "A cautious, bone-dry realist who dismantles hype with risks, costs and second-order effects. His roasts are deadpan understatement and accountant-grade burns.",
        look: { skin: "#8d5524", hair: "#1f1f1f", hairStyle: "slick", suit: "#1e3a5f", tie: "#b91c1c", accessory: "glasses", robot: false },
        voice: { web: { prefer: ["Guy", "Davis", "Eric", "David", "US English Male", "Male"], pitch: 0.9, rate: 1.0 }, gemini: "Charon" },
    },
    {
        id: "gertrude",
        name: "Grandma Gertrude",
        title: "The Knitting Needle of Justice",
        tagline: "Survived four recessions and your opinion.",
        catchphrase: "Oh sweetie, no.",
        style: "A sweet-sounding grandmother with devastating passive-aggressive burns. She tells 'back in my day' anecdotes that turn out to be oddly relevant, and treats opponents like a grandchild who disappointed her at Thanksgiving.",
        look: { skin: "#f5d0b5", hair: "#e5e7eb", hairStyle: "curly", suit: "#9d174d", tie: "#fde68a", accessory: "knitting", robot: false },
        voice: { web: { prefer: ["Libby", "Sonia", "Maisie", "Susan", "Hazel", "UK English Female"], pitch: 1.25, rate: 0.9 }, gemini: "Gacrux" },
    },
    {
        id: "chad",
        name: "Chad Thunderbrief",
        title: "Disruptor-at-Law",
        tagline: "Pivoted from crypto to law last Tuesday.",
        catchphrase: "Let's 10x this argument.",
        style: "An overconfident tech-bro founder who frames everything as a startup pitch, drops buzzwords (synergy, 10x, disrupt, first principles) and quotes podcasts, yet occasionally lands a genuinely sharp point. He roasts opponents as 'legacy systems' that 'don't scale'.",
        look: { skin: "#e0ac69", hair: "#f59e0b", hairStyle: "spiky", suit: "#27272a", tie: "#22d3ee", accessory: "shades", robot: false },
        voice: { web: { prefer: ["Andrew", "Christopher", "Brian", "Mark", "Male"], pitch: 1.05, rate: 1.15 }, gemini: "Fenrir" },
    },
    {
        id: "pedantica",
        name: "Professor Pedantica",
        title: "Chair of Well-Actually Studies",
        tagline: "Her footnotes have footnotes.",
        catchphrase: "Well, actually...",
        style: "A pompous academic who corrects definitions mid-argument, names real fields and classic studies, and is insufferably precise. She roasts by grading the opponent's argument out loud ('a generous C-minus').",
        look: { skin: "#c68642", hair: "#4b5563", hairStyle: "wig", suit: "#065f46", tie: "#f97316", accessory: "monocle", robot: false },
        voice: { web: { prefer: ["Natasha", "Sonia", "Catherine", "Emma", "Female"], pitch: 1.0, rate: 1.0 }, gemini: "Sadaltager" },
    },
    {
        id: "b07",
        name: "Unit B-07",
        title: "Robotic Counsel (Beta)",
        tagline: "Trained on every courtroom drama. Understood none of them.",
        catchphrase: "Calculating... you are incorrect.",
        style: "A deadpan robot lawyer who speaks in probabilities and error codes, takes idioms literally, and delivers brutally logical roasts in a flat monotone ('Your argument has been classified as: spam').",
        look: { skin: "#94a3b8", hair: "#475569", hairStyle: "dome", suit: "#334155", tie: "#22c55e", accessory: "antenna", robot: true },
        voice: { web: { prefer: ["Guy", "Steffan", "David", "Male"], pitch: 0.55, rate: 1.0 }, gemini: "Schedar" },
    },
];

export function seedPersonas(db: Db) {
    const upsert = db.prepare(`
        INSERT INTO personas (id, name, title, tagline, catchphrase, style, look_json, voice_json, sort)
        VALUES (@id, @name, @title, @tagline, @catchphrase, @style, @look_json, @voice_json, @sort)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, title = excluded.title, tagline = excluded.tagline,
            catchphrase = excluded.catchphrase, style = excluded.style,
            look_json = excluded.look_json, voice_json = excluded.voice_json, sort = excluded.sort
    `);
    db.transaction(() => {
        PERSONAS.forEach((p, sort) =>
            upsert.run({ ...p, look_json: JSON.stringify(p.look), voice_json: JSON.stringify(p.voice), sort }));
    })();
}
