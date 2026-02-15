"use client";

import React from 'react';
import { useAuth } from '@/lib/auth';
import { usePublicProfile } from '@/lib/social-prototype/store';

export function UserMenu() {
    const { user, loading } = useAuth();
    const { profile } = usePublicProfile(user?.id || '');

    if (loading || !user) return null;

    // Use profile username if available, fallback to email prefix
    const displayName = profile?.username || user.email?.split('@')[0] || user.username || 'User';

    return (
        <div className="flex items-center gap-3 font-mono">
            <span className="text-xs uppercase tracking-widest text-neutral-500">
                {displayName}
            </span>
            {/* Sign Out moved to Settings as requested */}
        </div>
    );
}
