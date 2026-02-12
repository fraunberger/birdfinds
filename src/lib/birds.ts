import type { Category } from "@/lib/social-prototype/store";

export const BIRD_CATALOG = [
  { slug: "australian_magpie", filename: "australian_magpie.png" },
  { slug: "chaffinch", filename: "chaffinch.png" },
  { slug: "cardinal", filename: "cardinal.png" },
  { slug: "pileated_woodpecker", filename: "pileated_woodpecker.png" },
  { slug: "yellowhammer", filename: "yellowhammer.png" },
  { slug: "great_blue_heron", filename: "great_blue_heron.png" },
  { slug: "norther_mockingbird", filename: "norther_mockingbird.png" },
  { slug: "california_quail", filename: "california_quail.png" },
  { slug: "eastern_blue_bird", filename: "eastern_blue_bird.png" },
  { slug: "australian_pied_cormorant", filename: "australian_pied_cormorant.png" },
  { slug: "new_zealand_pigeon", filename: "new_zealand_pigeon.png" },
  { slug: "silver_gull", filename: "silver_gull.png" },
  { slug: "kaka", filename: "kaka.png" },
  { slug: "black_billed_gull", filename: "black_billed_gull.png" },
  { slug: "european_greenfinch", filename: "european_greenfinch.png" },
  { slug: "spotted_shag", filename: "spotted_shag.png" },
  { slug: "new_zealand_bellbird", filename: "new_zealand_bellbird.png" },
  { slug: "takahe", filename: "takahe.png" },
  { slug: "coot", filename: "coot.png" },
  { slug: "house_sparrow", filename: "house_sparrow.png" },
] as const;

export type BirdSlug = (typeof BIRD_CATALOG)[number]["slug"];

export const BIRD_FILENAME_BY_SLUG: Record<BirdSlug, string> = BIRD_CATALOG.reduce(
  (acc, bird) => {
    acc[bird.slug] = bird.filename;
    return acc;
  },
  {} as Record<BirdSlug, string>
);

export const BIRD_CATEGORY_BY_SLUG: Partial<Record<BirdSlug, Category>> = {
  kaka: "movie",
  chaffinch: "tv",
  new_zealand_bellbird: "music",
  silver_gull: "restaurant",
  yellowhammer: "beer",
  new_zealand_pigeon: "cooking",
};
