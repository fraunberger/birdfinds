"use client";

import { useEffect } from "react";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { Check } from "lucide-react";
import { awaitAccount, connectAccount, disconnectAccount, type SyncState } from "./log";

/**
 * Keeps the log on the signed-in BirdFinds account, and offers sign-in to
 * those keeping it in this browser. Only rendered when Clerk is set up.
 */
export function AccountBar({ sync }: { sync: SyncState }) {
    const { isLoaded, userId } = useAuth();

    useEffect(() => {
        if (!isLoaded) awaitAccount();
        else if (userId) void connectAccount(userId);
        else disconnectAccount();
    }, [isLoaded, userId]);

    if (!isLoaded || sync === "loading") return null;

    if (userId && (sync === "account" || sync === "save-error")) {
        return (
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-neutral-500">
                <Check size={12} aria-hidden="true" />
                Saved to your account
            </p>
        );
    }

    if (userId) return null;

    return (
        <p className="text-[11px] text-neutral-500">
            Your climbs are saved in this browser.{" "}
            <SignInButton mode="modal">
                <button type="button" className="underline underline-offset-2 hover:text-black">
                    Sign in
                </button>
            </SignInButton>{" "}
            to keep them with your account.
        </p>
    );
}
