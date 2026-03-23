"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { CATEGORY_DEFINITIONS, getCategoryDef } from '@/lib/social-prototype/categories';
import type { SsotPattern, CouplingType, RatingScope, CategoryExtra } from '@/lib/social-prototype/categories';

// ============================================================
// Types
// ============================================================

export type Category = string;
export type ProfileVisibility = 'public' | 'accounts' | 'private';

export const DEFAULT_CATEGORIES: Category[] = ['movie', 'tv', 'music', 'restaurant', 'location', 'beer', 'cooking', 'exercise', 'podcast', 'book'];
export const ALL_CATEGORIES: Category[] = DEFAULT_CATEGORIES;
export const PILE_CATEGORY_STATUS_DATE = '1900-01-01';
export const PILE_CATEGORY_STATUS_CONTENT = '__pile_category_item_bucket__';
export const NON_PILE_CATEGORIES: Category[] = ['link'];
export const PROFILE_UPDATED_EVENT = 'birdfinds:profile-updated';

export interface ConsumableItem {
    id: string;
    category: Category;
    title: string;
    subtitle?: string;
    rating?: number;
    notes?: string;
    image?: string;
    createdAt: number;
    statusDate?: string; // YYYY-MM-DD date of the parent daily post
    consumedDates?: number[]; // epoch ms for each time consumed; length = total times tagged
}

export interface Status {
    id: string;
    content: string;
    date: string; // YYYY-MM-DD
    items: ConsumableItem[];
    comments: StatusComment[];
    userId?: string;
    published: boolean;
    createdAt: number;
    bundledDates?: string[]; // other dates this status covers (YYYY-MM-DD), excluding the primary date
    babyBirdUrl?: string; // when set, this status is a "baby bird" (single URL + commentary)
}

export interface StatusComment {
    id: string;
    statusId: string;
    userId: string;
    username: string;
    content: string;
    createdAt: number;
}

export interface CategoryConfig {
    id: Category;
    label: string;
    shortLabel: string;
    titleLabel: string;
    subtitleLabel: string;
    subtitlePlaceholder: string;
    ratingLabel: string;
    notesLabel?: string;
    notesPlaceholder?: string;
    color?: string;
    icon?: string;
    // Behavioral fields from categories.ts
    verb: string;
    ssotPattern: SsotPattern;
    coupling: CouplingType;
    hasRating: boolean;
    ratingScope: RatingScope | null;
    childLabel: string | null;
    extras: CategoryExtra[];
}

export interface CategoryConfigOverride {
    label?: string;
    shortLabel?: string;
    titleLabel?: string;
    subtitleLabel?: string;
    subtitlePlaceholder?: string;
    ratingLabel?: string;
    notesLabel?: string;
    notesPlaceholder?: string;
    color?: string;
}

export interface UserProfile {
    id: string;
    username: string;
    avatarUrl?: string;
    categories: Category[];
    visibility?: ProfileVisibility;
    isPrivate?: boolean;
    createdAt?: string;
    muted_users?: string[];
    categoryConfigs?: Record<string, CategoryConfigOverride>;
}

export interface Habit {
    id: string;
    userId: string;
    name: string;
    icon: string;
    sortOrder: number;
}

export interface FollowData {
    following: string[]; // array of userIds you follow
    followers: string[]; // array of userIds following you
}

export interface SavedItem {
    id: string;
    userId: string;
    itemId: string;       // references social_items.id
    category: Category;
    title: string;
    subtitle?: string;
    image?: string;
    notes?: string;
    rating?: number;
    sourceUserId: string;
    createdAt: number;
}

interface HabitLogRow {
    habit_id: string;
    date: string;
    completed: boolean;
    notes?: string;
}

interface HabitRow {
    id: string;
    user_id: string;
    name: string;
    icon: string;
    sort_order: number;
}

interface FollowRow {
    following_id: string;
}

interface CommentRow {
    id: string;
    status_id: string;
    user_id: string;
    content: string;
    created_at: string;
    deleted_at?: string | null;
}

interface StatusRow {
    id: string;
    content: string;
    date: string;
    user_id: string;
    published?: boolean;
    created_at: string;
    deleted_at?: string | null;
    bundled_dates?: unknown[] | null;
    baby_bird_url?: string | null;
}

interface MeResponse {
    clerkUserId: string | null;
    linkedUserId: string | null;
    isAdmin?: boolean;
    hasPublishedPost?: boolean;
    profile: {
        id: string;
        username: string;
        avatar_url?: string;
        categories?: Category[];
        visibility?: ProfileVisibility;
        is_private?: boolean;
        created_at?: string;
        muted_users?: string[];
        category_configs?: Record<string, CategoryConfigOverride>;
    } | null;
}

export const FEED_PAGE_SIZE = 15;
const FEED_FETCH_SIZE = FEED_PAGE_SIZE * 2;
const JOURNAL_PAGE_SIZE = 60;
// Profile data rarely changes mid-session; a longer TTL avoids re-fetching
// /api/social/me (2 Supabase queries) on every store operation.
const LINKED_ME_CACHE_TTL_MS = 60_000;
const LINKED_ME_EMPTY_CACHE_TTL_MS = 2_000;
let linkedMeCache: { value: MeResponse; expiresAt: number } | null = null;
let linkedMeInFlight: Promise<MeResponse> | null = null;

function cacheLinkedMe(value: MeResponse) {
    const hasLinkedIdentity = Boolean(value.clerkUserId && value.linkedUserId);
    const ttl = hasLinkedIdentity ? LINKED_ME_CACHE_TTL_MS : LINKED_ME_EMPTY_CACHE_TTL_MS;
    linkedMeCache = { value, expiresAt: Date.now() + ttl };
}

async function getLinkedMe(options?: { bustCache?: boolean }): Promise<MeResponse> {
    const empty: MeResponse = { clerkUserId: null, linkedUserId: null, profile: null };
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const now = Date.now();
    if (!options?.bustCache && linkedMeCache && linkedMeCache.expiresAt > now) {
        return linkedMeCache.value;
    }
    if (linkedMeInFlight) {
        return linkedMeInFlight;
    }

    linkedMeInFlight = (async () => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
            try {
                const response = await fetch('/api/social/me', { cache: 'no-store' });
                const raw = await response.text();
                if (!response.ok || !raw) {
                    if (attempt < 3) {
                        await sleep(120 * (attempt + 1));
                        continue;
                    }
                    cacheLinkedMe(empty);
                    return empty;
                }
                let parsed: MeResponse;
                try {
                    parsed = JSON.parse(raw) as MeResponse;
                } catch {
                    if (attempt < 3) {
                        await sleep(120 * (attempt + 1));
                        continue;
                    }
                    cacheLinkedMe(empty);
                    return empty;
                }

                // New signups can briefly race before Clerk->Supabase link creation finalizes.
                // Retry quickly so composer does not open while unlinked.
                if (parsed.clerkUserId && !parsed.linkedUserId && attempt < 3) {
                    await sleep(120 * (attempt + 1));
                    continue;
                }
                cacheLinkedMe(parsed);
                return parsed;
            } catch {
                if (attempt < 3) {
                    await sleep(120 * (attempt + 1));
                    continue;
                }
                cacheLinkedMe(empty);
                return empty;
            }
        }
        cacheLinkedMe(empty);
        return empty;
    })();
    try {
        return await linkedMeInFlight;
    } finally {
        linkedMeInFlight = null;
    }
}

async function socialWrite(action: string, payload: Record<string, unknown> = {}) {
    const maxAttempts = 3;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await fetch('/api/social/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, payload }),
            });
            const raw = await response.text();
            let data: { error?: string;[key: string]: unknown } = {};
            if (raw) {
                try {
                    data = JSON.parse(raw) as { error?: string;[key: string]: unknown };
                } catch {
                    data = { error: raw };
                }
            }
            if (!response.ok) {
                const detail = data?.error || raw || `${response.status} ${response.statusText}`;
                const retryable = response.status === 429 || response.status >= 500 || detail.toLowerCase().includes('network');
                if (retryable && attempt < maxAttempts) {
                    await sleep(200 * attempt);
                    continue;
                }
                throw new Error(`Write failed (${action}): ${detail}`);
            }
            return data;
        } catch (error) {
            if (attempt >= maxAttempts) {
                throw error;
            }
            await sleep(200 * attempt);
        }
    }

    throw new Error(`Write failed (${action}): exhausted retries`);
}

export const HIGHLIGHT_COLOR = '#fffb91';

// CATEGORY_CONFIGS is derived from the authoritative categories.ts definitions.
// To change category behavior, edit src/lib/social-prototype/categories.ts.
export const CATEGORY_CONFIGS: Record<string, CategoryConfig> = Object.fromEntries(
    Object.values(CATEGORY_DEFINITIONS).map((def) => [def.id, { ...def }])
);

let ACTIVE_CATEGORY_CONFIG_OVERRIDES: Record<string, CategoryConfigOverride> = {};

export function setActiveCategoryConfigOverrides(overrides?: Record<string, CategoryConfigOverride>) {
    ACTIVE_CATEGORY_CONFIG_OVERRIDES = overrides || {};
}

export function normalizeProfileVisibility(profile?: { visibility?: string | null; is_private?: boolean | null }): ProfileVisibility {
    if (profile?.is_private) return 'private';
    if (profile?.visibility === 'accounts') return 'accounts';
    if (profile?.visibility === 'private') return 'private';
    return 'public';
}

const toLabel = (value: string) => {
    const normalized = value.replace(/[_-]+/g, ' ').trim();
    if (!normalized) return 'Category';
    return normalized
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
};

const toShortLabel = (value: string) => {
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!cleaned) return 'CAT';
    return cleaned;
};

export function getCategoryConfig(category: Category): CategoryConfig {
    const predefined = CATEGORY_CONFIGS[category] ?? getCategoryDef(category);
    const base: CategoryConfig = predefined || {
        id: category,
        label: toLabel(category),
        shortLabel: toShortLabel(category),
        titleLabel: `${toLabel(category)} Title`,
        subtitleLabel: 'Details',
        subtitlePlaceholder: 'Details',
        ratingLabel: 'Rating',
        color: '#d4d4d4',
        icon: '',
        verb: 'tagged',
        ssotPattern: 'single',
        coupling: 'none',
        hasRating: true,
        ratingScope: 'entity',
        childLabel: null,
        extras: [],
    };

    // Never apply user overrides to predefined categories — overrides are only
    // meaningful for user-created custom categories. Applying them to predefined
    // categories corrupts labels (e.g. "RESTAURA" / "Details") when the logged-in
    // user happens to have a custom override stored under the same key.
    if (predefined) return base;

    const override = ACTIVE_CATEGORY_CONFIG_OVERRIDES[category];
    if (!override) return base;

    const merged = {
        ...base,
        ...override,
        id: category,
    };

    // Fix retroactive truncation: if the stored shortLabel is a prefix of the
    // full derived label (i.e. it was previously .slice(0,8)'d), replace it.
    const full = toShortLabel(category);
    if (merged.shortLabel && merged.shortLabel.length < full.length && full.startsWith(merged.shortLabel)) {
        merged.shortLabel = full;
    }

    return merged;
}

// ============================================================
// Store Implementation (Singleton with useSyncExternalStore)
// ============================================================

interface SocialState {
    statuses: Status[];
    allStatuses: Status[];
    activeDate: string;
    activeStatus: Status | null;
    isLoaded: boolean;
    mutedUsers: string[];
    feedHasMore: boolean;
    feedCursor: string | null; // ISO timestamp of the oldest loaded feed status
    savedItems: SavedItem[];
}

class SocialStore {
    private state: SocialState = {
        statuses: [],
        allStatuses: [],
        activeDate: getTodayDateString(),
        activeStatus: null,
        isLoaded: false,
        mutedUsers: [],
        feedHasMore: false,
        feedCursor: null,
        savedItems: [],
    };
    private listeners = new Set<() => void>();
    private _pollTimer: ReturnType<typeof setInterval> | null = null;
    private _fetchInFlight: Promise<void> | null = null;
    private _lastFetchAt = 0;
    private _postWriteRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        if (typeof window !== 'undefined') {
            // Auto-fetch on client side init
            void this.fetchStatuses({ force: true });
            this.setupBackgroundPolling();
        }
    }

    getState() {
        return this.state;
    }

    private emit() {
        this.listeners.forEach(l => l());
    }

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    setActiveDate(date: string) {
        this.state = { ...this.state, activeDate: date };
        this.syncActiveStatus();
        this.emit();
    }

    // For editing a specific status that may not be in the local statuses array
    // (e.g. an older post beyond JOURNAL_PAGE_SIZE). Directly sets activeStatus
    // and activeDate, and also inserts/updates the status in the statuses array
    // so that future syncActiveStatus() calls (from polling/refresh) don't clobber
    // it with a blank temp-optimistic.
    setActiveStatusForEdit(status: Status) {
        const inStatuses = this.state.statuses.some(s => s.id === status.id);
        const statuses = inStatuses
            ? this.state.statuses.map(s => s.id === status.id ? status : s)
            : [status, ...this.state.statuses];
        this.state = { ...this.state, activeDate: status.date, activeStatus: status, statuses };
        this.emit();
    }

    resetAndRefresh() {
        this.state = {
            statuses: [],
            allStatuses: [],
            activeDate: getTodayDateString(),
            activeStatus: null,
            isLoaded: false,
            mutedUsers: [],
            feedHasMore: false,
            feedCursor: null,
            savedItems: [],
        };
        this.syncActiveStatus();
        this.emit();
        return this.fetchStatuses({ force: true });
    }

    refresh() {
        return this.fetchStatuses({ force: true });
    }

    private syncActiveStatus() {
        const { statuses, activeDate } = this.state;
        const existing = statuses.find(s => s.date === activeDate);
        if (existing) {
            this.state.activeStatus = existing;
        } else {
            // Check if this date is bundled into another status
            const bundleParent = statuses.find(s => s.bundledDates?.includes(activeDate));
            if (bundleParent) {
                this.state.activeDate = bundleParent.date;
                this.state.activeStatus = bundleParent;
            } else {
                this.state.activeStatus = {
                    id: 'temp-optimistic',
                    content: '',
                    date: activeDate,
                    items: [],
                    comments: [],
                    published: false,
                    createdAt: Date.now()
                };
            }
        }
    }

    /** Check if a date is bundled into another status. */
    isDateBundled(date: string): { statusId: string; primaryDate: string } | null {
        for (const s of this.state.statuses) {
            if (s.bundledDates?.includes(date)) {
                return { statusId: s.id, primaryDate: s.date };
            }
        }
        return null;
    }

    async fetchStatuses(options?: { force?: boolean }) {
        const force = Boolean(options?.force);
        if (this._fetchInFlight) {
            return this._fetchInFlight;
        }
        const now = Date.now();
        if (!force && this.state.isLoaded && now - this._lastFetchAt < SocialStore.MIN_FETCH_INTERVAL_MS) {
            return;
        }
        this._lastFetchAt = now;
        this._fetchInFlight = (async () => {
            try {
                const me = await getLinkedMe();
                const linkedUserId = me.linkedUserId;
                const statusSelect = 'id,content,date,user_id,published,created_at,deleted_at,bundled_dates,baby_bird_url';

                const [journalResp, feedResp] = await Promise.all([
                    linkedUserId
                        ? supabase
                            .from('social_statuses')
                            .select(statusSelect)
                            .is('deleted_at', null)
                            .eq('user_id', linkedUserId)
                            .order('created_at', { ascending: false })
                            .limit(JOURNAL_PAGE_SIZE)
                        : Promise.resolve({ data: [], error: null }),
                    supabase
                        .from('social_statuses')
                        .select(statusSelect)
                        .is('deleted_at', null)
                        .eq('published', true)
                        .order('created_at', { ascending: false })
                        // Slight over-fetch so filtering still yields a full first page.
                        .limit(FEED_FETCH_SIZE),
                ]);
                if (journalResp.error) throw journalResp.error;
                if (feedResp.error) throw feedResp.error;

                const mergedStatusRows = new Map<string, StatusRow>();
                ((journalResp.data || []) as StatusRow[]).forEach((row) => mergedStatusRows.set(row.id, row));
                ((feedResp.data || []) as StatusRow[]).forEach((row) => mergedStatusRows.set(row.id, row));
                const statusRows = Array.from(mergedStatusRows.values());
                const statusIds = statusRows.map((s) => s.id);

                // Scope items + comments to only fetched status IDs
                let itemData: Record<string, unknown>[] = [];
                let comments: CommentRow[] = [];

                if (statusIds.length > 0) {
                    const { data: items, error: itemError } = await supabase
                        .from('social_items')
                        .select('id,status_id,category,title,subtitle,rating,notes,image,created_at,consumed_dates')
                        .in('status_id', statusIds);
                    if (itemError) throw itemError;
                    itemData = items || [];

                    const { data: commentData, error: commentError } = await supabase
                        .from('social_comments')
                        .select('id,status_id,user_id,content,created_at,deleted_at')
                        .is('deleted_at', null)
                        .in('status_id', statusIds);
                    comments = commentError ? [] : ((commentData || []) as CommentRow[]);
                }

                // Resolve comment author usernames
                const commentUserIds = Array.from(new Set(comments.map((comment) => comment.user_id)));
                let commentUsernames = new Map<string, string>();
                if (commentUserIds.length > 0) {
                    const { data: commentProfiles } = await supabase
                        .from('user_profiles')
                        .select('id,username')
                        .in('id', commentUserIds);
                    commentUsernames = new Map(
                        (commentProfiles || []).map((profile) => [profile.id as string, profile.username as string])
                    );
                }

                // Build Map-based lookups instead of nested .filter() (O(n+m) vs O(n×m))
                const itemsByStatus = new Map<string, typeof itemData>();
                for (const item of itemData) {
                    const sid = item.status_id as string;
                    const list = itemsByStatus.get(sid);
                    if (list) list.push(item);
                    else itemsByStatus.set(sid, [item]);
                }

                const commentsByStatus = new Map<string, CommentRow[]>();
                for (const comment of comments) {
                    const sid = comment.status_id;
                    const list = commentsByStatus.get(sid);
                    if (list) list.push(comment);
                    else commentsByStatus.set(sid, [comment]);
                }

                const combined: Status[] = statusRows.map((s) => ({
                    id: s.id,
                    content: s.content,
                    date: s.date,
                    userId: s.user_id,
                    published: s.published ?? false,
                    createdAt: new Date(s.created_at).getTime(),
                    bundledDates: Array.isArray(s.bundled_dates) ? s.bundled_dates as string[] : undefined,
                    babyBirdUrl: s.baby_bird_url || undefined,
                    items: (itemsByStatus.get(s.id) || [])
                        .map(i => ({
                            id: i.id as string,
                            category: i.category as Category,
                            title: i.title as string,
                            subtitle: (i.subtitle as string | null) || undefined,
                            rating: (i.rating as number | null) ?? undefined,
                            notes: (i.notes as string | null) || undefined,
                            image: (i.image as string | null) || undefined,
                            createdAt: new Date(i.created_at as string).getTime(),
                            statusDate: s.date,
                            consumedDates: Array.isArray(i.consumed_dates)
                                ? (i.consumed_dates as string[]).map((d) => new Date(d).getTime())
                                : undefined,
                        })),
                    comments: (commentsByStatus.get(s.id) || [])
                        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                        .map((comment) => ({
                            id: comment.id,
                            statusId: comment.status_id,
                            userId: comment.user_id,
                            username: commentUsernames.get(comment.user_id) || 'Unknown',
                            content: comment.content,
                            createdAt: new Date(comment.created_at).getTime(),
                        })),
                }));

                // Filter for current user (Journal view). If link resolution fails, never fall back
                // to global statuses here; that can leak another user's entry into composer.
                const userStatuses = linkedUserId
                    ? combined.filter(s => s.userId === linkedUserId).sort((a, b) => b.createdAt - a.createdAt)
                    : [];

                // Fetch Current User's Muted List
                const mutedUsers: string[] = Array.isArray(me.profile?.muted_users) ? me.profile.muted_users : [];

                // Fetch Current User's Saved Items
                let savedItems: SavedItem[] = [];
                if (linkedUserId) {
                    const { data: savedData } = await supabase
                        .from('saved_items')
                        .select('id,user_id,item_id,category,title,subtitle,image,notes,rating,source_user_id,created_at')
                        .eq('user_id', linkedUserId)
                        .order('created_at', { ascending: false });
                    savedItems = (savedData || []).map((row: Record<string, unknown>) => ({
                        id: row.id as string,
                        userId: row.user_id as string,
                        itemId: row.item_id as string,
                        category: row.category as Category,
                        title: row.title as string,
                        subtitle: (row.subtitle as string | null) || undefined,
                        image: (row.image as string | null) || undefined,
                        notes: (row.notes as string | null) || undefined,
                        rating: (row.rating as number | null) ?? undefined,
                        sourceUserId: row.source_user_id as string,
                        createdAt: new Date(row.created_at as string).getTime(),
                    }));
                }

                // Filter out muted users from allStatuses (Feed)
                const visibleStatuses = combined
                    .filter(s => s.userId && !mutedUsers.includes(s.userId))
                    .sort((a, b) => b.createdAt - a.createdAt);

                // Determine pagination state: if we got a full page from the feed
                // query, there are likely more statuses available.
                const feedHasMore = (feedResp.data || []).length >= FEED_FETCH_SIZE;
                const feedCursor = visibleStatuses.length > 0
                    ? new Date(visibleStatuses[visibleStatuses.length - 1].createdAt).toISOString()
                    : null;

                this.state = {
                    ...this.state,
                    allStatuses: visibleStatuses,
                    statuses: userStatuses,
                    mutedUsers,
                    savedItems,
                    isLoaded: true,
                    feedHasMore,
                    feedCursor,
                };
                this.syncActiveStatus();
                this.emit();
            } catch (error) {
                console.error("Error fetching social data:", error);
                this.state.isLoaded = true;
                this.emit();
            } finally {
                this._fetchInFlight = null;
            }
        })();
        return this._fetchInFlight;
    }

    // ── Background polling (replaces realtime subscription) ─────────────
    // Intentionally do not force-refresh on tab/app focus changes; users expect
    // composer/editor state to remain stable when switching windows.
    private static POLL_INTERVAL_MS = 180_000; // 3 minutes
    private static MIN_FETCH_INTERVAL_MS = 8_000;

    private schedulePostWriteRefresh() {
        if (this._postWriteRefreshTimer !== null) clearTimeout(this._postWriteRefreshTimer);
        this._postWriteRefreshTimer = setTimeout(() => {
            void this.fetchStatuses({ force: true });
        }, 900);
    }

    private setupBackgroundPolling() {
        // Long-interval background poll so the feed stays reasonably fresh
        this._pollTimer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                void this.fetchStatuses();
            }
        }, SocialStore.POLL_INTERVAL_MS);
    }

    /**
     * Loads the next page of feed statuses using cursor-based pagination.
     * Appends to `allStatuses` and updates `feedHasMore` / `feedCursor`.
     * No-op if there are no more pages or a fetch is already in-flight.
     */
    async loadMoreFeed(): Promise<void> {
        const { feedCursor, feedHasMore } = this.state;
        if (!feedHasMore || !feedCursor || this._fetchInFlight) return;

        const me = await getLinkedMe();
        const mutedUsers: string[] = Array.isArray(me.profile?.muted_users) ? me.profile.muted_users : [];
        const statusSelect = 'id,content,date,user_id,published,created_at,deleted_at,bundled_dates,baby_bird_url';

        const { data: nextPage, error } = await supabase
            .from('social_statuses')
            .select(statusSelect)
            .is('deleted_at', null)
            .eq('published', true)
            .lt('created_at', feedCursor)           // cursor: only older than current oldest
            .order('created_at', { ascending: false })
            .limit(FEED_FETCH_SIZE);

        if (error) { console.error('loadMoreFeed error:', error); return; }

        const newRows = (nextPage || []) as StatusRow[];
        if (newRows.length === 0) {
            this.state = { ...this.state, feedHasMore: false };
            this.emit();
            return;
        }

        const statusIds = newRows.map(s => s.id);

        const [{ data: items }, { data: commentData }] = await Promise.all([
            supabase
                .from('social_items')
                .select('id,status_id,category,title,subtitle,rating,notes,image,created_at,consumed_dates')
                .in('status_id', statusIds),
            supabase
                .from('social_comments')
                .select('id,status_id,user_id,content,created_at,deleted_at')
                .is('deleted_at', null)
                .in('status_id', statusIds),
        ]);

        const comments = (commentData || []) as CommentRow[];
        const commentUserIds = Array.from(new Set(comments.map(c => c.user_id)));
        let commentUsernames = new Map<string, string>();
        if (commentUserIds.length > 0) {
            const { data: profiles } = await supabase
                .from('user_profiles')
                .select('id,username')
                .in('id', commentUserIds);
            commentUsernames = new Map(
                (profiles || []).map(p => [p.id as string, p.username as string])
            );
        }

        const itemsByStatus = new Map<string, Record<string, unknown>[]>();
        for (const item of (items || [])) {
            const sid = (item as Record<string, unknown>).status_id as string;
            const list = itemsByStatus.get(sid);
            if (list) list.push(item as Record<string, unknown>);
            else itemsByStatus.set(sid, [item as Record<string, unknown>]);
        }

        const commentsByStatus = new Map<string, CommentRow[]>();
        for (const c of comments) {
            const list = commentsByStatus.get(c.status_id);
            if (list) list.push(c);
            else commentsByStatus.set(c.status_id, [c]);
        }

        const newStatuses: Status[] = newRows
            .filter(s => s.user_id && !mutedUsers.includes(s.user_id))
            .map(s => ({
                id: s.id,
                content: s.content,
                date: s.date,
                userId: s.user_id,
                published: s.published ?? false,
                createdAt: new Date(s.created_at).getTime(),
                bundledDates: Array.isArray(s.bundled_dates) ? s.bundled_dates as string[] : undefined,
                babyBirdUrl: s.baby_bird_url || undefined,
                items: (itemsByStatus.get(s.id) || []).map(i => ({
                    id: i.id as string,
                    category: i.category as Category,
                    title: i.title as string,
                    subtitle: (i.subtitle as string | null) || undefined,
                    rating: (i.rating as number | null) ?? undefined,
                    notes: (i.notes as string | null) || undefined,
                    image: (i.image as string | null) || undefined,
                    createdAt: new Date(i.created_at as string).getTime(),
                    consumedDates: Array.isArray(i.consumed_dates)
                        ? (i.consumed_dates as string[]).map(d => new Date(d).getTime())
                        : undefined,
                })),
                comments: (commentsByStatus.get(s.id) || [])
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                    .map(c => ({
                        id: c.id,
                        statusId: c.status_id,
                        userId: c.user_id,
                        username: commentUsernames.get(c.user_id) || 'Unknown',
                        content: c.content,
                        createdAt: new Date(c.created_at).getTime(),
                    })),
            }));

        const merged = [...this.state.allStatuses, ...newStatuses];
        const newFeedHasMore = newRows.length >= FEED_FETCH_SIZE;
        const newCursor = merged.length > 0
            ? new Date(merged[merged.length - 1].createdAt).toISOString()
            : feedCursor;

        this.state = {
            ...this.state,
            allStatuses: merged,
            feedHasMore: newFeedHasMore,
            feedCursor: newCursor,
        };
        this.emit();
    }

    async ensureActiveStatus(): Promise<string> {
        const { activeDate, statuses } = this.state;
        const existing = statuses.find(s => s.date === activeDate);

        // If we have a real status, return its ID
        if (existing && existing.id !== 'temp-optimistic') return existing.id;
        // Preserve any in-progress content so the upsert doesn't overwrite it
        const currentContent = this.state.activeStatus?.content || existing?.content || '';
        const response = await socialWrite('social.status.upsert', { date: activeDate, content: currentContent });
        const statusId = response?.statusId as string | undefined;
        if (!statusId) throw new Error('Failed to ensure status');
        const current = this.state.activeStatus;
        if (current?.id === 'temp-optimistic' && current.date === activeDate) {
            this.state.activeStatus = { ...current, id: statusId };
        }
        this.schedulePostWriteRefresh();
        return statusId;
    }

    async updateActiveStatus(content: string): Promise<string | undefined> {
        try {
            // Optimistic update
            const currentStatus = this.state.activeStatus;
            if (currentStatus) {
                this.state.activeStatus = { ...currentStatus, content };
                this.emit();
            }

            const id = await this.ensureActiveStatus();
            await socialWrite('social.status.upsert', { date: this.state.activeDate, content });
            return id;
        } catch (error) {
            console.error("Error updating status:", error);
            return undefined;
        }
    }

    async addItemToActive(item: Omit<ConsumableItem, 'id' | 'createdAt'>) {
        const optimisticItem: ConsumableItem = {
            id: `temp-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: Date.now(),
            statusDate: this.state.activeDate,
            category: item.category,
            title: item.title,
            subtitle: item.subtitle,
            rating: item.rating,
            notes: item.notes,
            image: item.image,
        };
        try {
            if (this.state.activeStatus) {
                this.state.activeStatus = {
                    ...this.state.activeStatus,
                    items: [...(this.state.activeStatus.items || []), optimisticItem],
                };
                this.emit();
            }

            const statusId = await this.ensureActiveStatus();
            const result = await socialWrite('social.item.add', {
                statusId,
                item: {
                    category: item.category,
                    title: item.title,
                    subtitle: item.subtitle,
                    rating: item.rating,
                    notes: item.notes,
                    image: item.image,
                }
            });
            if (this.state.activeStatus) {
                if (result?.mergedItemId) {
                    // Server merged into an existing SSOT — remove the optimistic item
                    // (the real item is already in the list under its own ID).
                    this.state.activeStatus = {
                        ...this.state.activeStatus,
                        items: (this.state.activeStatus.items || []).filter(
                            (i) => i.id !== optimisticItem.id
                        ),
                    };
                    this.emit();
                } else if (result?.newItemId) {
                    // Replace the temp ID with the real server-assigned ID immediately
                    // so that any edit opened before the post-write refresh can use
                    // updateItemInActive (real ID) instead of addItemToActive (duplicate).
                    this.state.activeStatus = {
                        ...this.state.activeStatus,
                        items: (this.state.activeStatus.items || []).map(
                            (i) => i.id === optimisticItem.id ? { ...i, id: result.newItemId as string } : i
                        ),
                    };
                    this.emit();
                }
            }
            this.schedulePostWriteRefresh();
        } catch (error) {
            if (this.state.activeStatus) {
                this.state.activeStatus = {
                    ...this.state.activeStatus,
                    items: (this.state.activeStatus.items || []).filter((i) => i.id !== optimisticItem.id),
                };
                this.emit();
            }
            console.error("Error adding item:", error);
            throw error; // Propagate to UI
        }
    }

    async updateItemInActive(itemId: string, item: Partial<Omit<ConsumableItem, 'id' | 'createdAt'>>) {
        const currentStatus = this.state.activeStatus;
        const previousItems = currentStatus?.items || [];

        if (currentStatus) {
            this.state.activeStatus = {
                ...currentStatus,
                items: previousItems.map((existing) => (existing.id === itemId ? { ...existing, ...item } : existing)),
            };
            this.emit();
        }

        // Temp IDs only exist in optimistic local state — the server record either
        // hasn't been created yet or the newItemId response hasn't arrived. Updating
        // local state above is correct; skip the server call.
        if (itemId.startsWith('temp')) return;

        try {
            await socialWrite('social.item.update', { itemId, item });
            this.schedulePostWriteRefresh();
        } catch (error) {
            if (currentStatus) {
                this.state.activeStatus = {
                    ...currentStatus,
                    items: previousItems,
                };
                this.emit();
            }
            console.error('Error updating item:', error);
            throw error;
        }
    }

    async addItemToStatus(statusId: string, item: Omit<ConsumableItem, 'id' | 'createdAt'>) {
        try {
            await socialWrite('social.item.add', {
                statusId,
                item: {
                    category: item.category,
                    title: item.title,
                    subtitle: item.subtitle,
                    rating: item.rating,
                    notes: item.notes,
                    image: item.image,
                }
            });
            this.schedulePostWriteRefresh();
        } catch (error) {
            console.error("Error adding item to status:", error);
            throw error;
        }
    }

    async addItemToPileCategory(item: Omit<ConsumableItem, 'id' | 'createdAt'>) {
        try {
            const response = await socialWrite('social.status.upsert', {
                date: PILE_CATEGORY_STATUS_DATE,
                content: PILE_CATEGORY_STATUS_CONTENT,
            });
            const statusId = response?.statusId as string | undefined;
            if (!statusId) throw new Error('Failed to ensure pile category status');

            await socialWrite('social.item.add', {
                statusId,
                item: {
                    category: item.category,
                    title: item.title,
                    subtitle: item.subtitle,
                    rating: item.rating,
                    notes: item.notes,
                    image: item.image,
                }
            });
            this.schedulePostWriteRefresh();
        } catch (error) {
            console.error('Error adding item to pile category:', error);
            throw error;
        }
    }

    async togglePublished(statusId: string, published: boolean) {
        try {
            await socialWrite('social.status.publish', { statusId, published });
            this.schedulePostWriteRefresh();
        } catch (error) {
            console.error('Error toggling published:', error);
        }
    }

    async deleteStatus(statusId: string) {
        // Optimistic: remove from local state immediately
        const prevStatuses = this.state.statuses;
        const prevAllStatuses = this.state.allStatuses;
        const prevActiveStatus = this.state.activeStatus;

        this.state = {
            ...this.state,
            statuses: this.state.statuses.filter(s => s.id !== statusId),
            allStatuses: this.state.allStatuses.filter(s => s.id !== statusId),
        };
        if (this.state.activeStatus?.id === statusId) {
            this.syncActiveStatus();
        }
        this.emit();

        try {
            await socialWrite('social.status.delete', { statusId });
            this.schedulePostWriteRefresh();
        } catch (error) {
            // Rollback on failure
            this.state = {
                ...this.state,
                statuses: prevStatuses,
                allStatuses: prevAllStatuses,
                activeStatus: prevActiveStatus,
            };
            this.emit();
            console.error('Error deleting status:', error);
            throw error;
        }
    }

    async setBundledDates(statusId: string, bundledDates: string[] | null) {
        await socialWrite('social.status.setBundledDates', { statusId, bundledDates });
        const update = (s: Status) =>
            s.id === statusId ? { ...s, bundledDates: bundledDates?.length ? bundledDates : undefined } : s;
        this.state = {
            ...this.state,
            statuses: this.state.statuses.map(update),
            allStatuses: this.state.allStatuses.map(update),
        };
        if (this.state.activeStatus?.id === statusId) {
            this.state.activeStatus = { ...this.state.activeStatus, bundledDates: bundledDates?.length ? bundledDates : undefined };
        }
        this.emit();
        this.schedulePostWriteRefresh();
    }

    async setBabyBirdUrl(statusId: string, url: string | null) {
        await socialWrite('social.status.setBabyBird', { statusId, url });
        const update = (s: Status) =>
            s.id === statusId
                ? { ...s, babyBirdUrl: url || undefined, ...(url ? { items: [] } : {}) }
                : s;
        this.state = {
            ...this.state,
            statuses: this.state.statuses.map(update),
            allStatuses: this.state.allStatuses.map(update),
        };
        if (this.state.activeStatus?.id === statusId) {
            this.state.activeStatus = update(this.state.activeStatus);
        }
        this.emit();
        this.schedulePostWriteRefresh();
    }

    async moveStatusToDate(statusId: string, newDate: string) {
        await socialWrite('social.status.changeDate', { statusId, newDate });
        // Remove old status from local state and refresh
        this.state = {
            ...this.state,
            statuses: this.state.statuses.filter(s => s.id !== statusId),
            allStatuses: this.state.allStatuses.filter(s => s.id !== statusId),
            activeDate: newDate,
        };
        this.syncActiveStatus();
        this.emit();
        this.schedulePostWriteRefresh();
    }

    async removeItemFromActive(itemId: string) {
        try {
            // Optimistic removal
            if (this.state.activeStatus && this.state.activeStatus.items) {
                this.state.activeStatus = {
                    ...this.state.activeStatus,
                    items: this.state.activeStatus.items.filter(i => i.id !== itemId)
                };
                this.emit();
            }

            await socialWrite('social.item.delete', { itemId });
            this.schedulePostWriteRefresh();
        } catch (error) {
            console.error("Error removing item:", error);
        }
    }

    async addComment(statusId: string, content: string) {
        try {
            await socialWrite('social.comment.add', { statusId, content });
            this.schedulePostWriteRefresh();
        } catch (error) {
            console.error("Error adding comment:", error);
            throw error;
        }
    }

    async deleteComment(commentId: string) {
        try {
            await socialWrite('social.comment.delete', { commentId });
            this.schedulePostWriteRefresh();
        } catch (error) {
            console.error("Error deleting comment:", error);
            throw error;
        }
    }

    async reportStatus(statusId: string, reason?: string) {
        try {
            await socialWrite('social.status.report', { statusId, reason: reason || '' });
        } catch (error) {
            console.error("Error reporting status:", error);
            throw error;
        }
    }

    async reportComment(commentId: string, reason?: string) {
        try {
            await socialWrite('social.comment.report', { commentId, reason: reason || '' });
        } catch (error) {
            console.error("Error reporting comment:", error);
            throw error;
        }
    }

    async softDeleteStatus(statusId: string, reason?: string) {
        try {
            await socialWrite('social.status.soft_delete', { statusId, reason: reason || '' });
            this.schedulePostWriteRefresh();
        } catch (error) {
            console.error("Error soft deleting status:", error);
            throw error;
        }
    }

    async softDeleteComment(commentId: string, reason?: string) {
        try {
            await socialWrite('social.comment.soft_delete', { commentId, reason: reason || '' });
            this.schedulePostWriteRefresh();
        } catch (error) {
            console.error("Error soft deleting comment:", error);
            throw error;
        }
    }

    async toggleSaveItem(item: ConsumableItem, sourceUserId: string) {
        const isSaved = this.state.savedItems.some(s => s.itemId === item.id);
        // Optimistic update
        if (isSaved) {
            this.state = {
                ...this.state,
                savedItems: this.state.savedItems.filter(s => s.itemId !== item.id),
            };
        } else {
            const optimistic: SavedItem = {
                id: `temp-saved-${Date.now()}`,
                userId: '',
                itemId: item.id,
                category: item.category,
                title: item.title,
                subtitle: item.subtitle,
                image: item.image,
                notes: item.notes,
                rating: item.rating,
                sourceUserId,
                createdAt: Date.now(),
            };
            this.state = {
                ...this.state,
                savedItems: [optimistic, ...this.state.savedItems],
            };
        }
        this.emit();
        try {
            await socialWrite('social.item.save.toggle', {
                itemId: item.id,
                sourceUserId,
                itemSnapshot: {
                    category: item.category,
                    title: item.title,
                    subtitle: item.subtitle,
                    image: item.image,
                    notes: item.notes,
                    rating: item.rating,
                },
            });
            this.schedulePostWriteRefresh();
        } catch (error) {
            // Rollback on failure
            this.schedulePostWriteRefresh();
            console.error('Error toggling save item:', error);
            throw error;
        }
    }

    getAllItemsByCategory(category: Category): ConsumableItem[] {
        if (NON_PILE_CATEGORIES.includes(category)) return [];
        return this.state.statuses.flatMap(s => s.items).filter(i => i.category === category);
    }

    getUserItemsByCategory(category: Category, userId: string): ConsumableItem[] {
        if (NON_PILE_CATEGORIES.includes(category)) return [];
        return this.state.allStatuses
            .filter(s => s.userId === userId)
            .flatMap(s => s.items)
            .filter(i => i.category === category);
    }

    getUserStatuses(userId: string): Status[] {
        return this.state.allStatuses.filter(s => s.userId === userId);
    }

    async toggleMute(userId: string) {
        const currentMuted = this.state.mutedUsers || [];
        const isMuted = currentMuted.includes(userId);
        let newMuted: string[];

        if (isMuted) {
            newMuted = currentMuted.filter(id => id !== userId);
        } else {
            newMuted = [...currentMuted, userId];
        }

        // Optimistic update
        this.state = { ...this.state, mutedUsers: newMuted };
        this.emit(); // IMPORTANT: emit change

        await socialWrite('social.mute.toggle', { targetUserId: userId });
        this.schedulePostWriteRefresh();
    }
}

export const socialStore = new SocialStore();

// Hook for React components
export function useSocialStore() {
    const state = useSyncExternalStore(
        (cb) => socialStore.subscribe(cb),
        () => socialStore.getState(),
        () => socialStore.getState()
    );

    return {
        ...state,
        setActiveDate: (d: string) => socialStore.setActiveDate(d),
        setActiveStatusForEdit: (s: Status) => socialStore.setActiveStatusForEdit(s),
        updateActiveStatus: (c: string) => socialStore.updateActiveStatus(c),
        ensureActiveStatus: () => socialStore.ensureActiveStatus(),
        addItemToActive: (i: Omit<ConsumableItem, 'id' | 'createdAt'>) => socialStore.addItemToActive(i),
        addItemToStatus: (statusId: string, i: Omit<ConsumableItem, 'id' | 'createdAt'>) => socialStore.addItemToStatus(statusId, i),
        addItemToPileCategory: (i: Omit<ConsumableItem, 'id' | 'createdAt'>) => socialStore.addItemToPileCategory(i),
        removeItemFromActive: (id: string) => socialStore.removeItemFromActive(id),
        updateItemInActive: (id: string, item: Partial<Omit<ConsumableItem, 'id' | 'createdAt'>>) => socialStore.updateItemInActive(id, item),
        addComment: (statusId: string, content: string) => socialStore.addComment(statusId, content),
        deleteComment: (commentId: string) => socialStore.deleteComment(commentId),
        reportStatus: (statusId: string, reason?: string) => socialStore.reportStatus(statusId, reason),
        reportComment: (commentId: string, reason?: string) => socialStore.reportComment(commentId, reason),
        softDeleteStatus: (statusId: string, reason?: string) => socialStore.softDeleteStatus(statusId, reason),
        softDeleteComment: (commentId: string, reason?: string) => socialStore.softDeleteComment(commentId, reason),
        togglePublished: (id: string, published: boolean) => socialStore.togglePublished(id, published),
        deleteStatus: (id: string) => socialStore.deleteStatus(id),
        moveStatusToDate: (id: string, newDate: string) => socialStore.moveStatusToDate(id, newDate),
        setBundledDates: (id: string, dates: string[] | null) => socialStore.setBundledDates(id, dates),
        setBabyBirdUrl: (id: string, url: string | null) => socialStore.setBabyBirdUrl(id, url),
        getAllItemsByCategory: (c: Category) => socialStore.getAllItemsByCategory(c),
        getUserItemsByCategory: (c: Category, uid: string) => socialStore.getUserItemsByCategory(c, uid),
        getUserStatuses: (uid: string) => socialStore.getUserStatuses(uid),
        toggleMute: (uid: string) => socialStore.toggleMute(uid),
        toggleSaveItem: (item: ConsumableItem, sourceUserId: string) => socialStore.toggleSaveItem(item, sourceUserId),
        refresh: () => socialStore.refresh(),
        resetAndRefresh: () => socialStore.resetAndRefresh(),
        mutedUsers: state.mutedUsers,
        savedItems: state.savedItems,
    };
}

// Helper
function getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


// ============================================================
// Other Hooks (UserProfile, Habits, Follows) 
// ============================================================

export function useUserProfile() {
    const { user, loading: authLoading } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [hasPublishedPost, setHasPublishedPost] = useState(false);
    const [loading, setLoading] = useState(true);
    const retryTimeoutRef = useRef<number | null>(null);
    const retryCountRef = useRef(0);
    const retryPendingRef = useRef(false);

    const fetchProfile = async () => {
        retryPendingRef.current = false;
        try {
            const me = await getLinkedMe({ bustCache: Boolean(user?.id) });
            const linkedUserId = me.linkedUserId;
            if (typeof window !== 'undefined' && retryTimeoutRef.current) {
                window.clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
            const backendAuthOutOfSync = Boolean(user?.id) && me.clerkUserId !== user?.id;
            if (!linkedUserId || backendAuthOutOfSync) {
                setProfile(null);
                setIsAdmin(Boolean(me.isAdmin));
                setHasPublishedPost(false);
                if (user?.id && retryCountRef.current < 8 && typeof window !== 'undefined') {
                    retryCountRef.current += 1;
                    // Safari can briefly restore Clerk client auth before
                    // same-site cookies are ready for server routes. Keep
                    // loading=true while retrying so onboarding does not flash.
                    retryPendingRef.current = true;
                    const timeoutId = window.setTimeout(() => {
                        void fetchProfile();
                    }, 200 * retryCountRef.current);
                    retryTimeoutRef.current = timeoutId;
                    return;
                }
                return;
            }
            retryCountRef.current = 0;
            setIsAdmin(Boolean(me.isAdmin));
            setHasPublishedPost(Boolean(me.hasPublishedPost));

            const fromMe = me.profile
                ? {
                    id: me.profile.id,
                    username: me.profile.username,
                    avatar_url: me.profile.avatar_url,
                    categories: me.profile.categories || [],
                    visibility: me.profile.visibility,
                    is_private: me.profile.is_private,
                    created_at: me.profile.created_at,
                    muted_users: me.profile.muted_users || [],
                    category_configs: me.profile.category_configs || {},
                }
                : null;

            const { data, error } = fromMe
                ? { data: fromMe, error: null }
                : await supabase
                    .from('user_profiles')
                    .select('id,username,avatar_url,categories,visibility,is_private,created_at,muted_users,category_configs')
                    .eq('id', linkedUserId)
                    .single();

            if (error && error.code !== 'PGRST116') throw error;

            if (data) {
                const visibility = normalizeProfileVisibility(data);
                const mappedProfile = {
                    id: data.id,
                    username: data.username,
                    avatarUrl: data.avatar_url,
                    categories: data.categories || [],
                    visibility,
                    isPrivate: visibility === 'private',
                    createdAt: data.created_at,
                    muted_users: data.muted_users || [],
                    categoryConfigs: data.category_configs || {},
                };
                setProfile(mappedProfile);
                setActiveCategoryConfigOverrides(mappedProfile.categoryConfigs);
            } else {
                setProfile(null);
                setActiveCategoryConfigOverrides({});
            }
        } catch (error) {
            console.error("Error fetching profile:", error);
        } finally {
            // Don't clear loading while a retry is pending — this prevents
            // the onboarding checklist from flashing before the profile loads
            // (common on Safari reload where the Supabase link takes a moment).
            if (!retryPendingRef.current) {
                setLoading(false);
            }
        }
    };

    const uploadAvatar = async (file: File) => {
        const response = await fetch('/api/social/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contentType: file.type || 'image/jpeg',
            }),
        });
        const raw = await response.text();
        let data: { error?: string; publicUrl?: string; path?: string; token?: string } = {};
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            data = {};
        }
        if (!response.ok) {
            const detail = data?.error || raw || `${response.status} ${response.statusText}`;
            throw new Error(`Failed to prepare avatar upload (${response.status}): ${detail}`);
        }
        if (!data?.path || !data?.token) {
            throw new Error('Avatar upload token missing');
        }

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .uploadToSignedUrl(data.path, data.token, file);
        if (uploadError) {
            throw new Error(`Failed to upload avatar: ${uploadError.message}`);
        }
        if (!data.publicUrl) {
            throw new Error('Avatar uploaded but public URL missing');
        }
        return data.publicUrl;
    };

    const updateProfile = async (updates: Partial<UserProfile>) => {
        const resolvedUsername = (updates.username
            || profile?.username
            || user?.username
            || user?.email?.split("@")[0]
            || "").trim();
        if (!resolvedUsername) {
            throw new Error("Username is required");
        }

        const visibility = updates.visibility
            || (updates.isPrivate ? 'private' : undefined)
            || profile?.visibility
            || (profile?.isPrivate ? 'private' : 'public');

        const categories = updates.categories ?? profile?.categories ?? [];
        const categoryConfigs = updates.categoryConfigs ?? profile?.categoryConfigs ?? {};
        const avatarUrl = updates.avatarUrl !== undefined ? updates.avatarUrl : profile?.avatarUrl;

        await socialWrite('social.profile.upsert', {
            username: resolvedUsername,
            avatarUrl,
            categories,
            isPrivate: visibility === 'private',
            visibility,
            categoryConfigs,
        });
        // Bust the linked-me cache so the next getLinkedMe() call re-fetches
        // fresh profile data (updated username, avatar, categories, etc.)
        linkedMeCache = null;
        await fetchProfile();
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
        }
    };



    useEffect(() => {
        if (authLoading) return;
        retryCountRef.current = 0;
        setLoading(true);
        void fetchProfile();
        if (typeof window === 'undefined') return;
        const handleProfileUpdated = () => {
            setLoading(true);
            void fetchProfile();
        };
        window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
        return () => {
            window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
            if (retryTimeoutRef.current) {
                window.clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };
    }, [authLoading, user?.id]);

    return {
        profile,
        isAdmin,
        hasPublishedPost,
        loading,
        updateProfile,
        saveProfile: updateProfile, // Alias for backward compat
        uploadAvatar,
        refetch: fetchProfile
    };
}

export function useHabits(userId?: string) {
    const [habits, setHabits] = useState<Habit[]>([]);
    const [habitLogs, setHabitLogs] = useState<HabitLogRow[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHabits = useCallback(async () => {
        // If userId provided, fetch for that user, otherwise current user
        let targetId = userId;
        if (!targetId) {
            const me = await getLinkedMe();
            if (!me.linkedUserId) {
                setHabits([]);
                setHabitLogs([]);
                setLoading(false);
                return;
            }
            targetId = me.linkedUserId;
        }

        const { data } = await supabase
            .from('user_habits')
            .select('id,user_id,name,icon,sort_order')
            .eq('user_id', targetId)
            .order('sort_order');

        setHabits((data || []).map((h: HabitRow) => ({
            id: h.id,
            userId: h.user_id,
            name: h.name,
            icon: h.icon,
            sortOrder: h.sort_order
        })));

        // Fetch logs for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const since = thirtyDaysAgo.toISOString().split("T")[0];

        const { data: logsData } = await supabase
            .from('habit_logs')
            .select('habit_id,date,completed,notes')
            .eq('user_id', targetId)
            .gte('date', since);

        setHabitLogs(logsData || []);

        setLoading(false);
    }, [userId]);

    const addHabit = async (name: string, icon: string = '') => {
        await socialWrite('social.habit.add', { name, icon });
        await fetchHabits();
    };

    const removeHabit = async (id: string) => {
        await socialWrite('social.habit.remove', { habitId: id });
        await fetchHabits();
    };

    const toggleHabitLog = async (habitId: string, date: string, completed: boolean, notes?: string) => {
        const replaceLocalLog = (nextNotes: string) => {
            setHabitLogs(prev => {
                const filtered = prev.filter(l => !(l.habit_id === habitId && l.date === date));
                return [...filtered, { habit_id: habitId, date, completed: true, notes: nextNotes }];
            });
        };

        if (completed) {
            replaceLocalLog(notes || '');
            await socialWrite('social.habit.log.toggle', {
                habitId,
                date,
                completed: true,
                notes: notes || '',
            });
        } else {
            setHabitLogs(prev => prev.filter(l => !(l.habit_id === habitId && l.date === date)));
            await socialWrite('social.habit.log.toggle', {
                habitId,
                date,
                completed: false,
            });
        }
    };

    const isHabitCompleted = (habitId: string, date: string) => {
        return habitLogs.some(l => l.habit_id === habitId && l.date === date && l.completed);
    };

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchHabits();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchHabits]);

    return {
        habits,
        logs: habitLogs.map(l => ({ habitId: l.habit_id, date: l.date, completed: l.completed, notes: l.notes || '' })),
        loading,
        addHabit,
        removeHabit,
        toggleHabitLog,
        isHabitCompleted,
        refetch: fetchHabits
    };
}

export function useFollows() {
    const [following, setFollowing] = useState<string[]>([]);

    const fetchFollows = useCallback(async () => {
        const me = await getLinkedMe();
        if (!me.linkedUserId) {
            setFollowing([]);
            return;
        }

        const { data } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', me.linkedUserId);

        setFollowing((data || []).map((f: FollowRow) => f.following_id));
    }, []);

    const toggleFollow = async (targetUserId: string) => {
        await socialWrite('social.follow.toggle', { targetUserId });
        await fetchFollows();
    };

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchFollows();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchFollows]);

    return {
        following,
        toggleFollow,
        follow: toggleFollow,
        unfollow: toggleFollow,
        isFollowing: (uid: string) => following.includes(uid),
        refetch: fetchFollows
    };
}

export function usePublicProfile(userId: string) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const fetch = useCallback(async () => {
        if (!userId) {
            setProfile(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        // Only select display-relevant columns; skip muted_users and
        // category_configs to reduce egress on public profile views.
        const { data } = await supabase
            .from('user_profiles')
            .select('id,username,avatar_url,categories,visibility,is_private,created_at,category_configs')
            .eq('id', userId)
            .single();

        if (data) {
            const visibility = normalizeProfileVisibility(data);
            setProfile({
                id: data.id,
                username: data.username,
                avatarUrl: data.avatar_url,
                categories: data.categories || [],
                visibility,
                isPrivate: visibility === 'private',
                createdAt: data.created_at,
                categoryConfigs: data.category_configs || {},
            });
        }
        setLoading(false);
    }, [userId]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetch();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetch]);
    return { profile, loading };
}

export function useSavedItems(userId: string) {
    const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchItems = useCallback(async () => {
        if (!userId) {
            setSavedItems([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const { data } = await supabase
            .from('saved_items')
            .select('id,user_id,item_id,category,title,subtitle,image,notes,rating,source_user_id,created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        setSavedItems((data || []).map((row: Record<string, unknown>) => ({
            id: row.id as string,
            userId: row.user_id as string,
            itemId: row.item_id as string,
            category: row.category as Category,
            title: row.title as string,
            subtitle: (row.subtitle as string | null) || undefined,
            image: (row.image as string | null) || undefined,
            notes: (row.notes as string | null) || undefined,
            rating: (row.rating as number | null) ?? undefined,
            sourceUserId: row.source_user_id as string,
            createdAt: new Date(row.created_at as string).getTime(),
        })));
        setLoading(false);
    }, [userId]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetchItems();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [fetchItems]);

    return { savedItems, loading, refetch: fetchItems };
}
