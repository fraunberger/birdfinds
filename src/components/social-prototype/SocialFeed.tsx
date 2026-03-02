"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSocialStore, useFollows, UserProfile, Status, normalizeProfileVisibility, FEED_PAGE_SIZE } from '@/lib/social-prototype/store';
import { useAuth } from '@/lib/auth';
import { useUserProfile } from '@/lib/social-prototype/store';
import { StatusCard } from './StatusCard';
import { supabase } from '@/lib/supabase';

interface SocialFeedProps {
    onClickProfile: (userId: string) => void;
}

export function SocialFeed({ onClickProfile }: SocialFeedProps) {
    const { user } = useAuth();
    const { profile, isAdmin } = useUserProfile();
    const { allStatuses, setActiveDate, isLoaded } = useSocialStore();
    const { following, follow } = useFollows();
    const [mode, setMode] = useState<'all' | 'following'>('all');
    const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);
    const [openCommentsStatusId, setOpenCommentsStatusId] = useState<string | null>(null);
    const [profileCache, setProfileCache] = useState<Record<string, UserProfile>>({});
    const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);
    // Use a ref to track which IDs we've already fetched or are fetching, so we
    // don't re-trigger the effect every time profileCache state updates.
    const fetchedIdsRef = useRef<Set<string>>(new Set());

    // Fetch profiles for any new userIds that appear in the feed.
    // Dependency is only allStatuses + isLoaded — not profileCache — so we avoid
    // the cascade where setProfileCache → re-render → re-run effect → fetch again.
    const fetchMissingProfiles = useCallback(async (userIds: string[]) => {
        const missing = userIds.filter(id => !fetchedIdsRef.current.has(id));
        if (missing.length === 0) return;
        missing.forEach(id => fetchedIdsRef.current.add(id));

        const { data } = await supabase
            .from('user_profiles')
            .select('id,username,avatar_url,categories,visibility,is_private')
            .in('id', missing);

        if (data) {
            setProfileCache((prev) => {
                const next = { ...prev };
                data.forEach((p) => {
                    const visibility = normalizeProfileVisibility(p);
                    next[p.id] = {
                        id: p.id,
                        username: p.username,
                        avatarUrl: p.avatar_url,
                        categories: p.categories || [],
                        visibility,
                        isPrivate: visibility === 'private',
                    };
                });
                return next;
            });
        }
    }, []);

    useEffect(() => {
        if (!isLoaded) return;
        const userIds = [...new Set(allStatuses.map(s => s.userId).filter(Boolean) as string[])];
        void fetchMissingProfiles(userIds);
    }, [allStatuses, isLoaded, fetchMissingProfiles]);

    useEffect(() => {
        const handleOpenThread = (event: Event) => {
            const customEvent = event as CustomEvent<{ statusId?: string }>;
            const statusId = String(customEvent.detail?.statusId || "");
            if (!statusId) return;
            setMode('all');
            setVisibleCount((prev) => Math.max(prev, 200));
            setOpenCommentsStatusId(statusId);
            window.setTimeout(() => {
                const target = document.getElementById(`status-${statusId}`);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 30);
        };
        window.addEventListener('birdfinds:open-comment-thread', handleOpenThread as EventListener);
        return () => window.removeEventListener('birdfinds:open-comment-thread', handleOpenThread as EventListener);
    }, []);

    // Suggestions: only fetch once on initial load (not every time following changes)
    const suggestionsLoadedRef = useRef(false);
    useEffect(() => {
        if (!isLoaded || !user || suggestionsLoadedRef.current) return;
        suggestionsLoadedRef.current = true;
        const fetchSuggestions = async () => {
            const excluded = new Set([profile?.id, ...following].filter(Boolean) as string[]);
            const { data } = await supabase
                .from('user_profiles')
                .select('id,username,avatar_url,categories,visibility,is_private')
                .limit(12);
            const suggestions = (data || [])
                .filter((profile) => {
                    const visibility = normalizeProfileVisibility(profile);
                    if (visibility === 'private') return false;
                    return !excluded.has(profile.id);
                })
                .slice(0, 4)
                .map((profile) => ({
                    visibility: normalizeProfileVisibility(profile),
                    id: profile.id,
                    username: profile.username,
                    avatarUrl: profile.avatar_url,
                    categories: profile.categories || [],
                    isPrivate: normalizeProfileVisibility(profile) === 'private',
                } satisfies UserProfile));
            setSuggestedUsers(suggestions);
        };
        fetchSuggestions();
    }, [isLoaded, user, following, profile?.id]);

    if (!isLoaded) {
        return <div className="h-40 bg-neutral-100 mb-4 border border-neutral-300" />;
    }

    const linkedUserId = profile?.id || null;
    const isSignedInViewer = Boolean(user);
    const canViewProfile = (authorProfile?: UserProfile | null) => {
        if (!authorProfile) return false;
        const visibility = authorProfile.visibility || (authorProfile.isPrivate ? 'private' : 'public');
        if (visibility === 'private') return false;
        if (visibility === 'accounts') return isSignedInViewer;
        return true;
    };

    const publishedStatuses = allStatuses.filter(s => {
        if (!s.published) return false;
        if (linkedUserId && s.userId === linkedUserId) return true;
        const profile = s.userId ? profileCache[s.userId] : null;
        return canViewProfile(profile);
    });

    const feedStatuses: Status[] = mode === 'all'
        ? publishedStatuses
        : publishedStatuses.filter((s) => s.userId && (s.userId === linkedUserId || following.includes(s.userId)));
    // Sort strictly by chronology: newest date first, then newest post time.
    feedStatuses.sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return b.createdAt - a.createdAt;
    });
    const visibleFeedStatuses = feedStatuses.slice(0, visibleCount);
    const hasMoreStatuses = feedStatuses.length > visibleFeedStatuses.length;
    const followingPostCountToday = publishedStatuses.filter((status) => {
        if (!status.userId || !following.includes(status.userId)) return false;
        return status.date === getTodayDateString();
    }).length;

    return (
        <div className="font-mono">
            {/* Header with toggle */}
            <div className="border-b border-neutral-300 pb-2 mb-6 flex items-center justify-between">
                <h2 className="text-xs uppercase tracking-widest text-neutral-500">
                    {mode === 'all' ? 'Public Feed' : 'Following'}
                </h2>
                <div className="flex text-xs gap-0 border border-neutral-300">
                    <button
                        onClick={() => { setMode('all'); setVisibleCount(FEED_PAGE_SIZE); }}
                        className={`px-3 py-1 uppercase tracking-wider transition-colors ${mode === 'all'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-500 hover:bg-neutral-100'
                            }`}
                    >
                        Public Feed
                    </button>
                    <button
                        onClick={() => { setMode('following'); setVisibleCount(FEED_PAGE_SIZE); }}
                        className={`px-3 py-1 uppercase tracking-wider transition-colors border-l border-neutral-300 ${mode === 'following'
                            ? 'bg-neutral-800 text-white'
                            : 'text-neutral-500 hover:bg-neutral-100'
                            }`}
                    >
                        Following
                    </button>
                </div>
            </div>

            {user && mode === 'all' && (
                <div className="mb-4 border border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-500">
                    {followingPostCountToday > 0
                        ? `${followingPostCountToday} posts today from people you follow`
                        : 'No new posts today from people you follow'}
                </div>
            )}

            {/* Feed */}
            <div className="space-y-4">
                {visibleFeedStatuses.length === 0 && (
                    <div className="text-center py-8 text-neutral-400 text-xs uppercase tracking-widest border border-dashed border-neutral-200">
                        {mode === 'all'
                            ? 'No posts in the public feed yet. Be the first to publish.'
                            : user
                                ? 'No posts from accounts you follow yet.'
                                : 'Sign in to use Following feed.'}
                    </div>
                )}

                {mode === 'following' && user && visibleFeedStatuses.length === 0 && suggestedUsers.length > 0 && (
                    <div className="border border-neutral-200 p-3 bg-neutral-50">
                        <h3 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">Suggested People</h3>
                        <div className="space-y-2">
                            {suggestedUsers.map((profile) => (
                                <div key={profile.id} className="flex items-center justify-between border border-neutral-200 bg-white px-2 py-2">
                                    <button
                                        onClick={() => onClickProfile(profile.id)}
                                        className="text-xs text-neutral-700 hover:text-neutral-900"
                                    >
                                        {profile.username}
                                    </button>
                                    <button
                                        onClick={() => follow(profile.id)}
                                        className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 text-neutral-600 hover:bg-neutral-100"
                                    >
                                        Follow
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {visibleFeedStatuses.map(status => {
                    const isOwn = !!linkedUserId && status.userId === linkedUserId;
                    return (
                        <StatusCard
                            key={status.id}
                            status={status}
                            profile={status.userId ? profileCache[status.userId] : null}
                            onClickProfile={onClickProfile}
                            isOwn={isOwn}
                            isAdmin={isAdmin}
                            currentUserId={linkedUserId}
                            showPostReportButton={true}
                            disableItemEditing={true}
                            forceShowComments={openCommentsStatusId === status.id}
                            onEdit={isOwn ? () => {
                                setActiveDate(status.date);
                                window.dispatchEvent(new CustomEvent('birdpile:edit-entry', { detail: { date: status.date } }));
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            } : undefined}
                        />
                    );
                })}

                {hasMoreStatuses && (
                    <div className="pt-1">
                        <button
                            type="button"
                            onClick={() => setVisibleCount((current) => current + FEED_PAGE_SIZE)}
                            className="w-full border border-neutral-300 px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-600 hover:bg-neutral-100"
                        >
                            View more
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function getTodayDateString() {
    // Use America/New_York (EST/EDT) as the canonical timezone for "today".
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find(p => p.type === 'year')!.value;
    const month = parts.find(p => p.type === 'month')!.value;
    const day = parts.find(p => p.type === 'day')!.value;
    return `${year}-${month}-${day}`;
}
