"use client";

import { useCallback } from "react";
import { useClerk, useUser } from "@clerk/nextjs";

export interface AppUser {
    id: string;
    email?: string | null;
    username?: string | null;
}

export interface AuthState {
    user: AppUser | null;
    session: null;
    loading: boolean;
}

export function useAuth() {
    const { isLoaded, user: clerkUser } = useUser();
    const { signOut: clerkSignOut } = useClerk();

    const user: AppUser | null = clerkUser
        ? {
            id: clerkUser.id,
            email:
                clerkUser.primaryEmailAddress?.emailAddress
                ?? clerkUser.emailAddresses?.[0]?.emailAddress
                ?? null,
            username: clerkUser.username ?? null,
        }
        : null;

    const signIn = useCallback(async (_email?: string, _password?: string) => {
        return { error: new Error("Use Clerk Sign In button.") };
    }, []);

    const signUp = useCallback(async (_email?: string, _password?: string) => {
        return { error: new Error("Use Clerk Sign Up button.") };
    }, []);

    const signOut = useCallback(async () => {
        await clerkSignOut();
        return { error: null };
    }, [clerkSignOut]);

    return {
        user,
        session: null,
        loading: !isLoaded,
        signIn,
        signUp,
        signOut,
    };
}

export function useRequireAuth() {
    return useAuth();
}
