import type { Category, ConsumableItem } from "@/lib/social-prototype/store";
import { getCategoryDef } from "@/lib/social-prototype/categories";
import { parseItemMeta } from "@/lib/social-prototype/item-meta";

const normalizePart = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

export const buildItemSlug = (title: string, subtitle?: string) => {
  const parts = [normalizePart(title), normalizePart(subtitle || "")]
    .filter(Boolean)
    .join("-");
  return parts || "item";
};

const firstNamePart = (value?: string) => {
  if (!value) return "";
  const first = value.split(",")[0]?.split("/")[0]?.split("&")[0]?.trim() || "";
  return normalizePart(first);
};

export const getCanonicalItemSlug = (
  category: Category,
  title: string,
  subtitle?: string
) => {
  const normalizedTitle = normalizePart(title);
  const normalizedSubtitle = normalizePart(subtitle || "");
  const normalizedFirstCredit = firstNamePart(subtitle);

  if (category === "movie") {
    return normalizedTitle || "item";
  }

  if (category === "book" || category === "music") {
    return [normalizedTitle, normalizedFirstCredit || normalizedSubtitle]
      .filter(Boolean)
      .join("-") || normalizedTitle || "item";
  }

  if (category === "tv") {
    // Include show name + episode subtitle for proper per-episode matching
    return [normalizedTitle, normalizedSubtitle]
      .filter(Boolean)
      .join("-") || normalizedTitle || "item";
  }

  if (category === "podcast") {
    // Podcast overview: slug is the show name only (subtitle)
    return normalizedSubtitle || normalizedTitle || "item";
  }

  if (category === "beer" || category === "brewery") {
    // Include beer name (title) + brewery (subtitle) for proper matching
    return [normalizedTitle, normalizedSubtitle]
      .filter(Boolean)
      .join("-") || normalizedTitle || "item";
  }

  return buildItemSlug(title, subtitle);
};

/**
 * Slug used for the item aggregate page URL.
 * For parent-child categories (tv, podcast) this is always the parent/show level
 * so that all episodes share one page. Deduplication keys (getCanonicalItemSlug)
 * remain episode-level — only the public URL is coarser.
 */
export const getItemPageSlug = (
  category: Category,
  title: string,
  subtitle?: string
): string => {
  if (category === "tv") {
    // Show-level page: slug is the show name (title) only
    return normalizePart(title) || "item";
  }
  if (category === "beer") {
    // Brewery-level page: slug is the brewery name (subtitle) only
    return normalizePart(subtitle || title) || "item";
  }
  return getCanonicalItemSlug(category, title, subtitle);
};

export const buildItemPath = (item: Pick<ConsumableItem, "category" | "title" | "subtitle">) => {
  return `/item/${encodeURIComponent(item.category)}/${encodeURIComponent(getItemPageSlug(item.category, item.title, item.subtitle))}`;
};

export const matchesItemRoute = (
  category: Category,
  slug: string,
  item: Pick<ConsumableItem, "category" | "title" | "subtitle">
) => {
  if (item.category !== category) return false;
  const pageSlug = getItemPageSlug(item.category, item.title, item.subtitle);
  const canonical = getCanonicalItemSlug(item.category, item.title, item.subtitle);
  const legacy = buildItemSlug(item.title, item.subtitle);
  return pageSlug === slug || canonical === slug || legacy === slug;
};

export const hasItemAggregatePage = (category: Category) => {
  const def = getCategoryDef(category);
  // Known categories: use ssotPattern to determine page eligibility
  if (def) return def.ssotPattern !== 'none';
  // Legacy/unknown: keep previous allowlist behavior
  return category === "movie" || category === "book" || category === "music"
    || category === "tv" || category === "podcast" || category === "beer" || category === "brewery";
};

/** Return a stable canonical key for deduplication: `category::slug`. */
export const getCanonicalItemKey = (
  item: Pick<ConsumableItem, "category" | "title" | "subtitle">
): string =>
  `${item.category}::${getCanonicalItemSlug(item.category, item.title, item.subtitle)}`;

/** Return the appropriate past-tense verb for a category (e.g. "watched" for movie). */
export const getRepeatTagVerb = (category: Category): string =>
  getCategoryDef(category)?.verb ?? "tagged";

/**
 * Books the user is actively reading. Groups all book logs by title, keeps the
 * most recent log per book, and includes it only when that latest log is still
 * in progress — i.e. not finished, not a finished review, and not explicitly
 * removed from the reading list (`stoppedReading`). Returns one representative
 * (latest) log per book, newest first.
 */
export const getActivelyReadingBooks = (
  items: ConsumableItem[]
): ConsumableItem[] => {
  const latestByTitle = new Map<string, ConsumableItem>();
  for (const item of items) {
    if (item.category !== "book") continue;
    const key = normalizePart(item.title);
    if (!key) continue;
    const existing = latestByTitle.get(key);
    if (!existing || item.createdAt > existing.createdAt) latestByTitle.set(key, item);
  }
  const result: ConsumableItem[] = [];
  for (const item of latestByTitle.values()) {
    const meta = parseItemMeta(item.image);
    if (meta.finished || meta.stoppedReading) continue;
    if (meta.externalSource === "book-review") continue;
    result.push(item);
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
};

export interface RecentTvShow {
  id: string;
  name: string;
  image?: string;
  releaseDate?: string;
}

/**
 * The user's most recently tagged TV shows (distinct by show), newest first.
 * Reconstructs show identity from episode/show metadata so a chip can re-open
 * the episode picker for that show.
 */
export const getRecentTvShows = (
  items: ConsumableItem[],
  limit = 3
): RecentTvShow[] => {
  const sorted = [...items]
    .filter((i) => i.category === "tv")
    .sort((a, b) => b.createdAt - a.createdAt);
  const seen = new Map<string, RecentTvShow>();
  for (const item of sorted) {
    const meta = parseItemMeta(item.image);
    const showId =
      meta.externalSource === "tvmaze-episode"
        ? meta.externalId?.split(":")[0] || ""
        : meta.externalSource === "tvmaze-show"
        ? meta.externalId || ""
        : "";
    if (!showId || seen.has(showId) || !item.title.trim()) continue;
    seen.set(showId, {
      id: showId,
      name: item.title.trim(),
      image: meta.imageUrl,
      releaseDate: meta.releaseDate,
    });
    if (seen.size >= limit) break;
  }
  return Array.from(seen.values());
};
