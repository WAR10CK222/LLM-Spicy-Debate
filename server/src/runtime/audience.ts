import type { AudienceAction, Side } from "@court/shared";

interface Tally {
    tomato: Record<Side, number>;
    cheer: Record<Side, number>;
    laugh: Record<Side, number>;
    fire: Record<Side, number>;
    objection: boolean;
}

const empty = (): Tally => ({
    tomato: { for: 0, against: 0 },
    cheer: { for: 0, against: 0 },
    laugh: { for: 0, against: 0 },
    fire: { for: 0, against: 0 },
    objection: false,
});

export interface AudienceDigest {
    /** Human-readable note for the next speaker's prompt, or null if the gallery was quiet. */
    note: string | null;
    /** Crowd favour shift caused by spectators, + toward FOR. */
    favorShift: number;
    tally: Tally;
}

/** Collects spectator actions between speeches. Drained by the graph before each turn. */
export class AudienceInbox {
    private tallies = new Map<string, Tally>();
    private pendingObjection = new Set<string>();

    push(debateId: string, kind: AudienceAction, target: Side | null) {
        if (kind === "objection") {
            this.pendingObjection.add(debateId);
            return;
        }
        if (!target) return;
        const t = this.tallies.get(debateId) ?? empty();
        t[kind][target]++;
        this.tallies.set(debateId, t);
    }

    /** True once per spectator objection; the referee must rule on it. */
    takeObjection(debateId: string): boolean {
        return this.pendingObjection.delete(debateId);
    }

    drain(debateId: string, speaker: Side): AudienceDigest {
        const t = this.tallies.get(debateId) ?? empty();
        this.tallies.delete(debateId);
        const opp: Side = speaker === "for" ? "against" : "for";
        const parts: string[] = [];
        const say = (n: number, what: string) => n > 0 && parts.push(`${n} ${what}`);
        say(t.tomato[speaker], `tomato${t.tomato[speaker] > 1 ? "es" : ""} thrown at YOU`);
        say(t.cheer[speaker], `cheer${t.cheer[speaker] > 1 ? "s" : ""} for you`);
        say(t.fire[speaker] + t.laugh[speaker], "laughs/🔥 at your last line");
        say(t.tomato[opp], `tomato${t.tomato[opp] > 1 ? "es" : ""} thrown at your opponent`);
        say(t.cheer[opp] + t.fire[opp] + t.laugh[opp], "cheers/laughs for your opponent");
        const sideScore = (s: Side) => 2 * t.cheer[s] + t.fire[s] + t.laugh[s] - 2 * t.tomato[s];
        return {
            note: parts.length ? `Since the last speech the gallery gave: ${parts.join(", ")}.` : null,
            favorShift: Math.max(-15, Math.min(15, sideScore("for") - sideScore("against"))),
            tally: t,
        };
    }

    forget(debateId: string) {
        this.tallies.delete(debateId);
        this.pendingObjection.delete(debateId);
    }
}
