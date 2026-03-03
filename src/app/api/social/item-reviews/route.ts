import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { matchesItemRoute } from "@/lib/social-prototype/items";
import { getItemExternalIdentityKey } from "@/lib/social-prototype/item-meta";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

interface ItemRow {
  id: string;
  status_id: string;
  category: string;
  title: string;
  subtitle: string | null;
  rating: number | null;
  notes: string | null;
  image: string | null;
}

interface StatusRow {
  id: string;
  user_id: string;
  published: boolean;
  created_at: string;
  deleted_at: string | null;
}

interface ProfileRow {
  id: string;
  username: string;
  visibility: "public" | "accounts" | "private" | null;
  is_private: boolean | null;
}

export async function GET(req: NextRequest) {
  const clientKey = (() => {
    const ip = getClientIp(req);
    return ip && ip !== "unknown" ? `item-reviews:${ip}` : "item-reviews:anon";
  })();
  const rl = rateLimit(clientKey, 40, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests, please slow down" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || "";
  const slug = searchParams.get("slug") || "";
  if (!category || !slug) {
    return NextResponse.json({ error: "Missing category or slug" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { userId: clerkUserId } = await auth();
  const linkedViewerId = clerkUserId ? await getOrCreateLinkedSupabaseUser() : null;
  const signedInViewer = Boolean(clerkUserId);

  // Step 1: Fetch items for this category (bounded)
  const { data: items } = await supabaseAdmin
    .from("social_items")
    .select("id, status_id, category, title, subtitle, rating, notes, image, created_at")
    .eq("category", category)
    .order("created_at", { ascending: false })
    .limit(250);

  const allItems = (items || []) as ItemRow[];

  // Step 2: Filter to items matching the slug (title-based), then expand
  // to any item that shares the same API externalId as a slug-matched item.
  const slugMatched = allItems.filter((item) =>
    matchesItemRoute(category, slug, {
      category: item.category,
      title: item.title,
      subtitle: item.subtitle || undefined,
    })
  );

  const matchedExternalIds = new Set(
    slugMatched
      .map((item) => getItemExternalIdentityKey(category, item.image || undefined))
      .filter((k): k is string => k !== null)
  );

  const slugMatchedIds = new Set(slugMatched.map((i) => i.id));
  const matchedItems = matchedExternalIds.size > 0
    ? allItems.filter((item) => {
        if (slugMatchedIds.has(item.id)) return true;
        const externalKey = getItemExternalIdentityKey(category, item.image || undefined);
        return externalKey !== null && matchedExternalIds.has(externalKey);
      })
    : slugMatched;

  if (matchedItems.length === 0) {
    return NextResponse.json({ reviews: [] });
  }

  // Step 3: Fetch only the statuses we need
  const statusIds = [...new Set(matchedItems.map((i) => i.status_id))];
  const { data: statuses } = await supabaseAdmin
    .from("social_statuses")
    .select("id, user_id, published, created_at, deleted_at")
    .in("id", statusIds)
    .eq("published", true)
    .is("deleted_at", null);

  const statusMap = new Map(
    ((statuses || []) as StatusRow[]).map((s) => [s.id, s])
  );

  // Step 4: Fetch only the profiles we need
  const userIds = [...new Set(((statuses || []) as StatusRow[]).map((s) => s.user_id))];
  const profileMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("user_profiles")
      .select("id, username, visibility, is_private")
      .in("id", userIds);
    for (const p of (profiles || []) as ProfileRow[]) {
      const visibility = p.is_private ? "private" : (p.visibility || "public");
      if (visibility === "private" && p.id !== linkedViewerId) continue;
      if (visibility === "accounts" && !signedInViewer && p.id !== linkedViewerId) continue;
      profileMap.set(p.id, p.username);
    }
  }

  // Step 5: Assemble reviews
  const reviews = matchedItems
    .map((item) => {
      const status = statusMap.get(item.status_id);
      if (!status) return null;
      if (!profileMap.has(status.user_id)) return null;
      return {
        item: {
          id: item.id,
          category: item.category,
          title: item.title,
          subtitle: item.subtitle || undefined,
          rating: item.rating ?? undefined,
          notes: item.notes || undefined,
          image: item.image || undefined,
        },
        userId: status.user_id,
        username: profileMap.get(status.user_id) || "Unknown",
        createdAt: status.created_at,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime());

  return NextResponse.json({ reviews });
}
