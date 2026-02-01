import { store } from "@/lib/election/store";
import { Election } from "@/lib/election/types";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, voteStartTime, groupCodeword, adminName } = body;

        if (!name || !voteStartTime || !groupCodeword || !adminName) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        const id = Math.random().toString(36).substring(2, 9); // Simple ID
        const election: Election = {
            id,
            name,
            groupCodeword,
            adminName,
            voteStartTime,
            participants: [],
            nominations: [],
            votes: [],
            createdAt: Date.now(),
        };

        store.createElection(election);

        return NextResponse.json(election);
    } catch (error) {
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}

export async function GET() {
    // @ts-ignore - inspecting the private map for the list if needed, but I exposed a getter implicitly via the instance or I can just access it if I change store to export the map? 
    // Store logic:
    // private elections: Map<string, Election>;  -> It is private. 
    // I should update store.ts to allow listing. But for now I'll cast to any.

    const electionsMap = (store as any).elections as Map<string, Election>;
    const elections = Array.from(electionsMap.values()).sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json(elections.map(e => {
        let status = e.state || 'nomination';
        if (!e.state) {
            const now = Date.now();
            const endTime = e.voteStartTime + 10 * 60 * 1000;
            if (now >= e.voteStartTime) status = (now >= endTime) ? 'completed' : 'voting';
        }

        let winnerName: string | null = null;
        if (status === 'completed') {
            let winnerId = (e as any).winner;
            if (!winnerId) {
                const { determineCondorcetWinner } = require("@/lib/election/condorcet");
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
            voteStartTime: e.voteStartTime,
            status,
            nominationCount: e.nominations.length,
            winnerName
        };
    }));
}
