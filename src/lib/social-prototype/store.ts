"use client";

import { useSyncExternalStore, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// Types
// ============================================================

export type Category = 'movie' | 'tv' | 'music' | 'restaurant' | 'beer' | 'cooking' | 'podcast' | 'book';

export const ALL_CATEGORIES: Category[] = ['movie', 'tv', 'music', 'restaurant', 'beer', 'cooking', 'podcast', 'book'];

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
    userId?: string;
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

export interface UserProfile {
    id: string;
    username: string;
    avatarUrl?: string;
    categories: Category[];
    createdAt?: string;
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

export const HIGHLIGHT_COLOR = '#fffb91';

export const CATEGORY_CONFIGS: Record<Category, CategoryConfig> = {
    movie: { id: 'movie', label: 'Movie', shortLabel: 'FILM', titleLabel: 'Film Title', subtitleLabel: 'Director', subtitlePlaceholder: 'Director', ratingLabel: 'Score', color: '#fffb91', icon: '🎬' },
    tv: { id: 'tv', label: 'TV Show', shortLabel: 'TV', titleLabel: 'Show Name', subtitleLabel: 'Season/Ep', subtitlePlaceholder: 'S1E1', ratingLabel: 'Rating', color: '#91efff', icon: '📺' },
    music: { id: 'music', label: 'Music', shortLabel: 'MUSIC', titleLabel: 'Song/Album', subtitleLabel: 'Artist', subtitlePlaceholder: 'Artist', ratingLabel: 'Rating', color: '#ff91f9', icon: '🎵' },
    restaurant: { id: 'restaurant', label: 'Restaurant', shortLabel: 'FOOD', titleLabel: 'Place Name', subtitleLabel: 'Location/Dish', subtitlePlaceholder: 'Location', ratingLabel: 'Rating', color: '#91ff9c', icon: '🍽️' },
    beer: { id: 'beer', label: 'Beer/Drink', shortLabel: 'BEER', titleLabel: 'Drink Name', subtitleLabel: 'Brewery/Type', subtitlePlaceholder: 'Brewery', ratingLabel: 'Rating', color: '#ffd691', icon: '🍺' },
    cooking: { id: 'cooking', label: 'Cooking', shortLabel: 'COOK', titleLabel: 'Dish Name', subtitleLabel: 'Source/Type', subtitlePlaceholder: 'Source', ratingLabel: 'Rating', color: '#ffae91', icon: '👨‍🍳' },
    podcast: { id: 'podcast', label: 'Podcast', shortLabel: 'POD', titleLabel: 'Episode Title', subtitleLabel: 'Podcast Name', subtitlePlaceholder: 'Podcast Name', ratingLabel: 'Rating', color: '#d491ff', icon: '🎙️' },
    book: { id: 'book', label: 'Book', shortLabel: 'BOOK', titleLabel: 'Book Title', subtitleLabel: 'Author', subtitlePlaceholder: 'Author', ratingLabel: 'Rating', color: '#f5d142', icon: '📚' },
};

// ============================================================
// Store Implementation (Singleton with useSyncExternalStore)
// ============================================================

interface SocialState {
    statuses: Status[];
    allStatuses: Status[];
    activeDate: string;
    activeStatus: Status | null;
    isLoaded: boolean;
}

class SocialStore {
    private state: SocialState = {
        statuses: [],
        allStatuses: [],
        activeDate: getTodayDateString(),
        activeStatus: null,
        isLoaded: false
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
                createdAt: Date.now()
            };
        }
    }

    async fetchStatuses() {
        try {
            const { data: { user } } = await supabase.auth.getUser();

            // Fetch ALL statuses (public)
            const { data: statusData, error: statusError } = await supabase
                .from('social_statuses')
                .select('*')
                .order('date', { ascending: false });

            if (statusError) throw statusError;

            // Fetch ALL items (public)
            const { data: itemData, error: itemError } = await supabase
                .from('social_items')
                .select('*');

            if (itemError) throw itemError;

            const combined: Status[] = (statusData || []).map(s => ({
                id: s.id,
                content: s.content,
                date: s.date,
                userId: s.user_id,
                createdAt: new Date(s.created_at).getTime(),
                items: (itemData || [])
                    .filter(i => i.status_id === s.id)
                    .map(i => ({
                        id: i.id,
                        category: i.category as Category,
                        title: i.title,
                        subtitle: i.subtitle,
                        rating: i.rating,
                        notes: i.notes,
                        image: i.image,
                        createdAt: new Date(i.created_at).getTime()
                    }))
            }));

            // Filter for current user
            const userStatuses = user ? combined.filter(s => s.userId === user.id) : combined;

            this.state = {
                ...this.state,
                allStatuses: combined,
                statuses: userStatuses,
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

    setupSubscription() {
        const channel = supabase
            .channel('social_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'social_statuses' }, () => this.fetchStatuses())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'social_items' }, () => this.fetchStatuses())
            .subscribe();
    }

    async ensureActiveStatus(): Promise<string> {
        const { activeDate, statuses } = this.state;
        const existing = statuses.find(s => s.date === activeDate);

        // If we have a real status, return its ID
        if (existing && existing.id !== 'temp-optimistic') return existing.id;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Check DB for existing status first (race condition safety)
        const { data: dbExisting } = await supabase
            .from('social_statuses')
            .select('id')
            .eq('user_id', user.id)
            .eq('date', activeDate)
            .limit(1);

        if (dbExisting && dbExisting.length > 0) {
            await this.fetchStatuses(); // Refresh safely
            return dbExisting[0].id;
        }

        // Create new
        const { data, error } = await supabase
            .from('social_statuses')
            .insert({ content: '', date: activeDate, user_id: user.id })
            .select()
            .single();

        if (error) {
            // Handle race condition: Duplicate key violation (unique_date)
            // If another request created it while we were waiting, fetch it now.
            if (error.code === '23505') {
                console.log("Status race condition detected - fetching existing status");
                const { data: retryData, error: retryError } = await supabase
                    .from('social_statuses')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('date', activeDate)
                    .limit(1);

                const status = retryData?.[0];
                if (retryError || !status) {
                    throw retryError || new Error("Failed to recover from status race condition - status not found");
                }

                await this.fetchStatuses();
                return status.id;
            }
            throw error;
        }

        await this.fetchStatuses();
        return data.id;
    }

    async updateActiveStatus(content: string) {
        try {
            // Optimistic update
            const currentStatus = this.state.activeStatus;
            if (currentStatus) {
                this.state.activeStatus = { ...currentStatus, content };
                this.emit();
            }

            const id = await this.ensureActiveStatus();
            const { error } = await supabase
                .from('social_statuses')
                .update({ content })
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            console.error("Error updating status:", error);
        }
    }

    async addItemToActive(item: Omit<ConsumableItem, 'id' | 'createdAt'>) {
        try {
            const statusId = await this.ensureActiveStatus();
            const { error } = await supabase
                .from('social_items')
                .insert({
                    category: item.category,
                    title: item.title,
                    subtitle: item.subtitle,
                    rating: item.rating,
                    notes: item.notes,
                    image: item.image,
                    status_id: statusId
                });

            if (error) throw error;
            await this.fetchStatuses();
        } catch (error) {
            console.error("Error adding item:", error);
            throw error; // Propagate to UI
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

            const { error } = await supabase
                .from('social_items')
                .delete()
                .eq('id', itemId);

            if (error) throw error;
            await this.fetchStatuses();
        } catch (error) {
            console.error("Error removing item:", error);
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
}

export const socialStore = new SocialStore();

// Hook for React components
export function useSocialStore() {
    const state = useSyncExternalStore(
        (cb) => socialStore.subscribe(cb),
        () => socialStore.getState()
    );

    return {
        ...state,
        setActiveDate: (d: string) => socialStore.setActiveDate(d),
        updateActiveStatus: (c: string) => socialStore.updateActiveStatus(c),
        addItemToActive: (i: Omit<ConsumableItem, 'id' | 'createdAt'>) => socialStore.addItemToActive(i),
        removeItemFromActive: (id: string) => socialStore.removeItemFromActive(id),
        getAllItemsByCategory: (c: Category) => socialStore.getAllItemsByCategory(c),
        getUserItemsByCategory: (c: Category, uid: string) => socialStore.getUserItemsByCategory(c, uid),
        getUserStatuses: (uid: string) => socialStore.getUserStatuses(uid),
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
    const [loading, setLoading] = useState(true);

    const fetchProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setProfile(null);
                return;
            }
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            if (data) {
                setProfile({
                    id: data.id,
                    username: data.username,
                    avatarUrl: data.avatar_url,
                    categories: data.categories || [],
                    createdAt: data.created_at
                });
            } else {
                setProfile(null);
            }
        } catch (error) {
            console.error("Error fetching profile:", error);
        } finally {
            setLoading(false);
        }
    };

    const uploadAvatar = async (file: File) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
        return data.publicUrl;
    };

    const updateProfile = async (updates: Partial<UserProfile>) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const dbUpdates: any = {};
        if (updates.username) dbUpdates.username = updates.username;
        if (updates.avatarUrl) dbUpdates.avatar_url = updates.avatarUrl;
        if (updates.categories) dbUpdates.categories = updates.categories;

        // Upsert
        const { error } = await supabase
            .from('user_profiles')
            .upsert({ id: user.id, ...dbUpdates });

        if (error) throw error;
        await fetchProfile();
    };



    // Initial fetch
    useState(() => { fetchProfile(); });

    return {
        profile,
        loading,
        updateProfile,
        saveProfile: updateProfile, // Alias for backward compat
        uploadAvatar,
        refetch: fetchProfile
    };
}

export function useHabits(userId?: string) {
    const [habits, setHabits] = useState<Habit[]>([]);
    const [habitLogs, setHabitLogs] = useState<any[]>([]); // simplified type
    const [loading, setLoading] = useState(true);

    const fetchHabits = async () => {
        // If userId provided, fetch for that user, otherwise current user
        let targetId = userId;
        if (!targetId) {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            targetId = user.id;
        }

        const { data } = await supabase
            .from('user_habits')
            .select('*')
            .eq('user_id', targetId)
            .order('sort_order');

        setHabits((data || []).map((h: any) => ({
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

    const addHabit = async (name: string, icon: string = '✓') => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase.from('user_habits').insert({
            user_id: user.id,
            name,
            icon,
            sort_order: habits.length
        });
        await fetchHabits();
    };

    const removeHabit = async (id: string) => {
        await supabase.from('user_habits').delete().eq('id', id);
        await fetchHabits();
    };

    const toggleHabitLog = async (habitId: string, date: string, completed: boolean) => {
        // Optimistic
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        if (completed) {
            setHabitLogs(prev => [...prev, { habit_id: habitId, date, completed: true }]);
            await supabase.from('habit_logs').upsert({
                habit_id: habitId,
                user_id: user.id,
                date,
                completed: true
            }, { onConflict: 'habit_id, date' });
        } else {
            setHabitLogs(prev => prev.filter(l => !(l.habit_id === habitId && l.date === date)));
            await supabase.from('habit_logs').delete()
                .match({ habit_id: habitId, date });
        }
    };

    const isHabitCompleted = (habitId: string, date: string) => {
        return habitLogs.some(l => l.habit_id === habitId && l.date === date && l.completed);
    };

    // Initial fetch, dep on userId
    useState(() => { fetchHabits(); });

    return {
        habits,
        logs: habitLogs.map(l => ({ habitId: l.habit_id, date: l.date, completed: l.completed })),
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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id);

        setFollowing((data || []).map((f: any) => f.following_id));
    };

    const toggleFollow = async (targetUserId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const isFollowing = following.includes(targetUserId);

        if (isFollowing) {
            await supabase.from('follows').delete()
                .match({ follower_id: user.id, following_id: targetUserId });
        } else {
            await supabase.from('follows').insert({
                follower_id: user.id,
                following_id: targetUserId
            });
        }
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
            setProfile({
                id: data.id,
                username: data.username,
                avatarUrl: data.avatar_url,
                categories: data.categories || [],
                createdAt: data.created_at
            });
        }
        setLoading(false);
    };

    useState(() => { fetch(); });
    return { profile, loading };
}
