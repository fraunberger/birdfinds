
import { Nomination, Vote } from "./types";

export function calculateIRV(nominations: Nomination[], votes: Vote[]): string | null {
    if (nominations.length === 0) return null;
    if (votes.length === 0) return null;

    let candidates = nominations.map(n => n.id);
    let activeVotes = votes.map(v => ({
        voter: v.voterName,
        rankings: v.rankings.filter(id => candidates.includes(id))
    }));

    while (candidates.length > 1) {
        // Count first preferences
        const counts: Record<string, number> = {};
        candidates.forEach(id => counts[id] = 0);

        let totalValidBallots = 0;
        for (const ballot of activeVotes) {
            if (ballot.rankings.length > 0) {
                const firstChoice = ballot.rankings[0];
                counts[firstChoice] = (counts[firstChoice] || 0) + 1;
                totalValidBallots++;
            }
        }

        if (totalValidBallots === 0) return null; // No one voted for remaining candidates

        // Check for majority
        for (const id of candidates) {
            if (counts[id] > totalValidBallots / 2) {
                return id; // Winner found
            }
        }

        // Find candidate(s) to eliminate (lowest score)
        let minVotes = totalValidBallots + 1;
        let toEliminate: string[] = [];

        for (const id of candidates) {
            if (counts[id] < minVotes) {
                minVotes = counts[id];
                toEliminate = [id];
            } else if (counts[id] === minVotes) {
                toEliminate.push(id);
            }
        }

        // Tie-breaker: If all remaining are tied, pick one arbitrarily or return null?
        // User wants "try hard to crown a winner".
        if (toEliminate.length === candidates.length) {
            // Everyone is tied. Return the first one (arbitrary tie break)
            return candidates[0];
        }

        // Eliminate
        // If multiple tied for last, we can eliminate all of them (bulk elimination) 
        // OR standard IRV rules say eliminate one by one (often by looking at previous rounds).
        // For simplicity, eliminate all tied absolute losers.

        candidates = candidates.filter(id => !toEliminate.includes(id));

        // Update ballots: remove eliminated candidates
        activeVotes.forEach(ballot => {
            ballot.rankings = ballot.rankings.filter(id => !toEliminate.includes(id));
        });
    }

    return candidates[0] || null;
}
