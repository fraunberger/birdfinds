import { store } from "@/lib/election/store";
import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();
    const { groupCodeword } = body;

    const election = await store.getElection(id);
    if (!election) return NextResponse.json({ error: "Not Found" }, { status: 404 });

    // Validate codeword for admin actions
    if (election.groupCodeword !== groupCodeword) {
        return NextResponse.json({ error: "Invalid Codeword" }, { status: 403 });
    }

    await store.startVoting(id);
    return NextResponse.json({ success: true });
}
