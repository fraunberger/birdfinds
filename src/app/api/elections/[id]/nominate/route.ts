import { store } from "@/lib/election/store";
import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();
    const { nominatorName, restaurantName, groupCodeword } = body;

    const election = await store.getElection(id);
    if (!election) return NextResponse.json({ error: "Not Found" }, { status: 404 });

    if (election.groupCodeword !== groupCodeword) {
        return NextResponse.json({ error: "Invalid Codeword" }, { status: 403 });
    }

    // Check timing - allow during voting for write-ins
    // if (Date.now() >= election.voteStartTime) {
    //   return NextResponse.json({ error: "Nominations Closed" }, { status: 400 });
    // }

    const nomination = {
        id: Math.random().toString(36).substring(2, 9),
        nominatorName,
        restaurantName,
        isWriteIn: body.isWriteIn,
        metadata: body.metadata,
        createdAt: Date.now()
    };

    await store.addNomination(id, nomination);

    return NextResponse.json(nomination);
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();
    const { nominationId, requesterName, groupCodeword } = body;

    const election = await store.getElection(id);
    if (!election) return NextResponse.json({ error: "Not Found" }, { status: 404 });

    if (election.groupCodeword !== groupCodeword) {
        return NextResponse.json({ error: "Invalid Codeword" }, { status: 403 });
    }

    // Only the nominator or admin can cancel
    const nom = election.nominations.find(n => n.id === nominationId);
    if (!nom) return NextResponse.json({ error: "Nomination not found" }, { status: 404 });

    const isOwner = nom.nominatorName.toLowerCase() === requesterName.toLowerCase();
    const isAdmin = election.adminName.toLowerCase() === requesterName.toLowerCase();
    if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    await store.removeNomination(id, nominationId);
    return NextResponse.json({ success: true });
}
