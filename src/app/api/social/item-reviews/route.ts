import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { matchesItemRoute } from "@/lib/social-prototype/items";

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
}

interface ProfileRow {
  id: string;
  username: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || "";
  const slug = searchParams.get("slug") || "";
  if (!category || !slug) {
    return NextResponse.json({ error: "Missing category or slug" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Step 1: Fetch items for this category (bounded)
  const { data: items } = await supabaseAdmin
    .from("social_items")
    .select("id, status_id, category, title, subtitle, rating, notes, image")
    .eq("category", category)
    .limit(500);

  const allItems = (items || []) as ItemRow[];

  // Step 2: Filter to items matching the slug
  const matchedItems = allItems.filter((item) =>
    matchesItemRoute(category, slug, {
      category: item.category,
      title: item.title,
      subtitle: item.subtitle || undefined,
    })
  );

  if (matchedItems.length === 0) {
    return NextResponse.json({ reviews: [] });
  }

  // Step 3: Fetch only the statuses we need
  const statusIds = [...new Set(matchedItems.map((i) => i.status_id))];
  const { data: statuses } = await supabaseAdmin
    .from("social_statuses")
    .select("id, user_id, published, created_at")
    .in("id", statusIds)
    .eq("published", true);

  const statusMap = new Map(
    ((statuses || []) as StatusRow[]).map((s) => [s.id, s])
  );

  // Step 4: Fetch only the profiles we need
  const userIds = [...new Set(((statuses || []) as StatusRow[]).map((s) => s.user_id))];
  const profileMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("user_profiles")
      .select("id, username")
      .in("id", userIds);
    for (const p of (profiles || []) as ProfileRow[]) {
      profileMap.set(p.id, p.username);
    }
  }

  // Step 5: Assemble reviews
  const reviews = matchedItems
    .map((item) => {
      const status = statusMap.get(item.status_id);
      if (!status) return null;
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
