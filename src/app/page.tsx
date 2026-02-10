import Link from "next/link";
import Image from "next/image";

// Real Data from filesystem (hardcoded for now as per instructions to use provided files)
const BIRDS = [
  {
    filename: "australian_magpie.png",
    slug: "australian_magpie",
  },
  {
    filename: "chaffinch.png",
    slug: "chaffinch",
  },
  {
    filename: "cardinal.png",
    slug: "cardinal",
  },
  {
    filename: "pileated_woodpecker.png",
    slug: "pileated_woodpecker",
  },
  {
    filename: "yellowhammer.png",
    slug: "yellowhammer",
  },
  {
    filename: "great_blue_heron.png",
    slug: "great_blue_heron",
  },
  {
    filename: "norther_mockingbird.png",
    slug: "norther_mockingbird",
  },
  {
    filename: "california_quail.png",
    slug: "california_quail",
  },
  {
    filename: "eastern_blue_bird.png",
    slug: "eastern_blue_bird",
  },
  {
    filename: "australian_pied_cormorant.png",
    slug: "australian_pied_cormorant",
  },
  {
    filename: "new_zealand_pigeon.png",
    slug: "new_zealand_pigeon",
  },
  {
    filename: "silver_gull.png",
    slug: "silver_gull",
  },
  {
    filename: "kaka.png",
    slug: "kaka",
  },
  {
    filename: "black_billed_gull.png",
    slug: "black_billed_gull",
  },
  {
    filename: "european_greenfinch.png",
    slug: "european_greenfinch",
  },
  {
    filename: "spotted_shag.png",
    slug: "spotted_shag",
  },
  {
    filename: "new_zealand_bellbird.png",
    slug: "new_zealand_bellbird",
  },
  {
    filename: "takahe.png",
    slug: "takahe",
  },
  {
    filename: "coot.png",
    slug: "coot",
  },
  {
    filename: "house_sparrow.png",
    slug: "house_sparrow",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Centered Header */}
      <header className="py-2 flex justify-center">
        <div className="relative w-16 h-16">
          <Image
            src="/logo.svg"
            alt="BirdFinds Logo"
            fill
            className="object-contain"
            priority
          />
        </div>
      </header>

      {/* Bird Grid - 3 columns, no gaps/lines visually implied other than whitespace if images don't fill */}
      <main className="max-w-5xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-3 gap-8">
          {BIRDS.map((bird) => (
            <Link key={bird.slug} href={`/${bird.slug}`} className="block relative aspect-square w-full group overflow-hidden">
              <Image
                src={`/birds/${bird.filename}`}
                alt={bird.slug}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-110"
                sizes="(max-width: 768px) 33vw, 33vw"
              />
              <div className="absolute bottom-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-white text-[10px] font-mono font-medium uppercase tracking-widest drop-shadow-md">
                  {bird.slug.replace(/_/g, " ")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
