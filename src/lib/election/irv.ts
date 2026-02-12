
import { Nomination, Vote } from "./types";

export interface IRVResult {
    winnerId: string | null;
    tieBroken: boolean;
    winnerVoteTime?: number;
}

export function calculateIRV(nominations: Nomination[], votes: Vote[]): IRVResult {
    if (nominations.length === 0) return { winnerId: null, tieBroken: false };
    if (votes.length === 0) return { winnerId: null, tieBroken: false };

    let candidates = nominations.map(n => n.id);

    // Sort candidates by earliest #1 vote initially to handle "perfect" tie from start
    const getEarliestFirstVote = (candidateId: string): number => {
        const firstVotes = votes.filter(v => v.rankings[0] === candidateId);
        if (firstVotes.length === 0) return Infinity;
        return Math.min(...firstVotes.map(v => v.createdAt));
    };

    while (candidates.length > 1) {
        const activeVotes = votes.map(v => ({
            rankings: v.rankings.filter(id => candidates.includes(id))
        })).filter(v => v.rankings.length > 0);

        if (activeVotes.length === 0) break;

        const counts: Record<string, number> = {};
        candidates.forEach(id => counts[id] = 0);

        activeVotes.forEach(ballot => {
            const firstChoice = ballot.rankings[0];
            counts[firstChoice]++;
        });

        const totalVotes = activeVotes.length;

        // Check for majority
        for (const id of candidates) {
            if (counts[id] > totalVotes / 2) {
                return { winnerId: id, tieBroken: false };
            }
        }

        // Elimination
        const minVotes = Math.min(...candidates.map(id => counts[id]));
        const losers = candidates.filter(id => counts[id] === minVotes);

        if (losers.length === candidates.length) {
            // Perfect tie among all remaining - use the requested tie-breaker
            // "The first person who submitted one of the tied options at number 1 that one wins"
            const tieBreaker = candidates.map(id => ({ id, time: getEarliestFirstVote(id) }))
                .sort((a, b) => a.time - b.time);
            return { winnerId: tieBreaker[0].id, tieBroken: true, winnerVoteTime: tieBreaker[0].time };
        }

        // If multiple losers, eliminate the one whose EARLIEST #1 vote was latest 
        // (to encourage early voting even for second-tier choices)
        // Standard IRV usually eliminates all bottom-tied or picks one. 
        // We will pick the "most late" one to eliminate.
        if (losers.length > 1) {
            const loserTimes = losers.map(id => ({ id, time: getEarliestFirstVote(id) }))
                .sort((a, b) => b.time - a.time); // Latest time first (to eliminate)
            candidates = candidates.filter(id => id !== loserTimes[0].id);
        } else {
            candidates = candidates.filter(id => id !== losers[0]);
        }
    }

    return { winnerId: candidates[0] || null, tieBroken: false };
}
