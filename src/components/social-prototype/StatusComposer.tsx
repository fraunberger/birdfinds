"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ConsumableItem, useSocialStore, Category, CATEGORY_CONFIGS, HIGHLIGHT_COLOR, getCategoryConfig } from '@/lib/social-prototype/store';
import { ConsumableModal } from './ConsumableModal';
import { ComposerItemTable } from './ComposerItemTable';
import { pushToast } from '@/lib/social-prototype/toast';
import { parseHighlights, segmentText, TAG_MARKER } from '@/lib/social-prototype/highlighting.mjs';
import { getItemExternalIdentityKey, parseItemMeta, serializeItemMeta } from '@/lib/social-prototype/item-meta';
import { getCanonicalItemKey } from '@/lib/social-prototype/items';
import { useAuth } from '@/lib/auth';
import { useTaggingState, getItemHighlightTerms } from './useTaggingState';
import { HabitChecklist } from './HabitChecklist';

interface StatusComposerProps {
    userCategories?: Category[];
    onEntryModeChange?: (isEntryMode: boolean) => void;
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

export function StatusComposer({ userCategories, onEntryModeChange }: StatusComposerProps) {
    const { user } = useAuth();
    const { activeStatus, activeDate, setActiveDate, updateActiveStatus, addItemToActive, removeItemFromActive, updateItemInActive, togglePublished, statuses, isLoaded } = useSocialStore();
    const [contentDrafts, setContentDrafts] = useState<Record<string, string>>({});
    const [draftStatus, setDraftStatus] = useState<'saved' | 'error'>('saved');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showTagHelp, setShowTagHelp] = useState(false);
    const [isPosting, setIsPosting] = useState(false);

    const [activeCategory, setActiveCategory] = useState<Category>('movie');
    const [existingItem, setExistingItem] = useState<ConsumableItem | undefined>(undefined);

    const [previewText, setPreviewText] = useState('');
    const [previewDecorations, setPreviewDecorations] = useState<Array<{
        id: string; entityType: string; entityId: string;
        start: number; end: number; displayText: string; source: string; color?: string;
    }>>([]);
    const [lastCursorPosition, setLastCursorPosition] = useState<number | null>(null);
    const [selectedPlainText, setSelectedPlainText] = useState<string>('');

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const recentSelectionRef = useRef<{ text: string; at: number } | null>(null);

    useEffect(() => { onEntryModeChange?.(isExpanded); }, [isExpanded, onEntryModeChange]);

    // Active categories
    const activeCategories = userCategories && userCategories.length > 0
        ? userCategories
        : Object.keys(CATEGORY_CONFIGS) as Category[];
    const activeCategoryConfigs = activeCategories.map(c => getCategoryConfig(c));
    const draftsStorageKey = `birdfinds:composer:drafts:v2:${user?.id || 'anon'}`;
    const activeContentKey = `draft:${activeDate}`;
    const content = contentDrafts[activeContentKey] ?? activeStatus?.content ?? '';
    const items = useMemo(() => activeStatus?.items ?? [], [activeStatus?.items]);

    const setContentForActive = (value: string) => {
        if (draftStatus === 'error') setDraftStatus('saved');
        setContentDrafts((prev) => ({ ...prev, [activeContentKey]: value }));
    };

    // ── Tagging state (extracted hook) ─────────────────────────────────
    const tagging = useTaggingState({
        content,
        items,
        setContentForActive,
        updateActiveStatus,
        addItemToActive,
    });

    // ── Preview highlights ─────────────────────────────────────────────
    const rebuildPreviewHighlights = useCallback((textValue: string, itemList: ConsumableItem[]) => {
        const entities = itemList.map((item) => ({
            id: item.id,
            entityType: item.category,
            entityId: item.id,
            terms: getItemHighlightTerms(item),
            source: 'item',
            color: getCategoryConfig(item.category)?.color || HIGHLIGHT_COLOR,
            priority: 1,
        }));
        setPreviewText(textValue);
        setPreviewDecorations(parseHighlights(textValue, entities) as typeof previewDecorations);
    }, []);

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
            const customEvent = event as CustomEvent<{ date?: string }>;
            const editDate = customEvent.detail?.date;
            if (editDate) setActiveDate(editDate);
            setIsExpanded(true);
            window.setTimeout(() => textareaRef.current?.focus(), 220);
        };
        window.addEventListener('birdpile:edit-entry', handleEditEntry as EventListener);
        return () => window.removeEventListener('birdpile:edit-entry', handleEditEntry as EventListener);
    }, [setActiveDate]);

    // ── Mobile highlight debounce ──────────────────────────────────────
    useEffect(() => {
        const timer = window.setTimeout(() => { rebuildPreviewHighlights(content, items); }, tagging.isMobileTagging ? 520 : 180);
        return () => window.clearTimeout(timer);
    }, [content, items, tagging.isMobileTagging, rebuildPreviewHighlights]);

    // ── Content change handler ─────────────────────────────────────────
    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setContentForActive(val);
        adjustTextareaHeight();
        // Track @ prefix for inline tagging
        const cursorPos = e.target.selectionStart || 0;
        tagging.trackAtPrefix(val, cursorPos);
    };

    const handleBlur = () => { /* No-op. Content stays local until user explicitly posts. */ };

    const hasUnsavedChanges = !!content.trim() && content.trim() !== (activeStatus?.content || '').trim() && !activeStatus?.published;
    const hasDraftChanges = content.trim() !== (activeStatus?.content || '').trim();
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
            if (existingItem && existingItem.id !== 'temp') {
                await updateItemInActive(existingItem.id, { ...item, image: nextImage });
            } else {
                await addItemToActive({ ...item, image: nextImage });
            }
            setExistingItem(undefined);
        } catch (error: unknown) {
            pushToast({ message: `Failed to save item: ${getErrorMessage(error)}`, tone: 'error' });
        }
    };

    const handleDeleteItem = async () => {
        if (existingItem) { await removeItemFromActive(existingItem.id); setExistingItem(undefined); }
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
        };

        if (isAtPrefixLinking) {
            const typedText = tagging.atPrefixText.trim();
            await ensureAliasLinked(typedText);
            const currentContent = content || '';
            const before = currentContent.slice(0, tagging.atPrefixPos);
            const after = currentContent.slice(tagging.atPrefixPos + 1 + tagging.atPrefixText.length);
            const nextContent = `${before}${TAG_MARKER}${typedText}${after}`;
            setContentForActive(nextContent);
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
        const phrase = selectedPlainText.trim() || mobileFallbackPhrase;

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
                && currentContent.slice(start, end).trim() === phrase
                && currentContent.slice(Math.max(0, start - TAG_MARKER.length), start) !== TAG_MARKER
            ) {
                const nextContent = `${currentContent.slice(0, start)}${TAG_MARKER}${currentContent.slice(start)}`;
                setContentForActive(nextContent);
                await updateActiveStatus(nextContent);
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

        setContentForActive(nextContent);
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
            `}</style>

            {/* Header */}
            <header className="flex items-center justify-between mb-2 pb-2 border-b border-neutral-300">
                <button
                    onClick={() => { const next = !isExpanded; setIsExpanded(next); if (!next) setShowTagHelp(false); }}
                    className="flex items-center gap-2 p-2 -ml-2 hover:bg-neutral-100 rounded transition-colors"
                >
                    <span className={`text-[10px] transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                        {isExpanded ? 'LOG ENTRY' : (activeStatus?.content ? 'ENTRY' : 'NEW ENTRY')}
                    </h2>
                </button>
                <div className="flex items-center gap-3">
                    {isExpanded && (
                        <button type="button" onClick={() => setShowTagHelp((prev) => !prev)}
                            className="h-5 w-5 inline-flex items-center justify-center border border-neutral-300 text-[10px] text-neutral-500 hover:text-neutral-800 hover:border-neutral-500"
                            title="How tagging works" aria-label="How tagging works">
                            ?
                        </button>
                    )}
                    <span className={`text-[10px] uppercase tracking-widest ${draftBadgeTone}`}>{draftBadgeText}</span>
                    <div className="relative inline-flex items-center gap-1 p-1 border-b border-transparent hover:border-neutral-300 transition-colors">
                        <span className="block font-mono text-[16px] sm:text-[10px] text-neutral-500 select-none">{activeDate}</span>
                        <span className="text-neutral-400" aria-hidden="true">
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 9h18" />
                            </svg>
                        </span>
                        <input ref={dateInputRef} type="date" value={activeDate} onChange={(e) => setActiveDate(e.target.value)}
                            onClick={(e) => { try { const t = e.target as HTMLInputElement; if (typeof t.showPicker === 'function') t.showPicker(); } catch { /* fallback */ } }}
                            aria-label="Select date" className="absolute inset-0 opacity-0 cursor-pointer" />
                    </div>
                </div>
            </header>

            {/* Collapsible Content */}
            {isExpanded && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    {showTagHelp && (
                        <div className="mb-2 border border-neutral-300 bg-neutral-50 px-3 py-2 text-[10px] text-neutral-700">
                            <p className="uppercase tracking-widest font-bold mb-1">Tagging Help</p>
                            <p>Select text in the editor, then tap a category button to tag it.</p>
                            <p className="mt-1">Or type @item in the editor, then tap a category to tag everything after the @.</p>
                            <p className="mt-1">Or tap a category with no selection to type a new item name.</p>
                            <p className="mt-1">Use the table LINK button to connect selected words to an existing item.</p>
                        </div>
                    )}
                    {/* Editor Container */}
                    <div className="border border-neutral-300">
                        {/* ── Inline Category Toolbar ── */}
                        <div className="border-b border-neutral-200 bg-neutral-50 flex items-stretch overflow-x-auto">
                            <div className="flex items-stretch min-w-max shrink-0">
                                {activeCategoryConfigs.map(cat => {
                                    const isActive = tagging.quickAddCategory === cat.id;
                                    const hasContext = !!(tagging.selectedText || tagging.atPrefixText);
                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => {
                                                // Clear selection-driven table link mode immediately on tag button press.
                                                setSelectedPlainText('');
                                                recentSelectionRef.current = null;
                                                tagging.handleCategoryTap(cat.id);
                                            }}
                                            onMouseDown={(e) => e.preventDefault()}
                                            onTouchStart={(e) => e.preventDefault()}
                                            disabled={tagging.busy}
                                            title={cat.label}
                                            className={`shrink-0 px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest whitespace-nowrap border-r border-neutral-200 transition-colors disabled:opacity-40 ${isActive
                                                ? 'bg-neutral-900 text-white'
                                                : hasContext
                                                    ? 'text-neutral-900 hover:brightness-90'
                                                    : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'
                                                }`}
                                            style={hasContext && !isActive ? { backgroundColor: cat.color || '#d4d4d4' } : undefined}
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

                        {/* ── Quick-Add Input (Flow C) ── */}
                        {tagging.quickAddCategory && (
                            <div className="border-b border-neutral-200 bg-neutral-100 flex items-center gap-0">
                                <span className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-neutral-500 border-r border-neutral-200 whitespace-nowrap">
                                    {getCategoryConfig(tagging.quickAddCategory).shortLabel}
                                </span>
                                <input
                                    ref={tagging.quickAddInputRef}
                                    type="text"
                                    value={tagging.quickAddTitle}
                                    onChange={(e) => tagging.setQuickAddTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); void tagging.submitQuickAdd(); }
                                        if (e.key === 'Escape') tagging.cancelQuickAdd();
                                    }}
                                    placeholder={getCategoryConfig(tagging.quickAddCategory).titleLabel || 'TITLE'}
                                    className="flex-1 min-w-0 text-[16px] sm:text-xs font-mono px-2 py-1.5 outline-none bg-transparent placeholder:text-neutral-400 text-neutral-900"
                                    autoFocus
                                />
                                <button onClick={() => void tagging.submitQuickAdd()} disabled={!tagging.quickAddTitle.trim() || tagging.busy}
                                    className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-neutral-900 border-l border-neutral-200 hover:bg-neutral-200 disabled:opacity-30 whitespace-nowrap">
                                    ADD
                                </button>
                                <button onClick={tagging.cancelQuickAdd}
                                    className="px-2 py-1.5 text-[9px] uppercase tracking-widest text-neutral-400 hover:text-neutral-700 border-l border-neutral-200 whitespace-nowrap">
                                    X
                                </button>
                            </div>
                        )}

                        {/* ── Textarea + Highlight (own relative container for perfect alignment) ── */}
                        <div className="relative min-h-[100px] bg-white">
                            {previewText && (
                                <div className="highlight-layer absolute inset-0 p-3 pointer-events-none whitespace-pre-wrap break-words font-mono text-transparent leading-relaxed z-0 align-top overflow-hidden" aria-hidden="true">
                                    {(segmentText(previewText, previewDecorations) as Array<{ type: 'text' | 'highlight'; text: string; start: number; end: number; decoration?: { color?: string; entityId?: string } }>).map((segment, index) =>
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
                                onBlur={(e) => { handleBlur(); rebuildPreviewHighlights(e.target.value, items); if (textareaRef.current && !content) textareaRef.current.style.minHeight = tagging.isMobileTagging ? '170px' : '100px'; }}
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
                    <div className="mt-2 mb-1 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <HabitChecklist date={activeDate} />
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                if (isPosting) return;
                                setIsPosting(true);
                                try {
                                    let statusId = activeStatus?.id !== 'temp-optimistic' ? activeStatus?.id : undefined;
                                    const trimmedContent = content.trim();
                                    if (trimmedContent) {
                                        statusId = await updateActiveStatus(trimmedContent) || statusId;
                                    }
                                    if (statusId) {
                                        await togglePublished(statusId, true);
                                        setContentDrafts((prev) => { const next = { ...prev }; delete next[activeContentKey]; return next; });
                                        setIsExpanded(false);
                                    } else {
                                        pushToast({ message: 'Write something before posting.', tone: 'error' });
                                    }
                                } catch (error) {
                                    pushToast({ message: error instanceof Error ? error.message : 'Failed to post update', tone: 'error' });
                                } finally {
                                    setIsPosting(false);
                                }
                            }}
                            disabled={isPosting || (!!activeStatus?.published && !hasDraftChanges)}
                            className={`ml-auto shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all border rounded shadow-sm whitespace-nowrap touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${activeStatus?.published ? 'bg-green-700 text-white border-green-700 hover:bg-green-800' : 'bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-700'}`}
                        >
                            {isPosting ? 'POSTING…' : (activeStatus?.published ? (hasDraftChanges ? 'UPDATE POST' : 'POSTED') : 'POST')}
                        </button>
                    </div>

                    {/* Data Table */}
                    <ComposerItemTable
                        items={items}
                        content={content}
                        isMobileTagging={tagging.isMobileTagging}
                        selectedPlainText={selectedPlainText}
                        activeCategoryConfigs={activeCategoryConfigs}
                        onOpenItem={openModal}
                        onLinkItem={linkExistingItemToPost}
                        isLinkingMode={isTableLinkingMode}
                        onRemoveItem={removeItemFromActive}
                        onAddItem={addItemToActive}
                    />
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
