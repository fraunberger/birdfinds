"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { hasItemAggregatePage, matchesItemRoute } from "@/lib/social-prototype/items";
import { ConsumableItem, getCategoryConfig } from "@/lib/social-prototype/store";

interface RawStatus {
  id: string;
  user_id: string;
  published: boolean;
  created_at: string;
}

interface RawItem {
  id: string;
  status_id: string;
  category: string;
  title: string;
  subtitle?: string;
  rating?: number;
  notes?: string;
  image?: string;
}

interface RawProfile {
  id: string;
  username: string;
}

interface DisplayReview {
  item: ConsumableItem;
  userId: string;
  username: string;
  createdAt: string;
}

interface FollowRow {
  following_id: string;
}

export default function ItemPage({
  params: _params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  void _params;
  const routeParams = useParams<{ category: string; slug: string }>();
  const routeCategory = decodeURIComponent(routeParams?.category || "");
  const routeSlug = decodeURIComponent(routeParams?.slug || "");
  const [reviews, setReviews] = useState<DisplayReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestedCategory, setRequestedCategory] = useState("");
  const [requestedSlug, setRequestedSlug] = useState("");
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const isTvPage = requestedCategory === "tv";
  const isPodcastPage = requestedCategory === "podcast";
  const isBreweryPage = requestedCategory === "beer" || requestedCategory === "brewery";

  useEffect(() => {
    if (!routeCategory || !routeSlug) return;
    let mounted = true;

    const run = async () => {
      if (!mounted) return;
      setRequestedCategory(routeCategory);
      setRequestedSlug(routeSlug);

      const [{ data: statuses }, { data: items }, { data: profiles }] = await Promise.all([
        supabase.from("social_statuses").select("id, user_id, published, created_at").eq("published", true),
        supabase.from("social_items").select("id, status_id, category, title, subtitle, rating, notes, image"),
        supabase.from("user_profiles").select("id, username"),
      ]);

      if (!mounted) return;

      const statusMap = new Map<string, RawStatus>((statuses || []).map((s: RawStatus) => [s.id, s]));
      const profileMap = new Map<string, string>((profiles || []).map((p: RawProfile) => [p.id, p.username]));

      const matched = (items || [])
        .filter((raw: RawItem) => {
          const status = statusMap.get(raw.status_id);
          if (!status || !status.published) return false;
          return matchesItemRoute(routeCategory, routeSlug, {
            category: raw.category,
            title: raw.title,
            subtitle: raw.subtitle,
          });
        })
        .map((raw: RawItem) => {
          const status = statusMap.get(raw.status_id);
          if (!status) return null;
          return {
            item: {
              id: raw.id,
              category: raw.category,
              title: raw.title,
              subtitle: raw.subtitle,
              rating: raw.rating,
              notes: raw.notes,
              image: raw.image,
              createdAt: new Date(status.created_at).getTime(),
            },
            userId: status.user_id,
            username: profileMap.get(status.user_id) || "Unknown",
            createdAt: status.created_at,
          } satisfies DisplayReview;
        })
        .filter(Boolean) as DisplayReview[];

      matched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReviews(matched);
      setLoading(false);
    };

    run();
    return () => {
      mounted = false;
    };
  }, [routeCategory, routeSlug]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const response = await fetch("/api/social/me", { cache: "no-store" });
      if (!response.ok) return;
      const me = await response.json() as { linkedUserId?: string | null };
      if (!me?.linkedUserId) return;

      const { data } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", me.linkedUserId);

      if (cancelled) return;
      setFollowingIds(((data || []) as FollowRow[]).map((row) => row.following_id));
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const ratings = reviews.map((r) => r.item.rating).filter((r): r is number => typeof r === "number");
    const average = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;
    return {
      ratingsCount: ratings.length,
      average,
      reviewsCount: reviews.length,
    };
  }, [reviews]);

  const friendReviews = useMemo(
    () => reviews.filter((review) => followingIds.includes(review.userId)),
    [reviews, followingIds]
  );

  const categoryConfig = getCategoryConfig(requestedCategory);
  const title = useMemo(() => {
    if (reviews.length === 0) return requestedSlug.replace(/-/g, " ");
    if (isPodcastPage || isBreweryPage) {
      const parent = reviews.find((review) => review.item.subtitle?.trim())?.item.subtitle;
      return parent || reviews[0].item.title;
    }
    return reviews[0].item.title;
  }, [isBreweryPage, isPodcastPage, requestedSlug, reviews]);

  const subtitle = useMemo(() => {
    if (isTvPage || isPodcastPage || isBreweryPage) return "";
    return reviews[0]?.item.subtitle || "";
  }, [isBreweryPage, isPodcastPage, isTvPage, reviews]);

  const subitems = useMemo(() => {
    if (!isTvPage && !isPodcastPage && !isBreweryPage) return [];

    const bucket = new Map<string, { name: string; count: number; ratings: number[]; latest: number }>();
    reviews.forEach((review) => {
      const name = isTvPage
        ? (review.item.subtitle?.trim() || "General")
        : isPodcastPage
          ? (review.item.title?.trim() || "Episode")
          : (review.item.title?.trim() || "Beer");

      const existing = bucket.get(name);
      if (!existing) {
        bucket.set(name, {
          name,
          count: 1,
          ratings: typeof review.item.rating === "number" ? [review.item.rating] : [],
          latest: new Date(review.createdAt).getTime(),
        });
        return;
      }
      existing.count += 1;
      if (typeof review.item.rating === "number") existing.ratings.push(review.item.rating);
      existing.latest = Math.max(existing.latest, new Date(review.createdAt).getTime());
    });

    return Array.from(bucket.values())
      .map((entry) => ({
        ...entry,
        avg: entry.ratings.length > 0
          ? entry.ratings.reduce((sum, rating) => sum + rating, 0) / entry.ratings.length
          : null,
      }))
      .sort((a, b) => b.latest - a.latest);
  }, [isBreweryPage, isPodcastPage, isTvPage, reviews]);

  const supported = hasItemAggregatePage(requestedCategory);

  if (loading) {
    return (
      <div className="min-h-screen bg-white font-mono flex items-center justify-center">
        <div className="text-xs uppercase tracking-widest text-neutral-400">Loading item...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-mono text-neutral-900">
      <div className="max-w-2xl mx-auto p-3 sm:p-6 pb-24 sm:pb-6">
        <header className="mb-4 sm:mb-8 border-b border-neutral-300 pb-3 sm:pb-4">
          <Link href="/" className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-900">
            BirdFinds / Feed
          </Link>
        </header>

        <section className="border border-neutral-200 bg-white px-4 py-4 mb-4">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">{categoryConfig.label}</p>
          <h1 className="text-xl font-bold uppercase tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
          <div className="mt-3 flex items-center gap-4 text-xs uppercase tracking-widest text-neutral-600">
            <span>{stats.reviewsCount} reviews</span>
            <span>{stats.ratingsCount} ratings</span>
            <span>
              avg {stats.average !== null ? stats.average.toFixed(1) : "N/A"}
            </span>
            {followingIds.length > 0 && <span>{friendReviews.length} from people you follow</span>}
          </div>
        </section>

        {(isTvPage || isPodcastPage || isBreweryPage) && (
          <section className="border border-neutral-200 bg-white px-4 py-4 mb-4">
            <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
              {isTvPage ? "Episodes" : isPodcastPage ? "Episodes" : "Beers"}
            </h2>
            {subitems.length === 0 ? (
              <p className="text-xs text-neutral-400 uppercase tracking-widest">
                No sub-items yet.
              </p>
            ) : (
              <div className="space-y-2">
                {subitems.map((subitem) => (
                  <div key={subitem.name} className="border border-neutral-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-neutral-800">{subitem.name}</p>
                      <div className="text-[10px] uppercase tracking-widest text-neutral-500">
                        {subitem.count} reviews
                        {subitem.avg !== null ? ` • avg ${subitem.avg.toFixed(1)}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {followingIds.length > 0 && (
          <section className="border border-neutral-200 bg-white px-4 py-4 mb-4">
            <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">People You Follow</h2>
            {friendReviews.length === 0 ? (
              <p className="text-xs text-neutral-400 uppercase tracking-widest">Nobody you follow has reviewed this yet.</p>
            ) : (
              <div className="space-y-2">
                {friendReviews.map((review) => (
                  <div key={`friend-${review.item.id}`} className="border border-neutral-200 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <Link href={`/pile/${encodeURIComponent(review.userId)}`} className="text-[11px] font-bold text-neutral-700 hover:text-neutral-900">
                        {review.username}
                      </Link>
                      <span className="text-[10px] uppercase tracking-widest text-neutral-400">
                        {typeof review.item.rating === "number" ? `${review.item.rating}/10` : "No rating"}
                      </span>
                    </div>
                    {review.item.notes && <p className="mt-1 text-xs text-neutral-600">{review.item.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="space-y-3">
          {!supported && (
            <div className="text-center py-8 text-neutral-400 text-xs uppercase tracking-widest border border-neutral-200">
              Item pages are currently enabled for movies, books, albums, TV, podcasts, and breweries.
            </div>
          )}
          {reviews.length === 0 && (
            <div className="text-center py-8 text-neutral-400 text-xs uppercase tracking-widest border border-neutral-200">
              No public reviews found for this item.
            </div>
          )}

          {reviews.map((review) => (
            <article key={review.item.id} className="border border-neutral-200 bg-white px-3 py-3">
              <div className="flex items-center justify-between">
                <Link
                  href={`/pile/${encodeURIComponent(review.userId)}`}
                  className="text-[11px] font-bold text-neutral-700 hover:text-neutral-900"
                >
                  {review.username}
                </Link>
                <div className="text-[10px] text-neutral-400">
                  {new Date(review.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
              </div>
              <div className="mt-2 text-xs text-neutral-700">
                {review.item.rating ? `${review.item.rating}/10` : "No rating"}
              </div>
              {(isTvPage || isPodcastPage || isBreweryPage) && review.item.subtitle && (
                <p className="mt-1 text-[10px] uppercase tracking-widest text-neutral-400">
                  {isTvPage ? `Episode: ${review.item.subtitle}` : isPodcastPage ? `Show: ${review.item.subtitle}` : `Brewery: ${review.item.subtitle}`}
                </p>
              )}
              {review.item.notes && (
                <p className="mt-2 text-xs text-neutral-600 whitespace-pre-wrap">{review.item.notes}</p>
              )}
            </article>
          ))}
        </section>
        <footer className="mt-12 pt-6 border-t border-neutral-200 text-center text-[10px] uppercase tracking-widest text-neutral-300">
          Copyright Birdfinds {new Date().getFullYear()}
        </footer>
      </div>
      <nav className="fixed bottom-0 inset-x-0 border-t border-neutral-300 bg-white/95 backdrop-blur sm:hidden">
        <div className="max-w-2xl mx-auto grid grid-cols-2">
          <Link href="/" className="py-2 text-center text-[10px] uppercase tracking-widest text-neutral-600">Feed</Link>
          <Link href="/settings" className="py-2 text-center text-[10px] uppercase tracking-widest text-neutral-600">Menu</Link>
        </div>
      </nav>
    </div>
  );
}
