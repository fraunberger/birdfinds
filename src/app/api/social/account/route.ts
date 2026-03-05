import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function deleteAvatarObjects(supabaseUserId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const bucket = supabaseAdmin.storage.from("avatars");
  let offset = 0;
  const paths: string[] = [];

  while (true) {
    const { data, error } = await bucket.list(supabaseUserId, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) return;
    if (!data || data.length === 0) break;

    data.forEach((entry) => {
      if (entry.name) {
        paths.push(`${supabaseUserId}/${entry.name}`);
      }
    });
    offset += data.length;
  }

  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    await bucket.remove(batch);
  }
}

export async function DELETE() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: link, error: linkError } = await supabaseAdmin
      .from("clerk_user_links")
      .select("supabase_user_id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle<{ supabase_user_id: string }>();
    if (linkError) throw linkError;

    const supabaseUserId = link?.supabase_user_id || null;

    if (supabaseUserId) {
      await deleteAvatarObjects(supabaseUserId);

      // 1. Clear soft-delete attribution on OTHER users' content first
      //    (must happen before we delete our own rows)
      await supabaseAdmin.from("social_statuses").update({ deleted_by: null }).eq("deleted_by", supabaseUserId);
      await supabaseAdmin.from("social_comments").update({ deleted_by: null }).eq("deleted_by", supabaseUserId);

      // 2. Delete follows (no FK dependencies)
      await supabaseAdmin.from("follows").delete().eq("follower_id", supabaseUserId);
      await supabaseAdmin.from("follows").delete().eq("following_id", supabaseUserId);

      // 3. Delete habits
      await supabaseAdmin.from("habit_logs").delete().eq("user_id", supabaseUserId);
      await supabaseAdmin.from("user_habits").delete().eq("user_id", supabaseUserId);

      // 4. Delete reports filed by user
      await supabaseAdmin.from("social_reports").delete().eq("reporter_id", supabaseUserId);

      // 5. Delete comments by user
      await supabaseAdmin.from("social_comments").delete().eq("user_id", supabaseUserId);

      // 6. Collect user's status IDs, then delete items BEFORE statuses (FK order)
      const { data: userStatuses } = await supabaseAdmin
        .from("social_statuses")
        .select("id")
        .eq("user_id", supabaseUserId);
      const statusIds = (userStatuses || []).map((s: { id: string }) => s.id);

      if (statusIds.length > 0) {
        await supabaseAdmin.from("social_items").delete().in("status_id", statusIds);
      }
      await supabaseAdmin.from("social_statuses").delete().eq("user_id", supabaseUserId);

      // 7. Delete profile and auth link
      await supabaseAdmin.from("user_profiles").delete().eq("id", supabaseUserId);
      await supabaseAdmin.from("clerk_user_links").delete().eq("clerk_user_id", clerkUserId);

      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
      if (authDeleteError) throw authDeleteError;
    }

    const clerk = await clerkClient();
    await clerk.users.deleteUser(clerkUserId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

