"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ConsumableItem, useSocialStore, Category, CATEGORY_CONFIGS, HIGHLIGHT_COLOR } from '@/lib/social-prototype/store';
import { ConsumableModal } from './ConsumableModal';
import { HabitChecklist } from './HabitChecklist';

interface StatusComposerProps {
    userCategories?: Category[];
}

export function StatusComposer({ userCategories }: StatusComposerProps) {
    const { activeStatus, activeDate, setActiveDate, updateActiveStatus, addItemToActive, removeItemFromActive, togglePublished, deleteStatus, isLoaded } = useSocialStore();
    const [content, setContent] = useState('');
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

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Active categories
    const activeCategories = userCategories && userCategories.length > 0
        ? userCategories
        : Object.keys(CATEGORY_CONFIGS) as Category[];

    const activeCategoryConfigs = activeCategories.map(c => CATEGORY_CONFIGS[c]).filter(Boolean);

    // Set default quick add category to first active category
    useEffect(() => {
        if (activeCategories.length > 0 && !activeCategories.includes(quickAddCategory)) {
            setQuickAddCategory(activeCategories[0]);
        }
    }, [activeCategories]);

    // Sync content with store
    useEffect(() => {
        if (activeStatus) {
            setContent(activeStatus.content || '');
            adjustTextareaHeight();
        } else if (isLoaded) {
            setContent('');
        }
    }, [activeStatus?.id, isLoaded]);

    const adjustTextareaHeight = () => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = Math.max(100, el.scrollHeight) + 'px';
        }
    };

    // Auto-resize on content change
    // Using layout effect to reduce flicker
    useEffect(() => {
        adjustTextareaHeight();
    }, [content]);

    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setContent(val);
        adjustTextareaHeight();

        const cursorPos = e.target.selectionStart || 0;

        // Detect @ trigger
        if (cursorPos > 0 && val[cursorPos - 1] === '@') {
            const charBefore = cursorPos > 1 ? val[cursorPos - 2] : ' ';
            if (charBefore === ' ' || charBefore === '\n' || cursorPos === 1) {
                setShowMentionPicker(true);
                setMentionCategory(null);
                setMentionTitle('');
                setAtPosition(cursorPos - 1);
                setTriggerLength(1);
                // Calculate coords for toolbar near cursor
                if (textareaRef.current) {
                    const coords = getSelectionCoords(textareaRef.current, cursorPos - 1, cursorPos);
                    setSelectionRange({ start: cursorPos - 1, end: cursorPos, ...coords });
                }
                return;
            }
        }

        // If currently in @ mode (triggerLength === 1), update the search term
        if (showMentionPicker && triggerLength === 1 && atPosition >= 0) {
            // Check if cursor moved before @
            if (cursorPos <= atPosition) {
                setShowMentionPicker(false);
                setSelectionRange(null);
                return;
            }

            // Extract typed text after @
            const typed = val.substring(atPosition + 1, cursorPos);
            // If space typed, maybe close? Or allow multi-word? User says "type word then x out"
            // Let's keep it open to allow multi-word until they click a category or hit Enter
            setMentionTitle(typed);

            // Update coords to follow cursor
            if (textareaRef.current) {
                const coords = getSelectionCoords(textareaRef.current, atPosition, cursorPos);
                setSelectionRange({ start: atPosition, end: cursorPos, ...coords });
            }
        }
    };

    // Remove the on-blur auto-save to enable draft behavior.
    const handleBlur = () => {
        // No-op for saving. Content stays local until user explicitly posts.
    };

    const handleSelectCategory = (cat: Category) => {
        setMentionCategory(cat);
        setMentionTitle('');
        setTimeout(() => mentionInputRef.current?.focus(), 50);
    };

    const handleMentionSubmit = async () => {
        if (!mentionTitle.trim() || !mentionCategory) return;

        const title = mentionTitle.trim();

        try {
            // Add the item
            await addItemToActive({
                category: mentionCategory,
                title,
                rating: undefined,
                subtitle: '',
                notes: ''
            });

            // Replace text
            const before = content.substring(0, atPosition);
            // Dynamic length replacement
            const after = content.substring(atPosition + triggerLength);
            const newContent = before + title + after;
            setContent(newContent);
            updateActiveStatus(newContent);
        } catch (error: any) {
            alert(`Failed to add item: ${error.message}`);
        }

        // Reset
        setShowMentionPicker(false);
        setMentionCategory(null);
        setMentionTitle('');
        setAtPosition(-1);

        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const handleMentionCancel = () => {
        setShowMentionPicker(false);
        setMentionCategory(null);
        setMentionTitle('');
        setAtPosition(-1);
        setSelectionRange(null);
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const handleQuickAddRow = async () => {
        if (!quickAddTitle.trim()) return;
        try {
            await addItemToActive({
                category: quickAddCategory,
                title: quickAddTitle,
                rating: undefined,
                subtitle: '',
                notes: ''
            });
            setQuickAddTitle('');
        } catch (error: any) {
            alert(`Failed to quick add: ${error.message}`);
        }
    };

    const handleSaveItem = async (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => {
        try {
            if (existingItem && existingItem.id !== 'temp') {
                await removeItemFromActive(existingItem.id);
            }
            await addItemToActive(item);
            setExistingItem(undefined);
        } catch (error: any) {
            alert(`Failed to save item: ${error.message}`);
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

    // Highlight rendering — font size must match the textarea exactly
    const renderHighlights = () => {
        if (!content) return null;

        let highlightedHtml = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>');

        items.forEach(item => {
            if (!item.title) return;
            const config = CATEGORY_CONFIGS[item.category];
            const color = config?.color || HIGHLIGHT_COLOR;
            const regex = new RegExp(`(${item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            highlightedHtml = highlightedHtml.replace(
                regex,
                `<mark style="background-color: ${color}; padding: 0; color: transparent;">$1</mark>`
            );
        });

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
                    font-size: 16px;
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
                    <input
                        type="date"
                        value={activeDate}
                        onChange={(e) => setActiveDate(e.target.value)}
                        // Try to open the picker on click for better UX
                        onClick={(e) => {
                            try {
                                if ('showPicker' in e.target) {
                                    (e.target as any).showPicker();
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
                                className="absolute z-50 bg-black text-white p-1.5 shadow-xl rounded-sm flex items-center justify-center gap-2 overflow-x-auto no-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-150"
                                style={{
                                    top: selectionRange?.top !== undefined ? (selectionRange.top - 40) : -40,
                                    // Align horizontally with selection or center if undefined
                                    left: selectionRange?.left !== undefined ? selectionRange.left : '50%',
                                    transform: 'translateX(-50%)',
                                    maxWidth: '90%',
                                    // Ensure minimum width to not squash buttons
                                    minWidth: 'max-content',
                                }}
                            >
                                {activeCategoryConfigs.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => {
                                            // Instant Add logic (Expanded to support @ mentions)
                                            // If we have a title (either from selection or typed after @), add immediately
                                            if (mentionTitle.trim()) {
                                                // Instant Add
                                                addItemToActive({
                                                    category: cat.id,
                                                    title: mentionTitle.trim(),
                                                    rating: undefined,
                                                    subtitle: '',
                                                    notes: ''
                                                }).then(() => {
                                                    // Replace text logic
                                                    // If selectionRange exists, use it. If not (rare), fallback to atPosition
                                                    let start = selectionRange ? selectionRange.start : atPosition;
                                                    let end = selectionRange ? selectionRange.end : (atPosition + (mentionTitle.length + 1)); // +1 for @

                                                    // Ensure valid range
                                                    if (start < 0) start = 0;
                                                    if (end > content.length) end = content.length;

                                                    const before = content.substring(0, start);
                                                    const after = content.substring(end);

                                                    // Just remove the raw text, it becomes a highlight overlay item
                                                    // Or replace with the Title?
                                                    // User says "x out of highlight and it gets added to table"
                                                    // Usually we keep the text in the body?
                                                    // Yes, keep the text so it highlights.
                                                    const newContent = before + mentionTitle.trim() + after;
                                                    setContent(newContent);
                                                    updateActiveStatus(newContent);

                                                    // Reset & auto-dismiss toolbar
                                                    setShowMentionPicker(false);
                                                    setMentionCategory(null);
                                                    setMentionTitle('');
                                                    setSelectionRange(null);
                                                    setTriggerLength(1);
                                                    setAtPosition(-1);
                                                }).catch(err => alert(err.message));
                                            } else {
                                                // Just open the picker for typing
                                                handleSelectCategory(cat.id);
                                            }
                                        }}
                                        className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest hover:text-neutral-300 transition-colors whitespace-nowrap"
                                    >
                                        {cat.shortLabel}
                                    </button>
                                ))}
                                <button
                                    onClick={handleMentionCancel}
                                    className="px-3 py-2 text-[10px] text-neutral-500 hover:text-white ml-auto border-l border-neutral-800"
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
                                    textareaRef.current.style.minHeight = '150px';
                                }
                            }}
                            onBlur={(e) => {
                                handleBlur();
                                if (textareaRef.current && !content) {
                                    textareaRef.current.style.minHeight = '100px';
                                }
                            }}
                            onSelect={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                const start = target.selectionStart;
                                const end = target.selectionEnd;
                                if (start !== end) {
                                    const selectedText = target.value.substring(start, end);
                                    if (selectedText.trim()) {
                                        // Check if this matches an existing item (Edit Mode)
                                        // We look for an exact match in the active items list
                                        const existing = items.find(i => i.title.toLowerCase() === selectedText.toLowerCase());

                                        if (existing) {
                                            // Open modal for editing
                                            openModal(existing);
                                        } else {
                                            // New item (Add Mode) - Capture ranges
                                            setMentionTitle(selectedText);
                                            setAtPosition(start);

                                            // Calculate coordinates
                                            const coords = getSelectionCoords(target, start, end);
                                            setSelectionRange({ start, end, ...coords });

                                            setTriggerLength(selectedText.length);
                                            setShowMentionPicker(true);
                                            setMentionCategory(null);
                                        }
                                    }
                                } else {
                                    // Dismiss toolbar if selection cleared and NOT in @ typing mode
                                    // We know we are in @ mode if triggerLength === 1
                                    if (triggerLength !== 1) {
                                        setShowMentionPicker(false);
                                        setSelectionRange(null);
                                    }
                                }
                            }}
                            onClick={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                const cursor = target.selectionStart;

                                // Check if cursor is inside an existing item
                                // We reconstruct where items are located
                                let foundItem: ConsumableItem | undefined;

                                // Simple scan - find all occurrences and check range
                                for (const item of items) {
                                    if (!item.title) continue;
                                    const escaped = item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

                                if (foundItem) {
                                    openModal(foundItem);
                                } else {
                                    // Clicked empty space - dismiss unless typing @
                                    if (triggerLength !== 1) {
                                        setShowMentionPicker(false);
                                        setSelectionRange(null);
                                    }
                                }
                            }}
                            placeholder="What did you do today? Highlight text to add items or click existing items to edit..."
                            className="composer-text relative z-10 w-full bg-transparent text-neutral-900 caret-black outline-none placeholder:text-neutral-300 min-h-[100px] p-3 font-mono resize-none leading-relaxed align-top overflow-hidden transition-all duration-200"
                            spellCheck={false}
                        />
                    </div>

                    {/* Sub-form for details (only when category selected AND not instant-added) */}
                    {showMentionPicker && mentionCategory && (
                        <div className="border border-neutral-300 bg-neutral-50 p-3 mb-2 animate-in fade-in zoom-in-95 duration-100">
                            <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2 flex items-center justify-between">
                                <span>{CATEGORY_CONFIGS[mentionCategory]?.icon} New {CATEGORY_CONFIGS[mentionCategory]?.label}</span>
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
                                    placeholder={CATEGORY_CONFIGS[mentionCategory]?.titleLabel}
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

                    {/* Habit Checklist */}
                    <div className="py-2">
                        <HabitChecklist date={activeDate} />
                    </div>

                    {/* Data Table — always visible with quick-add row */}
                    <div className="border border-neutral-300 bg-white mt-2 overflow-x-auto">
                        <table className="w-full text-xs font-mono border-collapse">
                            <thead className="bg-neutral-100 text-neutral-600 uppercase text-[10px]">
                                <tr>
                                    <th className="px-2 py-2 text-left border-b border-r border-neutral-300 w-14">Type</th>
                                    <th className="px-2 py-2 text-left border-b border-r border-neutral-300">Title</th>
                                    <th className="px-2 py-2 text-center border-b border-r border-neutral-300 w-10">R</th>
                                    <th className="px-2 py-2 text-center border-b border-neutral-300 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => {
                                    const config = CATEGORY_CONFIGS[item.category];
                                    if (!config) return null;
                                    return (
                                        <tr
                                            key={item.id}
                                            className="hover:bg-neutral-50 cursor-pointer active:bg-neutral-100"
                                            onClick={() => openModal(item)}
                                        >
                                            <td
                                                className="px-2 py-3 border-b border-r border-neutral-200 text-[10px] font-bold"
                                                style={{ backgroundColor: config.color || undefined }}
                                            >
                                                {config.shortLabel}
                                            </td>
                                            <td className="px-2 py-3 border-b border-r border-neutral-200 font-medium">
                                                {item.title}
                                                {item.subtitle && (
                                                    <span className="text-neutral-400 ml-1 font-normal">— {item.subtitle}</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-3 border-b border-r border-neutral-200 text-center">
                                                {item.rating ? <span>{item.rating}<span className="text-neutral-400 text-[8px]">/10</span></span> : '—'}
                                            </td>
                                            <td className="px-2 py-3 border-b border-neutral-200 text-center">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeItemFromActive(item.id); }}
                                                    className="text-neutral-400 hover:text-neutral-600 p-2"
                                                >
                                                    ×
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {/* Quick Add Row — always visible */}
                                <tr className="bg-neutral-50">
                                    <td className="px-1 py-1.5 border-r border-neutral-200">
                                        <select
                                            value={quickAddCategory}
                                            onChange={(e) => setQuickAddCategory(e.target.value as Category)}
                                            className="w-full bg-transparent text-[10px] outline-none cursor-pointer px-1 py-2 text-neutral-500 h-full"
                                        >
                                            {activeCategoryConfigs.map(c => (
                                                <option key={c.id} value={c.id}>{c.shortLabel}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-1 py-1.5 border-r border-neutral-200">
                                        <input
                                            type="text"
                                            value={quickAddTitle}
                                            onChange={(e) => setQuickAddTitle(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAddRow(); }}
                                            placeholder="Add new entry..."
                                            className="w-full bg-transparent outline-none text-[16px] sm:text-xs placeholder:text-neutral-300 px-1 py-2"
                                        />
                                    </td>
                                    <td className="px-2 py-1.5 text-center" colSpan={2}>
                                        <button
                                            onClick={handleQuickAddRow}
                                            disabled={!quickAddTitle.trim()}
                                            className="text-neutral-400 hover:text-neutral-600 disabled:opacity-30 p-2 w-full h-full flex items-center justify-center"
                                        >
                                            +
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Footer: Post button aligned right, large touch target */}
                    <div className="flex justify-end mt-4">
                        <button
                            onClick={async () => {
                                if (activeStatus?.published) {
                                    // Unpost
                                    await togglePublished(activeStatus.id, false);
                                } else {
                                    // Post: save content first, then publish
                                    let statusId = activeStatus?.id !== 'temp-optimistic' ? activeStatus?.id : undefined;
                                    if (content) {
                                        statusId = await updateActiveStatus(content) || statusId;
                                    }
                                    if (statusId) {
                                        await togglePublished(statusId, true);
                                        // Collapse after posting
                                        setIsExpanded(false);
                                    }
                                }
                            }}
                            className={`px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all border rounded shadow-sm ${activeStatus?.published
                                ? 'bg-green-700 text-white border-green-700 hover:bg-green-800'
                                : 'bg-neutral-800 text-white border-neutral-800 hover:bg-neutral-700'
                                }`}
                        >
                            {activeStatus?.published ? 'POSTED ✓' : 'POST ENTRY'}
                        </button>
                    </div>
                </div>
            )}

            <ConsumableModal
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
