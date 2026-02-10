"use client";

import React from 'react';
import { useAuth } from '@/lib/auth';

export function UserMenu() {
    const { user, signOut, loading } = useAuth();

    if (loading || !user) return null;

    const handleSignOut = async () => {
        await signOut();
    };

    // Extract display name from email
    const displayName = user.email?.split('@')[0] || 'User';

    return (
        <div className="flex items-center gap-3 font-mono">
            <span className="text-xs uppercase tracking-widest text-neutral-500">
                {displayName}
            </span>
            <button
                onClick={handleSignOut}
                className="text-xs uppercase tracking-widest text-neutral-400 hover:text-neutral-600 underline"
            >
                Sign Out
            </button>
        </div>
    );
}
