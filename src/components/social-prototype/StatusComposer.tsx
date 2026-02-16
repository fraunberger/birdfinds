"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ConsumableItem, useSocialStore, Category, CATEGORY_CONFIGS, HIGHLIGHT_COLOR, getCategoryConfig } from '@/lib/social-prototype/store';
import { ConsumableModal } from './ConsumableModal';
import { HabitChecklist } from './HabitChecklist';

interface StatusComposerProps {
    userCategories?: Category[];
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

interface ItemMeta {
    imageUrl?: string;
    aliases?: string[];
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
        };
    } catch {
        return {};
    }
};

const serializeItemMeta = (meta: ItemMeta): string | undefined => {
    const aliases = (meta.aliases || []).map((v) => v.trim()).filter(Boolean);
    if (!meta.imageUrl && aliases.length === 0) return undefined;
    if (aliases.length === 0 && meta.imageUrl) return meta.imageUrl;
    return `${META_PREFIX}${encodeURIComponent(JSON.stringify({ imageUrl: meta.imageUrl, aliases }))}`;
};

const getItemHighlightTerms = (item: ConsumableItem): string[] => {
    const meta = parseItemMeta(item.image);
    const terms = [item.title, ...(meta.aliases || [])].map((v) => (v || '').trim()).filter(Boolean);
    return Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
};

export function StatusComposer({ userCategories }: StatusComposerProps) {
    const { activeStatus, activeDate, setActiveDate, updateActiveStatus, addItemToActive, removeItemFromActive, togglePublished, deleteStatus, isLoaded } = useSocialStore();
    const [contentDrafts, setContentDrafts] = useState<Record<string, string>>({});
    const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

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
    const [mobilePickerBottom, setMobilePickerBottom] = useState(12);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Active categories
    const activeCategories = userCategories && userCategories.length > 0
        ? userCategories
        : Object.keys(CATEGORY_CONFIGS) as Category[];

    const activeCategoryConfigs = activeCategories.map(c => getCategoryConfig(c));
    const activeContentKey = activeStatus?.id ?? `draft:${activeDate}`;
    const content = contentDrafts[activeContentKey] ?? activeStatus?.content ?? '';
    const effectiveQuickAddCategory = activeCategories.includes(quickAddCategory)
        ? quickAddCategory
        : (activeCategories[0] ?? 'movie');

    const setContentForActive = (value: string) => {
        setDraftStatus('saving');
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
                if (draftStatus === 'saving') setDraftStatus('saved');
            } catch {
                // Ignore storage errors.
            }
        }, 220);
        return () => window.clearTimeout(timer);
    }, [contentDrafts, draftStatus]);

    useEffect(() => {
        if (draftStatus !== 'saved') return;
        const timer = window.setTimeout(() => setDraftStatus('idle'), 1200);
        return () => window.clearTimeout(timer);
    }, [draftStatus]);

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
            alert(`Failed to add item: ${getErrorMessage(error)}`);
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
            alert(`Failed to add item: ${getErrorMessage(error)}`);
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
            alert(`Failed to quick add: ${getErrorMessage(error)}`);
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
            alert(`Failed to save item: ${getErrorMessage(error)}`);
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

    const items = activeStatus?.items || [];

    const handleTextSelection = (target: HTMLTextAreaElement) => {
        const start = target.selectionStart;
        const end = target.selectionEnd;

        if (start !== end) {
            const selectedText = target.value.substring(start, end);
            if (!selectedText.trim()) return;

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

    // Highlight rendering — font size must match the textarea exactly
    const renderHighlights = () => {
        if (!content) return null;

        let highlightedHtml = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>');

        items.forEach(item => {
            const config = getCategoryConfig(item.category);
            const color = config?.color || HIGHLIGHT_COLOR;
            const terms = getItemHighlightTerms(item);
            terms.forEach((term) => {
                const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                highlightedHtml = highlightedHtml.replace(
                    regex,
                    `<mark style="background-color: ${color}; padding: 0; color: transparent;">$1</mark>`
                );
            });
        });

        // Live inline gray hint for currently open @token (before closing @).
        if (isMobileTagging && !showMentionPicker && mentionTitle.trim()) {
            highlightedHtml = highlightedHtml.replace(
                /@([^@\n]+)$/g,
                '@<mark style="background-color: rgba(161,161,170,0.28); color: transparent; text-decoration: underline; text-decoration-style: dashed; text-decoration-color: #52525b; text-decoration-thickness: 2px; text-underline-offset: 2px; padding: 0 1px;">$1</mark>'
            );
        }

        if (content.endsWith('\n')) {
            highlightedHtml += '<br/>';
        }

        return (
            <div
                className="highlight-layer absolute inset-0 p-3 pointer-events-none whitespace-pre-wrap break-words font-mono text-transparent leading-relaxed z-0 align-top overflow-hidden"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
        );
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
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 p-2 -ml-2 hover:bg-neutral-100 rounded transition-colors"
                >
                    <span className={`text-[10px] transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                        {isExpanded ? 'LOG ENTRY' : (activeStatus?.content ? 'ENTRY' : 'NEW ENTRY')}
                    </h2>
                </button>
                <div className="flex items-center gap-3">
                    <span className={`text-[10px] uppercase tracking-widest ${draftStatus === 'saved' ? 'text-green-700' : draftStatus === 'saving' ? 'text-neutral-500' : 'text-neutral-300'}`}>
                        {draftStatus === 'saved' ? 'Draft Saved' : draftStatus === 'saving' ? 'Saving Draft...' : 'Draft'}
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
                                    top: isMobileTagging ? undefined : `clamp(8px, ${(selectionRange?.top ?? 0) + 24}px, calc(100% - 140px))`,
                                    left: isMobileTagging ? undefined : `clamp(8px, ${(selectionRange?.left ?? 0) + 16}px, calc(100% - 132px))`,
                                    width: isMobileTagging ? undefined : '124px',
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
                        {renderHighlights()}
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
                                if (textareaRef.current && !content) {
                                    textareaRef.current.style.minHeight = isMobileTagging ? '170px' : '100px';
                                }
                            }}
                            onSelect={(e) => {
                                if (isMobileTagging) return;
                                const target = e.target as HTMLTextAreaElement;
                                handleTextSelection(target);
                            }}
                            onTouchEnd={(e) => {
                                if (isMobileTagging) return;
                                const target = e.target as HTMLTextAreaElement;
                                window.setTimeout(() => handleTextSelection(target), 0);
                            }}
                            onPointerUp={(e) => {
                                if (isMobileTagging) return;
                                const target = e.target as HTMLTextAreaElement;
                                window.setTimeout(() => handleTextSelection(target), 0);
                            }}
                            onClick={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                const cursor = target.selectionStart;

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
                        <div className="py-1.5 px-2 border border-neutral-200 bg-neutral-50/60 rounded-sm flex-1 min-w-0">
                            <HabitChecklist date={activeDate} />
                        </div>
                        <button
                            onClick={async () => {
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
