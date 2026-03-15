"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ConsumableItem, Status, useSocialStore, useUserProfile, Category, CATEGORY_CONFIGS, HIGHLIGHT_COLOR, getCategoryConfig } from '@/lib/social-prototype/store';
import { ConsumableModal } from './ConsumableModal';
import { ComposerItemTable } from './ComposerItemTable';
import { pushToast } from '@/lib/social-prototype/toast';
import { normalizeTaggedTextForFeed, parseHighlights, segmentText, TAG_MARKER } from '@/lib/social-prototype/highlighting.mjs';
import { getItemExternalIdentityKey, parseItemMeta, serializeItemMeta } from '@/lib/social-prototype/item-meta';
import { getCanonicalItemKey } from '@/lib/social-prototype/items';
import { useAuth } from '@/lib/auth';
import { useTaggingState, getItemHighlightTerms } from './useTaggingState';
import { HabitChecklist } from './HabitChecklist';
import { ComposerOnboardingChecklist, hasCompletedComposerOnboarding, getOnboardingHighlight, ONBOARDING_PULSE_CSS, isItemFilled } from './ComposerOnboarding';

interface StatusComposerProps {
    userCategories?: Category[];
    onEntryModeChange?: (isEntryMode: boolean) => void;
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');
const stripLeadingAtSymbol = (value: string) => value.replace(/^@+\s*/, '').trim();

export function StatusComposer({ userCategories, onEntryModeChange }: StatusComposerProps) {
    const { user } = useAuth();
    const { activeStatus, activeDate, setActiveDate, setActiveStatusForEdit, updateActiveStatus, ensureActiveStatus, addItemToActive, removeItemFromActive, updateItemInActive, togglePublished, statuses, isLoaded, refresh } = useSocialStore();
    const { hasPublishedPost } = useUserProfile();
    const [contentDrafts, setContentDrafts] = useState<Record<string, string>>({});
    const [draftStatus, setDraftStatus] = useState<'saved' | 'error'>('saved');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showHowToPost, setShowHowToPost] = useState(false);
    const [isPosting, setIsPosting] = useState(false);
    const [hasItemDraftChanges, setHasItemDraftChanges] = useState(false);
    const [isPreparingComposer, setIsPreparingComposer] = useState(false);

    const [activeCategory, setActiveCategory] = useState<Category>('movie');
    const [existingItem, setExistingItem] = useState<ConsumableItem | undefined>(undefined);

    const [lastCursorPosition, setLastCursorPosition] = useState<number | null>(null);
    const [selectedPlainText, setSelectedPlainText] = useState<string>('');
    const [showComposerOnboarding, setShowComposerOnboarding] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const recentSelectionRef = useRef<{ text: string; at: number } | null>(null);

    useEffect(() => { onEntryModeChange?.(isExpanded); }, [isExpanded, onEntryModeChange]);

    // Active categories
    const activeCategories = userCategories && userCategories.length > 0
        ? userCategories
        : Object.keys(CATEGORY_CONFIGS) as Category[];
    // LINK is always first; all remaining categories scroll horizontally.
    const linkConfig = getCategoryConfig('link');
    const nonLinkConfigs = activeCategories.filter(c => c !== 'link').map(c => getCategoryConfig(c));
    const toolbarCategoryConfigs = [linkConfig, ...nonLinkConfigs];
    // The v2 prefix isolates drafts from legacy structures. The user.id used here is
    // provided by Clerk (prefixed 'user_...') not the Supabase database. Its sole purpose 
    // is to prevent drafts from leaking across accounts if multiple users share the same browser.
    const draftsStorageKey = `birdfinds:composer:drafts:v2:${user?.id || 'anon'}`;
    const activeContentKey = `draft:${activeDate}`;
    const content = contentDrafts[activeContentKey] ?? activeStatus?.content ?? '';
    const items = useMemo(() => activeStatus?.items ?? [], [activeStatus?.items]);

    // Derive the active onboarding step for highlight hints
    const onboardingActive = showComposerOnboarding && isExpanded;
    const onboardingActiveStep = onboardingActive
        ? (items.length === 0
            ? 'tag' as const
            : !items.some(isItemFilled)
                ? 'fill' as const
                : !content.includes(TAG_MARKER)
                    ? 'couple' as const
                    : null)
        : null;

    const setContentForActive = useCallback((value: string) => {
        if (draftStatus === 'error') setDraftStatus('saved');
        setContentDrafts((prev) => ({ ...prev, [activeContentKey]: value }));
    }, [activeContentKey, draftStatus]);

    // ── Tagging state (extracted hook) ─────────────────────────────────
    const tagging = useTaggingState({
        content,
        items,
        setContentForActive,
        updateActiveStatus,
        addItemToActive,
    });

    // ── Preview highlights (synchronous — always in sync with content + items) ──
    const previewDecorations = useMemo(() => {
        if (!content) return [] as Array<{
            id: string; entityType: string; entityId: string;
            start: number; end: number; displayText: string; source: string; color?: string;
        }>;
        const entities = items.map((item) => ({
            id: item.id,
            entityType: item.category,
            entityId: item.id,
            terms: getItemHighlightTerms(item),
            source: 'item',
            color: getCategoryConfig(item.category)?.color || HIGHLIGHT_COLOR,
            priority: 1,
        }));
        return parseHighlights(content, entities) as Array<{
            id: string; entityType: string; entityId: string;
            start: number; end: number; displayText: string; source: string; color?: string;
        }>;
    }, [content, items]);

    /** Update composer content (convenience wrapper used by tagging & linking). */
    const setComposerContent = useCallback((nextContent: string) => {
        setContentForActive(nextContent);
    }, [setContentForActive]);

    // ── Draft persistence ──────────────────────────────────────────────
    useEffect(() => { setContentDrafts({}); }, [draftsStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(draftsStorageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Record<string, string>;
            if (parsed && typeof parsed === 'object') setContentDrafts(parsed);
        } catch { /* ignore */ }
    }, [draftsStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const timer = window.setTimeout(() => {
            try { window.localStorage.setItem(draftsStorageKey, JSON.stringify(contentDrafts)); }
            catch { /* ignore */ }
        }, 220);
        return () => window.clearTimeout(timer);
    }, [contentDrafts, draftsStorageKey]);

    // ── Auto-save draft to backend ─────────────────────────────────────
    useEffect(() => {
        if (!isExpanded) return;
        if (activeStatus?.published) return;
        if (content.trim() === (activeStatus?.content || '').trim()) return;
        // Never overwrite existing server content with an empty string —
        // this prevents accidental data loss when the composer loads blank
        // due to stale drafts or timing issues.
        if (!content.trim() && (activeStatus?.content || '').trim()) return;
        const timer = window.setTimeout(async () => {
            try {
                await updateActiveStatus(content);
                setDraftStatus('saved');
            } catch (error) {
                setDraftStatus('error');
                pushToast({ message: error instanceof Error ? error.message : 'Draft sync failed', tone: 'error' });
            }
        }, 1200);
        return () => window.clearTimeout(timer);
    }, [isExpanded, activeStatus?.published, activeStatus?.content, content, updateActiveStatus]);

    // ── Textarea auto-resize ───────────────────────────────────────────
    const adjustTextareaHeight = () => {
        const el = textareaRef.current;
        if (el) { el.style.height = 'auto'; el.style.height = Math.max(100, el.scrollHeight) + 'px'; }
    };

    useEffect(() => { adjustTextareaHeight(); }, [content]);

    // ── Edit entry event ───────────────────────────────────────────────
    useEffect(() => {
        const handleEditEntry = (event: Event) => {
            const customEvent = event as CustomEvent<{ date?: string; status?: Status }>;
            const editDate = customEvent.detail?.date;
            const editStatus = customEvent.detail?.status;
            if (editDate) {
                // Clear any stale local draft so the composer loads the actual
                // server content for this post instead of an old/empty draft.
                const key = `draft:${editDate}`;
                setContentDrafts((prev) => {
                    if (!(key in prev)) return prev;
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });
                // Use the full status when provided (handles posts older than JOURNAL_PAGE_SIZE
                // that won't be found in the local statuses array by setActiveDate alone).
                if (editStatus) {
                    setActiveStatusForEdit(editStatus);
                } else {
                    setActiveDate(editDate);
                }
            }
            setIsExpanded(true);
            // Trigger onboarding checklist for first-time composers (no published posts yet)
            if (user?.id && !hasCompletedComposerOnboarding(user.id) && !hasPublishedPost && !statuses.some(s => s.published)) {
                setShowComposerOnboarding(true);
            }
            window.setTimeout(() => textareaRef.current?.focus(), 220);
        };
        window.addEventListener('birdpile:edit-entry', handleEditEntry as EventListener);
        return () => window.removeEventListener('birdpile:edit-entry', handleEditEntry as EventListener);
    }, [setActiveDate, setActiveStatusForEdit, user?.id]);

    // If a stale local draft lost tag markers, prefer canonical server content for this status.
    useEffect(() => {
        if (!activeStatus?.id || activeStatus.id === 'temp-optimistic') return;
        const serverContent = activeStatus.content || '';
        if (!serverContent.includes(TAG_MARKER)) return;
        setContentDrafts((prev) => {
            const current = prev[activeContentKey];
            if (typeof current !== 'string' || current.includes(TAG_MARKER)) return prev;
            return { ...prev, [activeContentKey]: serverContent };
        });
    }, [activeContentKey, activeStatus?.id, activeStatus?.content]);

    // ── Content change handler ─────────────────────────────────────────
    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setComposerContent(val);
        adjustTextareaHeight();
        // Track @ prefix for inline tagging
        const cursorPos = e.target.selectionStart || 0;
        tagging.trackAtPrefix(val, cursorPos);
    };

    const handleBlur = () => { /* No-op. Content stays local until user explicitly posts. */ };

    const prepareComposerForEntry = useCallback(async () => {
        setIsPreparingComposer(true);
        try {
            // Force fresh account + status hydration before exposing table entry actions.
            await refresh();
        } catch (error) {
            pushToast({ message: `Failed to refresh composer context: ${getErrorMessage(error)}`, tone: 'error' });
        } finally {
            setIsPreparingComposer(false);
        }
    }, [refresh]);

    const hasUnsavedChanges = content !== (activeStatus?.content || '') && !activeStatus?.published;
    const hasDraftChanges = content !== (activeStatus?.content || '') || hasItemDraftChanges;
    const draftBadgeText = activeStatus?.published && !hasDraftChanges ? 'Posted' : (draftStatus === 'error' ? 'Draft Error' : 'Draft Saved');
    const draftBadgeTone = activeStatus?.published && !hasDraftChanges ? 'text-neutral-500' : (draftStatus === 'error' ? 'text-red-600' : 'text-green-700');
    const isAtPrefixLinking = tagging.atPrefixPos >= 0 && tagging.atPrefixText.trim().length > 0;
    const hasTableItems = items.length > 0;
    const isTableLinkingMode = hasTableItems && (isAtPrefixLinking || selectedPlainText.trim().length > 0);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasUnsavedChanges) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [hasUnsavedChanges]);

    useEffect(() => {
        setHasItemDraftChanges(false);
    }, [activeDate, activeStatus?.id]);

    // All user items for repeat detection
    const allUserItems = useMemo(() => statuses.flatMap(s => s.items), [statuses]);

    // ── Item callbacks ─────────────────────────────────────────────────
    const handleSaveItem = async (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => {
        try {
            const draftKey = getCanonicalItemKey(item);
            const incomingExternalKey = getItemExternalIdentityKey(item.category, item.image);
            const previousItem = existingItem
                || allUserItems.find((candidate) => {
                    if (incomingExternalKey) {
                        return getItemExternalIdentityKey(candidate.category, candidate.image) === incomingExternalKey;
                    }
                    return getCanonicalItemKey(candidate) === draftKey;
                });
            let nextImage = item.image;
            if (previousItem && (existingItem || incomingExternalKey)) {
                const previousMeta = parseItemMeta(previousItem.image);
                const incomingMeta = parseItemMeta(item.image);
                const meta = {
                    ...previousMeta,
                    ...incomingMeta,
                    aliases: Array.from(new Set([
                        ...(previousMeta.aliases || []).map((v) => v.trim()).filter(Boolean),
                        ...(incomingMeta.aliases || []).map((v) => v.trim()).filter(Boolean),
                    ])),
                };
                const oldTitle = previousItem.title.trim();
                const newTitle = item.title.trim();
                if (existingItem && oldTitle && newTitle && oldTitle.toLowerCase() !== newTitle.toLowerCase()) {
                    const aliases = new Set([...(meta.aliases || []), oldTitle]);
                    meta.aliases = Array.from(aliases);
                }
                nextImage = serializeItemMeta(meta);
            }
            if (existingItem) {
                // Always update when editing an existing item — even if it still has a
                // temp ID (server response hasn't arrived yet). Calling addItemToActive
                // here would create a duplicate server record.
                await updateItemInActive(existingItem.id, { ...item, image: nextImage });
            } else {
                await addItemToActive({ ...item, image: nextImage });
            }
            setHasItemDraftChanges(true);
            setExistingItem(undefined);
        } catch (error: unknown) {
            pushToast({ message: `Failed to save item: ${getErrorMessage(error)}`, tone: 'error' });
        }
    };

    const handleDeleteItem = async () => {
        if (existingItem) {
            await removeItemFromActive(existingItem.id);
            setHasItemDraftChanges(true);
            setExistingItem(undefined);
        }
    };

    const openModal = (item: ConsumableItem) => {
        setActiveCategory(item.category);
        setExistingItem(item);
        setIsModalOpen(true);
    };

    const linkExistingItemToPost = async (item: ConsumableItem) => {
        const ensureAliasLinked = async (phrase: string) => {
            const normalizedPhrase = phrase.trim();
            if (!normalizedPhrase) return;
            const alreadyLinked = getItemHighlightTerms(item).some((term) => term.trim().toLowerCase() === normalizedPhrase.toLowerCase());
            if (alreadyLinked) return;

            const meta = parseItemMeta(item.image);
            const aliases = new Set((meta.aliases || []).map((v) => v.trim()).filter(Boolean));
            aliases.add(normalizedPhrase);
            const nextImage = serializeItemMeta({ ...meta, aliases: Array.from(aliases) });
            await updateItemInActive(item.id, { image: nextImage });
            setHasItemDraftChanges(true);
        };

        if (isAtPrefixLinking) {
            const typedText = stripLeadingAtSymbol(tagging.atPrefixText);
            if (!typedText) {
                tagging.clearAtPrefix();
                return;
            }
            await ensureAliasLinked(typedText);
            const currentContent = content || '';
            const before = currentContent.slice(0, tagging.atPrefixPos);
            const after = currentContent.slice(tagging.atPrefixPos + 1 + tagging.atPrefixText.length);
            const nextContent = `${before}${TAG_MARKER}${typedText}${after}`;
            setComposerContent(nextContent);
            await updateActiveStatus(nextContent);
            tagging.clearAtPrefix();
            setIsExpanded(true);
            setTimeout(() => {
                const target = textareaRef.current;
                if (!target) return;
                target.focus();
                const nextCursor = before.length + TAG_MARKER.length + typedText.length;
                target.setSelectionRange(nextCursor, nextCursor);
                setLastCursorPosition(nextCursor);
            }, 30);
            return;
        }

        const recentSelection = recentSelectionRef.current;
        const mobileFallbackPhrase = tagging.isMobileTagging
            && recentSelection
            && (Date.now() - recentSelection.at) < 3000
            ? recentSelection.text.trim()
            : '';
        const rawPhrase = selectedPlainText.trim() || mobileFallbackPhrase;
        const phrase = stripLeadingAtSymbol(rawPhrase);

        if (tagging.isMobileTagging && !phrase) {
            pushToast({ message: 'Select text or type @ to link from mobile.', tone: 'error' });
            return;
        }

        if (phrase) {
            await ensureAliasLinked(phrase);
            const start = tagging.selectionStart;
            const end = tagging.selectionEnd;
            const currentContent = content || '';
            if (
                start >= 0
                && end > start
                && end <= currentContent.length
                && stripLeadingAtSymbol(currentContent.slice(start, end)) === phrase
                && currentContent.slice(Math.max(0, start - TAG_MARKER.length), start) !== TAG_MARKER
            ) {
                const hasLeadingAt = currentContent[start] === '@';
                const insertionStart = hasLeadingAt ? start + 1 : start;
                const nextContent = `${currentContent.slice(0, start)}${TAG_MARKER}${currentContent.slice(insertionStart)}`;
                setComposerContent(nextContent);
                await updateActiveStatus(nextContent);
                setHasItemDraftChanges(true);
            }
            setSelectedPlainText('');
            recentSelectionRef.current = null;
            return;
        }

        const currentContent = content || '';
        const rawInsertPos = lastCursorPosition ?? currentContent.length;
        const insertPos = Math.max(0, Math.min(rawInsertPos, currentContent.length));
        const before = currentContent.slice(0, insertPos);
        const after = currentContent.slice(insertPos);
        const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
        const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
        const insertion = `${needsLeadingSpace ? ' ' : ''}${TAG_MARKER}${item.title}${needsTrailingSpace ? ' ' : ''}`;
        const nextContent = `${before}${insertion}${after}`;

        setComposerContent(nextContent);
        setIsExpanded(true);
        setTimeout(() => {
            const target = textareaRef.current;
            if (!target) return;
            target.focus();
            const nextCursor = before.length + insertion.length;
            target.setSelectionRange(nextCursor, nextCursor);
            setLastCursorPosition(nextCursor);
        }, 30);
    };

    const handleTextSelection = useCallback((target: HTMLTextAreaElement) => {
        const start = target.selectionStart;
        const end = target.selectionEnd;
        if (start !== end) {
            const selectedText = target.value.substring(start, end);
            if (!selectedText.trim()) return;
            setSelectedPlainText(selectedText.trim());
            recentSelectionRef.current = { text: selectedText.trim(), at: Date.now() };
            tagging.updateSelection(start, end, selectedText.trim());
            // Auto-matching via selection removed as requested — user must tap item in table or category button
            return;
        }
        setSelectedPlainText('');
        tagging.clearSelection();
    }, [tagging]);

    useEffect(() => {
        const syncTextareaSelection = () => {
            const target = textareaRef.current;
            if (!target || document.activeElement !== target) return;
            setLastCursorPosition(target.selectionStart);
            handleTextSelection(target);
        };

        document.addEventListener('selectionchange', syncTextareaSelection);
        return () => document.removeEventListener('selectionchange', syncTextareaSelection);
    }, [handleTextSelection]);

    if (!isLoaded) return <div className="h-32 bg-neutral-100 mb-4 border border-neutral-300" />;

    return (
        <div className="mb-6 font-mono">
            <style>{`
                .composer-text, .highlight-layer { font-size: 14px; }
                @media (min-width: 640px) { .composer-text, .highlight-layer { font-size: 12px; } }
                ${onboardingActive ? ONBOARDING_PULSE_CSS : ''}
            `}</style>

            {/* Header */}
            <header className="flex items-center justify-between mb-2 pb-2 border-b border-neutral-300 gap-4">
                <button
                    onClick={async () => {
                        const next = !isExpanded;
                        if (next) {
                            await prepareComposerForEntry();
                            // Show inline onboarding checklist for first-time composers
                            if (user?.id && !hasCompletedComposerOnboarding(user.id) && !hasPublishedPost && !statuses.some(s => s.published)) {
                                setShowComposerOnboarding(true);
                            }
                        }
                        setIsExpanded(next);
                    }}
                    disabled={isPreparingComposer}
                    className="flex items-center gap-2 shrink-0 hover:opacity-70 transition-opacity touch-manipulation"
                >
                    <span className={`text-xs transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 whitespace-nowrap">
                        {isPreparingComposer ? 'LOADING…' : (isExpanded ? 'LOG ENTRY' : (activeStatus?.content ? 'ENTRY' : 'NEW ENTRY'))}
                    </h2>
                </button>
                <div className="flex items-center justify-end gap-4 text-xs uppercase tracking-widest">
                    <button type="button" onClick={() => setShowHowToPost(true)}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors whitespace-nowrap touch-manipulation"
                        aria-label="How to post?">
                        How to post?
                    </button>
                    <span className={`whitespace-nowrap text-[10px] ${draftBadgeTone}`}>{draftBadgeText}</span>
                    <div className="relative inline-flex items-center gap-1 cursor-pointer hover:opacity-70 transition-opacity">
                        <span className="font-mono text-neutral-500 whitespace-nowrap select-none">{activeDate.slice(5).replace('-', '/')}</span>
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-neutral-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 9h18" />
                        </svg>
                        <input ref={dateInputRef} type="date" value={activeDate} onChange={(e) => setActiveDate(e.target.value)}
                            onClick={(e) => { try { const t = e.target as HTMLInputElement; if (typeof t.showPicker === 'function') t.showPicker(); } catch { /* fallback */ } }}
                            aria-label="Select date" className="absolute inset-0 opacity-0 cursor-pointer" />
                    </div>
                </div>
            </header>

            {showHowToPost && (
                <div
                    className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
                    onClick={() => setShowHowToPost(false)}
                >
                    <div
                        className="bg-white border border-neutral-300 w-full max-w-sm font-mono max-h-[85vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                            <span className="text-xs font-bold uppercase tracking-widest text-neutral-800">How to Post</span>
                            <button
                                type="button"
                                onClick={() => setShowHowToPost(false)}
                                className="text-neutral-400 hover:text-neutral-700 text-xl leading-none w-7 h-7 flex items-center justify-center"
                            >×</button>
                        </div>
                        <div className="px-4 py-4 space-y-4 text-[11px] text-neutral-600 leading-relaxed">
                            <p className="font-semibold text-neutral-800 text-xs uppercase tracking-widest">One Post, One Pile, Every Day!</p>
                            <p className="-mt-2">Each day gets one entry. Check the calendar to make sure you're on the right date before starting.</p>

                            <div className="space-y-1">
                                <p><span className="font-bold text-neutral-900 tracking-wide">TAG</span> your finds</p>
                                <p>Add items to your daily pile using the table below. Type the title and select a category. Do this before writing your status (recommended) or inline using @title while writing (advanced)*</p>
                            </div>

                            <div className="space-y-1">
                                <p><span className="font-bold text-neutral-900 tracking-wide">FILL OUT</span> your finds</p>
                                <p>Tap any item in the table to open its card. Search to link it to a shared database record, then rate and review it. Linked items unlock community ratings and repeat tracking.</p>
                            </div>

                            <div className="space-y-1">
                                <p><span className="font-bold text-neutral-900 tracking-wide">COUPLE</span> finds to your status</p>
                                <p>In your status text, highlight a word and tap the matching item's row in the table. The word will be colored by category — this connects your words directly to the tagged item.</p>
                            </div>

                            <div className="border-t border-neutral-200 pt-3 space-y-2">
                                <p>* Two ways to tag inline while writing:</p>
                                <p className="pl-2">1. Type <span className="font-semibold">@title</span> then tap a category in the top bar to confirm</p>
                                <p className="pl-2">2. Highlight words in your status and tap a category in the top bar</p>
                                <p className="pt-1">** Items tagged inline still need to be filled out — tap the row to open the card.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Collapsible Content */}
            {isExpanded && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Editor Container */}
                    <div className="border border-neutral-300">
                        {/* ── Inline Category Toolbar — horizontally scrollable ── */}
                        <div className="border-b border-neutral-200 bg-neutral-50 flex items-stretch overflow-x-auto">
                            <div className="flex items-stretch min-w-max shrink-0">
                                {toolbarCategoryConfigs.map(cat => {
                                    const hasContext = !!(tagging.selectedText || tagging.atPrefixText);
                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => {
                                                setSelectedPlainText('');
                                                recentSelectionRef.current = null;
                                                if (hasContext) {
                                                    tagging.handleCategoryTap(cat.id);
                                                } else {
                                                    setActiveCategory(cat.id);
                                                    setExistingItem(undefined);
                                                    setIsModalOpen(true);
                                                }
                                            }}
                                            onPointerDown={(e) => e.preventDefault()}
                                            disabled={tagging.busy}
                                            title={cat.label}
                                            className={`shrink-0 px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest whitespace-nowrap border-r border-neutral-200 transition-colors disabled:opacity-40 ${hasContext
                                                ? 'text-neutral-900 hover:brightness-90'
                                                : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'
                                                }`}
                                            style={hasContext ? { backgroundColor: cat.color || '#d4d4d4' } : undefined}
                                        >
                                            {cat.shortLabel}
                                        </button>
                                    );
                                })}
                            </div>
                            {tagging.selectedText && (
                                <div className="ml-auto flex items-center px-2 text-[9px] uppercase tracking-widest text-neutral-600 whitespace-nowrap shrink-0">
                                    TEXT SELECTED → TAP A CATEGORY
                                </div>
                            )}
                            {!tagging.selectedText && tagging.atPrefixText && (
                                <div className="ml-auto flex items-center px-2 text-[9px] uppercase tracking-widest text-neutral-500 whitespace-nowrap shrink-0">
                                    @: {tagging.atPrefixText.length > 20 ? tagging.atPrefixText.slice(0, 20) + '...' : tagging.atPrefixText}
                                </div>
                            )}
                        </div>

                        {/* ── Textarea + Highlight (own relative container for perfect alignment) ── */}
                        <div className={`relative min-h-[100px] bg-white ${getOnboardingHighlight('textarea', onboardingActiveStep)}`}>
                            {content && (
                                <div className="highlight-layer absolute inset-0 p-3 pointer-events-none whitespace-pre-wrap break-words font-mono text-transparent leading-relaxed z-0 align-top overflow-hidden" aria-hidden="true">
                                    {(segmentText(content, previewDecorations) as Array<{ type: 'text' | 'highlight'; text: string; start: number; end: number; decoration?: { color?: string; entityId?: string } }>).map((segment, index) =>
                                        segment.type === 'text' ? (
                                            <React.Fragment key={`t:${segment.start}:${index}`}>{segment.text}</React.Fragment>
                                        ) : (
                                            <mark key={`h:${segment.start}:${segment.end}:${segment.decoration?.entityId || index}`}
                                                style={{ backgroundColor: segment.decoration?.color || HIGHLIGHT_COLOR, padding: 0, color: 'transparent' }}>
                                                {segment.text}
                                            </mark>
                                        )
                                    )}
                                </div>
                            )}
                            <textarea
                                ref={textareaRef}
                                value={content}
                                onChange={handleContentChange}
                                onFocus={() => { adjustTextareaHeight(); if (textareaRef.current) textareaRef.current.style.minHeight = tagging.isMobileTagging ? '220px' : '150px'; }}
                                onBlur={() => { handleBlur(); if (textareaRef.current && !content) textareaRef.current.style.minHeight = tagging.isMobileTagging ? '170px' : '100px'; }}
                                onSelect={(e) => { const t = e.target as HTMLTextAreaElement; setLastCursorPosition(t.selectionStart); handleTextSelection(t); }}
                                onTouchEnd={(e) => { const t = e.target as HTMLTextAreaElement; setLastCursorPosition(t.selectionStart); window.setTimeout(() => handleTextSelection(t), 0); }}
                                onPointerUp={(e) => { const t = e.target as HTMLTextAreaElement; setLastCursorPosition(t.selectionStart); window.setTimeout(() => handleTextSelection(t), 0); }}
                                // onClick auto-match removed as requested
                                placeholder="What did you do today? Type @item then tap a category, or select text..."
                                className="composer-text relative z-10 w-full bg-transparent text-neutral-900 caret-black outline-none placeholder:text-neutral-300 min-h-[170px] sm:min-h-[100px] p-3 font-mono resize-none leading-relaxed align-top overflow-hidden transition-all duration-200"
                                spellCheck={false}
                            />
                        </div>
                    </div>

                    {/* Post Action Row + Habits */}
                    <div className="mt-2 mb-1 flex flex-col gap-2">
                        {onboardingActive && user?.id && (
                            <ComposerOnboardingChecklist
                                userId={user.id}
                                items={items}
                                content={content}
                                onComplete={() => setShowComposerOnboarding(false)}
                            />
                        )}
                        <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <HabitChecklist date={activeDate} />
                        </div>
                        {items.length > 0 && items.some(i => !isItemFilled(i)) && (
                            <span className="text-[9px] uppercase tracking-widest text-amber-700 whitespace-nowrap">
                                {items.filter(i => !isItemFilled(i)).length} unfilled
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={async () => {
                                if (isPosting) return;
                                setIsPosting(true);
                                try {
                                    let statusId = activeStatus?.id !== 'temp-optimistic' ? activeStatus?.id : undefined;
                                    const normalizedContent = normalizeTaggedTextForFeed(content);
                                    const hasAnyText = normalizedContent.trim().length > 0;
                                    const hasContentChanges = normalizedContent !== (activeStatus?.content || '');
                                    const hasTaggedItems = items.length > 0;
                                    const hasExistingStatus = !!statusId;

                                    if (hasContentChanges) {
                                        statusId = await updateActiveStatus(normalizedContent) || statusId;
                                    } else if (hasTaggedItems) {
                                        statusId = statusId || await ensureActiveStatus();
                                    }

                                    if (statusId && (hasAnyText || hasTaggedItems || hasExistingStatus)) {
                                        await togglePublished(statusId, true);
                                        setContentDrafts((prev) => { const next = { ...prev }; delete next[activeContentKey]; return next; });
                                        setHasItemDraftChanges(false);
                                        setIsExpanded(false);
                                    } else {
                                        pushToast({ message: 'Add some text or tagged items before posting.', tone: 'error' });
                                    }
                                } catch (error) {
                                    pushToast({ message: error instanceof Error ? error.message : 'Failed to post update', tone: 'error' });
                                } finally {
                                    setIsPosting(false);
                                }
                            }}
                            disabled={isPosting || (!!activeStatus?.published && !hasDraftChanges)}
                            className={`ml-auto shrink-0 px-4 py-2.5 sm:py-2 text-[10px] font-bold uppercase tracking-widest transition-colors border whitespace-nowrap touch-manipulation select-none active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${activeStatus?.published ? 'bg-green-700 text-white border-green-700 hover:bg-green-800' : 'bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-700'}`}
                        >
                            {isPosting ? 'POSTING…' : (activeStatus?.published ? (hasDraftChanges ? 'UPDATE POST' : 'POSTED') : 'POST')}
                        </button>
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className={getOnboardingHighlight('table', onboardingActiveStep) || getOnboardingHighlight('card', onboardingActiveStep)}>
                    <ComposerItemTable
                        items={items}
                        content={content}
                        isMobileTagging={tagging.isMobileTagging}
                        selectedPlainText={selectedPlainText}
                        activeCategoryConfigs={toolbarCategoryConfigs}
                        onOpenItem={openModal}
                        onLinkItem={linkExistingItemToPost}
                        isLinkingMode={isTableLinkingMode}
                        onRemoveItem={async (id) => {
                            if (isPreparingComposer) return;
                            await removeItemFromActive(id);
                            setHasItemDraftChanges(true);
                        }}
                        onAddItem={async (item) => {
                            if (isPreparingComposer) return;
                            await addItemToActive(item);
                            setHasItemDraftChanges(true);
                        }}
                    />
                    </div>
                </div>
            )}

            <ConsumableModal
                key={`${existingItem?.id ?? 'new'}-${activeCategory}-${isModalOpen ? 'open' : 'closed'}`}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveItem}
                onDelete={handleDeleteItem}
                initialCategory={activeCategory}
                existingItem={existingItem}
                allUserItems={allUserItems}
            />
        </div>
    );
}
