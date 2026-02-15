"use client";

import React, { useState, useEffect } from 'react';
import { useSocialStore, useFollows, UserProfile, Status } from '@/lib/social-prototype/store';
import { useAuth } from '@/lib/auth';
import { StatusCard } from './StatusCard';
import { supabase } from '@/lib/supabase';

interface SocialFeedProps {
    onClickProfile: (userId: string) => void;
}

export function SocialFeed({ onClickProfile }: SocialFeedProps) {
    const { user } = useAuth();
    const { allStatuses, setActiveDate, isLoaded } = useSocialStore();
    const { following } = useFollows();
    const [mode, setMode] = useState<'all' | 'following'>('all');
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
                        isPrivate: p.is_private || false,
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

    const publishedStatuses = allStatuses.filter(s => {
        if (!s.published) return false;
        if (s.userId === user?.id) return true;
        const profile = s.userId ? profileCache[s.userId] : null;
        if (profile?.isPrivate) return false;
        return true;
    });

    const feedStatuses: Status[] = mode === 'all'
        ? publishedStatuses
        : publishedStatuses.filter((s) => s.userId && (s.userId === user?.id || following.includes(s.userId)));

    // Sort by date descending
    feedStatuses.sort((a, b) => b.date.localeCompare(a.date));

    return (
        <div className="font-mono">
            {/* Header with toggle */}
            <div className="border-b border-neutral-300 pb-2 mb-6 flex items-center justify-between">
                <h2 className="text-xs uppercase tracking-widest text-neutral-500">
                    {mode === 'all' ? 'Public Feed' : 'Following'}
                </h2>
                <div className="flex text-xs gap-0 border border-neutral-300">
                    <button
                        onClick={() => setMode('all')}
                        className={`px-3 py-1 uppercase tracking-wider transition-colors ${mode === 'all'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-500 hover:bg-neutral-100'
                            }`}
                    >
                        Public Feed
                    </button>
                    <button
                        onClick={() => setMode('following')}
                        className={`px-3 py-1 uppercase tracking-wider transition-colors border-l border-neutral-300 ${mode === 'following'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-500 hover:bg-neutral-100'
                            }`}
                    >
                        Following
                    </button>
                </div>
            </div>

            {/* Feed */}
            <div className="space-y-4">
                {feedStatuses.length === 0 && (
                    <div className="text-center py-8 text-neutral-400 text-xs uppercase tracking-widest">
                        {mode === 'all'
                            ? 'No posts in the public feed yet.'
                            : user
                                ? 'No posts from accounts you follow yet.'
                                : 'Sign in to use Following feed.'}
                    </div>
                )}

                {feedStatuses.map(status => {
                    const isOwn = status.userId === user?.id;
                    return (
                        <StatusCard
                            key={status.id}
                            status={status}
                            profile={status.userId ? profileCache[status.userId] : null}
                            onClickProfile={onClickProfile}
                            isOwn={isOwn}
                            onEdit={isOwn ? () => {
                                setActiveDate(status.date);
                                window.dispatchEvent(new CustomEvent('birdpile:edit-entry', { detail: { date: status.date } }));
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            } : undefined}
                        />
                    );
                })}
            </div>
        </div>
    );
}
