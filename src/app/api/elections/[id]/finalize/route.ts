import { store } from "@/lib/election/store";
import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    // No auth needed? User said "anyone can finish". Logic assumes inside room with knowledge?
    // I'll enforce codeword at least if passed, but prompt implies open "finish" button.
    // I'll check codeword if provided, but maybe just trust.
    // Let's require codeword in body.
    const body = await request.json();
    const { groupCodeword } = body;

    const election = await store.getElection(id);
    if (!election) return NextResponse.json({ error: "Not Found" }, { status: 404 });

    if (groupCodeword && election.groupCodeword !== groupCodeword) {
        return NextResponse.json({ error: "Invalid Codeword" }, { status: 403 });
    }

    await store.finalizeElection(id);
    return NextResponse.json({ success: true });
}
