import { store } from "@/lib/election/store";
import { determineCondorcetWinner } from "@/lib/election/condorcet";
import { Election } from "@/lib/election/types";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, voteStartTime, groupCodeword, adminName, ballotVisibility } = body;
        const safeBallotVisibility = ballotVisibility === "open" ? "open" : "secret";

        if (!name || !voteStartTime || !groupCodeword || !adminName) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        const id = Math.random().toString(36).substring(2, 9); // Simple ID
        const election: Election = {
            id,
            name,
            groupCodeword,
            adminName,
            ballotVisibility: safeBallotVisibility,
            voteStartTime,
            participants: [],
            nominations: [],
            votes: [],
            createdAt: Date.now(),
        };

        await store.createElection(election);

        return NextResponse.json(election);
    } catch {
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

export async function GET() {
    const elections = await store.getAllElections();
    // Sort logic needs to happen here as adapter returns unsorted array usually
    elections.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json(elections.map(e => {
        let status = e.state || 'nomination';
        if (!e.state) {
            const now = Date.now();
            const endTime = e.voteStartTime + 10 * 60 * 1000;
            if (now >= e.voteStartTime) status = (now >= endTime) ? 'completed' : 'voting';
        }

        let winnerName: string | null = null;
        if (status === 'completed') {
            let winnerId = e.winner;
            if (!winnerId) {
                winnerId = determineCondorcetWinner(e.nominations, e.votes);
            }
            if (winnerId) {
                const nom = e.nominations.find(n => n.id === winnerId);
                winnerName = nom ? nom.restaurantName : 'Unknown';
            }
        }

        return {
            id: e.id,
            name: e.name,
            adminName: e.adminName,
            ballotVisibility: e.ballotVisibility || "secret",
            voteStartTime: e.voteStartTime,
            status,
            nominationCount: e.nominations.length,
            winnerName
        };
    }));
}
