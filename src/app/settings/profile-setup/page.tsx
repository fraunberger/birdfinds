"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { UserSetup } from "@/components/social-prototype/UserSetup";
import { OnboardingWizard } from "@/components/social-prototype/OnboardingWizard";
import { HeaderSearch } from "@/components/social-prototype/HeaderSearch";
import { AccountMenu } from "@/components/social-prototype/AccountMenu";
import { useUserProfile } from "@/lib/social-prototype/store";

export default function ProfileSetupPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { profile } = useUserProfile();
  const hasUsername = !!(profile?.username?.trim() || user?.username?.trim() || user?.email?.split("@")[0]?.trim());
  const hasAvatar = !!profile?.avatarUrl?.trim();
  const hasCategories = !!profile?.categories && profile.categories.length > 0;
  const isOnboarding = !hasUsername || !hasAvatar || !hasCategories;

  const username = profile?.username || user?.username || user?.email?.split("@")[0] || "Account";
  const pileHref = profile?.username
    ? `/pile/${encodeURIComponent(profile.username)}`
    : profile?.id
      ? `/pile/${encodeURIComponent(profile.id)}`
      : "/settings";

  if (loading) {
    return (
      <div className="min-h-screen bg-white font-mono text-neutral-900 flex items-center justify-center">
        <div className="text-neutral-400 text-xs uppercase tracking-widest">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white font-mono text-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-neutral-400 mb-3">Sign in to open profile setup</p>
          <Link href="/" className="text-xs uppercase tracking-widest text-neutral-600 hover:text-neutral-900">
            Return to feed
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-mono text-neutral-900">
      <div className="max-w-2xl mx-auto p-3 sm:p-6 min-h-screen flex flex-col">
        <header className="flex items-center justify-between mb-4 sm:mb-8 border-b border-neutral-300 pb-3 sm:pb-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="relative w-16 h-10 block hover:opacity-80 transition-opacity">
              <Image src="/logo.svg" alt="BirdFinds" fill className="object-contain" priority />
            </Link>
            {!isOnboarding && (
              <Link
                href="/"
                className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:border-neutral-500"
              >
                Back to Feed
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!isOnboarding && <HeaderSearch />}
            {!isOnboarding && (
              <AccountMenu
                pileHref={pileHref}
                username={username}
                avatarUrl={profile?.avatarUrl}
              />
            )}
          </div>
        </header>
        <main className="flex-grow">
          {isOnboarding ? (
            <OnboardingWizard
              onComplete={() => {
                router.push("/");
              }}
            />
          ) : (
            <>
              <h1 className="mb-4 text-xs uppercase tracking-widest text-neutral-500">
                {`${username}'s`} Profile Setup
              </h1>
              <UserSetup
                isOnboarding={false}
                showPrivacy={true}
                onComplete={() => {
                  router.push("/");
                }}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
