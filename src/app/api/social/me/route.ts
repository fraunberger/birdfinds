import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ clerkUserId: null, linkedUserId: null, profile: null });
    }

    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (!linkedUserId) {
      return NextResponse.json({ clerkUserId: userId, linkedUserId: null, profile: null });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("*")
      .eq("id", linkedUserId)
      .maybeSingle();

    return NextResponse.json({
      clerkUserId: userId,
      linkedUserId,
      profile: profile || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: message,
        hint: "If this mentions clerk_user_links, run data/sql/create_clerk_user_links.sql in Supabase SQL Editor.",
      },
      { status: 500 }
    );
  }
}
