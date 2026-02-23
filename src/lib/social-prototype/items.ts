import type { Category, ConsumableItem } from "@/lib/social-prototype/store";

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
    return normalizedTitle || "item";
  }

  if (category === "podcast") {
    return normalizedSubtitle || normalizedTitle || "item";
  }

  if (category === "beer" || category === "brewery") {
    return normalizedSubtitle || normalizedTitle || "item";
  }

  return buildItemSlug(title, subtitle);
};

export const buildItemPath = (item: Pick<ConsumableItem, "category" | "title" | "subtitle">) => {
  return `/item/${encodeURIComponent(item.category)}/${encodeURIComponent(getCanonicalItemSlug(item.category, item.title, item.subtitle))}`;
};

export const matchesItemRoute = (
  category: Category,
  slug: string,
  item: Pick<ConsumableItem, "category" | "title" | "subtitle">
) => {
  if (item.category !== category) return false;
  const canonical = getCanonicalItemSlug(item.category, item.title, item.subtitle);
  const legacy = buildItemSlug(item.title, item.subtitle);
  return canonical === slug || legacy === slug;
};

export const hasItemAggregatePage = (category: Category) =>
  category === "movie"
  || category === "book"
  || category === "music"
  || category === "tv"
  || category === "podcast"
  || category === "beer"
  || category === "brewery";

/** Return a stable canonical key for deduplication: `category::slug`. */
export const getCanonicalItemKey = (
  item: Pick<ConsumableItem, "category" | "title" | "subtitle">
): string =>
  `${item.category}::${getCanonicalItemSlug(item.category, item.title, item.subtitle)}`;
