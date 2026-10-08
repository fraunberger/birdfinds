import type { Metadata } from "next";
import Image from "next/image";
import { FourThousandFooters } from "@/components/four-thousand-footers/FourThousandFooters";

export const metadata: Metadata = {
  title: "4000 Footers",
  description: "A log of New Hampshire's 48 peaks over 4,000 feet.",
};

/**
 * The 4000-footer log. It's one of birdpile.com's apps, served from here so it
 * can use the BirdFinds sign-in; the back arrow returns to birdpile.com.
 */
export default function DarkEyedJuncoPage() {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkEnabled = Boolean(clerkPublishableKey) && !String(clerkPublishableKey).startsWith("YOUR_");

  return (
    <div className="min-h-screen bg-white font-mono text-black p-4">
      <a
        href="https://birdpile.com"
        className="inline-flex items-center gap-2 mb-4 hover:opacity-70 transition-opacity group"
      >
        <span className="text-xl group-hover:-translate-x-1 transition-transform">&larr;</span>
        <div className="relative w-12 h-8">
          <Image src="/birdpile-logo.png" alt="Apps" fill className="object-contain" />
        </div>
      </a>
      <FourThousandFooters accounts={clerkEnabled} />
    </div>
  );
}
