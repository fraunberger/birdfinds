"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUserProfile, useHabits, DEFAULT_CATEGORIES, Category, CategoryConfigOverride, ProfileVisibility, getCategoryConfig } from '@/lib/social-prototype/store';
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
    const [visibility, setVisibility] = useState<ProfileVisibility>('public');
    const [newHabitName, setNewHabitName] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [categoryConfigs, setCategoryConfigs] = useState<Record<string, CategoryConfigOverride>>({});
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [saving, setSaving] = useState(false);
    const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lastSavedSignatureRef = useRef<string>('');
    const autoSaveTimerRef = useRef<number | null>(null);
    const saveIndicatorTimerRef = useRef<number | null>(null);
    const inFlightSaveRef = useRef<Promise<void> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const avatarObjectUrlRef = useRef<string | null>(null);

    // Cropping State
    const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isCropping, setIsCropping] = useState(false);
    const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);

    useEffect(() => {
        if (profile) {
            setUsername(profile.username || '');
            setAvatarUrl(profile.avatarUrl);
            setSelectedCategories(profile.categories || []);
            setVisibility(profile.visibility || (profile.isPrivate ? 'private' : 'public'));
            setCategoryConfigs(profile.categoryConfigs || {});
            lastSavedSignatureRef.current = JSON.stringify({
                username: profile.username || '',
                avatarUrl: profile.avatarUrl || '',
                categories: profile.categories || [],
                visibility: profile.visibility || (profile.isPrivate ? 'private' : 'public'),
                categoryConfigs: profile.categoryConfigs || {},
            });
        }
    }, [profile]);

    const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        e.target.value = '';

        if (!file.type.startsWith('image/')) {
            setError('Please select an image file.');
            return;
        }

        const maxBytes = 12 * 1024 * 1024;
        if (file.size > maxBytes) {
            setError('Image is too large. Please choose one under 12MB.');
            return;
        }

        setError(null);
        setPendingAvatarFile(file);
        if (avatarObjectUrlRef.current) {
            URL.revokeObjectURL(avatarObjectUrlRef.current);
        }
        const objectUrl = URL.createObjectURL(file);
        avatarObjectUrlRef.current = objectUrl;
        setCropImageSrc(objectUrl);
        setIsCropping(true);
    };

    const resetAvatarCropState = () => {
        if (avatarObjectUrlRef.current) {
            URL.revokeObjectURL(avatarObjectUrlRef.current);
            avatarObjectUrlRef.current = null;
        }
        setIsCropping(false);
        setCropImageSrc(null);
        setCroppedAreaPixels(null);
        setPendingAvatarFile(null);
        setZoom(1);
        setCrop({ x: 0, y: 0 });
    };

    const handleSaveCrop = async () => {
        if (!cropImageSrc) return;
        setAvatarUploading(true);
        setError(null);
        try {
            const image = await createImage(cropImageSrc);
            const fullImageArea: Area = {
                x: 0,
                y: 0,
                width: image.naturalWidth || image.width,
                height: image.naturalHeight || image.height,
            };
            const targetArea = croppedAreaPixels || fullImageArea;
            const optimizedBlob = await getOptimizedAvatarBlob(cropImageSrc, targetArea);
            const file = new File([optimizedBlob], 'avatar.jpg', { type: 'image/jpeg' });
            const url = await uploadAvatar(file);
            setAvatarUrl(url);
            resetAvatarCropState();
        } catch (e: unknown) {
            console.error(e);
            const primaryError = getErrorMessage(e);
            const normalized = primaryError.includes('FUNCTION_PAYLOAD_TOO_LARGE')
                ? 'Image is too large to upload. Try a smaller image.'
                : primaryError;
            setError(`Avatar upload failed: ${normalized || 'unknown error'}`);
            resetAvatarCropState();
        } finally {
            setAvatarUploading(false);
        }
    };

    useEffect(() => {
        return () => {
            if (avatarObjectUrlRef.current) {
                URL.revokeObjectURL(avatarObjectUrlRef.current);
            }
        };
    }, []);

    const toggleCategory = (cat: Category) => {
        setSelectedCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const handleAddCustomCategory = () => {
        const normalized = newCategoryName.trim().toLowerCase().replace(/\s+/g, '-');
        if (!normalized) return;
        const baseLabel = newCategoryName.trim();
        const shortLabel = normalized.replace(/[^a-z0-9]/g, '').slice(0, 8).toUpperCase() || 'CAT';

        setSelectedCategories((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
        setCategoryConfigs((prev) => ({
            ...prev,
            [normalized]: {
                label: baseLabel,
                shortLabel,
                titleLabel: 'Item',
                subtitleLabel: 'Details',
                subtitlePlaceholder: 'Details',
                ratingLabel: 'Rating',
                notesLabel: 'Notes',
                notesPlaceholder: 'Add notes...',
            },
        }));
        setNewCategoryName('');
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
        if (inFlightSaveRef.current) {
            await inFlightSaveRef.current;
        }

        setSaving(true);
        setError(null);
        const doSave = async () => {
            await saveProfile({
                username: username.trim(),
                avatarUrl,
                categories: selectedCategories,
                visibility,
                isPrivate: visibility === 'private',
                categoryConfigs,
            });
            lastSavedSignatureRef.current = JSON.stringify({
                username: username.trim(),
                avatarUrl: avatarUrl || '',
                categories: selectedCategories,
                visibility,
                categoryConfigs,
            });
            afterSave?.();
        };

        inFlightSaveRef.current = doSave();
        try {
            await inFlightSaveRef.current;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save profile');
            setAutoSaveState('error');
        } finally {
            inFlightSaveRef.current = null;
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
            visibility,
            categoryConfigs,
        });

        if (nextSignature === lastSavedSignatureRef.current) return;

        if (autoSaveTimerRef.current) {
            window.clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = window.setTimeout(async () => {
            if (saveIndicatorTimerRef.current) {
                window.clearTimeout(saveIndicatorTimerRef.current);
            }
            saveIndicatorTimerRef.current = window.setTimeout(() => {
                setAutoSaveState('saving');
            }, 350);
            await persistProfile();
            if (saveIndicatorTimerRef.current) {
                window.clearTimeout(saveIndicatorTimerRef.current);
                saveIndicatorTimerRef.current = null;
            }
            setAutoSaveState((prev) => (prev === 'error' ? 'error' : 'idle'));
        }, 900);

        return () => {
            if (autoSaveTimerRef.current) {
                window.clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
            }
            if (saveIndicatorTimerRef.current) {
                window.clearTimeout(saveIndicatorTimerRef.current);
                saveIndicatorTimerRef.current = null;
            }
        };
    }, [profile, username, avatarUrl, selectedCategories, visibility, categoryConfigs, isCropping, avatarUploading]);

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

    const editingConfig = editingCategory ? buildEditableConfig(editingCategory) : null;

    return (
        <div className="font-mono max-w-md mx-auto relative">
            {/* Cropping Modal Overlay */}
            {isCropping && cropImageSrc && (
                <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
                    <div className="relative w-72 h-72 bg-neutral-900 mb-4 rounded-full overflow-hidden border border-neutral-700">
                        <Cropper
                            image={cropImageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            cropShape="round"
                            showGrid={false}
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
                            onClick={() => {
                                resetAvatarCropState();
                            }}
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

            {editingCategory && editingConfig && (
                <div
                    className="fixed inset-0 bg-white/95 z-50 flex items-start sm:items-center justify-center pt-4 sm:pt-0 p-3"
                    onClick={() => setEditingCategory(null)}
                >
                    <div
                        className="bg-white border border-neutral-300 w-full sm:max-w-md font-mono flex flex-col"
                        style={{ maxHeight: '90vh' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="flex items-center justify-between px-4 py-3 border-b border-neutral-300"
                            style={{ backgroundColor: `${editingConfig.color || '#d4d4d4'}40` }}
                        >
                                            <input
                                                type="text"
                                                value={editingConfig.shortLabel}
                                                onChange={(e) => updateCategoryConfig(editingCategory, { shortLabel: e.target.value.toUpperCase() })}
                                                placeholder="SHORT"
                                                className="bg-transparent text-xs font-bold uppercase tracking-widest text-neutral-800 outline-none w-24"
                                            />
                            <button
                                onClick={() => setEditingCategory(null)}
                                className="text-neutral-500 hover:text-neutral-800 text-2xl leading-none w-8 h-8 flex items-center justify-center -mr-2"
                            >
                                ×
                            </button>
                        </div>

                        <div className="p-4 space-y-6 overflow-y-auto flex-1">
                            <div className="text-[10px] uppercase tracking-widest text-neutral-500">Live Card Preview</div>
                            <div className="border border-neutral-300 p-3">
                                <div className="flex gap-4">
                                    <div className="flex-1 space-y-4">
                                        <div>
                                            <input
                                                type="text"
                                                value={editingConfig.titleLabel}
                                                onChange={(e) => updateCategoryConfig(editingCategory, { titleLabel: e.target.value })}
                                                placeholder="Primary label"
                                                className="block w-full text-sm font-bold uppercase tracking-wider text-neutral-900 mb-1 outline-none bg-transparent border-b border-dashed border-neutral-300"
                                            />
                                            <div className="w-full text-base font-mono border-b border-neutral-200 py-1 text-neutral-400">
                                                Example Item
                                            </div>
                                        </div>
                                        <div>
                                            <input
                                                type="text"
                                                value={editingConfig.subtitleLabel}
                                                onChange={(e) => updateCategoryConfig(editingCategory, {
                                                    subtitleLabel: e.target.value,
                                                    subtitlePlaceholder: e.target.value,
                                                })}
                                                placeholder="Secondary label"
                                                className="block w-full text-sm font-bold uppercase tracking-wider text-neutral-900 mb-1 outline-none bg-transparent border-b border-dashed border-neutral-300"
                                            />
                                            <div className="w-full text-sm font-mono border border-neutral-300 p-2 text-neutral-400">
                                                Example Detail
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-shrink-0 pt-6">
                                        <div className="w-16 h-16 border-2 border-neutral-300 flex flex-col items-center justify-center bg-white">
                                            <span className="text-2xl font-bold text-neutral-800 leading-none">8.5</span>
                                            <input
                                                type="text"
                                                value={editingConfig.ratingLabel}
                                                onChange={(e) => updateCategoryConfig(editingCategory, { ratingLabel: e.target.value })}
                                                placeholder="Rating"
                                                className="text-[10px] font-bold uppercase tracking-wide text-neutral-900 mt-0.5 w-full text-center bg-transparent outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <input
                                        type="text"
                                        value={editingConfig.notesLabel || ''}
                                        onChange={(e) => updateCategoryConfig(editingCategory, {
                                            notesLabel: e.target.value,
                                            notesPlaceholder: e.target.value ? `Add ${e.target.value.toLowerCase()}...` : '',
                                        })}
                                        placeholder="Notes label"
                                        className="block w-full text-sm font-bold uppercase tracking-wider text-neutral-900 mb-1 outline-none bg-transparent border-b border-dashed border-neutral-300"
                                    />
                                    <div className="w-full text-sm font-mono border border-neutral-300 p-3 text-neutral-400 min-h-[88px]">
                                        Short annotation
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end px-4 py-3 border-t border-neutral-300 bg-neutral-50">
                            <button
                                onClick={() => setEditingCategory(null)}
                                className="text-xs uppercase tracking-widest text-neutral-600 hover:text-neutral-900 px-3 py-1 border border-neutral-300 hover:border-neutral-500"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Avatar */}
            <div className="flex flex-col items-center mb-8">
                <button
                    onClick={() => {
                        setError(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                        fileInputRef.current?.click();
                    }}
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
                    <button
                        onClick={handleAddCustomCategory}
                        disabled={!newCategoryName.trim()}
                        className="col-span-2 px-4 py-2 bg-neutral-800 text-white text-xs uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-30"
                    >
                        New Category
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
                <div className="space-y-2">
                    <button
                        onClick={() => setVisibility('public')}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 border text-xs transition-all ${visibility === 'public'
                            ? 'border-neutral-800 bg-neutral-800 text-white'
                            : 'border-neutral-300 text-neutral-500 hover:border-neutral-400'
                            }`}
                    >
                        <span className="text-sm">Public</span>
                        <span className="uppercase tracking-wider font-bold">Public Mode</span>
                        <span className="ml-auto text-[10px] text-neutral-400 normal-case tracking-normal">
                            Anyone can view
                        </span>
                    </button>
                    <button
                        onClick={() => setVisibility('accounts')}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 border text-xs transition-all ${visibility === 'accounts'
                            ? 'border-neutral-800 bg-neutral-800 text-white'
                            : 'border-neutral-300 text-neutral-500 hover:border-neutral-400'
                            }`}
                    >
                        <span className="text-sm">Accounts</span>
                        <span className="uppercase tracking-wider font-bold">Accounts Only</span>
                        <span className="ml-auto text-[10px] text-neutral-400 normal-case tracking-normal">
                            Signed-in users only
                        </span>
                    </button>
                    <button
                        onClick={() => setVisibility('private')}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 border text-xs transition-all ${visibility === 'private'
                            ? 'border-neutral-800 bg-neutral-800 text-white'
                            : 'border-neutral-300 text-neutral-500 hover:border-neutral-400'
                            }`}
                    >
                        <span className="text-sm">Private</span>
                        <span className="uppercase tracking-wider font-bold">Private Mode</span>
                        <span className="ml-auto text-[10px] text-neutral-400 normal-case tracking-normal">
                            Only you can view
                        </span>
                    </button>
                </div>
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
                <div className="mb-6">
                    <div className="text-center text-[10px] uppercase tracking-widest text-neutral-400 mb-3">
                        {autoSaveState === 'saving' && 'Saving changes...'}
                        {(autoSaveState === 'idle' || autoSaveState === 'error') && 'Auto-save enabled'}
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving || !username.trim()}
                        className="w-full bg-neutral-800 text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Save & Exit'}
                    </button>
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
        if (url.startsWith('http://') || url.startsWith('https://')) {
            image.setAttribute('crossOrigin', 'anonymous');
        }
        image.src = url;
    });

async function getOptimizedAvatarBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
    let maxDimension = 900;
    let quality = 0.82;
    const maxBytes = 900_000;

    for (let attempt = 0; attempt < 6; attempt += 1) {
        const blob = await getCroppedImg(imageSrc, pixelCrop, 'image/jpeg', quality, maxDimension);
        if (blob.size <= maxBytes) return blob;
        maxDimension = Math.max(360, Math.round(maxDimension * 0.8));
        quality = Math.max(0.5, quality - 0.1);
    }

    return getCroppedImg(imageSrc, pixelCrop, 'image/jpeg', 0.48, 320);
}

// Helper to get cropped image blob
async function getCroppedImg(
    imageSrc: string,
    pixelCrop: Area,
    outputType: string,
    quality: number,
    maxDimension: number,
): Promise<Blob> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Canvas context unavailable');
    }

    const sourceWidth = Math.max(1, Math.round(pixelCrop.width));
    const sourceHeight = Math.max(1, Math.round(pixelCrop.height));
    const downscaleRatio = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const destWidth = Math.max(1, Math.round(sourceWidth * downscaleRatio));
    const destHeight = Math.max(1, Math.round(sourceHeight * downscaleRatio));
    canvas.width = destWidth;
    canvas.height = destHeight;

    // draw cropped image
    // Note: pixelCrop defines coords in the *original* image natural dimensions if unit is px?
    // react-easy-crop pixelCrop are relative to natural image size? YEs, checked docs.
    ctx.drawImage(
        image,
        Math.max(0, Math.round(pixelCrop.x)),
        Math.max(0, Math.round(pixelCrop.y)),
        Math.max(1, Math.round(pixelCrop.width)),
        Math.max(1, Math.round(pixelCrop.height)),
        0,
        0,
        destWidth,
        destHeight
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Canvas is empty'));
                return;
            }
            resolve(blob);
        }, outputType, quality);
    });
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string') return error;
    return 'Failed to upload image';
}
