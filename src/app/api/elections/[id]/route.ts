import { store } from "@/lib/election/store";
import { determineCondorcetWinner } from "@/lib/election/condorcet";
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
    let winner: string | null = (election as any).winner || null;

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
        const { calculatePairwiseMatrix } = require("@/lib/election/condorcet");
        matrix = calculatePairwiseMatrix(election.nominations, election.votes);
    }

    return NextResponse.json({
        ...election,
        status,
        winner,
        matrix,
        votingEndsAt
    });
}
