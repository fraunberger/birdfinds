"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ConsumableItem, useSocialStore, Category, CATEGORY_CONFIGS, HIGHLIGHT_COLOR } from '@/lib/social-prototype/store';
import { ConsumableModal } from './ConsumableModal';
import { HabitChecklist } from './HabitChecklist';

interface StatusComposerProps {
    userCategories?: Category[];
}

export function StatusComposer({ userCategories }: StatusComposerProps) {
    const { activeStatus, activeDate, setActiveDate, updateActiveStatus, addItemToActive, removeItemFromActive, isLoaded } = useSocialStore();
    const [content, setContent] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<Category>('movie');
    const [existingItem, setExistingItem] = useState<ConsumableItem | undefined>(undefined);

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

    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setContent(val);
        adjustTextareaHeight();

        // Detect @ trigger
        const cursorPos = e.target.selectionStart;
        if (cursorPos > 0 && val[cursorPos - 1] === '@') {
            const charBefore = cursorPos > 1 ? val[cursorPos - 2] : ' ';
            if (charBefore === ' ' || charBefore === '\n' || cursorPos === 1) {
                setShowMentionPicker(true);
                setMentionCategory(null);
                setMentionCategory(null);
                setMentionTitle('');
                setAtPosition(cursorPos - 1);
                setTriggerLength(1);
                return;
            }
        }
    };

    const handleBlur = () => {
        updateActiveStatus(content);
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
                `<mark style="background-color: ${color}; padding: 0 1px; color: transparent;">$1</mark>`
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

            {/* Header */}
            <header className="flex items-center justify-between mb-2 border-b border-neutral-300 pb-2">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                    LOG ENTRY
                </h2>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (content) updateActiveStatus(content);
                            alert("Status saved!");
                        }}
                        className="text-[10px] font-bold uppercase tracking-widest text-black hover:text-neutral-600 active:text-neutral-800 transition-colors"
                    >
                        SAVE
                    </button>
                    <input
                        type="date"
                        value={activeDate}
                        onChange={(e) => setActiveDate(e.target.value)}
                        className="bg-transparent text-right font-mono text-[16px] sm:text-[10px] text-neutral-500 cursor-pointer outline-none"
                    />
                </div>
            </header>

            {/* Editor */}
            <div className="bg-white border border-neutral-300 mb-2 relative min-h-[100px]">
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
                                    // New item (Add Mode)
                                    setMentionTitle(selectedText);
                                    setAtPosition(start);
                                    setTriggerLength(selectedText.length);
                                    setShowMentionPicker(true);
                                    setMentionCategory(null);
                                }
                            }
                        }
                    }}
                    placeholder="What did you do today? Highlight text to add items or click existing items to edit..."
                    className="composer-text relative z-10 w-full bg-transparent text-neutral-900 caret-black outline-none placeholder:text-neutral-300 min-h-[100px] p-3 font-mono resize-none leading-relaxed align-top overflow-hidden transition-all duration-200"
                    spellCheck={false}
                />
            </div>

            {/* @ Mention Picker */}
            {showMentionPicker && (
                <div className="border border-neutral-300 bg-neutral-50 p-3 mb-2">
                    {!mentionCategory ? (
                        <>
                            <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">
                                What type?
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {activeCategoryConfigs.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => handleSelectCategory(cat.id)}
                                        className="flex items-center gap-1 px-2 py-1.5 text-xs border border-neutral-300 hover:bg-white active:bg-neutral-200 transition-colors"
                                        style={{ borderLeftColor: cat.color || '#ccc', borderLeftWidth: 3 }}
                                    >
                                        <span>{cat.icon}</span>
                                        <span className="uppercase tracking-wider text-[10px]">{cat.label}</span>
                                    </button>
                                ))}
                                <button
                                    onClick={handleMentionCancel}
                                    className="px-2 py-1.5 text-xs text-neutral-400 hover:text-neutral-600"
                                >
                                    ✕
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">
                                {CATEGORY_CONFIGS[mentionCategory]?.icon} {CATEGORY_CONFIGS[mentionCategory]?.titleLabel}
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
                                    className="flex-1 text-[16px] sm:text-xs font-mono border border-neutral-300 px-2 py-1.5 outline-none focus:border-neutral-500 bg-white"
                                    autoFocus
                                />
                                <button
                                    onClick={handleMentionSubmit}
                                    disabled={!mentionTitle.trim()}
                                    className="px-3 py-1.5 text-xs bg-neutral-800 text-white uppercase tracking-wider disabled:opacity-30"
                                >
                                    Add
                                </button>
                                <button
                                    onClick={() => { setMentionCategory(null); setMentionTitle(''); }}
                                    className="px-2 py-1.5 text-xs text-neutral-400 hover:text-neutral-600"
                                >
                                    ←
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Habit Checklist */}
            <HabitChecklist date={activeDate} />

            {/* Data Table — always visible with quick-add row */}
            <div className="border border-neutral-300 bg-white mt-2 overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full text-xs font-mono border-collapse">
                    <thead className="bg-neutral-100 text-neutral-600 uppercase text-[10px]">
                        <tr>
                            <th className="px-2 py-1.5 text-left border-b border-r border-neutral-300 w-14">Type</th>
                            <th className="px-2 py-1.5 text-left border-b border-r border-neutral-300">Title</th>
                            <th className="px-2 py-1.5 text-center border-b border-r border-neutral-300 w-10">★</th>
                            <th className="px-2 py-1.5 text-center border-b border-neutral-300 w-6"></th>
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
                                        className="px-2 py-1.5 border-b border-r border-neutral-200 text-[10px] font-bold"
                                        style={{ backgroundColor: config.color || undefined }}
                                    >
                                        {config.shortLabel}
                                    </td>
                                    <td className="px-2 py-1.5 border-b border-r border-neutral-200 font-medium">
                                        {item.title}
                                        {item.subtitle && (
                                            <span className="text-neutral-400 ml-1 font-normal">— {item.subtitle}</span>
                                        )}
                                    </td>
                                    <td className="px-2 py-1.5 border-b border-r border-neutral-200 text-center">
                                        {item.rating || '—'}
                                    </td>
                                    <td className="px-2 py-1.5 border-b border-neutral-200 text-center">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeItemFromActive(item.id); }}
                                            className="text-neutral-400 hover:text-neutral-600"
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
                                    className="w-full bg-transparent text-[10px] outline-none cursor-pointer px-1 text-neutral-500"
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
                                    className="w-full bg-transparent outline-none text-[16px] sm:text-xs placeholder:text-neutral-300 px-1"
                                />
                            </td>
                            <td className="px-2 py-1.5 text-center" colSpan={2}>
                                <button
                                    onClick={handleQuickAddRow}
                                    disabled={!quickAddTitle.trim()}
                                    className="text-neutral-400 hover:text-neutral-600 disabled:opacity-30"
                                >
                                    +
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

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
