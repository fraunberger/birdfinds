import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";

interface StatusRow {
  id: string;
  date: string;
}

interface CommentRow {
  id: string;
  status_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  username: string;
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ notifications: [], seenBefore: null });
    }

    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (!linkedUserId) {
      return NextResponse.json({ notifications: [], seenBefore: null });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch the user's seen-before timestamp for cross-device read state.
    const { data: profileRow } = await supabaseAdmin
      .from("user_profiles")
      .select("notifications_seen_before")
      .eq("id", linkedUserId)
      .maybeSingle();
    const seenBefore: string | null = (profileRow as { notifications_seen_before?: string | null } | null)?.notifications_seen_before ?? null;

    // --- Notifications for the user's own posts ---
    const { data: ownStatuses, error: statusError } = await supabaseAdmin
      .from("social_statuses")
      .select("id,date")
      .eq("user_id", linkedUserId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300);

    if (statusError) throw statusError;

    const ownStatusRows = (ownStatuses || []) as StatusRow[];
    const ownStatusIds = ownStatusRows.map((row) => row.id);
    const statusDateById = new Map(ownStatusRows.map((row) => [row.id, row.date]));

    // --- Notifications for posts the user has commented on (but doesn't own) ---
    const { data: myCommentedStatuses } = await supabaseAdmin
      .from("social_comments")
      .select("status_id")
      .eq("user_id", linkedUserId)
      .is("deleted_at", null);

    const commentedStatusIds = Array.from(
      new Set(
        ((myCommentedStatuses || []) as { status_id: string }[])
          .map((r) => r.status_id)
          .filter((id) => !ownStatusIds.includes(id)),
      ),
    );

    // Collect comments from both buckets.
    const allStatusIds = [...ownStatusIds, ...commentedStatusIds];
    if (allStatusIds.length === 0) {
      return NextResponse.json({ notifications: [], seenBefore });
    }

    const { data: comments, error: commentError } = await supabaseAdmin
      .from("social_comments")
      .select("id,status_id,user_id,content,created_at")
      .in("status_id", allStatusIds)
      .neq("user_id", linkedUserId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(80);
    if (commentError) throw commentError;

    const commentRows = (comments || []) as CommentRow[];
    if (commentRows.length === 0) {
      return NextResponse.json({ notifications: [], seenBefore });
    }

    // Fetch statuses for commented-on posts so we can surface the date.
    let commentedStatusDateById = new Map<string, string>();
    if (commentedStatusIds.length > 0) {
      const { data: commentedStatusRows } = await supabaseAdmin
        .from("social_statuses")
        .select("id,date")
        .in("id", commentedStatusIds)
        .is("deleted_at", null);
      commentedStatusDateById = new Map(
        ((commentedStatusRows || []) as StatusRow[]).map((row) => [row.id, row.date]),
      );
    }

    const commenterIds = Array.from(new Set(commentRows.map((row) => row.user_id)));
    const { data: commenterProfiles } = commenterIds.length
      ? await supabaseAdmin
          .from("user_profiles")
          .select("id,username")
          .in("id", commenterIds)
      : { data: [] as ProfileRow[] };

    const usernameById = new Map<string, string>(
      ((commenterProfiles || []) as ProfileRow[]).map((row) => [row.id, row.username]),
    );

    const ownStatusIdSet = new Set(ownStatusIds);
    const notifications = commentRows.map((row) => ({
      id: row.id,
      statusId: row.status_id,
      fromUserId: row.user_id,
      fromUsername: usernameById.get(row.user_id) || "Unknown",
      content: row.content,
      createdAt: row.created_at,
      statusDate:
        statusDateById.get(row.status_id) ||
        commentedStatusDateById.get(row.status_id) ||
        null,
      // "on_my_post" = comment on a post the user owns
      // "on_commented_post" = comment on a post the user also commented on
      type: ownStatusIdSet.has(row.status_id) ? "on_my_post" : "on_commented_post",
    }));

    return NextResponse.json({ notifications, seenBefore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Mark all current notifications as seen (updates a server-side timestamp so
// the read state syncs across all devices for this account).
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (!linkedUserId) {
      return NextResponse.json({ error: "No linked user" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("user_profiles")
      .update({ notifications_seen_before: now })
      .eq("id", linkedUserId);

    if (error) throw error;
    return NextResponse.json({ seenBefore: now });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
