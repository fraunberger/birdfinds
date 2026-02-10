"use client";

import React, { useState, useEffect } from 'react';
import { useSocialStore, useFollows, usePublicProfile, UserProfile, Status } from '@/lib/social-prototype/store';
import { useAuth } from '@/lib/auth';
import { StatusCard } from './StatusCard';
import { supabase } from '@/lib/supabase';

interface SocialFeedProps {
    onClickProfile: (userId: string) => void;
}

export function SocialFeed({ onClickProfile }: SocialFeedProps) {
    const { user } = useAuth();
    const { allStatuses, statuses, activeDate, isLoaded } = useSocialStore();
    const { following } = useFollows();
    const [mode, setMode] = useState<'feed' | 'journal'>('feed');
    const [profileCache, setProfileCache] = useState<Record<string, UserProfile>>({});

    // Fetch profiles for all unique userIds in the feed
    useEffect(() => {
        if (!isLoaded) return;

        const userIds = [...new Set(allStatuses.map(s => s.userId).filter(Boolean) as string[])];
        const missing = userIds.filter(id => !profileCache[id]);

        if (missing.length === 0) return;

        const fetchProfiles = async () => {
            const { data } = await supabase
                .from('user_profiles')
                .select('*')
                .in('id', missing);

            if (data) {
                const newCache = { ...profileCache };
                data.forEach(p => {
                    newCache[p.id] = {
                        id: p.id,
                        username: p.username,
                        avatarUrl: p.avatar_url,
                        categories: p.categories || [],
                    };
                });
                setProfileCache(newCache);
            }
        };

        fetchProfiles();
    }, [allStatuses, isLoaded]);

    if (!isLoaded) {
        return <div className="h-40 bg-neutral-100 mb-4 border border-neutral-300" />;
    }

    // Build feed based on mode
    let feedStatuses: Status[];
    if (mode === 'journal') {
        feedStatuses = statuses.filter(s => s.date !== activeDate);
    } else {
        // Feed: self + following
        const feedUserIds = user ? [user.id, ...following] : [];
        feedStatuses = allStatuses
            .filter(s => s.userId && feedUserIds.includes(s.userId) && s.date !== activeDate);
    }

    // Sort by date descending
    feedStatuses.sort((a, b) => b.date.localeCompare(a.date));

    return (
        <div className="font-mono">
            {/* Header with toggle */}
            <div className="border-b border-neutral-300 pb-2 mb-6 flex items-center justify-between">
                <h2 className="text-xs uppercase tracking-widest text-neutral-500">
                    {mode === 'feed' ? 'Feed' : 'Journal'}
                </h2>
                <div className="flex text-xs gap-0 border border-neutral-300">
                    <button
                        onClick={() => setMode('feed')}
                        className={`px-3 py-1 uppercase tracking-wider transition-colors ${mode === 'feed'
                                ? 'bg-neutral-800 text-white'
                                : 'text-neutral-500 hover:bg-neutral-100'
                            }`}
                    >
                        Feed
                    </button>
                    <button
                        onClick={() => setMode('journal')}
                        className={`px-3 py-1 uppercase tracking-wider transition-colors border-l border-neutral-300 ${mode === 'journal'
                                ? 'bg-neutral-800 text-white'
                                : 'text-neutral-500 hover:bg-neutral-100'
                            }`}
                    >
                        Journal
                    </button>
                </div>
            </div>

            {/* Feed */}
            <div className="space-y-4">
                {feedStatuses.length === 0 && (
                    <div className="text-center py-8 text-neutral-400 text-xs uppercase tracking-widest">
                        {mode === 'feed' ? 'No posts in your feed yet.' : 'No previous entries.'}
                    </div>
                )}

                {feedStatuses.map(status => (
                    <StatusCard
                        key={status.id}
                        status={status}
                        profile={status.userId ? profileCache[status.userId] : null}
                        onClickProfile={onClickProfile}
                        isOwn={status.userId === user?.id}
                    />
                ))}
            </div>
        </div>
    );
}
