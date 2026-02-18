"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ConsumableItem, useSocialStore, Category, CATEGORY_CONFIGS, HIGHLIGHT_COLOR, getCategoryConfig } from '@/lib/social-prototype/store';
import { ConsumableModal } from './ConsumableModal';
import { HabitChecklist } from './HabitChecklist';
import { pushToast } from '@/lib/social-prototype/toast';
import { parseHighlights, segmentText } from '@/lib/social-prototype/highlighting.mjs';

interface StatusComposerProps {
    userCategories?: Category[];
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');


interface ItemMeta {
    imageUrl?: string;
    aliases?: string[];
    recipeUrl?: string;
}

const META_PREFIX = 'meta:';

const parseItemMeta = (raw?: string): ItemMeta => {
    if (!raw) return {};
    if (!raw.startsWith(META_PREFIX)) return { imageUrl: raw };
    try {
        const decoded = decodeURIComponent(raw.slice(META_PREFIX.length));
        const parsed = JSON.parse(decoded) as ItemMeta;
        return {
            imageUrl: parsed.imageUrl,
            aliases: Array.isArray(parsed.aliases) ? parsed.aliases.filter(Boolean) : [],
            recipeUrl: typeof parsed.recipeUrl === 'string' ? parsed.recipeUrl : undefined,
        };
    } catch {
        return {};
    }
};

const serializeItemMeta = (meta: ItemMeta): string | undefined => {
    const aliases = (meta.aliases || []).map((v) => v.trim()).filter(Boolean);
    if (!meta.imageUrl && aliases.length === 0) return undefined;
    if (aliases.length === 0 && meta.imageUrl && !meta.recipeUrl) return meta.imageUrl;
    return `${META_PREFIX}${encodeURIComponent(JSON.stringify({ imageUrl: meta.imageUrl, aliases, recipeUrl: meta.recipeUrl }))}`;
};

const getItemHighlightTerms = (item: ConsumableItem): string[] => {
    const meta = parseItemMeta(item.image);
    const terms = [item.title, ...(meta.aliases || [])].map((v) => (v || '').trim()).filter(Boolean);
    return Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
};

export function StatusComposer({ userCategories }: StatusComposerProps) {
    const { activeStatus, activeDate, setActiveDate, updateActiveStatus, addItemToActive, removeItemFromActive, togglePublished, deleteStatus, isLoaded } = useSocialStore();
    const [contentDrafts, setContentDrafts] = useState<Record<string, string>>({});
    const [draftStatus, setDraftStatus] = useState<'saved' | 'error'>('saved');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showTagHelp, setShowTagHelp] = useState(false);

    const [activeCategory, setActiveCategory] = useState<Category>('movie');
    const [existingItem, setExistingItem] = useState<ConsumableItem | undefined>(undefined);
    const [selectionRange, setSelectionRange] = useState<{ start: number, end: number, top?: number, left?: number, height?: number } | null>(null);

    // Helper to get coordinates
    const getSelectionCoords = (textarea: HTMLTextAreaElement, selectionStart: number, selectionEnd: number) => {
        const div = document.createElement('div');
        const style = window.getComputedStyle(textarea);

        // Copy relevant styles
        ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'white-space', 'word-break', 'width', 'padding'].forEach(prop => {
            div.style.setProperty(prop, style.getPropertyValue(prop));
        });

        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordWrap = 'break-word'; // Important!

        // Replace newlines with <br> for accurate measurement
        const textBefore = textarea.value.substring(0, selectionStart);
        const selectedText = textarea.value.substring(selectionStart, selectionEnd);

        const span = document.createElement('span');
        span.textContent = selectedText;

        div.textContent = textBefore;
        div.appendChild(span);

        document.body.appendChild(div);

        const spanRect = span.getBoundingClientRect();
        const divRect = div.getBoundingClientRect();

        // Offset relative to the div top
        const relativeTop = span.offsetTop;
        const relativeLeft = span.offsetLeft;
        const height = span.offsetHeight;

        document.body.removeChild(div);

        return { top: relativeTop, left: relativeLeft + (span.offsetWidth / 2), height };
    };

    // @ mention state
    const [showMentionPicker, setShowMentionPicker] = useState(false);
    const [mentionCategory, setMentionCategory] = useState<Category | null>(null);
    const [mentionTitle, setMentionTitle] = useState('');
    const [atPosition, setAtPosition] = useState<number>(-1);
    const [triggerLength, setTriggerLength] = useState<number>(1); // 1 for @, N for selection
    const mentionInputRef = useRef<HTMLInputElement>(null);

    // Quick Add State
    const [quickAddTitle, setQuickAddTitle] = useState('');
    const [quickAddCategory, setQuickAddCategory] = useState<Category>('movie');
    const [isMobileTagging, setIsMobileTagging] = useState(false);
    const [previewText, setPreviewText] = useState('');
    const [previewDecorations, setPreviewDecorations] = useState<Array<{
        id: string;
        entityType: string;
        entityId: string;
        start: number;
        end: number;
        displayText: string;
        source: string;
        color?: string;
    }>>([]);
    const [mobilePickerBottom, setMobilePickerBottom] = useState(12);
    const [lastCursorPosition, setLastCursorPosition] = useState<number | null>(null);
    const [selectedPlainText, setSelectedPlainText] = useState<string>('');

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Active categories
    const activeCategories = userCategories && userCategories.length > 0
        ? userCategories
        : Object.keys(CATEGORY_CONFIGS) as Category[];

    const activeCategoryConfigs = activeCategories.map(c => getCategoryConfig(c));
    const activeContentKey = `draft:${activeDate}`;
    const content = contentDrafts[activeContentKey] ?? activeStatus?.content ?? '';
    const items = activeStatus?.items || [];
    const effectiveQuickAddCategory = activeCategories.includes(quickAddCategory)
        ? quickAddCategory
        : (activeCategories[0] ?? 'movie');

    const rebuildPreviewHighlights = (textValue: string, itemList: ConsumableItem[]) => {
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
    };

    const setContentForActive = (value: string) => {
        if (draftStatus === 'error') setDraftStatus('saved');
        setContentDrafts((prev) => ({ ...prev, [activeContentKey]: value }));
    };

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem('birdfinds:composer:drafts:v1');
            if (!raw) return;
            const parsed = JSON.parse(raw) as Record<string, string>;
            if (parsed && typeof parsed === 'object') {
                setContentDrafts(parsed);
            }
        } catch {
            // Ignore malformed local draft cache.
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const timer = window.setTimeout(() => {
            try {
                window.localStorage.setItem('birdfinds:composer:drafts:v1', JSON.stringify(contentDrafts));
            } catch {
                // Ignore storage errors.
            }
        }, 220);
        return () => window.clearTimeout(timer);
    }, [contentDrafts]);

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

    const adjustTextareaHeight = () => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = Math.max(100, el.scrollHeight) + 'px';
        }
    };

    const clearTaggingState = () => {
        setShowMentionPicker(false);
        setMentionCategory(null);
        setMentionTitle('');
        setSelectionRange(null);
        setTriggerLength(1);
        setAtPosition(-1);
    };

    const openTagMenuForRange = (target: HTMLTextAreaElement, start: number, end: number, rawText: string) => {
        const trimmed = rawText.trim();
        if (!trimmed) return;

        const coords = getSelectionCoords(target, start, end);
        setMentionTitle(trimmed);
        setAtPosition(start);
        setTriggerLength(end - start);
        setSelectionRange({ start, end, ...coords });
        setMentionCategory(null);
        setShowMentionPicker(true);
    };

    // Auto-resize on content change
    // Using layout effect to reduce flicker
    useEffect(() => {
        adjustTextareaHeight();
    }, [content]);

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

    useEffect(() => {
        const handleEditEntry = (event: Event) => {
            const customEvent = event as CustomEvent<{ date?: string }>;
            const editDate = customEvent.detail?.date;
            if (editDate) {
                setActiveDate(editDate);
            }
            setIsExpanded(true);
            window.setTimeout(() => textareaRef.current?.focus(), 220);
        };

        window.addEventListener('birdpile:edit-entry', handleEditEntry as EventListener);
        return () => window.removeEventListener('birdpile:edit-entry', handleEditEntry as EventListener);
    }, [setActiveDate]);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.visualViewport) return;

        const updateBottomOffset = () => {
            const vv = window.visualViewport;
            if (!vv) return;
            const keyboardHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
            setMobilePickerBottom(keyboardHeight + 12);
        };

        updateBottomOffset();
        window.visualViewport.addEventListener('resize', updateBottomOffset);
        window.visualViewport.addEventListener('scroll', updateBottomOffset);
        return () => {
            window.visualViewport?.removeEventListener('resize', updateBottomOffset);
            window.visualViewport?.removeEventListener('scroll', updateBottomOffset);
        };
    }, [isMobileTagging]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            rebuildPreviewHighlights(content, items);
        }, 180);
        return () => window.clearTimeout(timer);
    }, [content, items]);

    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setContentForActive(val);
        adjustTextareaHeight();

        if (!isMobileTagging) {
            return;
        }

        const cursorPos = e.target.selectionStart || 0;
        const justTypedAt = cursorPos > 0 && val[cursorPos - 1] === '@';

        // "@title@" flow: only open category menu after closing @ is typed.
        if (justTypedAt) {
            const openAt = val.lastIndexOf('@', cursorPos - 2);
            if (openAt >= 0) {
                const candidate = val.substring(openAt + 1, cursorPos - 1);
                const hasLineBreak = candidate.includes('\n');
                if (candidate.trim() && !hasLineBreak) {
                    openTagMenuForRange(e.target, openAt, cursorPos, candidate);
                    return;
                }
            }

            // This is likely the opening "@": keep a live highlight while user types.
            setAtPosition(cursorPos - 1);
            setTriggerLength(1);
            setMentionTitle('');
            setShowMentionPicker(false);
            setMentionCategory(null);
            setSelectionRange(null);
            return;
        }

        // Live highlight while typing between opening @ and closing @.
        if (!showMentionPicker && atPosition >= 0 && cursorPos > atPosition + 1) {
            const segment = val.substring(atPosition + 1, cursorPos);
            if (!segment.includes('@') && segment.trim().length > 0) {
                setMentionTitle(segment);
                setTriggerLength(cursorPos - atPosition);
                return;
            }
        }
    };

    // Remove the on-blur auto-save to enable draft behavior.
    const handleBlur = () => {
        // No-op for saving. Content stays local until user explicitly posts.
    };

    const hasUnsavedChanges = !!content.trim() && content.trim() !== (activeStatus?.content || '').trim() && !activeStatus?.published;
    const hasDraftChanges = content.trim() !== (activeStatus?.content || '').trim();

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasUnsavedChanges) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [hasUnsavedChanges]);

    const handleSelectCategory = (cat: Category) => {
        setMentionCategory(cat);
        setMentionTitle('');
        setTimeout(() => mentionInputRef.current?.focus(), 50);
    };

    const handleMentionSubmit = async () => {
        if (!mentionTitle.trim() || !mentionCategory) return;

        const title = mentionTitle.trim();
        const existing = items.find((item) =>
            item.category === mentionCategory
            && getItemHighlightTerms(item).some((term) => term.trim().toLowerCase() === title.toLowerCase())
        );

        try {
            // Reuse matching table item instead of creating duplicates.
            if (!existing) {
                await addItemToActive({
                    category: mentionCategory,
                    title,
                    rating: undefined,
                    subtitle: '',
                    notes: ''
                });
            }

            // Replace text
            const before = content.substring(0, atPosition);
            // Dynamic length replacement
            const after = content.substring(atPosition + triggerLength);
            const newContent = before + title + after;
            setContentForActive(newContent);
            updateActiveStatus(newContent);
        } catch (error: unknown) {
            pushToast({ message: `Failed to add item: ${getErrorMessage(error)}`, tone: 'error' });
        }

        // Reset
        setShowMentionPicker(false);
        setMentionCategory(null);
        setMentionTitle('');
        setAtPosition(-1);

        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const handleMentionCancel = () => {
        clearTaggingState();
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const applyCategoryToMention = async (category: Category) => {
        if (!mentionTitle.trim()) {
            handleSelectCategory(category);
            return;
        }

        try {
            const normalizedTitle = mentionTitle.trim();
            const existing = items.find((item) =>
                item.category === category
                && getItemHighlightTerms(item).some((term) => term.trim().toLowerCase() === normalizedTitle.toLowerCase())
            );

            if (!existing) {
                await addItemToActive({
                    category,
                    title: normalizedTitle,
                    rating: undefined,
                    subtitle: '',
                    notes: ''
                });
            }

            let start = selectionRange ? selectionRange.start : atPosition;
            let end = selectionRange ? selectionRange.end : (atPosition + (mentionTitle.length + 1));

            if (start < 0) start = 0;
            if (end > content.length) end = content.length;

            const before = content.substring(0, start);
            const after = content.substring(end);
            const newContent = before + normalizedTitle + after;
            setContentForActive(newContent);
            updateActiveStatus(newContent);
            clearTaggingState();
        } catch (error: unknown) {
            pushToast({ message: `Failed to add item: ${getErrorMessage(error)}`, tone: 'error' });
        }
    };

    const handleQuickAddRow = async () => {
        if (!quickAddTitle.trim()) return;
        try {
            await addItemToActive({
                category: effectiveQuickAddCategory,
                title: quickAddTitle,
                rating: undefined,
                subtitle: '',
                notes: ''
            });
            setQuickAddTitle('');
        } catch (error: unknown) {
            pushToast({ message: `Failed to quick add: ${getErrorMessage(error)}`, tone: 'error' });
        }
    };

    const handleSaveItem = async (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => {
        try {
            let nextImage = item.image;
            if (existingItem) {
                const meta = parseItemMeta(existingItem.image);
                const oldTitle = existingItem.title.trim();
                const newTitle = item.title.trim();
                if (oldTitle && newTitle && oldTitle.toLowerCase() !== newTitle.toLowerCase()) {
                    const aliases = new Set([...(meta.aliases || []), oldTitle]);
                    meta.aliases = Array.from(aliases);
                }
                nextImage = serializeItemMeta(meta);
            }

            if (existingItem && existingItem.id !== 'temp') {
                await removeItemFromActive(existingItem.id);
            }
            await addItemToActive({ ...item, image: nextImage });
            setExistingItem(undefined);
        } catch (error: unknown) {
            pushToast({ message: `Failed to save item: ${getErrorMessage(error)}`, tone: 'error' });
        }
    };

    const handleDeleteItem = async () => {
        if (existingItem) {
            await removeItemFromActive(existingItem.id);
            setExistingItem(undefined);
        }
    };

    const openModal = (item: ConsumableItem) => {
        setActiveCategory(item.category);
        setExistingItem(item);
        setIsModalOpen(true);
    };

    const linkExistingItemToPost = async (item: ConsumableItem) => {
        const phrase = selectedPlainText.trim();

        // Natural-language link: map selected phrase to this table item via alias.
        if (phrase) {
            const lowerPhrase = phrase.toLowerCase();
            const alreadyLinked = getItemHighlightTerms(item).some((term) => term.trim().toLowerCase() === lowerPhrase);
            if (!alreadyLinked) {
                const meta = parseItemMeta(item.image);
                const aliases = new Set((meta.aliases || []).map((value) => value.trim()).filter(Boolean));
                aliases.add(phrase);
                const nextImage = serializeItemMeta({ ...meta, aliases: Array.from(aliases) });

                await removeItemFromActive(item.id);
                await addItemToActive({
                    category: item.category,
                    title: item.title,
                    subtitle: item.subtitle,
                    rating: item.rating,
                    notes: item.notes,
                    image: nextImage,
                });
            }

            setSelectedPlainText('');
            return;
        }

        // Fallback: insert item title at cursor.
        const currentContent = content || '';
        const rawInsertPos = lastCursorPosition ?? currentContent.length;
        const insertPos = Math.max(0, Math.min(rawInsertPos, currentContent.length));
        const before = currentContent.slice(0, insertPos);
        const after = currentContent.slice(insertPos);
        const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
        const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
        const insertion = `${needsLeadingSpace ? ' ' : ''}${item.title}${needsTrailingSpace ? ' ' : ''}`;
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

    const handleTextSelection = (target: HTMLTextAreaElement) => {
        const start = target.selectionStart;
        const end = target.selectionEnd;

        if (start !== end) {
            const selectedText = target.value.substring(start, end);
            if (!selectedText.trim()) return;
            setSelectedPlainText(selectedText.trim());

            const existing = items.find((i) =>
                getItemHighlightTerms(i).some((term) => term.toLowerCase() === selectedText.toLowerCase())
            );
            if (existing) {
                openModal(existing);
                return;
            }

            openTagMenuForRange(target, start, end, selectedText);
            return;
        }

        if (triggerLength !== 1) clearTaggingState();
    };

    if (!isLoaded) return <div className="h-32 bg-neutral-100 mb-4 border border-neutral-300" />;

    return (
        <div className="mb-6 font-mono">
            {/* Inline style to sync highlight + textarea font sizes */}
            <style>{`
                .composer-text, .highlight-layer {
                    font-size: 14px;
                }
                @media (min-width: 640px) {
                    .composer-text, .highlight-layer {
                        font-size: 12px;
                    }
                }
            `}</style>

            {/* Header: now minimal with Date and Expand toggle */}
            <header className="flex items-center justify-between mb-2 pb-2 border-b border-neutral-300">
                <button
                    onClick={() => {
                        const next = !isExpanded;
                        setIsExpanded(next);
                        if (!next) {
                            setShowTagHelp(false);
                        }
                    }}
                    className="flex items-center gap-2 p-2 -ml-2 hover:bg-neutral-100 rounded transition-colors"
                >
                    <span className={`text-[10px] transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                        {isExpanded ? 'LOG ENTRY' : (activeStatus?.content ? 'ENTRY' : 'NEW ENTRY')}
                    </h2>
                </button>
                <div className="flex items-center gap-3">
                    {isExpanded && (
                        <button
                            type="button"
                            onClick={() => setShowTagHelp((prev) => !prev)}
                            className="h-5 w-5 inline-flex items-center justify-center border border-neutral-300 text-[10px] text-neutral-500 hover:text-neutral-800 hover:border-neutral-500"
                            title="How tagging works"
                            aria-label="How tagging works"
                        >
                            ?
                        </button>
                    )}
                    <span
                        className={`text-[10px] uppercase tracking-widest ${activeStatus?.published
                            ? 'text-neutral-500'
                            : draftStatus === 'error'
                                ? 'text-red-600'
                                : 'text-green-700'
                            }`}
                    >
                        {activeStatus?.published ? 'Posted' : draftStatus === 'error' ? 'Draft Error' : 'Draft Saved'}
                    </span>
                    <input
                        type="date"
                        value={activeDate}
                        onChange={(e) => setActiveDate(e.target.value)}
                        // Try to open the picker on click for better UX
                        onClick={(e) => {
                            try {
                                const target = e.target as HTMLInputElement;
                                if (typeof target.showPicker === 'function') {
                                    target.showPicker();
                                }
                            } catch (err) {
                                // Fallback or ignore
                            }
                        }}
                        className="bg-transparent text-right font-mono text-[16px] sm:text-[10px] text-neutral-500 cursor-pointer outline-none border-b border-transparent hover:border-neutral-300 transition-colors w-[130px] sm:w-[100px] p-1 appearance-none"
                    />
                </div>
            </header>

            {/* Collapsible Content */}
            {isExpanded && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    {showTagHelp && (
                        <div className="mb-2 border border-neutral-300 bg-neutral-50 px-3 py-2 text-[10px] text-neutral-700">
                            <p className="uppercase tracking-widest font-bold mb-1">Tagging Help</p>
                            <p>Highlight text and choose a category from the black menu to tag it.</p>
                            <p className="mt-1">Type `@something@` to open category tagging quickly.</p>
                            <p className="mt-1">Use the table `link` button to connect selected words to an existing item.</p>
                        </div>
                    )}
                    {/* Editor Container */}
                    <div className="bg-white border border-neutral-300 mb-2 relative min-h-[100px]">
                        {/* Floating "Black Bar" Toolbar */}
                        {showMentionPicker && !mentionCategory && (
                            <div
                                className={isMobileTagging
                                    ? "fixed left-3 right-3 z-50 bg-black text-white p-2 shadow-xl rounded-sm flex flex-col items-stretch gap-1 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-150"
                                    : "absolute z-50 bg-black text-white p-1.5 shadow-xl rounded-sm flex flex-col items-stretch gap-1 overflow-y-auto animate-in fade-in zoom-in-95 duration-150"}
                                style={{
                                    bottom: isMobileTagging ? `${mobilePickerBottom}px` : undefined,
                                    // Desktop: anchor above editor so selected text is always visible.
                                    top: isMobileTagging ? undefined : '-44px',
                                    left: isMobileTagging ? undefined : '50%',
                                    transform: isMobileTagging ? undefined : 'translateX(-50%)',
                                    width: isMobileTagging ? undefined : 'min(320px, calc(100% - 16px))',
                                    maxHeight: isMobileTagging ? '40vh' : '45vh',
                                }}
                            >
                                {activeCategoryConfigs.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => { void applyCategoryToMention(cat.id); }}
                                        className="w-full px-2 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-900 transition-colors whitespace-nowrap text-left"
                                    >
                                        {cat.shortLabel}
                                    </button>
                                ))}
                                <button
                                    onClick={handleMentionCancel}
                                    className="w-full px-2 py-2 text-[10px] text-neutral-500 hover:text-white border-t border-neutral-800 text-left"
                                >
                                    x
                                </button>
                            </div>
                        )}
                        {previewText && (
                            <div
                                className="highlight-layer absolute inset-0 p-3 pointer-events-none whitespace-pre-wrap break-words font-mono text-transparent leading-relaxed z-0 align-top overflow-hidden"
                                aria-hidden="true"
                            >
                                {(segmentText(previewText, previewDecorations) as Array<{
                                    type: 'text' | 'highlight';
                                    text: string;
                                    start: number;
                                    end: number;
                                    decoration?: { color?: string; entityId?: string };
                                }>).map((segment, index) =>
                                    segment.type === 'text' ? (
                                        <React.Fragment key={`t:${segment.start}:${index}`}>{segment.text}</React.Fragment>
                                    ) : (
                                        <mark
                                            key={`h:${segment.start}:${segment.end}:${segment.decoration?.entityId || index}`}
                                            style={{ backgroundColor: segment.decoration?.color || HIGHLIGHT_COLOR, padding: 0, color: 'transparent' }}
                                        >
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
                            onFocus={() => {
                                adjustTextareaHeight();
                                // Auto-expand slightly on focus if small
                                if (textareaRef.current) {
                                    textareaRef.current.style.minHeight = isMobileTagging ? '220px' : '150px';
                                }
                            }}
                            onBlur={(e) => {
                                handleBlur();
                                rebuildPreviewHighlights(e.target.value, items);
                                if (textareaRef.current && !content) {
                                    textareaRef.current.style.minHeight = isMobileTagging ? '170px' : '100px';
                                }
                            }}
                            onSelect={(e) => {
                                if (isMobileTagging) return;
                                const target = e.target as HTMLTextAreaElement;
                                setLastCursorPosition(target.selectionStart);
                                handleTextSelection(target);
                            }}
                            onTouchEnd={(e) => {
                                if (isMobileTagging) return;
                                const target = e.target as HTMLTextAreaElement;
                                setLastCursorPosition(target.selectionStart);
                                window.setTimeout(() => handleTextSelection(target), 0);
                            }}
                            onPointerUp={(e) => {
                                if (isMobileTagging) return;
                                const target = e.target as HTMLTextAreaElement;
                                setLastCursorPosition(target.selectionStart);
                                window.setTimeout(() => handleTextSelection(target), 0);
                            }}
                            onClick={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                const cursor = target.selectionStart;
                                setLastCursorPosition(cursor);

                                // Check if cursor is inside an existing item
                                // We reconstruct where items are located
                                let foundItem: ConsumableItem | undefined;

                                // Simple scan - find all occurrences and check range
                                for (const item of items) {
                                    const terms = getItemHighlightTerms(item);
                                    for (const term of terms) {
                                        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                        const regex = new RegExp(`(${escaped})`, 'gi');
                                        let match;
                                        while ((match = regex.exec(content)) !== null) {
                                            const start = match.index;
                                            const end = start + match[0].length;
                                            // Strict inequality for end to allow clicking *after* the word to type
                                            if (cursor >= start && cursor < end) {
                                                foundItem = item;
                                                break;
                                            }
                                        }
                                        if (foundItem) break;
                                        }
                                    if (foundItem) break;
                                }

                                if (foundItem) {
                                    openModal(foundItem);
                                } else {
                                    // Clicked empty space - do not auto-dismiss while tag menu is open.
                                    if (!showMentionPicker && triggerLength !== 1) clearTaggingState();
                                }
                            }}
                            placeholder="What did you do today? Highlight text to add items or click existing items to edit..."
                            className="composer-text relative z-10 w-full bg-transparent text-neutral-900 caret-black outline-none placeholder:text-neutral-300 min-h-[170px] sm:min-h-[100px] p-3 font-mono resize-none leading-relaxed align-top overflow-hidden transition-all duration-200"
                            spellCheck={false}
                        />
                        {isMobileTagging && !showMentionPicker && mentionTitle.trim() && (
                            <div className="absolute bottom-1 right-2 text-[10px] text-neutral-500 pointer-events-none uppercase tracking-wide">
                                close with @
                            </div>
                        )}
                    </div>

                    {/* Sub-form for details (only when category selected AND not instant-added) */}
                    {showMentionPicker && mentionCategory && (
                        <div className="border border-neutral-300 bg-neutral-50 p-3 mb-2 animate-in fade-in zoom-in-95 duration-100">
                            <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2 flex items-center justify-between">
                                <span>{getCategoryConfig(mentionCategory).icon} New {getCategoryConfig(mentionCategory).label}</span>
                                <button onClick={handleMentionCancel} className="text-neutral-400 hover:text-black p-2">x</button>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    ref={mentionInputRef}
                                    type="text"
                                    value={mentionTitle}
                                    onChange={(e) => setMentionTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleMentionSubmit();
                                        if (e.key === 'Escape') handleMentionCancel();
                                    }}
                                    placeholder={getCategoryConfig(mentionCategory).titleLabel}
                                    className="flex-1 text-[16px] sm:text-xs font-mono border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-500 bg-white shadow-sm"
                                    autoFocus
                                />
                                <button
                                    onClick={handleMentionSubmit}
                                    disabled={!mentionTitle.trim()}
                                    className="px-4 py-2 text-xs bg-black text-white font-bold uppercase tracking-wider disabled:opacity-30 shadow-sm"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Habit Checklist + Post Action Row */}
                    <div className="mt-2 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <HabitChecklist date={activeDate} />
                        </div>
                        <button
                            onClick={async () => {
                                try {
                                    let statusId = activeStatus?.id !== 'temp-optimistic' ? activeStatus?.id : undefined;
                                    if (content) {
                                        statusId = await updateActiveStatus(content) || statusId;
                                    }
                                    if (statusId) {
                                        await togglePublished(statusId, true);
                                        setContentDrafts((prev) => {
                                            const next = { ...prev };
                                            delete next[activeContentKey];
                                            return next;
                                        });
                                        setIsExpanded(false);
                                    }
                                } catch (error) {
                                    pushToast({ message: error instanceof Error ? error.message : 'Failed to post update', tone: 'error' });
                                }
                            }}
                            disabled={!!activeStatus?.published && !hasDraftChanges}
                            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all border rounded shadow-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${activeStatus?.published
                                ? 'bg-green-700 text-white border-green-700 hover:bg-green-800'
                                : 'bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-700'
                                }`}
                        >
                            {activeStatus?.published
                                ? (hasDraftChanges ? 'UPDATE POST' : 'POSTED')
                                : 'POST'}
                        </button>
                    </div>

                    {/* Data Table — always visible with quick-add row */}
                    <div className="border border-neutral-300 bg-white mt-2 overflow-x-auto">
                        <table className="w-full text-xs font-mono border-collapse">
                            <thead className="bg-neutral-100 text-neutral-600 uppercase text-[10px]">
                                <tr>
                                    <th className="px-2 py-1 text-left border-b border-r border-neutral-300 w-14">Type</th>
                                    <th className="px-2 py-1 text-left border-b border-r border-neutral-300">Title</th>
                                    <th className="px-2 py-1 text-center border-b border-r border-neutral-300 w-10">R</th>
                                    <th className="px-2 py-1 text-center border-b border-neutral-300 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => {
                                    const config = getCategoryConfig(item.category);
                                    return (
                                        <tr
                                            key={item.id}
                                            className="hover:bg-neutral-50 cursor-pointer active:bg-neutral-100"
                                            onClick={() => openModal(item)}
                                        >
                                            <td
                                                className="px-2 py-1 border-b border-r border-neutral-200 text-[10px] font-bold"
                                                style={{ backgroundColor: config.color || undefined }}
                                            >
                                                {config.shortLabel}
                                            </td>
                                            <td className="px-2 py-1 border-b border-r border-neutral-200 font-medium">
                                                {item.title}
                                                {item.subtitle && (
                                                    <span className="text-neutral-400 ml-1 font-normal">— {item.subtitle}</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1 border-b border-r border-neutral-200 text-center">
                                                {item.rating ? <span>{item.rating}<span className="text-neutral-400 text-[8px]">/10</span></span> : '—'}
                                            </td>
                                            <td className="px-2 py-1 border-b border-neutral-200 text-center">
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        try {
                                                            await linkExistingItemToPost(item);
                                                        } catch (error: unknown) {
                                                            pushToast({ message: `Failed to link item: ${getErrorMessage(error)}`, tone: 'error' });
                                                        }
                                                    }}
                                                    className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-700 px-1"
                                                    title={selectedPlainText.trim() ? `Link "${selectedPlainText.trim()}" to this item` : "Insert into post text"}
                                                >
                                                    link
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeItemFromActive(item.id); }}
                                                    className="text-neutral-400 hover:text-neutral-600 p-1"
                                                >
                                                    ×
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {/* Quick Add Row — always visible */}
                                <tr className="bg-neutral-50">
                                    <td className="px-1 py-1 border-r border-neutral-200">
                                        <select
                                            value={effectiveQuickAddCategory}
                                            onChange={(e) => setQuickAddCategory(e.target.value as Category)}
                                            className="w-full bg-transparent text-[10px] outline-none cursor-pointer px-1 py-1 text-neutral-500 h-full"
                                        >
                                            {activeCategoryConfigs.map(c => (
                                                <option key={c.id} value={c.id}>{c.shortLabel}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-1 py-1 border-r border-neutral-200">
                                        <input
                                            type="text"
                                            value={quickAddTitle}
                                            onChange={(e) => setQuickAddTitle(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAddRow(); }}
                                            placeholder="Add new entry..."
                                            className="w-full bg-transparent outline-none text-[14px] sm:text-xs placeholder:text-neutral-300 px-1 py-1"
                                        />
                                    </td>
                                    <td className="px-2 py-1 text-center" colSpan={2}>
                                        <button
                                            onClick={handleQuickAddRow}
                                            disabled={!quickAddTitle.trim()}
                                            className="text-neutral-400 hover:text-neutral-600 disabled:opacity-30 p-1 w-full h-full flex items-center justify-center"
                                        >
                                            +
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
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
            />
        </div>
    );
}
