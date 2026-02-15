"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  SignInButton,
  SignUpButton,
  SignedOut,
} from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";
import { useSocialStore, useUserProfile } from "@/lib/social-prototype/store";
import { SocialFeed } from "./SocialFeed";
import { StatusComposer } from "./StatusComposer";
import { AccountMenu } from "./AccountMenu";
import { HeaderSearch } from "./HeaderSearch";

export function SocialLayout() {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkEnabled = Boolean(clerkPublishableKey) && !String(clerkPublishableKey).startsWith("YOUR_");
  const router = useRouter();
  const [showAbout, setShowAbout] = React.useState(false);
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const { setActiveDate, statuses } = useSocialStore();
  const needsOnboarding = !!user && !profile?.username?.trim();
  const needsCategorySetup = !!user && !!profile?.username?.trim() && (!profile?.categories || profile.categories.length === 0);
  const needsFirstPost = !!user && !!profile?.username?.trim() && statuses.length === 0;
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const syncAboutFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const hash = (window.location.hash || "").toLowerCase();
      const requestedByMenu = window.sessionStorage.getItem("birdfinds:open-about") === "1";
      setShowAbout(params.get("about") === "1" || hash === "#about-birdfinds" || requestedByMenu);
    };

    syncAboutFromLocation();
    const handleOpenAbout = () => setShowAbout(true);
    window.addEventListener("hashchange", syncAboutFromLocation);
    window.addEventListener("popstate", syncAboutFromLocation);
    window.addEventListener("birdfinds:open-about", handleOpenAbout);
    return () => {
      window.removeEventListener("hashchange", syncAboutFromLocation);
      window.removeEventListener("popstate", syncAboutFromLocation);
      window.removeEventListener("birdfinds:open-about", handleOpenAbout);
    };
  }, []);

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-white font-mono text-neutral-900 flex items-center justify-center">
        <div className="text-neutral-400 text-xs uppercase tracking-widest">Loading...</div>
      </div>
    );
  }

  const getToday = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleReset = () => {
    setActiveDate(getToday());
  };

  const openPile = (userSlugOrId: string) => {
    router.push(`/pile/${encodeURIComponent(userSlugOrId)}`);
  };

  const userDisplay = profile?.username || user?.username || user?.email?.split("@")[0] || "Account";

  return (
    <div className="min-h-screen bg-white font-mono text-neutral-900">
      <div className="max-w-2xl mx-auto p-3 sm:p-6 min-h-screen flex flex-col">
        <header className="flex items-center justify-between mb-4 sm:mb-8 border-b border-neutral-300 pb-3 sm:pb-4">
          <div className="flex items-center gap-4">
            <Link href="/" onClick={handleReset} className="relative w-14 h-9 block hover:opacity-80 transition-opacity">
              <Image src="/logo.svg" alt="BirdFinds" fill className="object-contain" priority />
            </Link>
            <span className="text-xs uppercase tracking-widest text-neutral-500">Feed</span>
          </div>
          <div className="flex items-center gap-3">
            <HeaderSearch />
            {user && (
              <AccountMenu
                pileHref={`/pile/${encodeURIComponent(profile?.username || user.id)}`}
                username={userDisplay}
                avatarUrl={profile?.avatarUrl}
              />
            )}
            {clerkEnabled ? (
              <>
                <SignedOut>
                  <SignInButton>
                    <button className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-900">
                      Sign In
                    </button>
                  </SignInButton>
                  <SignUpButton>
                    <button className="text-xs uppercase tracking-widest border border-neutral-300 px-2 py-1 hover:bg-neutral-100">
                      Sign Up
                    </button>
                  </SignUpButton>
                </SignedOut>
              </>
            ) : null}
          </div>
        </header>

        <main className="flex-grow">
          {showAbout && (
            <div className="mb-4 border border-neutral-300 bg-neutral-50 p-3 text-[10px] uppercase tracking-widest text-neutral-600">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-neutral-700">About Birdfinds</p>
                  <div className="mt-2 space-y-1 normal-case text-xs tracking-normal">
                    <p>Birdfinds is designed as a low-noise personal tracking feed for media and life categories.</p>
                    <p>Use Public Feed or Following, open piles for profile overviews, and compare ratings on item pages.</p>
                    <p>Comments are available without notifications to keep it social but non-addictive.</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAbout(false);
                    if (typeof window !== "undefined") {
                      window.sessionStorage.removeItem("birdfinds:open-about");
                      window.history.replaceState({}, "", "/");
                    } else {
                      router.replace("/");
                    }
                  }}
                  className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {user && needsOnboarding ? (
            <div className="mb-4 border border-amber-200 bg-amber-50 p-3 text-[10px] uppercase tracking-widest text-amber-700">
              <p className="font-bold">Welcome to Birdfinds</p>
              <div className="mt-2 space-y-1 text-[10px]">
                <p>1. Set username + avatar in <Link href="/settings" className="underline">settings</Link>.</p>
                <p>2. Pick categories you want to track.</p>
                <p>3. Post your first review to publish on the feed.</p>
              </div>
            </div>
          ) : null}

          {user && !needsOnboarding && (needsCategorySetup || needsFirstPost) ? (
            <div className="mb-4 border border-neutral-300 bg-neutral-50 p-3 text-[10px] uppercase tracking-widest text-neutral-600">
              <p className="font-bold text-neutral-700">Quick Start</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {needsCategorySetup && (
                  <Link href="/settings" className="border border-neutral-300 px-2 py-1 hover:bg-neutral-100 text-neutral-700">
                    Add Categories
                  </Link>
                )}
                {needsFirstPost && (
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="border border-neutral-300 px-2 py-1 hover:bg-neutral-100 text-neutral-700"
                  >
                    Write First Post
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {user && !needsOnboarding && (
            <StatusComposer userCategories={profile?.categories} />
          )}

          <SocialFeed onClickProfile={openPile} />
        </main>

        <footer className="py-8 text-center text-xs text-neutral-300 mt-12 border-t border-neutral-200 pb-24 sm:pb-8">
          <div className="mb-3">
            <Link
              href="/apps"
              className="inline-block border border-neutral-300 px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-600 hover:text-neutral-900 hover:border-neutral-500"
            >
              Apps
            </Link>
          </div>
          <span className="uppercase tracking-widest">Copyright Birdfinds {new Date().getFullYear()}</span>
        </footer>
      </div>

      <nav className="fixed bottom-0 inset-x-0 border-t border-neutral-300 bg-white/95 backdrop-blur sm:hidden">
        <div className="max-w-2xl mx-auto grid grid-cols-3">
          <Link href="/" className="py-2 text-center text-[10px] uppercase tracking-widest text-neutral-600">Feed</Link>
          <Link href={user ? `/pile/${encodeURIComponent(profile?.username || user.id)}` : "/"} className="py-2 text-center text-[10px] uppercase tracking-widest text-neutral-600">
            My Pile
          </Link>
          <Link href={user ? "/settings" : "/"} className="py-2 text-center text-[10px] uppercase tracking-widest text-neutral-600">
            Menu
          </Link>
        </div>
      </nav>
    </div>
  );
}
