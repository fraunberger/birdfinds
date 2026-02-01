import { Nomination, Vote } from "./types";

export function calculatePairwiseMatrix(nominations: Nomination[], votes: Vote[]) {
    const candidateIds = nominations.map(n => n.id);
    const pairwiseWins: Record<string, Record<string, number>> = {};

    // Initialize pairwise counts
    candidateIds.forEach(id1 => {
        pairwiseWins[id1] = {};
        candidateIds.forEach(id2 => {
            if (id1 !== id2) {
                pairwiseWins[id1][id2] = 0;
            }
        });
    });

    // Tally votes
    votes.forEach(vote => {
        // For every pair (A, B)
        for (let i = 0; i < candidateIds.length; i++) {
            const a = candidateIds[i];
            for (let j = 0; j < candidateIds.length; j++) {
                const b = candidateIds[j];
                if (a === b) continue;

                // Check if A is preferred over B
                const rankA = vote.rankings.indexOf(a);
                const rankB = vote.rankings.indexOf(b);

                const aIsRanked = rankA !== -1;
                const bIsRanked = rankB !== -1;

                if (aIsRanked && !bIsRanked) {
                    pairwiseWins[a][b]++;
                } else if (aIsRanked && bIsRanked && rankA < rankB) {
                    pairwiseWins[a][b]++;
                }
                // If neither ranked or B preferred, no point for A
            }
        }
    });

    return pairwiseWins;
}

export function determineCondorcetWinner(nominations: Nomination[], votes: Vote[]): string | null {
    const candidateIds = nominations.map(n => n.id);
    const pairwiseWins = calculatePairwiseMatrix(nominations, votes);

    // Find Winner
    for (const candidate of candidateIds) {
        let beatsAllOthers = true;
        for (const other of candidateIds) {
            if (candidate === other) continue;

            const winsOverOther = pairwiseWins[candidate][other];
            const lossesToOther = pairwiseWins[other][candidate];

            if (winsOverOther <= lossesToOther) {
                beatsAllOthers = false;
                break;
            }
        }
        if (beatsAllOthers) {
            return candidate;
        }
    }

    return null; // No Confirmed Condorcet Winner (Cycle or Tie)
}
