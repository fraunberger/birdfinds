"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface FeatureWalkthroughProps {
  isSignedIn: boolean;
}

const STORAGE_KEY = "birdfinds_walkthrough_hidden_v1";

export function FeatureWalkthrough({ isSignedIn }: FeatureWalkthroughProps) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setHidden(stored === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore storage errors.
    }
  };

  const show = () => {
    setHidden(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  };

  if (hidden) {
    return (
      <div id="about-birdfinds" className="mb-4">
        <button
          type="button"
          onClick={show}
          className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 text-neutral-500 hover:text-neutral-900 hover:border-neutral-500"
        >
          About Birdfinds
        </button>
      </div>
    );
  }

  return (
    <section id="about-birdfinds" className="mb-4 border border-neutral-300 bg-neutral-50 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xs uppercase tracking-widest text-neutral-700">How Birdfinds Works</h2>
          <p className="mt-1 text-[11px] text-neutral-600">
            Track what you watch, read, hear, or create custom categories for.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-900"
          aria-label="Dismiss walkthrough"
        >
          Hide
        </button>
      </div>

      <ol className="mt-3 space-y-1 text-[11px] text-neutral-700">
        <li>1. Use `Public Feed` to browse everyone or `Following` to filter to people you follow.</li>
        <li>2. Open any profile to view that user&apos;s pile and category overview.</li>
        <li>3. Open movie, book, or album item pages to compare public ratings across users.</li>
        <li>4. Add your own categories in settings and define each card layout.</li>
        <li>5. Post from the composer to publish to the feed.</li>
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest">
        {isSignedIn ? (
          <>
            <Link href="/settings" className="text-neutral-600 hover:text-neutral-900 underline">
              Settings
            </Link>
            <Link href="/apps" className="text-neutral-600 hover:text-neutral-900 underline">
              Apps
            </Link>
          </>
        ) : (
          <span className="text-neutral-500">Sign in to post, follow, and customize categories.</span>
        )}
      </div>
    </section>
  );
}
