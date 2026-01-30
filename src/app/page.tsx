import Link from "next/link";
import Image from "next/image";

// Real Data from filesystem (hardcoded for now as per instructions to use provided files)
const BIRDS = [
  {
    filename: "australian_magpie.png",
    slug: "australian_magpie",
  },
  {
    filename: "australian_pied_cormorant.png",
    slug: "australian_pied_cormorant",
  },
  {
    filename: "eastern_blue_bird.png",
    slug: "eastern_blue_bird",
  },
  {
    filename: "takahe.png",
    slug: "takahe",
  },
  {
    filename: "yellowhammer.png",
    slug: "yellowhammer",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Centered Header */}
      <header className="py-8 flex justify-center">
        <h1 className="text-xl font-bold font-mono tracking-widest text-black">
          birdfinds.com
        </h1>
      </header>

      {/* Bird Grid - 3 columns, no gaps/lines visually implied other than whitespace if images don't fill */}
      <main className="max-w-5xl mx-auto px-4">
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
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-white font-mono font-bold uppercase tracking-widest text-center px-2">
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
