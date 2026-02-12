import Link from "next/link";
import Image from "next/image";
import { BIRD_CATALOG } from "@/lib/birds";

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
          {BIRD_CATALOG.map((bird) => (
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
