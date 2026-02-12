import { BlackjackTrainer } from "@/components/blackjack-trainer/BlackjackTrainer";
import { BillSplitter } from "@/components/bill-splitter/BillSplitter";
import { BenRiceShrine } from "@/components/ben-rice-shrine/BenRiceShrine";
import { RestaurantVotingApp } from "@/components/pileated-woodpecker-election/RestaurantVotingApp";
import Link from "next/link";
import Image from "next/image";
import { SocialLayout } from "@/components/social-prototype/SocialLayout";
import { BirdLog } from "@/components/bird-log/BirdLog";
import { BIRD_CATEGORY_BY_SLUG, BIRD_FILENAME_BY_SLUG } from "@/lib/birds";

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
    const isElection = slug === "pileated_woodpecker" || slug === "pileated-woodpecker";

    // BirdPile Social Media App
    const isBirdPile = slug === "cardinal";

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
        return <RestaurantVotingApp />;
    }

    // BirdPile — The Social Media App
    if (isBirdPile) {
        return <SocialLayout />;
    }

    // Bird Category Log — Michael's public data
    const birdCategory = BIRD_CATEGORY_BY_SLUG[slug as keyof typeof BIRD_CATEGORY_BY_SLUG];
    const birdImage = BIRD_FILENAME_BY_SLUG[slug as keyof typeof BIRD_FILENAME_BY_SLUG];
    if (birdCategory && birdImage) {
        return <BirdLog category={birdCategory} birdSlug={slug} birdImage={birdImage} />;
    }

    // Generic View for other birds
    const filename = BIRD_FILENAME_BY_SLUG[slug as keyof typeof BIRD_FILENAME_BY_SLUG];

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
