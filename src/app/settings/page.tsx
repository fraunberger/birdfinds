"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import { useClerk } from "@clerk/nextjs";
import { useUserProfile } from "@/lib/social-prototype/store";
import { HeaderSearch } from "@/components/social-prototype/HeaderSearch";
import { AccountMenu } from "@/components/social-prototype/AccountMenu";

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const { openUserProfile } = useClerk();
  const { profile } = useUserProfile();
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
          <p className="text-xs uppercase tracking-widest text-neutral-400 mb-3">Sign in to open settings</p>
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
            <Link href="/" className="relative w-14 h-9 block hover:opacity-80 transition-opacity">
              <Image src="/logo.svg" alt="BirdFinds" fill className="object-contain" priority />
            </Link>
            <Link
              href="/"
              className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:border-neutral-500"
            >
              Back to Feed
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <HeaderSearch />
            <AccountMenu
              pileHref={pileHref}
              username={username}
              avatarUrl={profile?.avatarUrl}
            />
          </div>
        </header>

        <main className="flex-grow space-y-4">
          <Link
            href="/settings/profile-setup"
            className="block border border-neutral-300 p-3 hover:bg-neutral-50"
          >
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Profile Setup</p>
            <p className="text-xs mt-1">Edit username, avatar, categories, profile visibility, and habits.</p>
          </Link>

          <div className="border border-neutral-300 p-3">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Email</p>
            <button
              onClick={() => openUserProfile({ __experimental_startPath: "/email-addresses" })}
              className="mt-2 text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
            >
              Open Email Settings
            </button>
          </div>

          <div className="border border-neutral-300 p-3">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Change Password</p>
            <button
              onClick={() => openUserProfile({ __experimental_startPath: "/security" })}
              className="mt-2 text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
            >
              Open Password Settings
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
