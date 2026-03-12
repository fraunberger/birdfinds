"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUserProfile, useHabits, DEFAULT_CATEGORIES, Category, CategoryConfigOverride, ProfileVisibility, getCategoryConfig } from '@/lib/social-prototype/store';
import { useAuth } from '@/lib/auth';
import Cropper, { Point, Area } from 'react-easy-crop';

/**
 * OnboardingWizard — Phase 1 onboarding flow.
 *
 * A step-by-step wizard that walks new users through profile setup.
 * Each step requires the user to complete an action OR hit "Skip".
 *
 * Steps:
 *   1. Add avatar
 *   2. Confirm username
 *   3. Select categories to rank
 *   4. Add a habit
 *   5. Select privacy
 *   6. Get started (save & enter)
 */

interface OnboardingWizardProps {
    onComplete: () => void;
}

type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_TITLES: Record<OnboardingStep, string> = {
    1: 'Add Your Avatar',
    2: 'Confirm Your Name',
    3: 'Pick Your Categories',
    4: 'Add a Habit',
    5: 'Set Your Privacy',
    6: 'Get Started',
};

const STEP_DESCRIPTIONS: Record<OnboardingStep, string> = {
    1: 'Choose a photo so people can recognize you in the feed. This is how you show up to others.',
    2: 'This is your public handle — how others find and mention you. You can change it later in settings.',
    3: 'Categories are the types of things you track. Movies, restaurants, birds — pick the ones that match your interests. You can add custom ones too.',
    4: 'Habits are daily actions you want to build. They show up as a checklist in your daily status. Examples: meditate, read, exercise, journal.',
    5: 'Choose who can see your pile and status updates.',
    6: 'You\'re all set! Your profile is ready. Hit the button below to jump into the feed and start posting.',
};

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
    const { profile, saveProfile, uploadAvatar, loading } = useUserProfile();
    const { habits, addHabit, removeHabit } = useHabits();
    const { user } = useAuth();

    const [step, setStep] = useState<OnboardingStep>(1);
    const [username, setUsername] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
    const [selectedCategories, setSelectedCategories] = useState<Category[]>(['movie', 'restaurant', 'bird']);
    const [visibility, setVisibility] = useState<ProfileVisibility>('public');
    const [newHabitName, setNewHabitName] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [categoryConfigs, setCategoryConfigs] = useState<Record<string, CategoryConfigOverride>>({});
    const [saving, setSaving] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlightSaveRef = useRef<Promise<void> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const avatarObjectUrlRef = useRef<string | null>(null);

    // Cropping State
    const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isCropping, setIsCropping] = useState(false);

    useEffect(() => {
        if (profile) {
            setUsername(profile.username || user?.username || user?.email?.split('@')[0] || '');
            setAvatarUrl(profile.avatarUrl);
            setSelectedCategories(profile.categories?.length ? profile.categories : ['movie', 'restaurant', 'bird']);
            setVisibility(profile.visibility || (profile.isPrivate ? 'private' : 'public'));
            setCategoryConfigs(profile.categoryConfigs || {});
        }
    }, [profile, user?.username, user?.email]);

    const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        e.target.value = '';
        if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
        if (file.size > 12 * 1024 * 1024) { setError('Image is too large. Please choose one under 12MB.'); return; }
        setError(null);
        if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
        const objectUrl = URL.createObjectURL(file);
        avatarObjectUrlRef.current = objectUrl;
        setCropImageSrc(objectUrl);
        setIsCropping(true);
    };

    const resetAvatarCropState = () => {
        if (avatarObjectUrlRef.current) { URL.revokeObjectURL(avatarObjectUrlRef.current); avatarObjectUrlRef.current = null; }
        setIsCropping(false);
        setCropImageSrc(null);
        setCroppedAreaPixels(null);
        setZoom(1);
        setCrop({ x: 0, y: 0 });
    };

    const handleSaveCrop = async () => {
        if (!cropImageSrc) return;
        setAvatarUploading(true);
        setError(null);
        try {
            const image = await createImage(cropImageSrc);
            const fullImageArea: Area = { x: 0, y: 0, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
            const targetArea = croppedAreaPixels || fullImageArea;
            const optimizedBlob = await getOptimizedAvatarBlob(cropImageSrc, targetArea);
            const file = new File([optimizedBlob], 'avatar.jpg', { type: 'image/jpeg' });
            const url = await uploadAvatar(file);
            setAvatarUrl(url);
            resetAvatarCropState();
        } catch (e: unknown) {
            const primaryError = getErrorMessage(e);
            const normalized = primaryError.includes('FUNCTION_PAYLOAD_TOO_LARGE') ? 'Image is too large to upload. Try a smaller image.' : primaryError;
            setError(`Avatar upload failed: ${normalized || 'unknown error'}`);
            resetAvatarCropState();
        } finally {
            setAvatarUploading(false);
        }
    };

    useEffect(() => {
        return () => { if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current); };
    }, []);

    const toggleCategory = (cat: Category) => {
        setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
    };

    const handleAddCustomCategory = () => {
        const normalized = newCategoryName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (!normalized) { setError('Category name must include at least one letter or number.'); return; }
        if (selectedCategories.includes(normalized)) { setError('That category already exists.'); setNewCategoryName(''); return; }
        setError(null);
        const baseLabel = newCategoryName.trim();
        const shortLabel = normalized.replace(/[^a-z0-9]/g, '').slice(0, 8).toUpperCase() || 'CAT';
        setSelectedCategories(prev => prev.includes(normalized) ? prev : [...prev, normalized]);
        setCategoryConfigs(prev => ({
            ...prev,
            [normalized]: { label: baseLabel, shortLabel, titleLabel: 'Item', subtitleLabel: 'Details', subtitlePlaceholder: 'Details', ratingLabel: 'Rating', notesLabel: 'Notes', notesPlaceholder: 'Add notes...' },
        }));
        setNewCategoryName('');
    };

    const handleAddHabit = async () => {
        if (!newHabitName.trim()) return;
        await addHabit(newHabitName.trim());
        setNewHabitName('');
    };

    const persistProfile = useCallback(async (afterSave?: () => void) => {
        if (!username.trim()) { setError('Username is required'); return; }
        if (inFlightSaveRef.current) await inFlightSaveRef.current;
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
            afterSave?.();
        };
        inFlightSaveRef.current = doSave();
        try { await inFlightSaveRef.current; }
        catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to save profile'); }
        finally { inFlightSaveRef.current = null; setSaving(false); }
    }, [avatarUrl, categoryConfigs, saveProfile, selectedCategories, username, visibility]);

    const goNext = () => {
        setError(null);
        if (step < 6) setStep((step + 1) as OnboardingStep);
    };

    const goBack = () => {
        setError(null);
        if (step > 1) setStep((step - 1) as OnboardingStep);
    };

    const handleGetStarted = async () => {
        await persistProfile(onComplete);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 font-mono">
                <div className="text-neutral-400 text-xs uppercase tracking-widest">Loading...</div>
            </div>
        );
    }

    const progress = Math.round((step / 6) * 100);

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
                        <input type="range" value={zoom} min={1} max={3} step={0.1} aria-labelledby="Zoom"
                            onChange={e => setZoom(Number(e.target.value))}
                            className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer" />
                    </div>
                    <div className="flex gap-4">
                        <button onClick={resetAvatarCropState}
                            className="px-6 py-2 border border-neutral-600 text-white text-xs uppercase tracking-widest hover:bg-neutral-800">
                            Cancel
                        </button>
                        <button onClick={handleSaveCrop} disabled={avatarUploading}
                            className="px-6 py-2 bg-white text-black text-xs uppercase tracking-widest font-bold hover:bg-neutral-200 disabled:opacity-50">
                            {avatarUploading ? 'Saving...' : 'Set Avatar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Progress Bar */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-widest text-neutral-400">Step {step} of 6</span>
                    <span className="text-[10px] uppercase tracking-widest text-neutral-400">{progress}%</span>
                </div>
                <div className="w-full h-1 bg-neutral-200">
                    <div className="h-1 bg-neutral-800 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
            </div>

            {/* Step Header */}
            <div className="mb-6">
                <h2 className="text-lg font-bold uppercase tracking-widest text-center mb-2">
                    {STEP_TITLES[step]}
                </h2>
                <p className="text-xs text-neutral-500 text-center leading-relaxed">
                    {STEP_DESCRIPTIONS[step]}
                </p>
            </div>

            {/* Step Content */}
            <div className="min-h-[280px]">
                {step === 1 && (
                    <StepAvatar
                        avatarUrl={avatarUrl}
                        avatarUploading={avatarUploading}
                        fileInputRef={fileInputRef}
                        onAvatarChange={handleAvatarChange}
                        onError={setError}
                    />
                )}
                {step === 2 && (
                    <StepUsername username={username} onChange={setUsername} />
                )}
                {step === 3 && (
                    <StepCategories
                        selectedCategories={selectedCategories}
                        onToggle={toggleCategory}
                        newCategoryName={newCategoryName}
                        onNewCategoryNameChange={setNewCategoryName}
                        onAddCustom={handleAddCustomCategory}
                    />
                )}
                {step === 4 && (
                    <StepHabit
                        habits={habits}
                        newHabitName={newHabitName}
                        onNewHabitNameChange={setNewHabitName}
                        onAddHabit={handleAddHabit}
                        onRemoveHabit={removeHabit}
                    />
                )}
                {step === 5 && (
                    <StepPrivacy visibility={visibility} onChange={setVisibility} />
                )}
                {step === 6 && (
                    <StepGetStarted
                        avatarUrl={avatarUrl}
                        username={username}
                        categoriesCount={selectedCategories.length}
                        habitsCount={habits.length}
                        visibility={visibility}
                    />
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 mb-4">
                    {error}
                </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-3 mt-6 border-t border-neutral-200 pt-4">
                {step > 1 && (
                    <button onClick={goBack}
                        className="px-4 py-2.5 border border-neutral-300 text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-800 hover:border-neutral-500">
                        Back
                    </button>
                )}
                <div className="flex-1" />
                {step < 6 && (
                    <>
                        <button onClick={goNext}
                            className="px-4 py-2.5 text-xs uppercase tracking-widest text-neutral-400 hover:text-neutral-700">
                            Skip
                        </button>
                        <button onClick={() => {
                            if (step === 2 && !username.trim()) {
                                setError('Username is required to continue');
                                return;
                            }
                            if (step === 3 && selectedCategories.length === 0) {
                                setError('Select at least one category');
                                return;
                            }
                            goNext();
                        }}
                            className="px-6 py-2.5 bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest hover:bg-neutral-700">
                            Continue
                        </button>
                    </>
                )}
                {step === 6 && (
                    <button onClick={handleGetStarted} disabled={saving || !username.trim()}
                        className="px-8 py-3 bg-neutral-800 text-white text-xs font-bold uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-50">
                        {saving ? 'Saving...' : 'Get Started'}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Step Components ──────────────────────────────────────────────────────────

function StepAvatar({ avatarUrl, avatarUploading, fileInputRef, onAvatarChange, onError }: {
    avatarUrl?: string;
    avatarUploading: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onError: (msg: string | null) => void;
}) {
    return (
        <div className="flex flex-col items-center">
            <button
                onClick={() => { onError(null); if (fileInputRef.current) fileInputRef.current.value = ''; fileInputRef.current?.click(); }}
                className="w-32 h-32 rounded-full bg-neutral-200 border-2 border-neutral-300 overflow-hidden flex items-center justify-center hover:border-neutral-500 transition-colors relative"
            >
                {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-neutral-400 text-3xl">+</span>
                        <span className="text-[9px] uppercase tracking-widest text-neutral-400">Tap to add</span>
                    </div>
                )}
                {avatarUploading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <span className="text-xs text-neutral-500">Uploading...</span>
                    </div>
                )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onAvatarChange} className="hidden" />
            {avatarUrl && (
                <span className="text-[10px] text-green-700 mt-3 uppercase tracking-widest">Avatar set</span>
            )}
        </div>
    );
}

function StepUsername({ username, onChange }: { username: string; onChange: (v: string) => void }) {
    return (
        <div className="space-y-4">
            <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-2">
                Username
            </label>
            <input
                type="text"
                value={username}
                onChange={e => onChange(e.target.value)}
                placeholder="your_username"
                className="w-full px-4 py-3 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent font-mono"
                autoFocus
            />
            {username.trim() && (
                <div className="text-[10px] text-neutral-400 uppercase tracking-widest">
                    Your profile will be at <span className="text-neutral-700 font-bold">birdfinds.com/pile/{username.trim()}</span>
                </div>
            )}
        </div>
    );
}

function StepCategories({ selectedCategories, onToggle, newCategoryName, onNewCategoryNameChange, onAddCustom }: {
    selectedCategories: Category[];
    onToggle: (cat: Category) => void;
    newCategoryName: string;
    onNewCategoryNameChange: (v: string) => void;
    onAddCustom: () => void;
}) {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-1.5">
                {Array.from(new Set([...DEFAULT_CATEGORIES, ...selectedCategories])).map(cat => {
                    const config = getCategoryConfig(cat);
                    const isActive = selectedCategories.includes(cat);
                    return (
                        <button
                            key={cat}
                            onClick={() => onToggle(cat)}
                            className={`text-left px-2 py-1.5 border text-[10px] uppercase tracking-wider transition-all ${isActive ? 'text-neutral-900' : 'border-neutral-300 text-neutral-400 hover:border-neutral-400'}`}
                            style={isActive ? { backgroundColor: `${config.color}30`, borderColor: config.color || '#404040', borderLeftWidth: '3px' } : undefined}
                        >
                            {config.label}
                        </button>
                    );
                })}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={newCategoryName}
                    onChange={e => onNewCategoryNameChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onAddCustom(); }}
                    placeholder="Custom category name"
                    className="flex-1 px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent font-mono"
                />
                <button onClick={onAddCustom} disabled={!newCategoryName.trim()}
                    className="px-4 py-2 bg-neutral-800 text-white text-xs uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-30">
                    +
                </button>
            </div>
            <div className="text-[10px] text-neutral-400 uppercase tracking-widest">
                {selectedCategories.length} categor{selectedCategories.length === 1 ? 'y' : 'ies'} selected
            </div>
        </div>
    );
}

function StepHabit({ habits, newHabitName, onNewHabitNameChange, onAddHabit, onRemoveHabit }: {
    habits: Array<{ id: string; name: string }>;
    newHabitName: string;
    onNewHabitNameChange: (v: string) => void;
    onAddHabit: () => void;
    onRemoveHabit: (id: string) => void;
}) {
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                {habits.map(h => (
                    <div key={h.id} className="flex items-center justify-between px-3 py-2 border border-neutral-200 bg-neutral-50">
                        <span className="text-sm">{h.name}</span>
                        <button onClick={() => onRemoveHabit(h.id)} className="text-neutral-400 hover:text-red-500 text-xs">x</button>
                    </div>
                ))}
                {habits.length === 0 && (
                    <div className="border border-dashed border-neutral-300 p-6 text-center">
                        <p className="text-xs text-neutral-400 uppercase tracking-widest mb-1">No habits yet</p>
                        <p className="text-[10px] text-neutral-400">Try: meditate, read, exercise, journal, stretch</p>
                    </div>
                )}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={newHabitName}
                    onChange={e => onNewHabitNameChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onAddHabit(); }}
                    placeholder="Add a habit..."
                    className="flex-1 px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent font-mono"
                    autoFocus
                />
                <button onClick={onAddHabit} disabled={!newHabitName.trim()}
                    className="px-4 py-2 bg-neutral-800 text-white text-xs uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-30">
                    +
                </button>
            </div>
        </div>
    );
}

function StepPrivacy({ visibility, onChange }: { visibility: ProfileVisibility; onChange: (v: ProfileVisibility) => void }) {
    const options: Array<{ value: ProfileVisibility; label: string; desc: string }> = [
        { value: 'public', label: 'Public', desc: 'Anyone can view your pile and status updates — even without an account.' },
        { value: 'accounts', label: 'Accounts Only', desc: 'Only signed-in users can see your pile. You stay hidden from the open web.' },
        { value: 'private', label: 'Private', desc: 'Only you can see your pile. Your status updates are completely private.' },
    ];
    return (
        <div className="space-y-3">
            {options.map(opt => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`w-full text-left px-4 py-4 border transition-all ${visibility === opt.value
                        ? 'border-neutral-800 bg-neutral-800 text-white'
                        : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
                    }`}
                >
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${visibility === opt.value ? 'border-white bg-white' : 'border-neutral-400'}`} />
                        <div>
                            <span className="text-xs font-bold uppercase tracking-widest">{opt.label}</span>
                            <p className={`text-[10px] mt-1 leading-relaxed ${visibility === opt.value ? 'text-neutral-300' : 'text-neutral-400'}`}>
                                {opt.desc}
                            </p>
                        </div>
                    </div>
                </button>
            ))}
        </div>
    );
}

function StepGetStarted({ avatarUrl, username, categoriesCount, habitsCount, visibility }: {
    avatarUrl?: string;
    username: string;
    categoriesCount: number;
    habitsCount: number;
    visibility: ProfileVisibility;
}) {
    return (
        <div className="space-y-6">
            <div className="border border-neutral-200 p-4">
                <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-3">Your Profile Summary</div>
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-neutral-300" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-400 text-sm border border-neutral-300">
                                {username.charAt(0).toUpperCase() || '?'}
                            </div>
                        )}
                        <div>
                            <div className="text-sm font-bold">{username || 'No username'}</div>
                            <div className="text-[10px] text-neutral-400 uppercase tracking-widest">{visibility} profile</div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest">
                        <div className="border border-neutral-200 px-3 py-2">
                            <span className="text-neutral-400">Categories:</span>{' '}
                            <span className="text-neutral-800 font-bold">{categoriesCount}</span>
                        </div>
                        <div className="border border-neutral-200 px-3 py-2">
                            <span className="text-neutral-400">Habits:</span>{' '}
                            <span className="text-neutral-800 font-bold">{habitsCount}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="border border-neutral-200 p-4">
                <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">What happens next</div>
                <div className="space-y-2 text-xs text-neutral-600 leading-relaxed">
                    <p>You'll land on the feed where you can write your first daily status. Each day gets one post — think of it as a journal entry with tagged finds.</p>
                    <p>When you write your first status, a quick walkthrough will show you how to tag items, fill out cards, and link finds to your text.</p>
                </div>
            </div>
        </div>
    );
}

// ─── Image Helpers (same as UserSetup) ────────────────────────────────────────

const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        if (url.startsWith('http://') || url.startsWith('https://')) image.setAttribute('crossOrigin', 'anonymous');
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

async function getCroppedImg(imageSrc: string, pixelCrop: Area, outputType: string, quality: number, maxDimension: number): Promise<Blob> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    const sourceWidth = Math.max(1, Math.round(pixelCrop.width));
    const sourceHeight = Math.max(1, Math.round(pixelCrop.height));
    const downscaleRatio = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const destWidth = Math.max(1, Math.round(sourceWidth * downscaleRatio));
    const destHeight = Math.max(1, Math.round(sourceHeight * downscaleRatio));
    canvas.width = destWidth;
    canvas.height = destHeight;
    ctx.drawImage(image, Math.max(0, Math.round(pixelCrop.x)), Math.max(0, Math.round(pixelCrop.y)), Math.max(1, Math.round(pixelCrop.width)), Math.max(1, Math.round(pixelCrop.height)), 0, 0, destWidth, destHeight);
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => { if (!blob) { reject(new Error('Canvas is empty')); return; } resolve(blob); }, outputType, quality);
    });
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string') return error;
    return 'Failed to upload image';
}
