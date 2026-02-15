import { store } from "@/lib/election/store";
import { calculatePairwiseMatrix, determineCondorcetWinner } from "@/lib/election/condorcet";
import { NextResponse } from "next/server";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const election = await store.getElection(id);

    if (!election) {
        return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const now = Date.now();
    const votingEndsAt = election.voteStartTime + 10 * 60 * 1000;

    let status = election.state || 'nomination';
    let winner: string | null = election.winner || null;
    const ballotVisibility = election.ballotVisibility || "secret";

    if (!election.state) {
        if (now >= election.voteStartTime) {
            status = 'voting';
        }
        if (now >= votingEndsAt) {
            status = 'completed';
        }
    }

    // Check Condorcet if completed
    // Check Condorcet if completed
    let matrix = null;
    if (status === 'completed') {
        if (!winner) {
            winner = determineCondorcetWinner(election.nominations, election.votes);
        }
        if (ballotVisibility === "open") {
            matrix = calculatePairwiseMatrix(election.nominations, election.votes);
        }
    }

    const shouldHideRankings = ballotVisibility === "secret" && status === "completed";
    const safeVotes = shouldHideRankings
        ? election.votes.map((vote) => ({ ...vote, rankings: [] }))
        : election.votes;
    const ballots = status === "completed" && ballotVisibility === "open"
        ? election.votes.map((vote) => ({
            voterName: vote.voterName,
            rankings: vote.rankings.map((nominationId) => {
                const nomination = election.nominations.find((item) => item.id === nominationId);
                return {
                    nominationId,
                    restaurantName: nomination?.restaurantName || "Unknown",
                };
            }),
        }))
        : null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { groupCodeword: _pw, votes: _votes, ...safeElection } = election;

    return NextResponse.json({
        ...safeElection,
        ballotVisibility,
        votes: safeVotes,
        status,
        winner,
        ballots,
        matrix,
        votingEndsAt
    });
}
