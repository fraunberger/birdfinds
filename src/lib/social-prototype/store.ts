"use client";

import { useEffect, useSyncExternalStore, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// Types
// ============================================================

export type Category = string;
export type ProfileVisibility = 'public' | 'accounts' | 'private';

export const DEFAULT_CATEGORIES: Category[] = ['movie', 'tv', 'music', 'restaurant', 'beer', 'cooking', 'podcast', 'book'];
export const ALL_CATEGORIES: Category[] = DEFAULT_CATEGORIES;
export const PILE_CATEGORY_STATUS_DATE = '1900-01-01';
export const PILE_CATEGORY_STATUS_CONTENT = '__pile_category_item_bucket__';

export interface ConsumableItem {
    id: string;
    category: Category;
    title: string;
    subtitle?: string;
    rating?: number;
    notes?: string;
    image?: string;
    createdAt: number;
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

async function getLinkedMe(): Promise<MeResponse> {
    try {
        const response = await fetch('/api/social/me', { cache: 'no-store' });
        const raw = await response.text();
        if (!response.ok || !raw) {
            return { clerkUserId: null, linkedUserId: null, profile: null };
        }
        try {
            return JSON.parse(raw) as MeResponse;
        } catch {
            return { clerkUserId: null, linkedUserId: null, profile: null };
        }
    } catch {
        return { clerkUserId: null, linkedUserId: null, profile: null };
    }
}

async function socialWrite(action: string, payload: Record<string, unknown> = {}) {
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
        throw new Error(`Write failed (${action}): ${detail}`);
    }
    return data;
}

export const HIGHLIGHT_COLOR = '#fffb91';

export const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
    movie: { id: 'movie', label: 'Movie', shortLabel: 'FILM', titleLabel: 'Film Title', subtitleLabel: 'Director', subtitlePlaceholder: 'Director', ratingLabel: 'Score', color: '#f5d142', icon: '' },
    tv: { id: 'tv', label: 'TV Show', shortLabel: 'TV', titleLabel: 'Show Name', subtitleLabel: 'Season/Ep', subtitlePlaceholder: 'S1E1', ratingLabel: 'Rating', color: '#62d9f7', icon: '' },
    music: { id: 'music', label: 'Music', shortLabel: 'MUSIC', titleLabel: 'Song/Album', subtitleLabel: 'Artist', subtitlePlaceholder: 'Artist', ratingLabel: 'Rating', color: '#f78be0', icon: '' },
    restaurant: { id: 'restaurant', label: 'Restaurant', shortLabel: 'RESTAURANT', titleLabel: 'Place Name', subtitleLabel: 'Dish', subtitlePlaceholder: 'Dish', ratingLabel: 'Rating', color: '#7be08a', icon: '' },
    beer: { id: 'beer', label: 'Beer', shortLabel: 'BEER', titleLabel: 'Drink Name', subtitleLabel: 'Brewery/Type', subtitlePlaceholder: 'Brewery', ratingLabel: 'Rating', color: '#e8a94f', icon: '' },
    cooking: { id: 'cooking', label: 'Recipe', shortLabel: 'RECIPE', titleLabel: 'Dish Name', subtitleLabel: 'Ingredients', subtitlePlaceholder: 'One per line', ratingLabel: 'Rating', notesLabel: 'Instructions', notesPlaceholder: 'Step-by-step instructions...', color: '#f7756a', icon: '' },
    podcast: { id: 'podcast', label: 'Podcast', shortLabel: 'POD', titleLabel: 'Episode Title', subtitleLabel: 'Podcast Name', subtitlePlaceholder: 'Podcast Name', ratingLabel: 'Rating', color: '#b78ef5', icon: '' },
    book: { id: 'book', label: 'Book', shortLabel: 'BOOK', titleLabel: 'Book Title', subtitleLabel: 'Author', subtitlePlaceholder: 'Author', ratingLabel: 'Rating', color: '#6ab4f7', icon: '' },
};

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
    return cleaned.slice(0, 8);
};

export function getCategoryConfig(category: Category): CategoryConfig {
    const predefined = CATEGORY_CONFIGS[category];
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
    };

    const override = ACTIVE_CATEGORY_CONFIG_OVERRIDES[category];
    if (!override) return base;

    return {
        ...base,
        ...override,
        id: category,
    };
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
}

class SocialStore {
    private state: SocialState = {
        statuses: [],
        allStatuses: [],
        activeDate: getTodayDateString(),
        activeStatus: null,
        isLoaded: false,
        mutedUsers: []
    };
    private listeners = new Set<() => void>();
    private initialized = false;

    constructor() {
        if (typeof window !== 'undefined') {
            // Auto-fetch on client side init
            this.fetchStatuses();
            this.setupSubscription();
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

    resetAndRefresh() {
        this.state = {
            statuses: [],
            allStatuses: [],
            activeDate: getTodayDateString(),
            activeStatus: null,
            isLoaded: false,
            mutedUsers: [],
        };
        this.syncActiveStatus();
        this.emit();
        void this.fetchStatuses();
    }

    refresh() {
        void this.fetchStatuses();
    }

    private syncActiveStatus() {
        const { statuses, activeDate } = this.state;
        const existing = statuses.find(s => s.date === activeDate);
        if (existing) {
            this.state.activeStatus = existing;
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

    async fetchStatuses() {
        try {
            const me = await getLinkedMe();
            const linkedUserId = me.linkedUserId;

            // Fetch recent statuses (capped at 200, soft-deletes filtered at DB level)
            const { data: statusData, error: statusError } = await supabase
                .from('social_statuses')
                .select('*')
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(200);

            if (statusError) throw statusError;

            const statusRows = (statusData || []) as StatusRow[];
            const statusIds = statusRows.map((s) => s.id);

            // Scope items + comments to only fetched status IDs
            let itemData: Record<string, unknown>[] = [];
            let comments: CommentRow[] = [];

            if (statusIds.length > 0) {
                const { data: items, error: itemError } = await supabase
                    .from('social_items')
                    .select('*')
                    .in('status_id', statusIds);
                if (itemError) throw itemError;
                itemData = items || [];

                const { data: commentData, error: commentError } = await supabase
                    .from('social_comments')
                    .select('*')
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
                items: (itemsByStatus.get(s.id) || [])
                    .map(i => ({
                        id: i.id as string,
                        category: i.category as Category,
                        title: i.title as string,
                        subtitle: (i.subtitle as string | null) || undefined,
                        rating: (i.rating as number | null) ?? undefined,
                        notes: (i.notes as string | null) || undefined,
                        image: (i.image as string | null) || undefined,
                        createdAt: new Date(i.created_at as string).getTime()
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

            // Filter for current user (Journal view)
            const userStatuses = linkedUserId ? combined.filter(s => s.userId === linkedUserId) : combined;

            // Fetch Current User's Muted List
            let mutedUsers: string[] = [];
            if (linkedUserId) {
                const { data: myProfile } = await supabase
                    .from('user_profiles')
                    .select('muted_users')
                    .eq('id', linkedUserId)
                    .single();
                if (myProfile?.muted_users) {
                    mutedUsers = myProfile.muted_users || [];
                }
            }

            // Filter out muted users from allStatuses (Feed)
            const visibleStatuses = combined.filter(s => s.userId && !mutedUsers.includes(s.userId));

            this.state = {
                ...this.state,
                allStatuses: visibleStatuses,
                statuses: userStatuses.sort((a, b) => b.date.localeCompare(a.date)), // Sort journal by date
                mutedUsers,
                isLoaded: true
            };
            this.syncActiveStatus();
            this.emit();
        } catch (error) {
            console.error("Error fetching social data:", error);
            this.state.isLoaded = true;
            this.emit();
        }
    }

    // Debounce real-time re-fetches to prevent rapid-fire full refreshes
    private _fetchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private debouncedFetch = () => {
        if (this._fetchDebounceTimer) clearTimeout(this._fetchDebounceTimer);
        this._fetchDebounceTimer = setTimeout(() => this.fetchStatuses(), 500);
    };

    setupSubscription() {
        supabase
            .channel('social_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'social_statuses' }, this.debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'social_items' }, this.debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'social_comments' }, this.debouncedFetch)
            .subscribe();
    }

    async ensureActiveStatus(): Promise<string> {
        const { activeDate, statuses } = this.state;
        const existing = statuses.find(s => s.date === activeDate);

        // If we have a real status, return its ID
        if (existing && existing.id !== 'temp-optimistic') return existing.id;
        const response = await socialWrite('social.status.upsert', { date: activeDate, content: '' });
        const statusId = response?.statusId as string | undefined;
        if (!statusId) throw new Error('Failed to ensure status');
        await this.fetchStatuses();
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
            await this.fetchStatuses();
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

        try {
            await socialWrite('social.item.update', { itemId, item });
            await this.fetchStatuses();
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
            await this.fetchStatuses();
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
            await this.fetchStatuses();
        } catch (error) {
            console.error('Error adding item to pile category:', error);
            throw error;
        }
    }

    async togglePublished(statusId: string, published: boolean) {
        try {
            await socialWrite('social.status.publish', { statusId, published });
            await this.fetchStatuses();
        } catch (error) {
            console.error('Error toggling published:', error);
        }
    }

    async deleteStatus(statusId: string) {
        try {
            await socialWrite('social.status.delete', { statusId });
            await this.fetchStatuses();
        } catch (error) {
            console.error('Error deleting status:', error);
        }
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
            await this.fetchStatuses();
        } catch (error) {
            console.error("Error removing item:", error);
        }
    }

    async addComment(statusId: string, content: string) {
        try {
            await socialWrite('social.comment.add', { statusId, content });
            await this.fetchStatuses();
        } catch (error) {
            console.error("Error adding comment:", error);
            throw error;
        }
    }

    async deleteComment(commentId: string) {
        try {
            await socialWrite('social.comment.delete', { commentId });
            await this.fetchStatuses();
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
            await this.fetchStatuses();
        } catch (error) {
            console.error("Error soft deleting status:", error);
            throw error;
        }
    }

    async softDeleteComment(commentId: string, reason?: string) {
        try {
            await socialWrite('social.comment.soft_delete', { commentId, reason: reason || '' });
            await this.fetchStatuses();
        } catch (error) {
            console.error("Error soft deleting comment:", error);
            throw error;
        }
    }

    getAllItemsByCategory(category: Category): ConsumableItem[] {
        return this.state.statuses.flatMap(s => s.items).filter(i => i.category === category);
    }

    getUserItemsByCategory(category: Category, userId: string): ConsumableItem[] {
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

        await this.fetchStatuses();
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
        updateActiveStatus: (c: string) => socialStore.updateActiveStatus(c),
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
        getAllItemsByCategory: (c: Category) => socialStore.getAllItemsByCategory(c),
        getUserItemsByCategory: (c: Category, uid: string) => socialStore.getUserItemsByCategory(c, uid),
        getUserStatuses: (uid: string) => socialStore.getUserStatuses(uid),
        toggleMute: (uid: string) => socialStore.toggleMute(uid),
        refresh: () => socialStore.refresh(),
        resetAndRefresh: () => socialStore.resetAndRefresh(),
        mutedUsers: state.mutedUsers,
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
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [hasPublishedPost, setHasPublishedPost] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchProfile = async () => {
        try {
            const me = await getLinkedMe();
            const linkedUserId = me.linkedUserId;
            if (!linkedUserId) {
                setProfile(null);
                setIsAdmin(Boolean(me.isAdmin));
                setHasPublishedPost(false);
                return;
            }
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
                    .select('*')
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
            setLoading(false);
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
        const visibility = updates.visibility || (updates.isPrivate ? 'private' : undefined);
        await socialWrite('social.profile.upsert', {
            username: updates.username,
            avatarUrl: updates.avatarUrl,
            categories: updates.categories,
            isPrivate: updates.isPrivate,
            visibility,
            categoryConfigs: updates.categoryConfigs,
        });
        await fetchProfile();
    };



    useEffect(() => {
        fetchProfile();
    }, []);

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

    const fetchHabits = async () => {
        // If userId provided, fetch for that user, otherwise current user
        let targetId = userId;
        if (!targetId) {
            const me = await getLinkedMe();
            if (!me.linkedUserId) return;
            targetId = me.linkedUserId;
        }

        const { data } = await supabase
            .from('user_habits')
            .select('*')
            .eq('user_id', targetId)
            .order('sort_order');

        setHabits((data || []).map((h: HabitRow) => ({
            id: h.id,
            userId: h.user_id,
            name: h.name,
            icon: h.icon,
            sortOrder: h.sort_order
        })));

        // Fetch Logs (last 30 days roughly)
        const { data: logsData } = await supabase
            .from('habit_logs')
            .select('*')
            .eq('user_id', targetId);

        setHabitLogs(logsData || []);

        setLoading(false);
    };

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

    // Initial fetch, dep on userId
    useState(() => { fetchHabits(); });

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

    const fetchFollows = async () => {
        const me = await getLinkedMe();
        if (!me.linkedUserId) return;

        const { data } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', me.linkedUserId);

        setFollowing((data || []).map((f: FollowRow) => f.following_id));
    };

    const toggleFollow = async (targetUserId: string) => {
        await socialWrite('social.follow.toggle', { targetUserId });
        await fetchFollows();
    };

    useState(() => { fetchFollows(); });

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

    const fetch = async () => {
        if (!userId) return;
        setLoading(true);
        const { data } = await supabase
            .from('user_profiles')
            .select('*')
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
    };

    useState(() => { fetch(); });
    return { profile, loading };
}
