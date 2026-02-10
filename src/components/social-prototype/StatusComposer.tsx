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
    const mentionInputRef = useRef<HTMLInputElement>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Active categories
    const activeCategories = userCategories && userCategories.length > 0
        ? userCategories
        : Object.keys(CATEGORY_CONFIGS) as Category[];

    const activeCategoryConfigs = activeCategories.map(c => CATEGORY_CONFIGS[c]).filter(Boolean);

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
        const textBeforeCursor = val.substring(0, cursorPos);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

        if (lastAtIndex !== -1 && (lastAtIndex === 0 || textBeforeCursor[lastAtIndex - 1] === ' ' || textBeforeCursor[lastAtIndex - 1] === '\n')) {
            const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
            if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n') && textAfterAt.length === 0) {
                setShowMentionPicker(true);
                setMentionCategory(null);
                setMentionTitle('');
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

        // Add the item
        await addItemToActive({
            category: mentionCategory,
            title: mentionTitle.trim(),
            rating: undefined,
            subtitle: '',
            notes: ''
        });

        // Replace the trailing @ in content with the title
        const newContent = content.replace(/@$/, mentionTitle.trim());
        setContent(newContent);
        updateActiveStatus(newContent);

        // Reset
        setShowMentionPicker(false);
        setMentionCategory(null);
        setMentionTitle('');

        // Refocus textarea
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const handleMentionCancel = () => {
        setShowMentionPicker(false);
        setMentionCategory(null);
        setMentionTitle('');
        // Remove trailing @ if present
        if (content.endsWith('@')) {
            const newContent = content.slice(0, -1);
            setContent(newContent);
            updateActiveStatus(newContent);
        }
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const handleSaveItem = async (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => {
        if (existingItem && existingItem.id !== 'temp') {
            await removeItemFromActive(existingItem.id);
        }
        await addItemToActive(item);
        setExistingItem(undefined);
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

    // Highlight rendering
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
                className="absolute inset-0 p-3 pointer-events-none whitespace-pre-wrap break-words font-mono text-xs text-transparent leading-relaxed z-0 align-top overflow-hidden"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
        );
    };

    if (!isLoaded) return <div className="h-32 bg-neutral-100 mb-4 border border-neutral-300" />;

    return (
        <div className="mb-6 font-mono">
            {/* Header */}
            <header className="flex items-center justify-between mb-2 border-b border-neutral-300 pb-2">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                    LOG ENTRY
                </h2>
                <input
                    type="date"
                    value={activeDate}
                    onChange={(e) => setActiveDate(e.target.value)}
                    className="bg-transparent text-right font-mono text-[10px] text-neutral-500 cursor-pointer outline-none"
                />
            </header>

            {/* Editor */}
            <div className="bg-white border border-neutral-300 mb-2 relative min-h-[100px]">
                {renderHighlights()}
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={handleContentChange}
                    onBlur={handleBlur}
                    placeholder="What did you do today? Type @ to add an item..."
                    className="relative z-10 w-full text-xs bg-transparent text-neutral-900 caret-black outline-none placeholder:text-neutral-300 min-h-[100px] p-3 font-mono resize-none leading-relaxed align-top overflow-hidden"
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
                                    className="flex-1 text-xs font-mono border border-neutral-300 px-2 py-1.5 outline-none focus:border-neutral-500 bg-white"
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

            {/* Items — stacked cards instead of table */}
            {items.length > 0 && (
                <div className="mt-2 space-y-1">
                    <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-1">
                        Items ({items.length})
                    </div>
                    {items.map((item) => {
                        const config = CATEGORY_CONFIGS[item.category];
                        if (!config) return null;
                        return (
                            <div
                                key={item.id}
                                onClick={() => openModal(item)}
                                className="flex items-center gap-2 px-2 py-1.5 border border-neutral-200 bg-white cursor-pointer hover:bg-neutral-50 active:bg-neutral-100"
                            >
                                <span
                                    className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 flex-shrink-0"
                                    style={{ backgroundColor: config.color || '#f5f5f5' }}
                                >
                                    {config.shortLabel}
                                </span>
                                <span className="text-xs font-medium truncate flex-1">
                                    {item.title}
                                </span>
                                {item.subtitle && (
                                    <span className="text-[10px] text-neutral-400 truncate max-w-[80px]">
                                        {item.subtitle}
                                    </span>
                                )}
                                {item.rating && (
                                    <span className="text-[10px] text-neutral-500">
                                        ★{item.rating}
                                    </span>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeItemFromActive(item.id); }}
                                    className="text-neutral-300 hover:text-neutral-600 text-sm flex-shrink-0 ml-auto"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
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
