"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TAG_MARKER } from '@/lib/social-prototype/highlighting.mjs';
import { getCategoryConfig } from '@/lib/social-prototype/store';
import type { ConsumableItem } from '@/lib/social-prototype/store';
import { parseItemMeta } from '@/lib/social-prototype/item-meta';

/**
 * ComposerOnboarding — Phase 2 inline guided checklist.
 *
 * Instead of a modal, this renders:
 *   - Three checkboxes to the left of the Post button
 *   - Visual highlight hints on specific composer regions
 *
 * Steps:
 *   1. "Add a tag"    → pulses the item table area
 *   2. "Fill out card" → pulses an unfilled item row
 *   3. "Couple to text" → pulses the status textarea
 *
 * Each step auto-checks when the user completes the action.
 * Only shown for the very first post, then permanently dismissed.
 */

const STORAGE_KEY_PREFIX = 'birdfinds:composer-onboarding-done:';

export function hasCompletedComposerOnboarding(userId: string): boolean {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`) === '1';
}

export function markComposerOnboardingComplete(userId: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, '1');
}

type OnboardingStep = 'tag' | 'fill' | 'couple';

const STEP_LABELS: Record<OnboardingStep, string> = {
    tag: 'Add a tag',
    fill: 'Fill out card',
    couple: 'Couple to text',
};

const STEP_HINTS: Record<OnboardingStep, string> = {
    tag: 'Tap a category button above to tag your first find',
    fill: 'Tap the item row below to open its card and add a rating',
    couple: 'Highlight a word in your text, then tap the item row to link it',
};

/** Check if an item has been "filled out" — matches the isLinked logic in ComposerItemTable. */
export function isItemFilled(item: ConsumableItem): boolean {
    const config = getCategoryConfig(item.category);
    const meta = parseItemMeta(item.image);
    if (config.coupling === 'api') {
        return item.category === 'book' ? !!meta.imageUrl : !!meta.externalSource;
    }
    // Bird items are filled when they have species in birdList or checklist
    if (item.category === 'bird') {
        return !!((meta.birdList && meta.birdList.length > 0) || (meta.checklist && meta.checklist.length > 0));
    }
    return !!(item.rating || item.notes?.trim() || item.subtitle?.trim() || meta.recipeUrl || meta.linkUrl);
}

interface ComposerOnboardingChecklistProps {
    userId: string;
    items: ConsumableItem[];
    content: string;
    onComplete: () => void;
}

/**
 * Inline checklist rendered next to the post button.
 * Tracks step completion reactively from items/content props.
 */
export function ComposerOnboardingChecklist({ userId, items, content, onComplete }: ComposerOnboardingChecklistProps) {
    const [dismissed, setDismissed] = useState(false);
    const completedRef = useRef(false);

    // Derive completion state from actual data
    const hasTag = items.length > 0;
    const hasFilled = items.some(isItemFilled);
    const hasCoupled = content.includes(TAG_MARKER);

    const steps: Array<{ id: OnboardingStep; done: boolean }> = [
        { id: 'tag', done: hasTag },
        { id: 'fill', done: hasFilled },
        { id: 'couple', done: hasCoupled },
    ];

    const allDone = hasTag && hasFilled && hasCoupled;
    const activeStep = steps.find(s => !s.done)?.id ?? null;

    // Auto-dismiss and persist when all three are done
    useEffect(() => {
        if (allDone && !completedRef.current) {
            completedRef.current = true;
            markComposerOnboardingComplete(userId);
            // Brief delay so user sees all three checked before it disappears
            const timer = setTimeout(() => onComplete(), 1200);
            return () => clearTimeout(timer);
        }
    }, [allDone, userId, onComplete]);

    const handleSkip = useCallback(() => {
        markComposerOnboardingComplete(userId);
        setDismissed(true);
        onComplete();
    }, [userId, onComplete]);

    if (dismissed) return null;

    return (
        <div className="flex flex-col gap-1">
            {/* Checklist */}
            <div className="flex items-center gap-3">
                {steps.map(({ id, done }) => (
                    <label key={id} className={`flex items-center gap-1 text-[9px] uppercase tracking-widest cursor-default select-none transition-colors ${done ? 'text-green-700' : id === activeStep ? 'text-neutral-800 font-bold' : 'text-neutral-400'}`}>
                        <span className={`inline-flex items-center justify-center w-3.5 h-3.5 border text-[8px] leading-none ${done ? 'border-green-700 bg-green-700 text-white' : id === activeStep ? 'border-neutral-800' : 'border-neutral-300'}`}>
                            {done ? '✓' : ''}
                        </span>
                        {STEP_LABELS[id]}
                    </label>
                ))}
                <button
                    type="button"
                    onClick={handleSkip}
                    className="text-[8px] uppercase tracking-widest text-neutral-300 hover:text-neutral-500 ml-1"
                >
                    skip
                </button>
            </div>

            {/* Active hint */}
            {activeStep && !allDone && (
                <div className="text-[9px] text-neutral-400 leading-snug">
                    {STEP_HINTS[activeStep]}
                </div>
            )}
            {allDone && (
                <div className="text-[9px] text-green-700 leading-snug font-bold">
                    You&apos;re ready to post!
                </div>
            )}
        </div>
    );
}

/**
 * Returns a CSS class name for composer regions that should pulse
 * during onboarding. Apply to wrapper divs of the relevant areas.
 *
 * @param region - 'table' | 'card' | 'textarea'
 * @param activeStep - the current incomplete step, or null
 */
export function getOnboardingHighlight(
    region: 'table' | 'card' | 'textarea',
    activeStep: OnboardingStep | null,
): string {
    if (!activeStep) return '';
    if (activeStep === 'tag' && region === 'table') return 'onboarding-pulse';
    if (activeStep === 'fill' && region === 'card') return 'onboarding-pulse';
    if (activeStep === 'couple' && region === 'textarea') return 'onboarding-pulse';
    return '';
}

/**
 * CSS to inject for the onboarding pulse animation.
 * Add this once to the composer when onboarding is active.
 */
export const ONBOARDING_PULSE_CSS = `
@keyframes onboarding-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
    50% { box-shadow: 0 0 0 3px rgba(0,0,0,0.12); }
}
.onboarding-pulse {
    animation: onboarding-pulse 2s ease-in-out infinite;
}
`;
