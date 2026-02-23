import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";

const getAdminList = (envValue?: string) =>
  (envValue || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ clerkUserId: null, linkedUserId: null, profile: null, isAdmin: false, hasPublishedPost: false });
    }

    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (!linkedUserId) {
      const adminIds = getAdminList(process.env.SOCIAL_ADMIN_CLERK_IDS);
      return NextResponse.json({
        clerkUserId: userId,
        linkedUserId: null,
        profile: null,
        isAdmin: adminIds.includes(userId),
        hasPublishedPost: false,
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("*")
      .eq("id", linkedUserId)
      .maybeSingle();

    const { data: publishedStatuses } = await supabaseAdmin
      .from("social_statuses")
      .select("id")
      .eq("user_id", linkedUserId)
      .eq("published", true)
      .is("deleted_at", null)
      .limit(1);

    const adminClerkIds = getAdminList(process.env.SOCIAL_ADMIN_CLERK_IDS);
    const adminLinkedIds = getAdminList(process.env.SOCIAL_ADMIN_LINKED_IDS);
    const isAdmin = adminClerkIds.includes(userId) || adminLinkedIds.includes(linkedUserId);

    return NextResponse.json({
      clerkUserId: userId,
      linkedUserId,
      profile: profile || null,
      isAdmin,
      hasPublishedPost: Boolean(publishedStatuses?.length),
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
