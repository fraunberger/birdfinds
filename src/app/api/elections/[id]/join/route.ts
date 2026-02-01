import { store } from "@/lib/election/store";
import { NextResponse } from "next/server";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { name, groupCodeword } = body;

        const election = store.getElection(id);
        if (!election) return NextResponse.json({ error: "Not Found" }, { status: 404 });

        if (election.groupCodeword !== groupCodeword) {
            return NextResponse.json({ error: "Invalid Codeword" }, { status: 403 });
        }

        const success = store.addParticipant(id, name);
        if (!success) {
            return NextResponse.json({ error: "Name already taken" }, { status: 409 });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Internal Error" }, { status: 500 });
    }
}
