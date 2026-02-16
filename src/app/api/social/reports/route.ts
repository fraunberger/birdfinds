import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";

interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: "status" | "comment";
  target_id: string;
  reason: string | null;
  created_at: string;
}

interface StatusRow {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  deleted_at: string | null;
}

interface CommentRow {
  id: string;
  content: string;
  user_id: string;
  status_id: string;
  created_at: string;
  deleted_at: string | null;
}

interface UserRow {
  id: string;
  username: string;
}

const getAdminList = (envValue?: string) =>
  (envValue || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const isSocialAdmin = (clerkUserId: string, linkedUserId: string) => {
  const adminClerkIds = getAdminList(process.env.SOCIAL_ADMIN_CLERK_IDS);
  const adminLinkedIds = getAdminList(process.env.SOCIAL_ADMIN_LINKED_IDS);
  return adminClerkIds.includes(clerkUserId) || adminLinkedIds.includes(linkedUserId);
};

async function requireAdmin() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const linkedUserId = await getOrCreateLinkedSupabaseUser();
  if (!linkedUserId) return { error: NextResponse.json({ error: "No linked user" }, { status: 400 }) };
  if (!isSocialAdmin(clerkUserId, linkedUserId)) {
    return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { clerkUserId, linkedUserId };
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("social_reports")
    .select("id,reporter_id,target_type,target_id,reason,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reports = (data || []) as ReportRow[];
  const statusIds = reports.filter((r) => r.target_type === "status").map((r) => r.target_id);
  const commentIds = reports.filter((r) => r.target_type === "comment").map((r) => r.target_id);

  const [{ data: statuses }, { data: comments }] = await Promise.all([
    statusIds.length
      ? supabaseAdmin
          .from("social_statuses")
          .select("id,content,user_id,created_at,deleted_at")
          .in("id", statusIds)
      : Promise.resolve({ data: [] as StatusRow[] }),
    commentIds.length
      ? supabaseAdmin
          .from("social_comments")
          .select("id,content,user_id,status_id,created_at,deleted_at")
          .in("id", commentIds)
      : Promise.resolve({ data: [] as CommentRow[] }),
  ]);

  const statusMap = new Map<string, StatusRow>((statuses || []).map((row) => [row.id, row as StatusRow]));
  const commentMap = new Map<string, CommentRow>((comments || []).map((row) => [row.id, row as CommentRow]));

  const userIds = new Set<string>();
  reports.forEach((report) => userIds.add(report.reporter_id));
  (statuses || []).forEach((row) => userIds.add((row as StatusRow).user_id));
  (comments || []).forEach((row) => userIds.add((row as CommentRow).user_id));

  const { data: users } = userIds.size
    ? await supabaseAdmin.from("user_profiles").select("id,username").in("id", Array.from(userIds))
    : { data: [] as UserRow[] };
  const userMap = new Map<string, UserRow>((users || []).map((row) => [row.id, row as UserRow]));

  const enriched = reports.map((report) => {
    const base = {
      id: report.id,
      createdAt: report.created_at,
      reason: report.reason,
      reporter: userMap.get(report.reporter_id)?.username || "unknown",
      targetType: report.target_type,
      targetId: report.target_id,
    };

    if (report.target_type === "status") {
      const status = statusMap.get(report.target_id);
      return {
        ...base,
        target: status
          ? {
              content: status.content,
              username: userMap.get(status.user_id)?.username || "unknown",
              createdAt: status.created_at,
              isHidden: Boolean(status.deleted_at),
              statusId: status.id,
            }
          : null,
      };
    }

    const comment = commentMap.get(report.target_id);
    return {
      ...base,
      target: comment
        ? {
            content: comment.content,
            username: userMap.get(comment.user_id)?.username || "unknown",
            createdAt: comment.created_at,
            isHidden: Boolean(comment.deleted_at),
            commentId: comment.id,
            statusId: comment.status_id,
          }
        : null,
    };
  });

  return NextResponse.json({ reports: enriched });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  const reportId = new URL(req.url).searchParams.get("id")?.trim();
  if (!reportId) return NextResponse.json({ error: "Missing report id" }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from("social_reports").delete().eq("id", reportId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
