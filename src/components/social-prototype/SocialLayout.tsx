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
import { pushToast } from "@/lib/social-prototype/toast";

export function SocialLayout() {
  type CommentNotification = {
    id: string;
    statusId: string;
    fromUsername: string;
    content: string;
    createdAt: string;
    statusDate?: string;
    type?: "on_my_post" | "on_commented_post";
  };
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkEnabled = Boolean(clerkPublishableKey) && !String(clerkPublishableKey).startsWith("YOUR_");
  const router = useRouter();
  const [showAbout, setShowAbout] = React.useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = React.useState(false);
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, isAdmin, hasPublishedPost } = useUserProfile();
  const { setActiveDate, resetAndRefresh, statuses } = useSocialStore();
  const lastAuthKeyRef = React.useRef<string | null>(null);
  const [reportCount, setReportCount] = React.useState(0);
  const [commentNotificationCount, setCommentNotificationCount] = React.useState(0);
  const [commentNotifications, setCommentNotifications] = React.useState<CommentNotification[]>([]);
  const reportCountRef = React.useRef<number | null>(null);
  const hasUsername = !!(profile?.username?.trim() || user?.username?.trim() || user?.email?.split("@")[0]?.trim());
  const hasAvatar = !!profile?.avatarUrl?.trim();
  const hasCategories = !!profile?.categories && profile.categories.length > 0;
  const stepOneComplete = !!user && hasUsername;
  const stepTwoComplete = !!user && hasAvatar;
  const stepThreeComplete = !!user && hasCategories;
  // Show the composer once username + categories are set (avatar is optional)
  const canCompose = stepOneComplete && stepThreeComplete;
  const needsOnboarding = !!user && !canCompose;
  const hasPublishedPostInFeed = hasPublishedPost || statuses.some((status) => status.published && status.id !== "temp-optimistic");
  const needsFirstPost = !!user && canCompose && !hasPublishedPostInFeed;
  const showOnboardingChecklist = !!user && needsOnboarding && !onboardingDismissed;

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user?.id || !needsOnboarding) {
      setOnboardingDismissed(false);
      return;
    }
    // The user.id here is the Clerk user session ID, not the database primary key.
    // We isolate this key per-user to support shared device scenarios.
    const dismissedKey = `birdfinds:onboarding-dismissed:${user.id}`;
    setOnboardingDismissed(window.localStorage.getItem(dismissedKey) === "1");
  }, [user?.id, needsOnboarding]);

  const handleDismissOnboardingChecklist = React.useCallback(() => {
    if (!user?.id || typeof window === "undefined") return;
    // user.id is the Clerk user session ID, not the database primary key.
    const dismissedKey = `birdfinds:onboarding-dismissed:${user.id}`;
    window.localStorage.setItem(dismissedKey, "1");
    setOnboardingDismissed(true);
  }, [user?.id]);
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
      // Initial auth resolution can happen after an anonymous store fetch.
      // Force an immediate sync for the resolved identity.
      if (user?.id) {
        resetAndRefresh();
      }
      return;
    }
    // Ignore transient signed-out blips (seen on some focus/tab changes)
    // so composer state is not reset while the same user is still active.
    if (!user?.id) {
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
      if (document.visibilityState === 'visible') void readReports();
    }, 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user?.id, isAdmin]);

  React.useEffect(() => {
    if (!user?.id || !profile?.id) {
      setCommentNotificationCount(0);
      setCommentNotifications([]);
      return;
    }

    let cancelled = false;
    // seenBeforeRef tracks the server-side timestamp so we can detect unseen
    // notifications without relying on localStorage (cross-device safe).
    const seenBeforeRef = { current: null as string | null };

    const readCommentNotifications = async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch("/api/social/notifications", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json();
        const notifications = Array.isArray(payload?.notifications) ? payload.notifications : [];
        const serverSeenBefore: string | null = payload?.seenBefore ?? null;

        const isFirstLoad = serverSeenBefore === null && seenBeforeRef.current === null;
        if (isFirstLoad && notifications.length > 0) {
          // First load with no server-side seen record: mark all current as seen
          // so we don't retroactively notify for historical comments.
          void fetch("/api/social/notifications", { method: "POST", cache: "no-store" });
          seenBeforeRef.current = new Date().toISOString();
        } else {
          seenBeforeRef.current = serverSeenBefore;
        }

        const effectiveSeenBefore = seenBeforeRef.current;
        const unseen = effectiveSeenBefore && !isFirstLoad
          ? notifications.filter(
              (entry: { createdAt?: string }) =>
                entry.createdAt && entry.createdAt > effectiveSeenBefore,
            )
          : [];

        const allMapped: CommentNotification[] = (notifications as Record<string, unknown>[]).map((entry) => ({
          id: String(entry.id || ""),
          statusId: String(entry.statusId || ""),
          fromUsername: String(entry.fromUsername || "Unknown"),
          content: String(entry.content || ""),
          createdAt: String(entry.createdAt || ""),
          statusDate: entry.statusDate ? String(entry.statusDate) : undefined,
          type: (entry.type === "on_commented_post" ? "on_commented_post" : "on_my_post") as
            | "on_my_post"
            | "on_commented_post",
        })).filter((entry: CommentNotification) => Boolean(entry.id && entry.statusId));

        if (!cancelled && unseen.length > 0) {
          const newest = unseen[0] as { fromUsername?: string; type?: string };
          const isReply = newest.type === "on_commented_post";
          pushToast({
            message:
              unseen.length === 1
                ? isReply
                  ? `New comment from ${newest.fromUsername || "someone"} on a post you commented on`
                  : `New comment from ${newest.fromUsername || "someone"}`
                : `${unseen.length} new comments`,
            tone: "info",
            href: "/",
          });
        }
        if (!cancelled) {
          setCommentNotificationCount(unseen.length);
          setCommentNotifications(allMapped);
        }
      } catch {
        // Ignore polling failures.
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    const markVisibleAsSeen = async () => {
      // Update server-side seen timestamp so all devices see this as cleared.
      const res = await fetch("/api/social/notifications", { method: "POST", cache: "no-store" });
      if (!res.ok) return;
      const payload = await res.json();
      seenBeforeRef.current = payload?.seenBefore ?? seenBeforeRef.current;
      if (!cancelled) {
        setCommentNotificationCount(0);
      }
    };

    void readCommentNotifications();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void readCommentNotifications();
    }, 60_000);

    const onFocus = () => {
      if (document.visibilityState === "visible") void readCommentNotifications();
    };
    window.addEventListener("focus", onFocus);

    const onMarkSeen = () => { void markVisibleAsSeen(); };
    window.addEventListener("birdfinds:notifications-seen", onMarkSeen);

    const onOpenNotification = (event: Event) => {
      const customEvent = event as CustomEvent<{ notificationId?: string; statusId?: string }>;
      const statusId = String(customEvent.detail?.statusId || "");
      if (!statusId) return;

      // Mark all seen when any notification is clicked (keeps UX simple and
      // ensures cross-device consistency).
      void markVisibleAsSeen();

      // Persist intent so SocialFeed can pick it up on mount when navigating cross-page.
      window.sessionStorage.setItem("birdfinds:pending-thread", statusId);
      window.dispatchEvent(new CustomEvent("birdfinds:open-comment-thread", { detail: { statusId } }));
    };
    window.addEventListener("birdfinds:open-comment-notification", onOpenNotification as EventListener);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("birdfinds:notifications-seen", onMarkSeen);
      window.removeEventListener("birdfinds:open-comment-notification", onOpenNotification as EventListener);
    };
  }, [user?.id, profile?.id]);

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
        <header className="relative z-40 flex items-center justify-between mb-4 sm:mb-8 border-b border-neutral-300 pb-3 sm:pb-4">
          <div className="flex items-center gap-4">
            <Link href="/" onClick={handleReset} className="relative w-16 h-10 block hover:opacity-80 transition-opacity">
              <Image src="/logo.svg" alt="BirdFinds" fill className="object-contain" priority />
            </Link>
            <span className="text-xs uppercase tracking-widest text-neutral-500">Feed</span>
          </div>
          <div className="flex items-center gap-3">
            <HeaderSearch />
            {user && (
              <>
                <Link href={pileHref} className="hidden sm:flex items-center gap-2 hover:opacity-80 transition-opacity">
                  {profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover border border-neutral-300" />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-[10px] font-bold text-neutral-500 border border-neutral-300">
                      {userDisplay.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-widest text-neutral-500">{userDisplay}</span>
                </Link>
                <AccountMenu
                  pileHref={pileHref}
                  username={userDisplay}
                  avatarUrl={profile?.avatarUrl}
                  isAdmin={isAdmin}
                  reportCount={reportCount}
                  commentCount={commentNotificationCount}
                  commentNotifications={commentNotifications}
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
              <div className="flex items-start justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-widest">Getting Started</p>
                <button
                  onClick={handleDismissOnboardingChecklist}
                  className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
                >
                  Hide
                </button>
              </div>
              <ol className="mt-2 space-y-1 text-xs">
                <li className={stepOneComplete ? "text-green-700" : "text-neutral-800"}>
                  {stepOneComplete ? "✓" : "□"} 1. Username ready
                </li>
                <li className={stepTwoComplete ? "text-green-700" : "text-neutral-800"}>
                  {stepTwoComplete ? "✓" : "□"} 2. Add avatar
                </li>
                <li className={stepThreeComplete ? "text-green-700" : "text-neutral-800"}>
                  {stepThreeComplete ? "✓" : "□"} 3. Choose categories
                </li>
              </ol>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                <Link href="/settings/profile-setup" className="border border-neutral-300 px-2 py-1 hover:bg-neutral-100">
                  Get Started
                </Link>
              </div>
            </div>
          )}

          {user && canCompose && (
            <>
              {needsFirstPost && (
                <div className="mb-4 border border-neutral-300 bg-neutral-50 p-3 text-neutral-700">
                  <p className="text-[10px] font-bold uppercase tracking-widest">Your First Post</p>
                  <div className="mt-2 space-y-1.5 text-xs text-neutral-600">
                    <p>
                      Add an item to your status by typing <span className="font-mono bg-neutral-200 px-0.5">@item</span> and
                      then clicking the category. Click the table to open its card and add a rating or notes.
                    </p>
                    <p>You can also add items without linking them to your status.</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                    <button
                      onClick={() => {
                        const target = document.getElementById("first-post-composer");
                        if (target) {
                          target.scrollIntoView({ behavior: "smooth", block: "start" });
                        } else {
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }
                        window.setTimeout(() => {
                          window.dispatchEvent(new CustomEvent("birdpile:edit-entry", { detail: {} }));
                        }, 120);
                      }}
                      className="border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
                    >
                      Write First Post
                    </button>
                  </div>
                </div>
              )}
              <div id="first-post-composer">
                <StatusComposer
                  userCategories={profile?.categories}
                />
              </div>

            </>
          )}

          <SocialFeed onClickProfile={openPile} />
        </main>

        <footer className="py-8 text-center text-xs text-neutral-300 mt-12 border-t border-neutral-200 pb-24 sm:pb-8">
          <div className="mb-3">
            <a
              href="https://birdpile.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block border border-neutral-300 px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-600 hover:text-neutral-900 hover:border-neutral-500"
            >
              Visit the Birdpile
            </a>
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
