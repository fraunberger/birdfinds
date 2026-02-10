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

    // Quick Add State
    const [quickAddTitle, setQuickAddTitle] = useState('');
    const [quickAddCategory, setQuickAddCategory] = useState<Category>('movie');

    // Selection State
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);

    // Active categories: use user's selected categories, or all if not provided
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
            el.style.height = el.scrollHeight + 'px';
        }
    };

    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(e.target.value);
        adjustTextareaHeight();
    };

    const handleBlur = () => {
        updateActiveStatus(content);
    };

    const handleSelect = () => {
        const el = textareaRef.current;
        if (!el) return;
        if (el.selectionStart !== el.selectionEnd) {
            let text = el.value.substring(el.selectionStart, el.selectionEnd);

            if (text.length > 50) {
                setSelection(null);
                return;
            }

            const hasOverlap = items.some(item =>
                text.toLowerCase().includes(item.title.toLowerCase())
            );

            if (hasOverlap) {
                setSelection(null);
                return;
            }

            if (text.trim().length > 0) {
                text = text.replace(/[.,;!?]+$/, '').replace(/^[.,;!?]+/, '');
                setSelection({ start: el.selectionStart, end: el.selectionEnd, text: text.trim() });
                return;
            }
        }
        setSelection(null);
    };

    const handleTextareaClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
        const el = textareaRef.current;
        if (!el || !content) return;
        if (el.selectionStart !== el.selectionEnd) return;

        const cursorIndex = el.selectionStart;
        let foundItem: ConsumableItem | null = null;

        for (const item of items) {
            const title = item.title;
            const regex = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            let match;
            while ((match = regex.exec(content)) !== null) {
                if (cursorIndex > match.index && cursorIndex < match.index + title.length) {
                    foundItem = item;
                    break;
                }
            }
            if (foundItem) break;
        }

        if (foundItem) {
            openModal(foundItem);
        }
    };

    const handleQuickTag = async (category: Category) => {
        if (!selection) return;
        await addItemToActive({
            category,
            title: selection.text,
            rating: undefined,
            subtitle: '',
            notes: ''
        });
        setSelection(null);
    };

    const handleQuickAddRow = async () => {
        if (!quickAddTitle.trim()) return;
        await addItemToActive({
            category: quickAddCategory,
            title: quickAddTitle,
            rating: undefined,
            subtitle: '',
            notes: ''
        });
        setQuickAddTitle('');
    };

    const handleSaveItem = async (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => {
        if (existingItem && existingItem.id !== 'temp') {
            await removeItemFromActive(existingItem.id);
        }
        await addItemToActive(item);
        setExistingItem(undefined);
    };

    const handleRemoveItem = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        removeItemFromActive(id);
    };

    const openModal = (item: ConsumableItem) => {
        setActiveCategory(item.category);
        setExistingItem(item);
        setIsModalOpen(true);
    };

    const items = activeStatus?.items || [];

    // Simple highlight rendering behind text
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
                className="absolute inset-0 p-4 pointer-events-none whitespace-pre-wrap break-words font-mono text-xs text-transparent leading-relaxed z-0 align-top overflow-hidden"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
        );
    };

    if (!isLoaded) return <div className="h-40 bg-neutral-100 mb-4 border border-neutral-300" />;

    return (
        <div className="mb-8 font-mono">
            {/* Header */}
            <header className="flex items-center justify-between mb-2 border-b border-neutral-300 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600">
                    LOG ENTRY
                </h2>
                <input
                    type="date"
                    value={activeDate}
                    onChange={(e) => setActiveDate(e.target.value)}
                    className="bg-transparent text-right font-mono text-xs text-neutral-500 cursor-pointer outline-none"
                />
            </header>

            {/* Editor */}
            <div className="bg-white border border-neutral-300 mb-2 relative min-h-[120px]">
                {renderHighlights()}
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={handleContentChange}
                    onSelect={handleSelect}
                    onClick={handleTextareaClick}
                    onBlur={handleBlur}
                    placeholder="Enter observations..."
                    className="relative z-10 w-full text-xs bg-transparent text-neutral-900 caret-black outline-none placeholder:text-neutral-300 min-h-[120px] p-4 font-mono resize-none leading-relaxed align-top overflow-hidden"
                    spellCheck={false}
                />

                {/* Selection Toolbar */}
                {selection && (
                    <div className="absolute bottom-2 right-2 z-30 flex gap-0 bg-neutral-800 text-white text-xs font-mono border border-neutral-600 shadow-md">
                        <span className="px-2 py-1 border-r border-neutral-600 text-neutral-400 uppercase tracking-wider">TAG:</span>
                        {activeCategoryConfigs.map(cat => (
                            <button
                                key={cat.id}
                                onMouseDown={(e) => { e.preventDefault(); handleQuickTag(cat.id); }}
                                className="px-2 py-1 hover:bg-neutral-700 border-r border-neutral-600 last:border-r-0 uppercase tracking-wider"
                                style={{ borderBottom: `2px solid ${cat.color || 'transparent'}` }}
                            >
                                {cat.shortLabel}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Habit Checklist */}
            <HabitChecklist date={activeDate} />

            {/* Data Table */}
            <div className="border border-neutral-300 bg-white mt-2">
                <table className="w-full text-xs font-mono border-collapse">
                    <thead className="bg-neutral-100 text-neutral-600 uppercase">
                        <tr>
                            <th className="px-3 py-2 text-left border-b border-r border-neutral-300 w-16">Type</th>
                            <th className="px-3 py-2 text-left border-b border-r border-neutral-300">Title</th>
                            <th className="px-3 py-2 text-left border-b border-r border-neutral-300 w-32">Details</th>
                            <th className="px-3 py-2 text-center border-b border-r border-neutral-300 w-16">Rating</th>
                            <th className="px-3 py-2 text-center border-b border-neutral-300 w-8"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) => {
                            const config = CATEGORY_CONFIGS[item.category];
                            if (!config) return null;
                            return (
                                <tr
                                    key={item.id}
                                    className="hover:bg-neutral-50 cursor-pointer"
                                    onClick={() => openModal(item)}
                                >
                                    <td
                                        className="px-3 py-2 border-b border-r border-neutral-200 text-neutral-500 font-bold"
                                        style={{ color: config.color ? '#000' : undefined, backgroundColor: config.color || undefined }}
                                    >
                                        {config.shortLabel}
                                    </td>
                                    <td className="px-3 py-2 border-b border-r border-neutral-200 font-medium">
                                        {item.title}
                                    </td>
                                    <td className="px-3 py-2 border-b border-r border-neutral-200 text-neutral-500 truncate">
                                        {item.subtitle || '—'}
                                    </td>
                                    <td className="px-3 py-2 border-b border-r border-neutral-200 text-center">
                                        {item.rating || '—'}
                                    </td>
                                    <td className="px-3 py-2 border-b border-neutral-200 text-center">
                                        <button
                                            onClick={(e) => handleRemoveItem(item.id, e)}
                                            className="text-neutral-400 hover:text-neutral-600"
                                        >
                                            ×
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}

                        {/* Quick Add Row */}
                        <tr className="bg-neutral-50">
                            <td className="px-1 py-2 border-r border-neutral-200">
                                <select
                                    value={quickAddCategory}
                                    onChange={(e) => setQuickAddCategory(e.target.value as Category)}
                                    className="w-full bg-transparent text-xs outline-none cursor-pointer px-2 text-neutral-500"
                                >
                                    {activeCategoryConfigs.map(c => (
                                        <option key={c.id} value={c.id}>{c.shortLabel}</option>
                                    ))}
                                </select>
                            </td>
                            <td className="px-1 py-2 border-r border-neutral-200" colSpan={3}>
                                <input
                                    type="text"
                                    value={quickAddTitle}
                                    onChange={(e) => setQuickAddTitle(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAddRow(); }}
                                    placeholder="Add new entry..."
                                    className="w-full bg-transparent outline-none text-xs placeholder:text-neutral-300 px-2"
                                />
                            </td>
                            <td className="px-3 py-2 text-center">
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
                initialCategory={activeCategory}
                existingItem={existingItem}
            />
        </div>
    );
}
