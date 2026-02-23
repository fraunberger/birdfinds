import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Input length limits ─────────────────────────────────────────────
const MAX_BODY_BYTES = 100 * 1024;          // 100 KB
const MAX_STATUS_CONTENT = 5_000;
const MAX_ITEM_TITLE = 500;
const MAX_ITEM_SUBTITLE = 500;
const MAX_ITEM_NOTES = 10_000;
const MAX_ITEM_IMAGE_URL = 2_000;
const MAX_COMMENT_CONTENT = 2_000;
const MAX_HABIT_NAME = 100;
const MAX_REPORT_REASON = 1_000;
const MAX_HABIT_LOG_NOTES = 2_000;
const MAX_AVATAR_URL = 2_000;

/** Truncate a string to `max` characters (no-op when shorter). */
const truncate = (value: string, max: number) =>
  value.length > max ? value.slice(0, max) : value;

// ── Rate limit: 60 writes per minute per user ───────────────────────
const WRITE_RATE_LIMIT = 60;
const WRITE_RATE_WINDOW_MS = 60_000;

type WriteAction =
  | "social.status.upsert"
  | "social.status.publish"
  | "social.status.delete"
  | "social.status.soft_delete"
  | "social.status.report"
  | "social.item.add"
  | "social.item.update"
  | "social.item.delete"
  | "social.comment.add"
  | "social.comment.delete"
  | "social.comment.soft_delete"
  | "social.comment.report"
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

const ensureOwnComment = async (supabaseAdmin: SupabaseClient, commentId: string, userId: string) => {
  const { data } = await supabaseAdmin
    .from("social_comments")
    .select("id,user_id,status_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!data) throw new Error("Comment not found");
  if (data.user_id !== userId) {
    await ensureOwnStatus(supabaseAdmin, data.status_id, userId);
  }
};

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

const extractErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
    const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
    const details = "details" in error ? String((error as { details?: unknown }).details || "") : "";
    const hint = "hint" in error ? String((error as { hint?: unknown }).hint || "") : "";
    const parts = [message, code ? `code=${code}` : "", details ? `details=${details}` : "", hint ? `hint=${hint}` : ""]
      .filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
  }
  return "Unknown error";
};

export async function POST(req: NextRequest) {
  try {
    // ── Body size guard ───────────────────────────────────────────
    const contentLength = Number(req.headers.get("content-length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: `Request body too large (max ${MAX_BODY_BYTES / 1024} KB)` },
        { status: 413 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Rate limit ────────────────────────────────────────────────
    const rl = rateLimit(`write:${clerkUserId}`, WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests, please slow down" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } },
      );
    }

    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (!linkedUserId) {
      return NextResponse.json({ error: "No linked user" }, { status: 400 });
    }

    const body = (await req.json()) as WriteBody;
    const action = body.action;
    const payload = body.payload || {};
    const admin = isSocialAdmin(clerkUserId, linkedUserId);

    if (action === "social.status.upsert") {
      const date = String(payload.date || "");
      const content = truncate(String(payload.content || ""), MAX_STATUS_CONTENT);
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
        category: truncate(String(item.category || "movie"), MAX_ITEM_TITLE),
        title: truncate(String(item.title || ""), MAX_ITEM_TITLE),
        subtitle: item.subtitle ? truncate(String(item.subtitle), MAX_ITEM_SUBTITLE) : null,
        rating: typeof item.rating === "number" ? item.rating : null,
        notes: item.notes ? truncate(String(item.notes), MAX_ITEM_NOTES) : null,
        image: item.image ? truncate(String(item.image), MAX_ITEM_IMAGE_URL) : null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.item.update") {
      const itemId = String(payload.itemId || "");
      if (!itemId) {
        return NextResponse.json({ error: "Missing itemId" }, { status: 400 });
      }
      await ensureOwnItem(supabaseAdmin, itemId, linkedUserId);

      const item = (payload.item || {}) as Record<string, unknown>;
      const updates: Record<string, unknown> = {};

      if ("category" in item) updates.category = truncate(String(item.category || "movie"), MAX_ITEM_TITLE);
      if ("title" in item) updates.title = truncate(String(item.title || ""), MAX_ITEM_TITLE);
      if ("subtitle" in item) updates.subtitle = item.subtitle ? truncate(String(item.subtitle), MAX_ITEM_SUBTITLE) : null;
      if ("rating" in item) updates.rating = typeof item.rating === "number" ? item.rating : null;
      if ("notes" in item) updates.notes = item.notes ? truncate(String(item.notes), MAX_ITEM_NOTES) : null;
      if ("image" in item) updates.image = item.image ? truncate(String(item.image), MAX_ITEM_IMAGE_URL) : null;

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No item fields provided" }, { status: 400 });
      }

      const { error } = await supabaseAdmin.from("social_items").update(updates).eq("id", itemId);
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

    if (action === "social.comment.add") {
      const statusId = String(payload.statusId || "");
      const content = truncate(String(payload.content || "").trim(), MAX_COMMENT_CONTENT);
      if (!statusId || !content) {
        return NextResponse.json({ error: "Missing statusId or content" }, { status: 400 });
      }
      const { data: status } = await supabaseAdmin
        .from("social_statuses")
        .select("id,published")
        .eq("id", statusId)
        .maybeSingle();
      if (!status?.id) return NextResponse.json({ error: "Status not found" }, { status: 404 });
      if (!status.published) return NextResponse.json({ error: "Cannot comment on unpublished status" }, { status: 400 });
      const { error } = await supabaseAdmin.from("social_comments").insert({
        status_id: statusId,
        user_id: linkedUserId,
        content,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.comment.delete") {
      const commentId = String(payload.commentId || "");
      if (!commentId) return NextResponse.json({ error: "Missing commentId" }, { status: 400 });
      await ensureOwnComment(supabaseAdmin, commentId, linkedUserId);
      const { error } = await supabaseAdmin.from("social_comments").delete().eq("id", commentId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.status.report") {
      const statusId = String(payload.statusId || "").trim();
      const reason = truncate(String(payload.reason || "").trim(), MAX_REPORT_REASON);
      if (!statusId) return NextResponse.json({ error: "Missing statusId" }, { status: 400 });
      const { error } = await supabaseAdmin.from("social_reports").insert({
        reporter_id: linkedUserId,
        target_type: "status",
        target_id: statusId,
        reason: reason || null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.comment.report") {
      const commentId = String(payload.commentId || "").trim();
      const reason = truncate(String(payload.reason || "").trim(), MAX_REPORT_REASON);
      if (!commentId) return NextResponse.json({ error: "Missing commentId" }, { status: 400 });
      const { error } = await supabaseAdmin.from("social_reports").insert({
        reporter_id: linkedUserId,
        target_type: "comment",
        target_id: commentId,
        reason: reason || null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.status.soft_delete") {
      if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
      const statusId = String(payload.statusId || "").trim();
      const reason = truncate(String(payload.reason || "").trim(), MAX_REPORT_REASON);
      if (!statusId) return NextResponse.json({ error: "Missing statusId" }, { status: 400 });
      const { error } = await supabaseAdmin
        .from("social_statuses")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: linkedUserId,
          delete_reason: reason || "Hidden by admin",
        })
        .eq("id", statusId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.comment.soft_delete") {
      if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
      const commentId = String(payload.commentId || "").trim();
      const reason = truncate(String(payload.reason || "").trim(), MAX_REPORT_REASON);
      if (!commentId) return NextResponse.json({ error: "Missing commentId" }, { status: 400 });
      const { error } = await supabaseAdmin
        .from("social_comments")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: linkedUserId,
          delete_reason: reason || "Hidden by admin",
        })
        .eq("id", commentId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "social.profile.upsert") {
      const username = payload.username ? String(payload.username).trim() : "";
      if (!username) {
        return NextResponse.json({ error: "Username is required" }, { status: 400 });
      }
      if (username.length < 2 || username.length > 32) {
        return NextResponse.json({ error: "Username must be between 2 and 32 characters" }, { status: 400 });
      }
      if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        return NextResponse.json(
          { error: "Username can only include letters, numbers, dots, dashes, and underscores" },
          { status: 400 }
        );
      }

      const visibilityRaw = String(payload.visibility || "").trim();
      const visibility =
        visibilityRaw === "public" || visibilityRaw === "accounts" || visibilityRaw === "private"
          ? visibilityRaw
          : undefined;
      const isPrivate = visibility ? visibility === "private" : typeof payload.isPrivate === "boolean" ? payload.isPrivate : undefined;
      const categories = Array.isArray(payload.categories)
        ? payload.categories.map((value) => String(value).trim()).filter(Boolean)
        : undefined;
      const categoryConfigs = payload.categoryConfigs && typeof payload.categoryConfigs === "object"
        ? payload.categoryConfigs
        : undefined;
      const avatarUrl = payload.avatarUrl == null || payload.avatarUrl === ""
        ? null
        : truncate(String(payload.avatarUrl), MAX_AVATAR_URL);

      const { error } = await supabaseAdmin
        .from("user_profiles")
        .upsert({
          id: linkedUserId,
          username,
          avatar_url: avatarUrl,
          categories,
          is_private: isPrivate,
          visibility,
          category_configs: categoryConfigs,
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
      const name = truncate(String(payload.name || "").trim(), MAX_HABIT_NAME);
      const icon = truncate(String(payload.icon || ""), 10);
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
      const notes = payload.notes ? truncate(String(payload.notes), MAX_HABIT_LOG_NOTES) : "";
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
    const message = extractErrorMessage(error);
    console.error("[social/write] request failed:", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
