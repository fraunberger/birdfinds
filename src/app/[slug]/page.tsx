import { BlackjackTrainer } from "@/components/blackjack-trainer/BlackjackTrainer";
import { BillSplitter } from "@/components/bill-splitter/BillSplitter";
import { BenRiceShrine } from "@/components/ben-rice-shrine/BenRiceShrine";
import { VotingApp } from "@/components/pileated-woodpecker-election/VotingApp";
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
    "european_greenfinch": "european_greenfinch.png",
    "cardinal": "cardinal.png",
    "great_blue_heron": "great_blue_heron.png",
    "california_quail": "california_quail.png",
    "pileated_woodpecker": "pileated_woodpecker.png",
    "new_zealand_pigeon": "new_zealand_pigeon.png",
    "silver_gull": "silver_gull.png",
    "kaka": "kaka.png",
    "black_billed_gull": "black_billed_gull.png",
    "chaffinch": "chaffinch.png",
    "spotted_shag": "spotted_shag.png",
    "new_zealand_bellbird": "new_zealand_bellbird.png",
    "norther_mockingbird": "norther_mockingbird.png",
    "coot": "coot.png",
    "house_sparrow": "house_sparrow.png",
};

export default async function BirdPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;

    // App Mappings
    const isBillSplitter = slug === "australian_magpie";
    const isBenRice = false; // slug === "australian_pied_cormorant"; // Disabled for now
    const isBlackjack = slug === "eastern_blue_bird";
    const isElection = slug === "pileated_woodpecker";

    if (isBillSplitter) {
        return (
            <div className="min-h-screen bg-white font-mono text-black p-4">
                <Link href="/" className="inline-flex items-center gap-2 mb-4 hover:opacity-70 transition-opacity group">
                    <span className="text-xl group-hover:-translate-x-1 transition-transform">&larr;</span>
                    <div className="relative w-12 h-8">
                        <Image src="/logo.svg" alt="Home" fill className="object-contain" />
                    </div>
                </Link>
                <BillSplitter />
            </div>
        );
    }

    if (isBenRice) {
        return <BenRiceShrine />;
    }

    if (isBlackjack) {
        return (
            <div className="min-h-screen bg-gray-50 font-sans text-black p-4 flex flex-col items-center">
                <Link href="/" className="self-start inline-flex items-center gap-2 mb-8 hover:opacity-70 transition-opacity group">
                    <span className="text-xl group-hover:-translate-x-1 transition-transform">&larr;</span>
                    <div className="relative w-12 h-8">
                        <Image src="/logo.svg" alt="Home" fill className="object-contain" />
                    </div>
                </Link>
                <BlackjackTrainer />
            </div>
        );
    }

    if (isElection) {
        return <VotingApp />;
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
            <Link href="/" className="self-start inline-flex items-center gap-2 mb-12 hover:opacity-70 transition-opacity group">
                <span className="text-xl group-hover:-translate-x-1 transition-transform">&larr;</span>
                <div className="relative w-12 h-8">
                    <Image src="/logo.svg" alt="Home" fill className="object-contain" />
                </div>
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
