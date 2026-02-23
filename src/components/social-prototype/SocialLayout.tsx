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
import { HabitChecklist } from "./HabitChecklist";
import { AccountMenu } from "./AccountMenu";
import { HeaderSearch } from "./HeaderSearch";
import { pushToast } from "@/lib/social-prototype/toast";

export function SocialLayout() {
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkEnabled = Boolean(clerkPublishableKey) && !String(clerkPublishableKey).startsWith("YOUR_");
  const router = useRouter();
  const [showAbout, setShowAbout] = React.useState(false);
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, isAdmin, hasPublishedPost: hasPublishedPostEver } = useUserProfile();
  const { activeDate, setActiveDate, statuses, isLoaded: socialLoaded, resetAndRefresh } = useSocialStore();
  const lastAuthKeyRef = React.useRef<string | null>(null);
  const [reportCount, setReportCount] = React.useState(0);
  const reportCountRef = React.useRef<number | null>(null);
  const [isEntryMode, setIsEntryMode] = React.useState(false);
  const hasUsername = !!profile?.username?.trim();
  const hasCategories = !!profile?.categories && profile.categories.length > 0;
  const hasPublishedPost = hasPublishedPostEver || statuses.some((status) => status.published && status.id !== "temp-optimistic");
  const stepOneComplete = !!user && hasUsername;
  const stepTwoComplete = stepOneComplete && hasCategories;
  const stepThreeComplete = stepTwoComplete && hasPublishedPost;
  const needsOnboarding = !!user && !stepOneComplete;
  const needsCategorySetup = !!user && !stepTwoComplete;
  const needsFirstPost = !!user && !stepThreeComplete;
  const showOnboardingChecklist = !!user && socialLoaded && (needsOnboarding || needsCategorySetup || needsFirstPost);
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

  React.useEffect(() => {
    if (authLoading) return;
    const authKey = user?.id || "signed-out";
    if (lastAuthKeyRef.current === null) {
      lastAuthKeyRef.current = authKey;
      return;
    }
    if (lastAuthKeyRef.current !== authKey) {
      lastAuthKeyRef.current = authKey;
      resetAndRefresh();
    }
  }, [authLoading, user?.id, resetAndRefresh]);

  React.useEffect(() => {
    if (!user?.id || !isAdmin) {
      setReportCount(0);
      reportCountRef.current = null;
      return;
    }

    let cancelled = false;
    const readReports = async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch("/api/social/reports", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json();
        const nextCount = Array.isArray(payload?.reports) ? payload.reports.length : 0;
        if (cancelled) return;
        if (reportCountRef.current != null && nextCount > reportCountRef.current) {
          const delta = nextCount - reportCountRef.current;
          pushToast({ message: `${delta} new report${delta > 1 ? "s" : ""} in moderation.`, tone: "error" });
        }
        reportCountRef.current = nextCount;
        setReportCount(nextCount);
      } catch {
        // Ignore polling failures.
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    void readReports();
    const intervalId = window.setInterval(() => {
      void readReports();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user?.id, isAdmin]);

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
  const pileHref = user
    ? (profile?.username
      ? `/pile/${encodeURIComponent(profile.username)}`
      : profile?.id
        ? `/pile/${encodeURIComponent(profile.id)}`
        : "/settings")
    : "/";

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
              <>
                <span className="hidden sm:flex items-center gap-2">
                  {profile?.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover border border-neutral-300" />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-[10px] font-bold text-neutral-500 border border-neutral-300">
                      {userDisplay.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-widest text-neutral-500">{userDisplay}</span>
                </span>
                <AccountMenu
                  pileHref={pileHref}
                  username={userDisplay}
                  avatarUrl={profile?.avatarUrl}
                  isAdmin={isAdmin}
                  reportCount={reportCount}
                />
              </>
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
          {!user && (
            <div className="mb-4 border border-neutral-300 bg-neutral-50 p-3 text-[10px] uppercase tracking-widest text-neutral-600">
              Sign in to post and comment.
            </div>
          )}

          {showAbout && (
            <div className="mb-4 border border-neutral-300 bg-neutral-50 p-3 text-[10px] uppercase tracking-widest text-neutral-600">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-neutral-700">About Birdfinds</p>
                  <div className="mt-3 space-y-3 normal-case text-xs tracking-normal">
                    <p>
                      birdfinds.com is a daily status engine. It is based on the idea that you are what you do and what
                      you find. It is designed as a journal with a feed: a non-addictive social platform for sharing your
                      tastes, your finds, and the little stories that make your day.
                    </p>
                    <p>
                      Every day you get one post and one pile to track your finds in the categories you care about.
                      Use the starting categories or create your own.
                    </p>
                    <p>
                      Add as much, or as little detail as you want per item. Find the same item as someone else and
                      compare your opinions on its page, or drop a comment on their post.
                    </p>
                    <p>
                      See everyone&apos;s finds in the global feed, or curate your own following. Click on somebody&apos;s
                      pile to see an overview of their finds and to follow or block them.
                    </p>
                    <p>
                      Trying to build a habit? Add those as well and track progress in your pile.
                    </p>
                    <p>
                      Found a bug in birdfinds? email mikefraun19 AT gmail and I&apos;ll venmo you a dollar*.
                    </p>
                    <p className="italic text-neutral-500">*probably</p>
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

          {showOnboardingChecklist && (
            <div className="mb-4 border border-neutral-300 bg-neutral-50 p-3 text-neutral-700">
              <p className="text-[10px] font-bold uppercase tracking-widest">Getting Started</p>
              <ol className="mt-2 space-y-1 text-xs">
                <li className={stepOneComplete ? "text-green-700" : "text-neutral-800"}>
                  {stepOneComplete ? "✓" : "□"} 1. Set username and avatar
                </li>
                <li className={stepTwoComplete ? "text-green-700" : "text-neutral-800"}>
                  {stepTwoComplete ? "✓" : "□"} 2. Choose categories to track
                </li>
                <li className={stepThreeComplete ? "text-green-700" : "text-neutral-800"}>
                  {stepThreeComplete ? "✓" : "□"} 3. Publish your first post
                </li>
              </ol>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                {(needsOnboarding || needsCategorySetup) && (
                  <Link href="/settings" className="border border-neutral-300 px-2 py-1 hover:bg-neutral-100">
                    Open Settings
                  </Link>
                )}
                {needsFirstPost && !needsOnboarding && !needsCategorySetup && (
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
                  >
                    Write First Post
                  </button>
                )}
              </div>
            </div>
          )}

          {user && !needsOnboarding && (
            <>
              <StatusComposer
                userCategories={profile?.categories}
                onEntryModeChange={setIsEntryMode}
              />

            </>
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
          <Link href={pileHref} className="py-2 text-center text-[10px] uppercase tracking-widest text-neutral-600">
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
