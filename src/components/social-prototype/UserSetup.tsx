"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUserProfile, useHabits, DEFAULT_CATEGORIES, Category, CategoryConfigOverride, getCategoryConfig } from '@/lib/social-prototype/store';
import { useAuth } from '@/lib/auth';
import Cropper, { Point, Area } from 'react-easy-crop';

interface UserSetupProps {
    onComplete: () => void;
}

export function UserSetup({ onComplete }: UserSetupProps) {
    const { profile, saveProfile, uploadAvatar, loading } = useUserProfile();
    const { habits, addHabit, removeHabit } = useHabits();
    const { signOut } = useAuth(); // Importing signOut

    const [username, setUsername] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
    const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
    const [isPrivate, setIsPrivate] = useState(false);
    const [newHabitName, setNewHabitName] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryShortLabel, setNewCategoryShortLabel] = useState('');
    const [newCategoryTitleLabel, setNewCategoryTitleLabel] = useState('');
    const [newCategorySubtitleLabel, setNewCategorySubtitleLabel] = useState('');
    const [newCategoryRatingLabel, setNewCategoryRatingLabel] = useState('');
    const [newCategoryNotesLabel, setNewCategoryNotesLabel] = useState('');
    const [categoryConfigs, setCategoryConfigs] = useState<Record<string, CategoryConfigOverride>>({});
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [saving, setSaving] = useState(false);
    const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lastSavedSignatureRef = useRef<string>('');
    const autoSaveTimerRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cropping State
    const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isCropping, setIsCropping] = useState(false);

    useEffect(() => {
        if (profile) {
            setUsername(profile.username || '');
            setAvatarUrl(profile.avatarUrl);
            setSelectedCategories(profile.categories || []);
            setIsPrivate(profile.isPrivate || false);
            setCategoryConfigs(profile.categoryConfigs || {});
            lastSavedSignatureRef.current = JSON.stringify({
                username: profile.username || '',
                avatarUrl: profile.avatarUrl || '',
                categories: profile.categories || [],
                isPrivate: profile.isPrivate || false,
                categoryConfigs: profile.categoryConfigs || {},
            });
        }
    }, [profile]);

    const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                setCropImageSrc(reader.result as string);
                setIsCropping(true);
            });
            reader.readAsDataURL(file);
        }
    };

    const handleSaveCrop = async () => {
        if (!cropImageSrc || !croppedAreaPixels) return;
        setAvatarUploading(true);
        try {
            const croppedImageBlob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
            if (!croppedImageBlob) throw new Error('Failed to crop image');

            // Create a File object from Blob to upload
            const file = new File([croppedImageBlob], 'avatar.jpg', { type: 'image/jpeg' });
            const url = await uploadAvatar(file);
            setAvatarUrl(url);
            setIsCropping(false);
            setCropImageSrc(null);
        } catch (e: unknown) {
            console.error(e);
            setError('Failed to crop/upload image');
        } finally {
            setAvatarUploading(false);
        }
    };

    const toggleCategory = (cat: Category) => {
        setSelectedCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const handleAddCustomCategory = () => {
        const normalized = newCategoryName.trim().toLowerCase().replace(/\s+/g, '-');
        if (!normalized) return;
        const baseLabel = newCategoryName.trim();
        const shortLabel = (newCategoryShortLabel.trim() || normalized.replace(/[^a-z0-9]/g, '').slice(0, 8)).toUpperCase();
        const titleLabel = newCategoryTitleLabel.trim() || `${baseLabel} Title`;
        const subtitleLabel = newCategorySubtitleLabel.trim() || 'Details';
        const ratingLabel = newCategoryRatingLabel.trim() || 'Rating';
        const notesLabel = newCategoryNotesLabel.trim() || 'Notes';

        setSelectedCategories((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
        setCategoryConfigs((prev) => ({
            ...prev,
            [normalized]: {
                label: baseLabel,
                shortLabel,
                titleLabel,
                subtitleLabel,
                subtitlePlaceholder: subtitleLabel,
                ratingLabel,
                notesLabel,
                notesPlaceholder: `Add ${notesLabel.toLowerCase()}...`,
            },
        }));
        setNewCategoryName('');
        setNewCategoryShortLabel('');
        setNewCategoryTitleLabel('');
        setNewCategorySubtitleLabel('');
        setNewCategoryRatingLabel('');
        setNewCategoryNotesLabel('');
        setEditingCategory(normalized);
    };

    const updateCategoryConfig = (category: Category, updates: CategoryConfigOverride) => {
        setCategoryConfigs((prev) => {
            const existing = prev[category] || {};
            return {
                ...prev,
                [category]: {
                    ...existing,
                    ...updates,
                },
            };
        });
    };

    const buildEditableConfig = (category: Category) => {
        const base = getCategoryConfig(category);
        const override = categoryConfigs[category] || {};
        return {
            ...base,
            ...override,
            id: category,
        };
    };

    const handleAddHabit = async () => {
        if (!newHabitName.trim()) return;
        await addHabit(newHabitName.trim());
        setNewHabitName('');
    };

    const persistProfile = async (afterSave?: () => void) => {
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
                categoryConfigs,
            });
            lastSavedSignatureRef.current = JSON.stringify({
                username: username.trim(),
                avatarUrl: avatarUrl || '',
                categories: selectedCategories,
                isPrivate,
                categoryConfigs,
            });
            afterSave?.();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save profile');
            setAutoSaveState('error');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        await persistProfile(onComplete);
    };

    useEffect(() => {
        if (!profile) return; // onboarding still uses explicit save
        if (!username.trim()) return;
        if (isCropping || avatarUploading) return;

        const nextSignature = JSON.stringify({
            username: username.trim(),
            avatarUrl: avatarUrl || '',
            categories: selectedCategories,
            isPrivate,
            categoryConfigs,
        });

        if (nextSignature === lastSavedSignatureRef.current) return;

        if (autoSaveTimerRef.current) {
            window.clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = window.setTimeout(async () => {
            setAutoSaveState('saving');
            await persistProfile();
            setAutoSaveState('saved');
            window.setTimeout(() => setAutoSaveState('idle'), 1200);
        }, 900);

        return () => {
            if (autoSaveTimerRef.current) {
                window.clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
            }
        };
    }, [profile, username, avatarUrl, selectedCategories, isPrivate, categoryConfigs, isCropping, avatarUploading]);

    const handleSignOut = async () => {
        await signOut();
        onComplete(); // Close modal or redirect? Usually signOut redirects.
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 font-mono">
                <div className="text-neutral-400 text-xs uppercase tracking-widest">Loading...</div>
            </div>
        );
    }

    return (
        <div className="font-mono max-w-md mx-auto relative">
            {/* Cropping Modal Overlay */}
            {isCropping && cropImageSrc && (
                <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
                    <div className="relative w-full h-64 bg-neutral-900 mb-4 rounded overflow-hidden">
                        <Cropper
                            image={cropImageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            onCropChange={setCrop}
                            onCropComplete={onCropComplete}
                            onZoomChange={setZoom}
                        />
                    </div>
                    <div className="w-full max-w-xs mb-6 px-4">
                        <input
                            type="range"
                            value={zoom}
                            min={1}
                            max={3}
                            step={0.1}
                            aria-labelledby="Zoom"
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={() => setIsCropping(false)}
                            className="px-6 py-2 border border-neutral-600 text-white text-xs uppercase tracking-widest hover:bg-neutral-800"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveCrop}
                            disabled={avatarUploading}
                            className="px-6 py-2 bg-white text-black text-xs uppercase tracking-widest font-bold hover:bg-neutral-200 disabled:opacity-50"
                        >
                            {avatarUploading ? 'Saving...' : 'Set Avatar'}
                        </button>
                    </div>
                </div>
            )}

            <h2 className="text-lg font-bold uppercase tracking-widest text-center mb-8 border-b border-neutral-300 pb-3">
                {profile ? 'Settings' : 'Set Up Your Profile'}
            </h2>

            {editingCategory && (
                <div className="fixed inset-0 z-40 bg-black/70 p-4 flex items-center justify-center">
                    <div className="w-full max-w-xl bg-[#f6f6ef] border border-neutral-700 p-4 max-h-[85vh] overflow-y-auto">
                        {(() => {
                            const config = buildEditableConfig(editingCategory);
                            return (
                                <>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-800">
                                            Edit {config.label} Card
                                        </h3>
                                        <button
                                            onClick={() => setEditingCategory(null)}
                                            className="text-[10px] uppercase tracking-widest text-neutral-600 hover:text-neutral-900"
                                        >
                                            Done
                                        </button>
                                    </div>

                                    <div className="border border-neutral-700 bg-white p-3 mb-4">
                                        <div className="border border-neutral-700">
                                            <div className="px-2 py-1 text-[10px] uppercase tracking-[0.2em] border-b border-neutral-700 bg-neutral-100 font-bold">
                                                {config.shortLabel || 'CAT'}
                                            </div>
                                            <div className="grid grid-cols-[8rem_1fr] border-b border-neutral-700 text-xs">
                                                <div className="px-2 py-1 border-r border-neutral-700 uppercase tracking-wider font-bold bg-neutral-50">
                                                    {config.titleLabel}
                                                </div>
                                                <div className="px-2 py-1">Example Item</div>
                                            </div>
                                            <div className="grid grid-cols-[8rem_1fr] border-b border-neutral-700 text-xs">
                                                <div className="px-2 py-1 border-r border-neutral-700 uppercase tracking-wider font-bold bg-neutral-50">
                                                    {config.subtitleLabel}
                                                </div>
                                                <div className="px-2 py-1">Example Detail</div>
                                            </div>
                                            <div className="grid grid-cols-[8rem_1fr] border-b border-neutral-700 text-xs">
                                                <div className="px-2 py-1 border-r border-neutral-700 uppercase tracking-wider font-bold bg-neutral-50">
                                                    {config.ratingLabel}
                                                </div>
                                                <div className="px-2 py-1">8.5</div>
                                            </div>
                                            <div className="grid grid-cols-[8rem_1fr] text-xs">
                                                <div className="px-2 py-1 border-r border-neutral-700 uppercase tracking-wider font-bold bg-neutral-50">
                                                    {config.notesLabel || 'Notes'}
                                                </div>
                                                <div className="px-2 py-1">Short annotation</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            value={config.label}
                                            onChange={(e) => updateCategoryConfig(editingCategory, { label: e.target.value })}
                                            placeholder="Category display name"
                                            className="col-span-2 px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-white font-mono"
                                        />
                                        <input
                                            type="text"
                                            value={config.shortLabel}
                                            onChange={(e) => updateCategoryConfig(editingCategory, { shortLabel: e.target.value.toUpperCase() })}
                                            placeholder="Abbreviation"
                                            className="px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-white font-mono"
                                        />
                                        <input
                                            type="text"
                                            value={config.titleLabel}
                                            onChange={(e) => updateCategoryConfig(editingCategory, { titleLabel: e.target.value })}
                                            placeholder="Primary box label"
                                            className="px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-white font-mono"
                                        />
                                        <input
                                            type="text"
                                            value={config.subtitleLabel}
                                            onChange={(e) => updateCategoryConfig(editingCategory, {
                                                subtitleLabel: e.target.value,
                                                subtitlePlaceholder: e.target.value,
                                            })}
                                            placeholder="Secondary box label"
                                            className="px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-white font-mono"
                                        />
                                        <input
                                            type="text"
                                            value={config.ratingLabel}
                                            onChange={(e) => updateCategoryConfig(editingCategory, { ratingLabel: e.target.value })}
                                            placeholder="Rating box label"
                                            className="px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-white font-mono"
                                        />
                                        <input
                                            type="text"
                                            value={config.notesLabel || ''}
                                            onChange={(e) => updateCategoryConfig(editingCategory, {
                                                notesLabel: e.target.value,
                                                notesPlaceholder: e.target.value ? `Add ${e.target.value.toLowerCase()}...` : 'Add notes...',
                                            })}
                                            placeholder="Notes box label"
                                            className="col-span-2 px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-white font-mono"
                                        />
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

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
                    {Array.from(new Set([...DEFAULT_CATEGORIES, ...selectedCategories])).map(cat => {
                        const config = getCategoryConfig(cat);
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
                <div className="grid grid-cols-2 gap-2 mt-3">
                    <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Custom category name"
                        className="col-span-2 px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent font-mono"
                    />
                    <input
                        type="text"
                        value={newCategoryShortLabel}
                        onChange={(e) => setNewCategoryShortLabel(e.target.value.toUpperCase())}
                        placeholder="Abbreviation (e.g. VG)"
                        className="px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent font-mono"
                    />
                    <input
                        type="text"
                        value={newCategoryTitleLabel}
                        onChange={(e) => setNewCategoryTitleLabel(e.target.value)}
                        placeholder="Primary box label"
                        className="px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent font-mono"
                    />
                    <input
                        type="text"
                        value={newCategorySubtitleLabel}
                        onChange={(e) => setNewCategorySubtitleLabel(e.target.value)}
                        placeholder="Secondary box label"
                        className="px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent font-mono"
                    />
                    <input
                        type="text"
                        value={newCategoryRatingLabel}
                        onChange={(e) => setNewCategoryRatingLabel(e.target.value)}
                        placeholder="Rating box label"
                        className="px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent font-mono"
                    />
                    <input
                        type="text"
                        value={newCategoryNotesLabel}
                        onChange={(e) => setNewCategoryNotesLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomCategory(); }}
                        placeholder="Notes box label"
                        className="col-span-2 px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent font-mono"
                    />
                    <button
                        onClick={handleAddCustomCategory}
                        disabled={!newCategoryName.trim()}
                        className="col-span-2 px-4 py-2 bg-neutral-800 text-white text-xs uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-30"
                    >
                        Add Custom Category
                    </button>
                </div>
                {selectedCategories.filter((cat) => !DEFAULT_CATEGORIES.includes(cat)).length > 0 && (
                    <div className="mt-3 space-y-1">
                        {selectedCategories
                            .filter((cat) => !DEFAULT_CATEGORIES.includes(cat))
                            .map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setEditingCategory(cat)}
                                    className="w-full text-left px-3 py-2 border border-neutral-300 text-[11px] uppercase tracking-wider text-neutral-600 hover:border-neutral-500"
                                >
                                    Edit {buildEditableConfig(cat).label} card layout
                                </button>
                            ))}
                    </div>
                )}
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
                    <span className="text-sm">{isPrivate ? 'Private' : 'Public'}</span>
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
            {!profile ? (
                <button
                    onClick={handleSave}
                    disabled={saving || !username.trim()}
                    className="w-full bg-neutral-800 text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-50 mb-6"
                >
                    {saving ? 'Saving...' : 'Get Started'}
                </button>
            ) : (
                <div className="mb-6 text-center text-[10px] uppercase tracking-widest text-neutral-400">
                    {autoSaveState === 'saving' && 'Saving changes...'}
                    {autoSaveState === 'saved' && 'Saved'}
                    {(autoSaveState === 'idle' || autoSaveState === 'error') && 'Auto-save enabled'}
                </div>
            )}

            {/* Sign Out Button (Added) */}
            {profile && (
                <div className="border-t border-neutral-200 pt-6 mt-6 flex justify-center">
                    <button
                        onClick={handleSignOut}
                        className="text-xs text-neutral-400 hover:text-red-600 uppercase tracking-widest transition-colors"
                    >
                        Sign Out
                    </button>
                </div>
            )}
        </div>
    );
}

// Helper function to create image from URL
const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.setAttribute('crossOrigin', 'anonymous'); // needed to avoid cross-origin issues on CodeSandbox
        image.src = url;
    });

// Helper to get cropped image blob
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob | null> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return null;
    }

    // set canvas width to match the bounding box
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    // draw cropped image
    // Note: pixelCrop defines coords in the *original* image natural dimensions if unit is px?
    // react-easy-crop pixelCrop are relative to natural image size? YEs, checked docs.
    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
    );

    // As Blob
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                // reject(new Error('Canvas is empty'));
                console.error('Canvas is empty');
                return;
            }
            resolve(blob);
        }, 'image/jpeg');
    });
}
