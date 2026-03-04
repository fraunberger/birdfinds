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
      return NextResponse.json({ notifications: [] });
    }

    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (!linkedUserId) {
      return NextResponse.json({ notifications: [] });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: ownStatuses, error: statusError } = await supabaseAdmin
      .from("social_statuses")
      .select("id,date")
      .eq("user_id", linkedUserId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300);

    if (statusError) throw statusError;

    const statusRows = (ownStatuses || []) as StatusRow[];
    const statusIds = statusRows.map((row) => row.id);
    const statusDateById = new Map(statusRows.map((row) => [row.id, row.date]));
    if (statusIds.length === 0) {
      return NextResponse.json({ notifications: [] });
    }

    const { data: comments, error: commentError } = await supabaseAdmin
      .from("social_comments")
      .select("id,status_id,user_id,content,created_at")
      .in("status_id", statusIds)
      .neq("user_id", linkedUserId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(80);
    if (commentError) throw commentError;

    const commentRows = (comments || []) as CommentRow[];
    if (commentRows.length === 0) {
      return NextResponse.json({ notifications: [] });
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

    const notifications = commentRows.map((row) => ({
      id: row.id,
      statusId: row.status_id,
      fromUserId: row.user_id,
      fromUsername: usernameById.get(row.user_id) || "Unknown",
      content: row.content,
      createdAt: row.created_at,
      statusDate: statusDateById.get(row.status_id) || null,
    }));

    return NextResponse.json({ notifications });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

