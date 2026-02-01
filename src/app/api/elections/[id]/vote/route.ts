import { store } from "@/lib/election/store";
import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();
    const { voterName, rankings, groupCodeword } = body;

    const election = await store.getElection(id);
    if (!election) return NextResponse.json({ error: "Not Found" }, { status: 404 });

    if (election.groupCodeword !== groupCodeword) {
        return NextResponse.json({ error: "Invalid Codeword" }, { status: 403 });
    }

    // Check timing
    if (Date.now() < election.voteStartTime) {
        return NextResponse.json({ error: "Voting Has Not Started" }, { status: 400 });
    }

    // Allow voting even if technically "ended" by time, usually good UX to have a grace period or strict cutoff.
    // The prompt says "10 minutes". I'll enforce it strictly or softly?
    // "Vote opens for 10 minutes".
    const endsAt = election.voteStartTime + 10 * 60 * 1000;
    if (Date.now() > endsAt) {
        return NextResponse.json({ error: "Voting Closed" }, { status: 400 });
    }

    const vote = {
        voterName,
        rankings // Array of nomination IDs
    };

    await store.addVote(id, vote);

    return NextResponse.json({ success: true });
}
