"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import { useClerk, useUser } from "@clerk/nextjs";
import { ProfileVisibility, useUserProfile } from "@/lib/social-prototype/store";
import { HeaderSearch } from "@/components/social-prototype/HeaderSearch";
import { AccountMenu } from "@/components/social-prototype/AccountMenu";

export default function SettingsPage() {
  const { user, loading, signOut } = useAuth();
  const { user: clerkUser } = useUser();
  const { openUserProfile } = useClerk();
  const { profile, updateProfile } = useUserProfile();
  const [visibility, setVisibility] = useState<ProfileVisibility>("public");
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const canManagePassword = clerkUser?.passwordEnabled ?? false;
  const canManageEmail = canManagePassword;

  useEffect(() => {
    setVisibility(profile?.visibility || (profile?.isPrivate ? "private" : "public"));
  }, [profile?.visibility, profile?.isPrivate]);

  const saveVisibility = async (nextVisibility: ProfileVisibility) => {
    setVisibility(nextVisibility);
    setVisibilityError(null);
    setSavingVisibility(true);
    try {
      await updateProfile({
        username: profile?.username || user?.username || user?.email?.split("@")[0] || "",
        avatarUrl: profile?.avatarUrl,
        categories: profile?.categories || [],
        visibility: nextVisibility,
        isPrivate: nextVisibility === "private",
        categoryConfigs: profile?.categoryConfigs || {},
      });
    } catch (error) {
      setVisibilityError(error instanceof Error ? error.message : "Unable to update visibility");
    } finally {
      setSavingVisibility(false);
    }
  };

  const openAccountSettings = async (startPath?: "email-addresses" | "security") => {
    setCredentialsError(null);
    try {
      if (startPath) {
        await openUserProfile({ __experimental_startPath: startPath });
        return;
      }
      await openUserProfile();
    } catch {
      try {
        await openUserProfile();
      } catch {
        setCredentialsError("Unable to open Clerk account settings right now.");
      }
    }
  };

  const handleDeleteAccount = async () => {
    if (deletingAccount) return;
    const typed = typeof window !== "undefined"
      ? window.prompt('This permanently deletes your account and data. Type "DELETE" to confirm.')
      : null;
    if (typed !== "DELETE") return;

    setDeleteAccountError(null);
    setDeletingAccount(true);
    try {
      const response = await fetch("/api/social/account", { method: "DELETE" });
      const raw = await response.text();
      let payload: { error?: string } = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }
      if (!response.ok) {
        throw new Error(payload.error || raw || "Failed to delete account");
      }
      await signOut();
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch (error) {
      setDeleteAccountError(error instanceof Error ? error.message : "Failed to delete account");
      setDeletingAccount(false);
    }
  };

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
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Profile Visibility</p>
            <div className="mt-2 space-y-2">
              {([
                { value: "public", label: "Public", description: "Anyone can view your profile." },
                { value: "accounts", label: "Accounts only", description: "Only signed-in accounts can view your profile." },
                { value: "private", label: "Private", description: "Only you can view your profile." },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={savingVisibility}
                  onClick={() => saveVisibility(option.value)}
                  className={`w-full text-left border px-2 py-2 transition-colors ${visibility === option.value
                    ? "border-neutral-800 bg-neutral-100"
                    : "border-neutral-300 hover:bg-neutral-50"
                    } ${savingVisibility ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <p className="text-[10px] uppercase tracking-widest">{option.label}</p>
                  <p className="text-xs text-neutral-600 mt-1">{option.description}</p>
                </button>
              ))}
            </div>
            {visibilityError ? (
              <p className="mt-2 text-[10px] uppercase tracking-widest text-red-600">{visibilityError}</p>
            ) : null}
          </div>

          <div className="border border-neutral-300 p-3">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Login Credentials</p>
            <button
              onClick={() => (canManageEmail ? openAccountSettings("email-addresses") : openAccountSettings())}
              className="mt-2 text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
            >
              Change Login Username/Email
            </button>
            <p className="mt-2 text-xs text-neutral-600">
              {canManageEmail
                ? "Opens Clerk account popup for login username/email only."
                : "Your account is managed by Google sign-in, so login email changes must be made in Google. This opens general Clerk account settings."}
            </p>
          </div>

          <div className="border border-neutral-300 p-3">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Login Credentials</p>
            <button
              onClick={() => (canManagePassword ? openAccountSettings("security") : openAccountSettings())}
              className="mt-2 text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
            >
              Change Password
            </button>
            <p className="mt-2 text-xs text-neutral-600">
              {canManagePassword
                ? "Opens Clerk security popup for login password only."
                : "Your account is using Google sign-in, so password changes are managed in Google. This opens general Clerk account settings."}
            </p>
          </div>

          {credentialsError ? (
            <p className="text-[10px] uppercase tracking-widest text-red-600">{credentialsError}</p>
          ) : null}

          <div className="border border-red-200 bg-red-50 p-3">
            <p className="text-[10px] uppercase tracking-widest text-red-700">Danger Zone</p>
            <p className="mt-2 text-xs text-red-700">
              Delete account removes your account from Clerk and Supabase (profile, posts, comments, habits, follows, and links).
            </p>
            <button
              onClick={handleDeleteAccount}
              disabled={deletingAccount}
              className="mt-3 text-[10px] uppercase tracking-widest border border-red-300 px-2 py-1 text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {deletingAccount ? "Deleting..." : "Delete Account"}
            </button>
            {deleteAccountError ? (
              <p className="mt-2 text-[10px] uppercase tracking-widest text-red-700">{deleteAccountError}</p>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
