import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";
import type { SupabaseClient } from "@supabase/supabase-js";

type WriteAction =
  | "social.status.upsert"
  | "social.status.publish"
  | "social.status.delete"
  | "social.item.add"
  | "social.item.delete"
  | "social.profile.upsert"
  | "social.follow.toggle"
  | "social.mute.toggle"
  | "social.habit.add"
  | "social.habit.remove"
  | "social.habit.log.toggle";

interface WriteBody {
  action: WriteAction;
  payload?: Record<string, unknown>;
}

const ensureOwnStatus = async (supabaseAdmin: SupabaseClient, statusId: string, userId: string) => {
  const { data } = await supabaseAdmin
    .from("social_statuses")
    .select("id,user_id")
    .eq("id", statusId)
    .maybeSingle();
  if (!data || data.user_id !== userId) {
    throw new Error("Not authorized for status");
  }
};

const ensureOwnItem = async (supabaseAdmin: SupabaseClient, itemId: string, userId: string) => {
  const { data } = await supabaseAdmin
    .from("social_items")
    .select("id,status_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!data) throw new Error("Item not found");
  await ensureOwnStatus(supabaseAdmin, data.status_id, userId);
  return data.status_id;
};

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const linkedUserId = await getOrCreateLinkedSupabaseUser();
  if (!linkedUserId) {
    return NextResponse.json({ error: "No linked user" }, { status: 400 });
  }

  const body = (await req.json()) as WriteBody;
  const action = body.action;
  const payload = body.payload || {};

  try {
    if (action === "social.status.upsert") {
      const date = String(payload.date || "");
      const content = String(payload.content || "");
      if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

      const { data: existing } = await supabaseAdmin
        .from("social_statuses")
        .select("id")
        .eq("user_id", linkedUserId)
        .eq("date", date)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabaseAdmin
          .from("social_statuses")
          .update({ content })
          .eq("id", existing.id);
        if (error) throw error;
        return NextResponse.json({ statusId: existing.id });
      }

      const { data, error } = await supabaseAdmin
        .from("social_statuses")
        .insert({ user_id: linkedUserId, date, content })
        .select("id")
        .single();
      if (error || !data?.id) throw error || new Error("Failed to create status");
      return NextResponse.json({ statusId: data.id });
    }

    if (action === "social.status.publish") {
      const statusId = String(payload.statusId || "");
      const published = Boolean(payload.published);
      await ensureOwnStatus(supabaseAdmin, statusId, linkedUserId);
      const { error } = await supabaseAdmin
        .from("social_statuses")
        .update({ published })
        .eq("id", statusId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.status.delete") {
      const statusId = String(payload.statusId || "");
      await ensureOwnStatus(supabaseAdmin, statusId, linkedUserId);
      await supabaseAdmin.from("social_items").delete().eq("status_id", statusId);
      const { error } = await supabaseAdmin.from("social_statuses").delete().eq("id", statusId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.item.add") {
      const statusId = String(payload.statusId || "");
      await ensureOwnStatus(supabaseAdmin, statusId, linkedUserId);
      const item = (payload.item || {}) as Record<string, unknown>;
      const { error } = await supabaseAdmin.from("social_items").insert({
        status_id: statusId,
        category: String(item.category || "movie"),
        title: String(item.title || ""),
        subtitle: item.subtitle ? String(item.subtitle) : null,
        rating: typeof item.rating === "number" ? item.rating : null,
        notes: item.notes ? String(item.notes) : null,
        image: item.image ? String(item.image) : null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.item.delete") {
      const itemId = String(payload.itemId || "");
      await ensureOwnItem(supabaseAdmin, itemId, linkedUserId);
      const { error } = await supabaseAdmin.from("social_items").delete().eq("id", itemId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.profile.upsert") {
      const { error } = await supabaseAdmin
        .from("user_profiles")
        .upsert({
          id: linkedUserId,
          username: payload.username ? String(payload.username) : undefined,
          avatar_url: payload.avatarUrl ? String(payload.avatarUrl) : undefined,
          categories: Array.isArray(payload.categories) ? payload.categories : undefined,
          is_private: typeof payload.isPrivate === "boolean" ? payload.isPrivate : undefined,
          category_configs:
            payload.categoryConfigs && typeof payload.categoryConfigs === "object"
              ? payload.categoryConfigs
              : undefined,
        });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.follow.toggle") {
      const targetUserId = String(payload.targetUserId || "");
      const { data: existing } = await supabaseAdmin
        .from("follows")
        .select("id")
        .eq("follower_id", linkedUserId)
        .eq("following_id", targetUserId)
        .maybeSingle();
      if (existing?.id) {
        await supabaseAdmin.from("follows").delete().eq("id", existing.id);
      } else {
        const { error } = await supabaseAdmin.from("follows").insert({
          follower_id: linkedUserId,
          following_id: targetUserId,
        });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "social.mute.toggle") {
      const targetUserId = String(payload.targetUserId || "");
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("muted_users")
        .eq("id", linkedUserId)
        .maybeSingle();
      const current = Array.isArray(profile?.muted_users) ? profile.muted_users : [];
      const exists = current.includes(targetUserId);
      const next = exists ? current.filter((id: string) => id !== targetUserId) : [...current, targetUserId];
      const { error } = await supabaseAdmin
        .from("user_profiles")
        .update({ muted_users: next })
        .eq("id", linkedUserId);
      if (error) throw error;
      return NextResponse.json({ ok: true, mutedUsers: next });
    }

    if (action === "social.habit.add") {
      const name = String(payload.name || "").trim();
      const icon = String(payload.icon || "");
      if (!name) return NextResponse.json({ error: "Missing habit name" }, { status: 400 });
      const { data: existing } = await supabaseAdmin
        .from("user_habits")
        .select("id")
        .eq("user_id", linkedUserId);
      const sortOrder = (existing || []).length;
      const { error } = await supabaseAdmin.from("user_habits").insert({
        user_id: linkedUserId,
        name,
        icon,
        sort_order: sortOrder,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.habit.remove") {
      const habitId = String(payload.habitId || "");
      const { data: habit } = await supabaseAdmin
        .from("user_habits")
        .select("id,user_id")
        .eq("id", habitId)
        .maybeSingle();
      if (!habit || habit.user_id !== linkedUserId) throw new Error("Not authorized for habit");
      const { error } = await supabaseAdmin.from("user_habits").delete().eq("id", habitId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.habit.log.toggle") {
      const habitId = String(payload.habitId || "");
      const date = String(payload.date || "");
      const completed = Boolean(payload.completed);
      const notes = payload.notes ? String(payload.notes) : "";
      const { data: habit } = await supabaseAdmin
        .from("user_habits")
        .select("id,user_id")
        .eq("id", habitId)
        .maybeSingle();
      if (!habit || habit.user_id !== linkedUserId) throw new Error("Not authorized for habit log");

      if (completed) {
        const { error } = await supabaseAdmin.from("habit_logs").upsert(
          {
            habit_id: habitId,
            user_id: linkedUserId,
            date,
            completed: true,
            notes,
          },
          { onConflict: "habit_id,date" }
        );
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin
          .from("habit_logs")
          .delete()
          .match({ habit_id: habitId, date, user_id: linkedUserId });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
