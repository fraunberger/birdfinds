"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Category, ConsumableItem } from '@/lib/social-prototype/store';
import { parseItemMeta } from '@/lib/social-prototype/item-meta';
import { pushToast } from '@/lib/social-prototype/toast';
import { TAG_MARKER } from '@/lib/social-prototype/highlighting.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

const normalizeForMatch = (value: string) => value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const isMatchingItemTerm = (term: string, title: string) => normalizeForMatch(term) === normalizeForMatch(title);

const insertTagMarkerAtRange = (content: string, start: number, end: number) => {
    if (start < 0 || end <= start || end > content.length) return content;
    if (content.slice(Math.max(0, start - TAG_MARKER.length), start) === TAG_MARKER) return content;
    return `${content.slice(0, start)}${TAG_MARKER}${content.slice(start)}`;
};

export const getItemHighlightTerms = (item: ConsumableItem): string[] => {
    const meta = parseItemMeta(item.image);
    const terms = [item.title, ...(meta.aliases || [])].map((v) => (v || '').trim()).filter(Boolean);
    return Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
};

// ---------------------------------------------------------------------------
// Hook options & return type
// ---------------------------------------------------------------------------
export interface UseTaggingStateOptions {
    /** The live content (post text). */
    content: string;
    /** Table items attached to the current post. */
    items: ConsumableItem[];
    /** Callback to upsert content. */
    setContentForActive: (value: string) => void;
    /** Side-effect after text replacement. */
    updateActiveStatus: (text: string) => Promise<string | void>;
    /** Add a new item row. */
    addItemToActive: (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => Promise<void>;
}

export interface TaggingState {
    /** Whether we're in mobile mode (coarse pointer). */
    isMobileTagging: boolean;
    /** Currently selected text range in the textarea. */
    selectionStart: number;
    selectionEnd: number;
    selectedText: string;
    /** Quick-add mode: which category was tapped (null = idle). */
    quickAddCategory: Category | null;
    quickAddTitle: string;
    /** Whether an async submission is in-flight. */
    busy: boolean;
    /** The @ prefix position (-1 = inactive). */
    atPrefixPos: number;
    /** The text after the @ prefix (live preview). */
    atPrefixText: string;
    // Actions
    /** Called by textarea selection events to track current selection. */
    updateSelection: (start: number, end: number, text: string) => void;
    /** Clear current selection tracking. */
    clearSelection: () => void;
    /** User tapped a category button in the toolbar. */
    handleCategoryTap: (category: Category) => void;
    /** Update the quick-add title input. */
    setQuickAddTitle: (v: string) => void;
    /** Submit the quick-add form. */
    submitQuickAdd: () => Promise<void>;
    /** Cancel quick-add mode. */
    cancelQuickAdd: () => void;
    /** Ref for the quick-add input (auto-focus). */
    quickAddInputRef: React.RefObject<HTMLInputElement | null>;
    /** Called on every content change to track @ prefix. */
    trackAtPrefix: (value: string, cursorPos: number) => void;
    /** Clear the @ prefix state. */
    clearAtPrefix: () => void;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------
export function useTaggingState({
    content,
    items,
    setContentForActive,
    updateActiveStatus,
    addItemToActive,
}: UseTaggingStateOptions): TaggingState {
    const [isMobileTagging, setIsMobileTagging] = useState(false);
    const [selectionStart, setSelectionStart] = useState(0);
    const [selectionEnd, setSelectionEnd] = useState(0);
    const [selectedText, setSelectedText] = useState('');
    const [quickAddCategory, setQuickAddCategory] = useState<Category | null>(null);
    const [quickAddTitle, setQuickAddTitle] = useState('');
    const [busy, setBusy] = useState(false);
    const [atPrefixPos, setAtPrefixPos] = useState(-1);
    const [atPrefixText, setAtPrefixText] = useState('');

    const quickAddInputRef = useRef<HTMLInputElement | null>(null);
    const inFlightRef = useRef(false);
    const recentKeyRef = useRef<{ key: string; at: number } | null>(null);
    const lastSelectionRef = useRef<{ text: string; at: number } | null>(null);

    // Mobile detection
    useEffect(() => {
        const updateMode = () => {
            if (typeof window === 'undefined') return;
            const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
            setIsMobileTagging(coarsePointer || window.innerWidth < 640);
        };
        updateMode();
        window.addEventListener('resize', updateMode);
        return () => window.removeEventListener('resize', updateMode);
    }, []);

    const updateSelection = useCallback((start: number, end: number, text: string) => {
        setSelectionStart(start);
        setSelectionEnd(end);
        setSelectedText(text);
        if (text.trim()) {
            lastSelectionRef.current = { text: text.trim(), at: Date.now() };
        }
    }, []);

    const clearSelection = useCallback(() => {
        setSelectionStart(0);
        setSelectionEnd(0);
        setSelectedText('');
    }, []);

    const cancelQuickAdd = useCallback(() => {
        setQuickAddCategory(null);
        setQuickAddTitle('');
    }, []);

    const clearAtPrefix = useCallback(() => {
        setAtPrefixPos(-1);
        setAtPrefixText('');
    }, []);

    // ── Track @ prefix in content ──────────────────────────────────────
    const trackAtPrefix = useCallback((value: string, cursorPos: number) => {
        // Look backwards from cursor for an unmatched @
        // The @ must not be preceded by a non-whitespace char (or be at start)
        if (cursorPos <= 0) { clearAtPrefix(); return; }

        // Search backwards from cursor to find the most recent @
        let atPos = -1;
        for (let i = cursorPos - 1; i >= 0; i--) {
            if (value[i] === '\n') break; // don't cross line boundaries
            if (value[i] === '@') {
                // @ must be at start of string or preceded by whitespace
                if (i === 0 || /\s/.test(value[i - 1])) {
                    atPos = i;
                }
                break;
            }
        }

        if (atPos >= 0) {
            const textAfterAt = value.substring(atPos + 1, cursorPos);
            if (textAfterAt.length > 0 && !textAfterAt.includes('\n')) {
                setAtPrefixPos(atPos);
                setAtPrefixText(textAfterAt);
                return;
            }
        }

        clearAtPrefix();
    }, [clearAtPrefix]);

    // ── Core: tag selected text, @ prefix, or enter quick-add mode ─────
    const handleCategoryTap = useCallback((category: Category) => {
        if (inFlightRef.current) return;

        // Priority 1: Has text selected (Flow A)
        const recentSelection = lastSelectionRef.current;
        const hasRecentMobileSelection = isMobileTagging
            && !!recentSelection
            && (Date.now() - recentSelection.at) < 2500
            && recentSelection.text.trim().length > 0;
        const effectiveSelectionText = selectedText.trim() || (hasRecentMobileSelection ? recentSelection?.text.trim() || '' : '');
        const hasSelection = effectiveSelectionText.length > 0;
        if (hasSelection) {
            const title = effectiveSelectionText;
            const mentionKey = `${category}:${title.toLowerCase()}`;
            const now = Date.now();
            if (recentKeyRef.current && recentKeyRef.current.key === mentionKey && (now - recentKeyRef.current.at) < 2500) return;

            const existing = items.find((item) =>
                item.category === category
                && getItemHighlightTerms(item).some((term) => isMatchingItemTerm(term, title))
            );

            inFlightRef.current = true;
            setBusy(true);
            (async () => {
                try {
                    if (!existing) {
                        await addItemToActive({ category, title, rating: undefined, subtitle: '', notes: '' });
                    }
                    const nextContent = insertTagMarkerAtRange(content || '', selectionStart, selectionEnd);
                    if (nextContent !== (content || '')) {
                        setContentForActive(nextContent);
                        await updateActiveStatus(nextContent);
                    }
                    recentKeyRef.current = { key: mentionKey, at: Date.now() };
                } catch (error: unknown) {
                    pushToast({ message: `Failed to tag: ${getErrorMessage(error)}`, tone: 'error' });
                } finally {
                    inFlightRef.current = false;
                    setBusy(false);
                    clearSelection();
                    lastSelectionRef.current = null;
                }
            })();
            return;
        }

        // Priority 2: Has @ prefix typed (Flow @)
        if (atPrefixPos >= 0 && atPrefixText.trim().length > 0) {
            const title = atPrefixText.trim();
            const mentionKey = `${category}:${title.toLowerCase()}`;
            const now = Date.now();
            if (recentKeyRef.current && recentKeyRef.current.key === mentionKey && (now - recentKeyRef.current.at) < 2500) {
                clearAtPrefix();
                return;
            }

            const existing = items.find((item) =>
                item.category === category
                && getItemHighlightTerms(item).some((term) => isMatchingItemTerm(term, title))
            );

            inFlightRef.current = true;
            setBusy(true);
            (async () => {
                try {
                    if (!existing) {
                        await addItemToActive({ category, title, rating: undefined, subtitle: '', notes: '' });
                    }
                    // Remove the @ prefix from content, keep just the title text
                    const currentContent = content || '';
                    const before = currentContent.slice(0, atPrefixPos);
                    const after = currentContent.slice(atPrefixPos + 1 + atPrefixText.length);
                    const newContent = before + TAG_MARKER + title + after;
                    setContentForActive(newContent);
                    await updateActiveStatus(newContent);
                    recentKeyRef.current = { key: mentionKey, at: Date.now() };
                } catch (error: unknown) {
                    pushToast({ message: `Failed to tag: ${getErrorMessage(error)}`, tone: 'error' });
                } finally {
                    inFlightRef.current = false;
                    setBusy(false);
                    clearAtPrefix();
                }
            })();
            return;
        }

        // Priority 3: Nothing active — enter quick-add mode (Flow C)
        setQuickAddCategory(category);
        setQuickAddTitle('');
        setTimeout(() => quickAddInputRef.current?.focus(), 50);
    }, [selectedText, atPrefixPos, atPrefixText, content, items, clearSelection, clearAtPrefix, addItemToActive, setContentForActive, updateActiveStatus, isMobileTagging, selectionStart, selectionEnd]);

    // ── Quick-add submit ───────────────────────────────────────────────
    const submitQuickAdd = useCallback(async () => {
        if (!quickAddTitle.trim() || !quickAddCategory) return;
        if (inFlightRef.current) return;

        const title = quickAddTitle.trim();
        const mentionKey = `${quickAddCategory}:${title.toLowerCase()}`;
        const now = Date.now();
        if (recentKeyRef.current && recentKeyRef.current.key === mentionKey && (now - recentKeyRef.current.at) < 2500) {
            cancelQuickAdd();
            return;
        }

        const existing = items.find((item) =>
            item.category === quickAddCategory
            && getItemHighlightTerms(item).some((term) => isMatchingItemTerm(term, title))
        );

        inFlightRef.current = true;
        setBusy(true);
        try {
            if (!existing) {
                await addItemToActive({ category: quickAddCategory, title, rating: undefined, subtitle: '', notes: '' });
            }
            // Insert title into content at the end (or append with space)
            const currentContent = content || '';
            const needsSpace = currentContent.length > 0 && !/\s$/.test(currentContent);
            const newContent = currentContent + (needsSpace ? ' ' : '') + title;
            setContentForActive(newContent);
            await updateActiveStatus(newContent);
            recentKeyRef.current = { key: mentionKey, at: Date.now() };
            cancelQuickAdd();
        } catch (error: unknown) {
            pushToast({ message: `Failed to add item: ${getErrorMessage(error)}`, tone: 'error' });
        } finally {
            inFlightRef.current = false;
            setBusy(false);
        }
    }, [quickAddTitle, quickAddCategory, content, items, cancelQuickAdd, addItemToActive, setContentForActive, updateActiveStatus]);

    return {
        isMobileTagging,
        selectionStart,
        selectionEnd,
        selectedText,
        quickAddCategory,
        quickAddTitle,
        busy,
        atPrefixPos,
        atPrefixText,
        updateSelection,
        clearSelection,
        handleCategoryTap,
        setQuickAddTitle,
        submitQuickAdd,
        cancelQuickAdd,
        quickAddInputRef,
        trackAtPrefix,
        clearAtPrefix,
    };
}
