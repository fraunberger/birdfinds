"use client";

import React, { useState } from 'react';
import {
    usePublicProfile,
    useSocialStore,
    useFollows,
    CATEGORY_CONFIGS,
    Category,
    ConsumableItem
} from '@/lib/social-prototype/store';
import { useAuth } from '@/lib/auth';
import { StatusCard } from './StatusCard';
import { CategorySheet } from './CategorySheet';
import { HabitCalendar } from './HabitCalendar';
import { ConsumableModal } from './ConsumableModal';

interface ProfilePageProps {
    userId: string;
    onBack: () => void;
    onClickProfile: (userId: string) => void;
    onSettings?: () => void;
}

export function ProfilePage({ userId, onBack, onClickProfile, onSettings }: ProfilePageProps) {
    const { user } = useAuth();
    const { profile, loading: profileLoading } = usePublicProfile(userId);
    const { getUserStatuses, getUserItemsByCategory } = useSocialStore();
    const { isFollowing, follow, unfollow } = useFollows();
    const [openCategory, setOpenCategory] = useState<Category | null>(null);
    const [showHabitCalendar, setShowHabitCalendar] = useState(false);
    const [selectedTagItem, setSelectedTagItem] = useState<ConsumableItem | null>(null);

    const isOwnProfile = user?.id === userId;
    const userStatuses = getUserStatuses(userId);

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

    const categoryItems: Record<string, ConsumableItem[]> = {};
    if (profile?.categories) {
        profile.categories.forEach(cat => {
            categoryItems[cat] = getUserItemsByCategory(cat, userId);
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
                <h2 className="text-sm font-bold uppercase tracking-widest">{profile.username}</h2>

                {/* Category icons */}
                {profile.categories && profile.categories.length > 0 && (
                    <div className="flex items-center justify-center gap-1.5 mt-1.5">
                        {profile.categories.map(cat => {
                            const config = CATEGORY_CONFIGS[cat];
                            if (!config) return null;
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
                    {!isOwnProfile && (
                        <button
                            onClick={() => isFollowing(userId) ? unfollow(userId) : follow(userId)}
                            className={`text-[10px] uppercase tracking-widest px-3 py-1 border transition-colors ${isFollowing(userId)
                                ? 'bg-neutral-800 text-white border-neutral-800 hover:bg-neutral-700'
                                : 'text-neutral-600 border-neutral-400 hover:bg-neutral-100'
                                }`}
                        >
                            {isFollowing(userId) ? 'Following' : 'Follow'}
                        </button>
                    )}
                    <button
                        onClick={() => setShowHabitCalendar(true)}
                        className="text-[10px] uppercase tracking-widest px-3 py-1 border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                    >
                        Habits
                    </button>
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
                                const config = CATEGORY_CONFIGS[item.category];
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
                                    const config = CATEGORY_CONFIGS[cat];
                                    if (!config) return null;
                                    const count = categoryItems[cat]?.length || 0;
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
                                            <span className="flex items-center gap-1">
                                                <span>{config.icon}</span>
                                                <span>{config.label}</span>
                                            </span>
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
                        />
                    )}

                    {/* Status Feed (hidden when category sheet is open) */}
                    {!openCategory && (
                        <div>
                            <h3 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3 border-b border-neutral-200 pb-1">
                                Posts
                            </h3>
                            <div className="space-y-3">
                                {userStatuses.length === 0 ? (
                                    <div className="text-center py-8 text-neutral-400 text-xs uppercase tracking-widest">
                                        No posts yet.
                                    </div>
                                ) : (
                                    userStatuses.map(status => (
                                        <StatusCard
                                            key={status.id}
                                            status={status}
                                            profile={profile}
                                            onClickProfile={onClickProfile}
                                            isOwn={isOwnProfile}
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
