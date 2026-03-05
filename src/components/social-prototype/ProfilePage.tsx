"use client";

import React, { useMemo, useState } from 'react';
import { Ban, UserCheck, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
    usePublicProfile,
    useUserProfile,
    useSocialStore,
    useFollows,
    useSavedItems,
    getCategoryConfig,
    Category,
    ConsumableItem,
    PILE_CATEGORY_STATUS_DATE
} from '@/lib/social-prototype/store';
import { StatusCard } from './StatusCard';
import { StatusComposer } from './StatusComposer';
import { CategorySheet } from './CategorySheet';
import { HabitCalendar } from './HabitCalendar';
import { ConsumableModal } from './ConsumableModal';
import { getCanonicalItemKey } from '@/lib/social-prototype/items';
import { getItemExternalIdentityKey } from '@/lib/social-prototype/item-meta';

interface ProfilePageProps {
    userId: string;
    onBack: () => void;
    onClickProfile: (userId: string) => void;
    onSettings?: () => void;
}

export function ProfilePage({ userId, onBack, onClickProfile, onSettings }: ProfilePageProps) {
    const { user } = useAuth();
    const { profile: myProfile, isAdmin } = useUserProfile();
    const { profile, loading: profileLoading } = usePublicProfile(userId);
    const { getUserStatuses, getUserItemsByCategory, addItemToPileCategory, toggleMute, mutedUsers, setActiveStatusForEdit, toggleSaveItem, savedItems: storeSavedItems } = useSocialStore();
    const { isFollowing, follow, unfollow } = useFollows();
    const [openCategory, setOpenCategory] = useState<Category | null>(null);
    const [showHabitCalendar, setShowHabitCalendar] = useState(false);
    const [selectedTagItem, setSelectedTagItem] = useState<ConsumableItem | null>(null);
    const [statusSort, setStatusSort] = useState<'recent' | 'top'>('recent');
    const [statusCategoryFilter, setStatusCategoryFilter] = useState<'all' | Category>('all');

    const { savedItems: fetchedSavedItems, loading: savedItemsLoading } = useSavedItems(userId);
    const [wantsCategoryFilter, setWantsCategoryFilter] = useState<'all' | Category>('all');
    const [showWants, setShowWants] = useState(false);

    const isOwnProfile = myProfile?.id === userId;
    // On own profile, use the store's live savedItems (kept in sync by toggleSaveItem);
    // on other profiles, use what was fetched by useSavedItems.
    const savedItems = isOwnProfile ? storeSavedItems : fetchedSavedItems;
    const userStatuses = getUserStatuses(userId);
    const sortedFilteredStatuses = useMemo(() => {
        const visibleStatuses = userStatuses.filter((status) => status.date !== PILE_CATEGORY_STATUS_DATE);
        const withCategory = visibleStatuses.filter((status) => {
            if (statusCategoryFilter === 'all') return true;
            return status.items.some((item) => item.category === statusCategoryFilter);
        });

        if (statusSort === 'recent') {
            return withCategory.sort((a, b) => b.date.localeCompare(a.date));
        }

        return withCategory.sort((a, b) => {
            const aRatings = a.items.map((item) => item.rating).filter((rating): rating is number => typeof rating === 'number');
            const bRatings = b.items.map((item) => item.rating).filter((rating): rating is number => typeof rating === 'number');
            const aAvg = aRatings.length > 0 ? aRatings.reduce((sum, value) => sum + value, 0) / aRatings.length : -1;
            const bAvg = bRatings.length > 0 ? bRatings.reduce((sum, value) => sum + value, 0) / bRatings.length : -1;
            return bAvg - aAvg;
        });
    }, [userStatuses, statusSort, statusCategoryFilter]);

    if (profileLoading) {
        return (
            <div className="flex items-center justify-center py-20 font-mono">
                <div className="text-neutral-400 text-xs uppercase tracking-widest">Loading...</div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="font-mono text-center py-12">
                <p className="text-neutral-400 text-xs uppercase tracking-widest mb-4">Profile not found.</p>
            </div>
        );
    }

    const visibility = profile.visibility || (profile.isPrivate ? 'private' : 'public');
    if (!isOwnProfile && visibility === 'private') {
        return (
            <div className="font-mono text-center py-12">
                <p className="text-neutral-400 text-xs uppercase tracking-widest mb-4">Pile is private.</p>
            </div>
        );
    }

    if (!isOwnProfile && visibility === 'accounts' && !user) {
        return (
            <div className="font-mono text-center py-12">
                <p className="text-neutral-400 text-xs uppercase tracking-widest mb-4">Sign in to view this pile.</p>
            </div>
        );
    }

    const categoryItems: Record<string, ConsumableItem[]> = {};
    const dedupedCategoryItems: Record<string, ConsumableItem[]> = {};
    if (profile?.categories) {
        profile.categories.forEach(cat => {
            const raw = getUserItemsByCategory(cat, userId);
            categoryItems[cat] = raw;
            // Deduplicate for counts and sheets.
            // Prefer the stable externalId for API-linked items; fall back to canonical slug.
            const map = new Map<string, ConsumableItem>();
            for (const item of raw) {
                const key = getItemExternalIdentityKey(item.category, item.image) ?? getCanonicalItemKey(item);
                const existing = map.get(key);
                if (!existing || item.createdAt > existing.createdAt) {
                    map.set(key, item);
                }
            }
            dedupedCategoryItems[cat] = Array.from(map.values());
        });
    }

    const toggleCategory = (cat: Category) => {
        setOpenCategory(prev => prev === cat ? null : cat);
    };

    return (
        <div className="font-mono relative">
            {/* Profile Header */}
            <div className="text-center mb-6 border-b border-neutral-300 pb-5">
                {/* Avatar */}
                <div className="w-16 h-16 rounded-full bg-neutral-200 overflow-hidden mx-auto mb-2">
                    {profile.avatarUrl ? (
                        <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xl font-bold">
                            {profile.username?.[0]?.toUpperCase() || '?'}
                        </div>
                    )}
                </div>

                {/* Username */}
                <h2 className="text-sm font-bold uppercase tracking-widest">
                    {`${profile.username}'s Pile`}
                </h2>

                {/* Category icons */}
                {profile.categories && profile.categories.length > 0 && (
                    <div className="flex items-center justify-center gap-1.5 mt-1.5">
                        {profile.categories.map(cat => {
                            const config = getCategoryConfig(cat);
                            return (
                                <span key={cat} className="text-sm" title={config.label}>
                                    {config.icon}
                                </span>
                            );
                        })}
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-center gap-2 mt-3">
                    {isOwnProfile && onSettings && (
                        <button
                            onClick={onSettings}
                            className="text-[10px] uppercase tracking-widest px-3 py-1 border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                        >
                            Settings
                        </button>
                    )}
                    {!isOwnProfile && (
                        <>
                            <button
                                onClick={() => isFollowing(userId) ? unfollow(userId) : follow(userId)}
                                className={`h-7 w-7 inline-flex items-center justify-center border transition-colors ${isFollowing(userId)
                                    ? 'bg-neutral-800 text-white border-neutral-800 hover:bg-neutral-700'
                                    : 'text-neutral-600 border-neutral-400 hover:bg-neutral-100'
                                    }`}
                                title={isFollowing(userId) ? "Following" : "Follow"}
                            >
                                {isFollowing(userId) ? <UserCheck size={13} /> : <UserPlus size={13} />}
                            </button>
                            <button
                                onClick={() => toggleMute(userId)}
                                className={`h-7 w-7 inline-flex items-center justify-center border transition-colors ${mutedUsers?.includes(userId)
                                    ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                    : 'text-neutral-500 border-neutral-300 hover:bg-neutral-50 hover:text-neutral-700'
                                    }`}
                                title={mutedUsers?.includes(userId) ? "Unblock user" : "Block user"}
                            >
                                <Ban size={13} />
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => setShowHabitCalendar(true)}
                        className="text-[10px] uppercase tracking-widest px-3 py-1 border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                    >
                        Habits
                    </button>
                </div>

                <div className="mt-3 text-[10px] uppercase tracking-widest text-neutral-400">
                    <span>{userStatuses.length} posts</span>
                    <span className="mx-2">•</span>
                    <span>{Object.values(dedupedCategoryItems).flat().length} tagged items</span>
                    <span className="mx-2">•</span>
                    <span>{profile.categories?.length || 0} categories</span>
                </div>
            </div>

            {/* Two-column layout: tags sidebar + main content */}
            <div className="flex gap-4">
                {/* Left: Recent Tags */}
                <div className="hidden sm:block w-36 flex-shrink-0">
                    <h3 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2 border-b border-neutral-200 pb-1">
                        Recent Tags
                    </h3>
                    <div className="space-y-0.5">
                        {(() => {
                            // Aggregate recent items across all categories
                            const allItems = (profile.categories || [])
                                .flatMap(cat => (categoryItems[cat] || []).map(item => ({ ...item, cat })));
                            const sorted = allItems
                                .sort((a, b) => b.createdAt - a.createdAt)
                                .slice(0, 20);
                            if (sorted.length === 0) {
                                return <div className="text-[10px] text-neutral-300 py-2">No items yet</div>;
                            }
                            return sorted.map(item => {
                                const config = getCategoryConfig(item.category);
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setSelectedTagItem(item)}
                                        className="block w-full text-left text-[10px] font-mono truncate py-0.5 px-1.5 hover:bg-neutral-100 transition-colors cursor-pointer"
                                        title={`${config?.label}: ${item.title}`}
                                        style={{ borderLeft: `2px solid ${config?.color || '#d4d4d4'}` }}
                                    >
                                        {item.title}
                                    </button>
                                );
                            });
                        })()}
                    </div>
                </div>

                {/* Right: Main content */}
                <div className="flex-1 min-w-0">
                    {/* Category Dropdowns */}
                    {profile.categories && profile.categories.length > 0 && (
                        <div className="mb-6">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {profile.categories.map(cat => {
                                    const config = getCategoryConfig(cat);
                                    const count = dedupedCategoryItems[cat]?.length || 0;
                                    const isOpen = openCategory === cat;
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => toggleCategory(cat)}
                                            className={`text-left px-2.5 py-1.5 border text-[10px] uppercase tracking-wider transition-colors flex items-center justify-between ${isOpen
                                                ? 'bg-neutral-800 text-white border-neutral-800'
                                                : 'border-neutral-300 text-neutral-600 hover:border-neutral-500'
                                                }`}
                                            style={!isOpen ? {
                                                borderLeftColor: config.color || '#d4d4d4',
                                                borderLeftWidth: '3px',
                                            } : undefined}
                                        >
                                            <span>{config.label}</span>
                                            <span className={isOpen ? 'text-neutral-400' : 'text-neutral-400'}>{count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Category Sheet — slides over profile content */}
                    {openCategory && (
                        <CategorySheet
                            category={openCategory}
                            items={categoryItems[openCategory] || []}
                            onClose={() => setOpenCategory(null)}
                            canAddItem={isOwnProfile}
                            onAddItem={async (item) => {
                                await addItemToPileCategory(item);
                            }}
                        />
                    )}

                    {/* Want to Check Out Section */}
                    {!openCategory && (
                        <div className="mb-6">
                            <button
                                onClick={() => setShowWants(prev => !prev)}
                                className={`w-full text-left px-2.5 py-1.5 border text-[10px] uppercase tracking-wider transition-colors flex items-center justify-between ${showWants
                                    ? 'bg-neutral-800 text-white border-neutral-800'
                                    : 'border-neutral-300 text-neutral-600 hover:border-neutral-500'
                                    }`}
                                style={!showWants ? { borderLeftColor: '#a3a3a3', borderLeftWidth: '3px' } : undefined}
                            >
                                <span>Want to Check Out</span>
                                <span className={showWants ? 'text-neutral-400' : 'text-neutral-400'}>
                                    {savedItemsLoading ? '…' : savedItems.length}
                                </span>
                            </button>

                            {showWants && (
                                <div className="border border-t-0 border-neutral-200 p-3">
                                    {/* Category filter */}
                                    {savedItems.length > 0 && (
                                        <div className="mb-3">
                                            <select
                                                value={wantsCategoryFilter}
                                                onChange={e => setWantsCategoryFilter(e.target.value as Category | 'all')}
                                                className="px-2 py-1 text-[10px] uppercase tracking-widest border border-neutral-300 text-neutral-600 bg-white"
                                            >
                                                <option value="all">All Categories</option>
                                                {Array.from(new Set(savedItems.map(s => s.category))).map(cat => (
                                                    <option key={cat} value={cat}>
                                                        {getCategoryConfig(cat).label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {savedItemsLoading ? (
                                        <div className="text-[10px] text-neutral-400 uppercase tracking-widest py-2">Loading…</div>
                                    ) : savedItems.length === 0 ? (
                                        <div className="text-center py-6 text-neutral-400 text-xs uppercase tracking-widest border border-dashed border-neutral-200">
                                            {isOwnProfile
                                                ? 'Star items from others\' posts to save them here.'
                                                : 'No saved items yet.'}
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {savedItems
                                                .filter(s => wantsCategoryFilter === 'all' || s.category === wantsCategoryFilter)
                                                .map(saved => {
                                                    const config = getCategoryConfig(saved.category);
                                                    return (
                                                        <div
                                                            key={saved.id}
                                                            className="flex items-center gap-2 px-2 py-1.5 border border-neutral-100 hover:border-neutral-300 transition-colors"
                                                            style={{ borderLeftColor: config.color || '#d4d4d4', borderLeftWidth: '3px' }}
                                                        >
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-[11px] font-medium text-neutral-800 truncate">{saved.title}</div>
                                                                {saved.subtitle && (
                                                                    <div className="text-[10px] text-neutral-500 truncate">{saved.subtitle}</div>
                                                                )}
                                                                <div className="text-[9px] text-neutral-400 uppercase tracking-wider mt-0.5">{config.label}</div>
                                                            </div>
                                                            {isOwnProfile && (
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        try {
                                                                            await toggleSaveItem(
                                                                                { id: saved.itemId, category: saved.category, title: saved.title, subtitle: saved.subtitle, image: saved.image, notes: saved.notes, createdAt: saved.createdAt },
                                                                                saved.sourceUserId
                                                                            );
                                                                        } catch { /* ignore */ }
                                                                    }}
                                                                    className="flex-shrink-0 text-[10px] text-neutral-400 hover:text-red-500 px-1"
                                                                    title="Remove from Want to Check Out"
                                                                    aria-label="Remove saved item"
                                                                >
                                                                    ✕
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            {savedItems.filter(s => wantsCategoryFilter === 'all' || s.category === wantsCategoryFilter).length === 0 && (
                                                <div className="text-center py-4 text-neutral-400 text-xs uppercase tracking-widest">
                                                    No saved items in this category.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Status Feed (hidden when category sheet is open) */}
                    {!openCategory && (
                        <div>
                            {isOwnProfile && (
                                <div className="mb-4">
                                    <StatusComposer userCategories={profile.categories || []} />
                                </div>
                            )}
                            <h3 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3 border-b border-neutral-200 pb-1">
                                Posts
                            </h3>
                            <div className="mb-3 flex flex-wrap gap-2">
                                <button
                                    onClick={() => setStatusSort('recent')}
                                    className={`px-2 py-1 text-[10px] uppercase tracking-widest border ${statusSort === 'recent' ? 'bg-neutral-800 text-white border-neutral-800' : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'}`}
                                >
                                    Recent
                                </button>
                                <button
                                    onClick={() => setStatusSort('top')}
                                    className={`px-2 py-1 text-[10px] uppercase tracking-widest border ${statusSort === 'top' ? 'bg-neutral-800 text-white border-neutral-800' : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'}`}
                                >
                                    Highest Rated
                                </button>
                                <select
                                    value={statusCategoryFilter}
                                    onChange={(event) => setStatusCategoryFilter(event.target.value as Category | 'all')}
                                    className="px-2 py-1 text-[10px] uppercase tracking-widest border border-neutral-300 text-neutral-600 bg-white"
                                >
                                    <option value="all">All Categories</option>
                                    {(profile.categories || []).map((category) => (
                                        <option key={category} value={category}>
                                            {getCategoryConfig(category).label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-3">
                                {sortedFilteredStatuses.length === 0 ? (
                                    <div className="text-center py-8 text-neutral-400 text-xs uppercase tracking-widest border border-dashed border-neutral-200">
                                        {isOwnProfile
                                            ? 'No posts yet. Use the composer above to publish your first one.'
                                            : 'No posts in this view yet.'}
                                    </div>
                                ) : (
                                    sortedFilteredStatuses.map(status => (
                                        <StatusCard
                                            key={status.id}
                                            status={status}
                                            profile={profile}
                                            onClickProfile={onClickProfile}
                                            isOwn={isOwnProfile}
                                            isAdmin={isAdmin}
                                            currentUserId={myProfile?.id}
                                            onEdit={isOwnProfile ? () => {
                                                setActiveStatusForEdit(status);
                                                window.dispatchEvent(new CustomEvent('birdpile:edit-entry', { detail: { date: status.date, status } }));
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                            } : undefined}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Habit Calendar Overlay */}
            {showHabitCalendar && (
                <HabitCalendar
                    userId={userId}
                    onClose={() => setShowHabitCalendar(false)}
                />
            )}

            {/* Tag Item Modal */}
            {selectedTagItem && (
                <ConsumableModal
                    key={selectedTagItem.id}
                    isOpen={true}
                    initialCategory={selectedTagItem.category}
                    existingItem={selectedTagItem}
                    readOnly
                    onClose={() => setSelectedTagItem(null)}
                    onSave={() => { }}
                />
            )}
        </div>
    );
}
