"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useUserProfile, useHabits, ALL_CATEGORIES, CATEGORY_CONFIGS, Category } from '@/lib/social-prototype/store';

interface UserSetupProps {
    onComplete: () => void;
}

export function UserSetup({ onComplete }: UserSetupProps) {
    const { profile, saveProfile, uploadAvatar, loading } = useUserProfile();
    const { habits, addHabit, removeHabit } = useHabits();

    const [username, setUsername] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
    const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
    const [isPrivate, setIsPrivate] = useState(false);
    const [newHabitName, setNewHabitName] = useState('');
    const [saving, setSaving] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (profile) {
            setUsername(profile.username || '');
            setAvatarUrl(profile.avatarUrl);
            setSelectedCategories(profile.categories || []);
            setIsPrivate(profile.isPrivate || false);
        }
    }, [profile]);

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setAvatarUploading(true);

        try {
            const url = await uploadAvatar(file);
            if (url) {
                setAvatarUrl(url); // Set local preview immediately
            }
        } catch (err: any) {
            setError('Failed to upload avatar: ' + err.message);
        } finally {
            setAvatarUploading(false);
        }
    };

    const toggleCategory = (cat: Category) => {
        setSelectedCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const handleAddHabit = async () => {
        if (!newHabitName.trim()) return;
        await addHabit(newHabitName.trim());
        setNewHabitName('');
    };

    const handleSave = async () => {
        if (!username.trim()) {
            setError('Username is required');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await saveProfile({
                username: username.trim(),
                avatarUrl,
                categories: selectedCategories,
                isPrivate,
            });
            onComplete();
        } catch (err: any) {
            setError(err.message || 'Failed to save profile');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 font-mono">
                <div className="text-neutral-400 text-xs uppercase tracking-widest">Loading...</div>
            </div>
        );
    }

    return (
        <div className="font-mono max-w-md mx-auto">
            <h2 className="text-lg font-bold uppercase tracking-widest text-center mb-8 border-b border-neutral-300 pb-3">
                {profile ? 'Settings' : 'Set Up Your Profile'}
            </h2>

            {/* Avatar */}
            <div className="flex flex-col items-center mb-8">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-full bg-neutral-200 border-2 border-neutral-300 overflow-hidden flex items-center justify-center hover:border-neutral-500 transition-colors relative"
                >
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-neutral-400 text-2xl">+</span>
                    )}
                    {avatarUploading && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <span className="text-xs text-neutral-500">...</span>
                        </div>
                    )}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                />
                <span className="text-xs text-neutral-400 mt-2 uppercase tracking-wider">
                    {avatarUrl ? 'Change Photo' : 'Add Photo'}
                </span>
            </div>

            {/* Username */}
            <div className="mb-8">
                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-2">
                    Username
                </label>
                <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="your_username"
                    className="w-full px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent font-mono"
                />
            </div>

            {/* Categories */}
            <div className="mb-8">
                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-3">
                    Categories to Track
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {ALL_CATEGORIES.map(cat => {
                        const config = CATEGORY_CONFIGS[cat];
                        const isActive = selectedCategories.includes(cat);
                        return (
                            <button
                                key={cat}
                                onClick={() => toggleCategory(cat)}
                                className={`text-left px-3 py-2 border text-xs uppercase tracking-wider transition-all ${isActive
                                    ? 'border-neutral-800 bg-neutral-800 text-white'
                                    : 'border-neutral-300 text-neutral-500 hover:border-neutral-400'
                                    }`}
                            >
                                <span className="mr-2">{config.icon}</span>
                                {config.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Habits */}
            <div className="mb-8">
                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-3">
                    Daily Habits
                </label>
                <div className="space-y-2 mb-3">
                    {habits.map(h => (
                        <div key={h.id} className="flex items-center justify-between px-3 py-2 border border-neutral-200 bg-neutral-50">
                            <span className="text-sm">{h.name}</span>
                            <button
                                onClick={() => removeHabit(h.id)}
                                className="text-neutral-400 hover:text-red-500 text-xs"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    {habits.length === 0 && (
                        <div className="text-xs text-neutral-400 py-2">No habits defined yet.</div>
                    )}
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newHabitName}
                        onChange={(e) => setNewHabitName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddHabit(); }}
                        placeholder="Add a habit..."
                        className="flex-1 px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent font-mono"
                    />
                    <button
                        onClick={handleAddHabit}
                        disabled={!newHabitName.trim()}
                        className="px-4 py-2 bg-neutral-800 text-white text-xs uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-30"
                    >
                        +
                    </button>
                </div>
            </div>

            {/* Privacy */}
            <div className="mb-8">
                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-3">
                    Privacy
                </label>
                <button
                    onClick={() => setIsPrivate(!isPrivate)}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 border text-xs transition-all ${isPrivate
                            ? 'border-neutral-800 bg-neutral-800 text-white'
                            : 'border-neutral-300 text-neutral-500 hover:border-neutral-400'
                        }`}
                >
                    <span className="text-sm">{isPrivate ? '🔒' : '🌐'}</span>
                    <span className="uppercase tracking-wider font-bold">
                        {isPrivate ? 'Private Mode' : 'Public Mode'}
                    </span>
                    <span className="ml-auto text-[10px] text-neutral-400 normal-case tracking-normal">
                        {isPrivate ? 'Only you see your posts' : 'Posts visible in feed'}
                    </span>
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 mb-4">
                    {error}
                </div>
            )}

            {/* Save */}
            <button
                onClick={handleSave}
                disabled={saving || !username.trim()}
                className="w-full bg-neutral-800 text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-50"
            >
                {saving ? 'Saving...' : (profile ? 'Save Changes' : 'Get Started')}
            </button>
        </div>
    );
}
