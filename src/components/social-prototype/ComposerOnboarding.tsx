"use client";

import React, { useState, useCallback } from 'react';

/**
 * ComposerOnboarding — Phase 2 onboarding flow.
 *
 * Shown when the user opens the status composer for the first time.
 * Walks them through the core posting workflow step by step:
 *
 *   Step 1: Add a tag (explains @item flow + category buttons)
 *   Step 2: Fill out the card (explains the ConsumableModal)
 *   Step 3: Couple your tag (explains highlight + tap to link, or @)
 *
 * After completion, a localStorage flag is set so it never shows again.
 */

interface ComposerOnboardingProps {
    userId: string;
    onComplete: () => void;
}

type ComposerStep = 1 | 2 | 3;

const STORAGE_KEY_PREFIX = 'birdfinds:composer-onboarding-done:';

export function hasCompletedComposerOnboarding(userId: string): boolean {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`) === '1';
}

export function markComposerOnboardingComplete(userId: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, '1');
}

export function ComposerOnboarding({ userId, onComplete }: ComposerOnboardingProps) {
    const [step, setStep] = useState<ComposerStep>(1);

    const handleComplete = useCallback(() => {
        markComposerOnboardingComplete(userId);
        onComplete();
    }, [userId, onComplete]);

    const goNext = () => {
        if (step < 3) setStep((step + 1) as ComposerStep);
    };

    const goBack = () => {
        if (step > 1) setStep((step - 1) as ComposerStep);
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={handleComplete}
        >
            <div
                className="bg-white border border-neutral-300 w-full max-w-md font-mono max-h-[85vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-800">
                        How to Post
                    </span>
                    <div className="flex items-center gap-3">
                        <span className="text-[9px] uppercase tracking-widest text-neutral-400">
                            {step} of 3
                        </span>
                        <button
                            type="button"
                            onClick={handleComplete}
                            className="text-neutral-400 hover:text-neutral-700 text-xl leading-none w-7 h-7 flex items-center justify-center"
                        >
                            x
                        </button>
                    </div>
                </div>

                {/* Progress */}
                <div className="w-full h-0.5 bg-neutral-100">
                    <div
                        className="h-0.5 bg-neutral-800 transition-all duration-300"
                        style={{ width: `${Math.round((step / 3) * 100)}%` }}
                    />
                </div>

                {/* Content */}
                <div className="px-4 py-5">
                    {step === 1 && <StepTag />}
                    {step === 2 && <StepFillCard />}
                    {step === 3 && <StepCouple />}
                </div>

                {/* Navigation */}
                <div className="flex items-center gap-3 px-4 py-3 border-t border-neutral-200">
                    {step > 1 ? (
                        <button
                            onClick={goBack}
                            className="px-3 py-2 border border-neutral-300 text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
                        >
                            Back
                        </button>
                    ) : (
                        <div />
                    )}
                    <div className="flex-1" />
                    {step < 3 ? (
                        <>
                            <button
                                onClick={handleComplete}
                                className="px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-700"
                            >
                                Skip all
                            </button>
                            <button
                                onClick={goNext}
                                className="px-5 py-2 bg-neutral-800 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-700"
                            >
                                Next
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleComplete}
                            className="px-5 py-2 bg-neutral-800 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-700"
                        >
                            Got it — Start posting
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Step Content ─────────────────────────────────────────────────────────────

function StepTag() {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-full bg-neutral-800 text-white flex items-center justify-center text-xs font-bold">1</div>
                <h3 className="text-sm font-bold uppercase tracking-widest">Tag Your Finds</h3>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
                Everything you do in a day — movies watched, restaurants visited, birds spotted — gets tagged as an item in your daily status.
            </p>
            <div className="border border-neutral-200 bg-neutral-50 p-3 space-y-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">How to add a tag</div>
                <div className="space-y-2 text-xs text-neutral-600">
                    <div className="flex gap-2">
                        <span className="text-neutral-400 w-4 text-right flex-shrink-0">1.</span>
                        <span>Tap one of the <span className="font-bold text-neutral-800">category buttons</span> in the toolbar above the text area (FILM, TV, MUSIC, etc.)</span>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-neutral-400 w-4 text-right flex-shrink-0">2.</span>
                        <span>A card will open — type the name and search to find it</span>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-neutral-400 w-4 text-right flex-shrink-0">3.</span>
                        <span>Save it and the item appears in your table below the text area</span>
                    </div>
                </div>
            </div>
            <div className="text-[10px] text-neutral-400 leading-relaxed">
                You can also type <span className="font-mono bg-neutral-100 px-1 py-0.5 text-neutral-600">@item name</span> in your status text and then tap a category to tag it inline.
            </div>
        </div>
    );
}

function StepFillCard() {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-full bg-neutral-800 text-white flex items-center justify-center text-xs font-bold">2</div>
                <h3 className="text-sm font-bold uppercase tracking-widest">Fill Out the Card</h3>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
                Each tagged item has a card where you can add details. This is where birdfinds gets powerful — your ratings and notes build your personal pile over time.
            </p>
            <div className="border border-neutral-200 bg-neutral-50 p-3 space-y-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">What goes on a card</div>
                <div className="space-y-2 text-xs text-neutral-600">
                    <div className="flex items-start gap-2">
                        <span className="font-bold text-neutral-800 w-16 flex-shrink-0">Search</span>
                        <span>Link your tag to the shared database so others who tag the same item can compare</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="font-bold text-neutral-800 w-16 flex-shrink-0">Rating</span>
                        <span>Score the item on your own scale</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="font-bold text-neutral-800 w-16 flex-shrink-0">Notes</span>
                        <span>Add a quick review, thoughts, or context</span>
                    </div>
                </div>
            </div>
            <div className="text-[10px] text-neutral-400 leading-relaxed">
                Tap any row in the item table to open its card. You can fill these out before or after writing your status text.
            </div>
        </div>
    );
}

function StepCouple() {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-full bg-neutral-800 text-white flex items-center justify-center text-xs font-bold">3</div>
                <h3 className="text-sm font-bold uppercase tracking-widest">Couple Finds to Text</h3>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
                Coupling connects a word in your status text to a tagged item. The word gets colored by category — readers can see exactly which finds you're talking about.
            </p>
            <div className="border border-neutral-200 bg-neutral-50 p-3 space-y-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Two ways to couple</div>
                <div className="space-y-3 text-xs text-neutral-600">
                    <div>
                        <div className="font-bold text-neutral-800 mb-1">Highlight + Tap</div>
                        <div className="pl-3 space-y-1">
                            <p>1. Select/highlight a word or phrase in your status text</p>
                            <p>2. Tap the matching item's row in the table below</p>
                            <p>3. The word turns the item's category color</p>
                        </div>
                    </div>
                    <div className="border-t border-neutral-200 pt-3">
                        <div className="font-bold text-neutral-800 mb-1">@ Mention</div>
                        <div className="pl-3 space-y-1">
                            <p>1. Type <span className="font-mono bg-neutral-100 px-1 py-0.5">@</span> followed by the item name</p>
                            <p>2. Tap a category button in the toolbar</p>
                            <p>3. The @ is replaced with a colored tag</p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="border border-neutral-200 p-3 bg-white">
                <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">Example</div>
                <p className="text-xs text-neutral-700 leading-relaxed">
                    Watched <span className="px-0.5" style={{ backgroundColor: '#f5d14240' }}>Dune Part Two</span> tonight — the desert scenes were incredible. Then grabbed dinner at <span className="px-0.5" style={{ backgroundColor: '#7be08a40' }}>Sushi Park</span>.
                </p>
            </div>
        </div>
    );
}
