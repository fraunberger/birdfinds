import { BillSplitter } from "@/components/bill-splitter/BillSplitter";
import Link from "next/link";
import Image from "next/image";

// Re-using the same list to check validity or just passing through. 
// Ideally this is shared or fetched.
const BIRDS = {
    "australian_magpie": "australian_magpie.png",
    "australian_pied_cormorant": "australian_pied_cormorant.png",
    "eastern_blue_bird": "eastern_blue_bird.png",
    "takahe": "takahe.png",
    "yellowhammer": "yellowhammer.png",
};

export default async function BirdPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;

    // The first bird (australian_magpie) triggers the bill splitter
    // You can change which bird triggers it here.
    const isBillSplitter = slug === "australian_magpie";

    if (isBillSplitter) {
        return (
            <div className="min-h-screen bg-white font-mono text-black p-4">
                <Link href="/" className="text-sm underline mb-4 block hover:no-underline">
                    &larr; birdfinds.com
                </Link>
                <BillSplitter />
            </div>
        );
    }

    // Generic View for other birds
    const filename = BIRDS[slug as keyof typeof BIRDS];

    if (!filename) {
        return (
            <div className="min-h-screen flex items-center justify-center font-mono">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-2">404 - Bird Not Found</h1>
                    <Link href="/" className="underline hover:no-underline">Return Home</Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-white font-mono text-black p-4 flex flex-col items-center">
            <Link href="/" className="self-start text-sm underline hover:no-underline mb-12">
                &larr; birdfinds.com
            </Link>

            <div className="max-w-xl w-full text-center">
                <div className="relative w-full aspect-square mb-8">
                    <Image
                        src={`/birds/${filename}`}
                        alt={slug}
                        fill
                        className="object-contain"
                    />
                </div>
                <h1 className="text-xl font-bold uppercase">{slug}</h1>
                <p className="mt-4 text-sm text-neutral-500">
                    (App functionality coming soon)
                </p>
            </div>
        </div>
    );
}
