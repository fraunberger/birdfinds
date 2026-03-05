import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";
import { getAdminList, isSocialAdmin } from "@/lib/social-prototype/admin-auth";

const SOCIAL_AUTH_DEBUG = process.env.SOCIAL_AUTH_DEBUG === "1";
const logMeDebug = (requestId: string, message: string, meta?: Record<string, unknown>) => {
  if (!SOCIAL_AUTH_DEBUG) return;
  console.info("[social/me]", { requestId, message, ...(meta || {}) });
};

export async function GET() {
  const requestId = `me-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  try {
    const { userId } = await auth();
    logMeDebug(requestId, "auth resolved", { clerkUserId: userId || null });
    if (!userId) {
      logMeDebug(requestId, "no clerk user", { durationMs: Date.now() - startedAt });
      return NextResponse.json({ clerkUserId: null, linkedUserId: null, profile: null, isAdmin: false, hasPublishedPost: false });
    }

    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (!linkedUserId) {
      logMeDebug(requestId, "no linked user", { clerkUserId: userId, durationMs: Date.now() - startedAt });
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
      .select("id, username, avatar_url, categories, visibility, is_private, created_at, muted_users, category_configs")
      .eq("id", linkedUserId)
      .maybeSingle();

    const { data: publishedStatuses } = await supabaseAdmin
      .from("social_statuses")
      .select("id")
      .eq("user_id", linkedUserId)
      .eq("published", true)
      .is("deleted_at", null)
      .limit(1);

    const isAdmin = isSocialAdmin(userId, linkedUserId);
    logMeDebug(requestId, "resolved linked user", {
      clerkUserId: userId,
      linkedUserId,
      hasProfile: Boolean(profile),
      hasPublishedPost: Boolean(publishedStatuses?.length),
      isAdmin,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      clerkUserId: userId,
      linkedUserId,
      profile: profile || null,
      isAdmin,
      hasPublishedPost: Boolean(publishedStatuses?.length),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logMeDebug(requestId, "failed", {
      error: message,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: message,
        hint: "If this mentions clerk_user_links, run data/sql/create_clerk_user_links.sql in Supabase SQL Editor.",
      },
      { status: 500 }
    );
  }
}
