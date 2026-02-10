"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
// Types
// ============================================================

export type Category = 'movie' | 'tv' | 'music' | 'restaurant' | 'beer' | 'cooking' | 'podcast';

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

export interface HabitLog {
    id: string;
    habitId: string;
    userId: string;
    date: string;
    completed: boolean;
}

// ============================================================
// Constants
// ============================================================

export const HIGHLIGHT_COLOR = '#fffb91';

export const CATEGORY_CONFIGS: Record<Category, CategoryConfig> = {
    movie: { id: 'movie', label: 'Movie', shortLabel: 'FILM', titleLabel: 'Film Title', subtitleLabel: 'Director', subtitlePlaceholder: '', ratingLabel: 'Score', color: '#fffb91', icon: '🎬' },
    tv: { id: 'tv', label: 'TV Show', shortLabel: 'TV', titleLabel: 'Show Name', subtitleLabel: 'Season', subtitlePlaceholder: '', ratingLabel: 'Score', color: '#91dfff', icon: '📺' },
    music: { id: 'music', label: 'Music', shortLabel: 'MUSIC', titleLabel: 'Song or Album', subtitleLabel: 'Artist', subtitlePlaceholder: '', ratingLabel: 'Score', color: '#ff91f4', icon: '🎵' },
    podcast: { id: 'podcast', label: 'Podcast', shortLabel: 'POD', titleLabel: 'Episode Name', subtitleLabel: 'Podcast', subtitlePlaceholder: '', ratingLabel: 'Score', color: '#ffb391', icon: '🎙️' },
    restaurant: { id: 'restaurant', label: 'Restaurant', shortLabel: 'REST', titleLabel: 'Restaurant Name', subtitleLabel: 'Cuisine', subtitlePlaceholder: '', ratingLabel: 'Score', color: '#91ffb3', icon: '🍽️' },
    beer: { id: 'beer', label: 'Beer', shortLabel: 'BEER', titleLabel: 'Beer Name', subtitleLabel: 'Style', subtitlePlaceholder: '', ratingLabel: 'Score', notesLabel: 'Brewery & Notes', notesPlaceholder: '', color: '#e6ff91', icon: '🍺' },
    cooking: { id: 'cooking', label: 'Cooking', shortLabel: 'COOK', titleLabel: 'Dish Name', subtitleLabel: 'Recipe Link', subtitlePlaceholder: 'https://', ratingLabel: 'Score', notesLabel: 'Recipe', notesPlaceholder: '', color: '#d191ff', icon: '👨‍🍳' },
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_CONFIGS) as Category[];

// ============================================================
// Helper
// ============================================================

function getTodayDateString() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - (offset * 60 * 1000));
    return local.toISOString().split('T')[0];
}

// ============================================================
// useUserProfile — manages the current user's profile
// ============================================================

export function useUserProfile() {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }

            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error fetching profile:', error);
            }

            if (data) {
                setProfile({
                    id: data.id,
                    username: data.username,
                    avatarUrl: data.avatar_url,
                    categories: (data.categories as Category[]) || [],
                });
            } else {
                setProfile(null);
            }
        } catch (err) {
            console.error('Error fetching profile:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    const saveProfile = async (updates: { username: string; avatarUrl?: string; categories: Category[] }) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const payload = {
            id: user.id,
            username: updates.username,
            avatar_url: updates.avatarUrl || null,
            categories: updates.categories,
            updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
            .from('user_profiles')
            .upsert(payload);

        if (error) throw error;

        setProfile({
            id: user.id,
            username: updates.username,
            avatarUrl: updates.avatarUrl,
            categories: updates.categories,
        });
    };

    const uploadAvatar = async (file: File): Promise<string> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const ext = file.name.split('.').pop();
        const path = `${user.id}/avatar.${ext}`;

        const { error } = await supabase.storage
            .from('avatars')
            .upload(path, file, { upsert: true });

        if (error) throw error;

        const { data } = supabase.storage
            .from('avatars')
            .getPublicUrl(path);

        return data.publicUrl;
    };

    return { profile, loading, saveProfile, uploadAvatar, refetch: fetchProfile };
}

// ============================================================
// useHabits — manage habit definitions and daily logs
// ============================================================

export function useHabits(targetUserId?: string) {
    const [habits, setHabits] = useState<Habit[]>([]);
    const [logs, setLogs] = useState<HabitLog[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHabits = useCallback(async () => {
        try {
            const userId = targetUserId || (await supabase.auth.getUser()).data.user?.id;
            if (!userId) { setLoading(false); return; }

            const { data: habitData } = await supabase
                .from('user_habits')
                .select('*')
                .eq('user_id', userId)
                .order('sort_order', { ascending: true });

            const { data: logData } = await supabase
                .from('habit_logs')
                .select('*')
                .eq('user_id', userId);

            setHabits((habitData || []).map(h => ({
                id: h.id,
                userId: h.user_id,
                name: h.name,
                icon: h.icon || '✓',
                sortOrder: h.sort_order || 0,
            })));

            setLogs((logData || []).map(l => ({
                id: l.id,
                habitId: l.habit_id,
                userId: l.user_id,
                date: l.date,
                completed: l.completed,
            })));
        } catch (err) {
            console.error('Error fetching habits:', err);
        } finally {
            setLoading(false);
        }
    }, [targetUserId]);

    useEffect(() => { fetchHabits(); }, [fetchHabits]);

    const addHabit = async (name: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('user_habits')
            .insert({ user_id: user.id, name, sort_order: habits.length });

        if (error) console.error('Error adding habit:', error);
        else await fetchHabits();
    };

    const removeHabit = async (habitId: string) => {
        const { error } = await supabase
            .from('user_habits')
            .delete()
            .eq('id', habitId);

        if (error) console.error('Error removing habit:', error);
        else await fetchHabits();
    };

    const toggleHabitLog = async (habitId: string, date: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const existing = logs.find(l => l.habitId === habitId && l.date === date);

        if (existing) {
            if (existing.completed) {
                await supabase.from('habit_logs').delete().eq('id', existing.id);
            } else {
                await supabase.from('habit_logs').update({ completed: true }).eq('id', existing.id);
            }
        } else {
            await supabase.from('habit_logs').insert({
                habit_id: habitId,
                user_id: user.id,
                date,
                completed: true,
            });
        }
        await fetchHabits();
    };

    const isHabitCompleted = (habitId: string, date: string) => {
        return logs.some(l => l.habitId === habitId && l.date === date && l.completed);
    };

    return { habits, logs, loading, addHabit, removeHabit, toggleHabitLog, isHabitCompleted, refetch: fetchHabits };
}

// ============================================================
// useFollows — follow/unfollow
// ============================================================

export function useFollows() {
    const [following, setFollowing] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchFollowing = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }

            const { data } = await supabase
                .from('follows')
                .select('following_id')
                .eq('follower_id', user.id);

            setFollowing((data || []).map(f => f.following_id));
        } catch (err) {
            console.error('Error fetching follows:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchFollowing(); }, [fetchFollowing]);

    const follow = async (userId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase.from('follows').insert({ follower_id: user.id, following_id: userId });
        await fetchFollowing();
    };

    const unfollow = async (userId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase.from('follows').delete()
            .eq('follower_id', user.id)
            .eq('following_id', userId);
        await fetchFollowing();
    };

    const isFollowing = (userId: string) => following.includes(userId);

    return { following, loading, follow, unfollow, isFollowing, refetch: fetchFollowing };
}

// ============================================================
// useSocialStore — main store (modified to support social feed)
// ============================================================

export function useSocialStore() {
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [allStatuses, setAllStatuses] = useState<Status[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    const [activeDate, setActiveDate] = useState<string>(getTodayDateString());
    const [activeStatus, setActiveStatus] = useState<Status | null>(null);

    const fetchStatuses = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();

            // Fetch ALL statuses (public) with items
            const { data: statusData, error: statusError } = await supabase
                .from('social_statuses')
                .select('*')
                .order('date', { ascending: false });

            if (statusError) throw statusError;

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

            setAllStatuses(combined);

            // User's own statuses
            if (user) {
                setStatuses(combined.filter(s => s.userId === user.id));
            } else {
                setStatuses(combined);
            }
        } catch (error) {
            console.error("Error fetching social data:", error);
        } finally {
            setIsLoaded(true);
        }
    }, []);

    // Sync activeStatus
    useEffect(() => {
        if (!isLoaded) return;
        const existing = statuses.find(s => s.date === activeDate);
        if (existing) {
            setActiveStatus(existing);
        } else {
            setActiveStatus({
                id: 'temp-optimistic',
                content: '',
                date: activeDate,
                items: [],
                createdAt: Date.now()
            });
        }
    }, [statuses, activeDate, isLoaded]);

    useEffect(() => {
        fetchStatuses();
        const channel = supabase
            .channel('social_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'social_statuses' }, fetchStatuses)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'social_items' }, fetchStatuses)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchStatuses]);

    const ensureActiveStatus = async (): Promise<string> => {
        const existing = statuses.find(s => s.date === activeDate);
        if (existing && existing.id !== 'temp-optimistic') return existing.id;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .from('social_statuses')
            .insert({ content: '', date: activeDate, user_id: user.id })
            .select()
            .single();

        if (error) throw error;
        await fetchStatuses();
        return data.id;
    };

    const updateActiveStatus = async (content: string) => {
        try {
            const id = await ensureActiveStatus();
            const { error } = await supabase
                .from('social_statuses')
                .update({ content })
                .eq('id', id);

            if (error) throw error;
            setActiveStatus(prev => prev ? { ...prev, content, id } : null);
        } catch (error) {
            console.error("Error updating status:", error);
        }
    };

    const addItemToActive = async (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => {
        try {
            const statusId = await ensureActiveStatus();
            const { error } = await supabase
                .from('social_items')
                .insert({
                    status_id: statusId,
                    category: item.category,
                    title: item.title,
                    subtitle: item.subtitle,
                    rating: item.rating,
                    notes: item.notes,
                    image: item.image
                });

            if (error) throw error;
            await fetchStatuses();
        } catch (error) {
            console.error("Error adding item:", error);
        }
    };

    const removeItemFromActive = async (itemId: string) => {
        try {
            const { error } = await supabase
                .from('social_items')
                .delete()
                .eq('id', itemId);

            if (error) throw error;
            setActiveStatus(prev => {
                if (!prev) return null;
                return { ...prev, items: prev.items.filter(i => i.id !== itemId) };
            });
        } catch (error) {
            console.error("Error deleting item:", error);
        }
    };

    const getAllItemsByCategory = (category: Category) => {
        return statuses.flatMap(s => s.items).filter(i => i.category === category);
    };

    // Social feed: get statuses from followed users + self
    const getFeedStatuses = (followingIds: string[], currentUserId?: string) => {
        const ids = currentUserId ? [...followingIds, currentUserId] : followingIds;
        return allStatuses.filter(s => s.userId && ids.includes(s.userId));
    };

    // Get statuses for a specific user
    const getUserStatuses = (userId: string) => {
        return allStatuses.filter(s => s.userId === userId);
    };

    // Get all items for a user by category
    const getUserItemsByCategory = (userId: string, category: Category) => {
        return allStatuses
            .filter(s => s.userId === userId)
            .flatMap(s => s.items)
            .filter(i => i.category === category);
    };

    return {
        statuses,
        allStatuses,
        activeStatus,
        activeDate,
        setActiveDate,
        updateActiveStatus,
        addItemToActive,
        removeItemFromActive,
        getAllItemsByCategory,
        getFeedStatuses,
        getUserStatuses,
        getUserItemsByCategory,
        isLoaded
    };
}

// ============================================================
// usePublicProfile — fetch any user's profile
// ============================================================

export function usePublicProfile(userId: string | null) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) { setLoading(false); return; }

        const fetch = async () => {
            try {
                const { data, error } = await supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (error) {
                    console.error('Error fetching public profile:', error);
                    setProfile(null);
                } else if (data) {
                    setProfile({
                        id: data.id,
                        username: data.username,
                        avatarUrl: data.avatar_url,
                        categories: (data.categories as Category[]) || [],
                    });
                }
            } catch (err) {
                console.error('Error:', err);
            } finally {
                setLoading(false);
            }
        };

        fetch();
    }, [userId]);

    return { profile, loading };
}
