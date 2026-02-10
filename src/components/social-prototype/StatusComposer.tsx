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
    const [atPosition, setAtPosition] = useState<number>(-1); // where the @ was typed
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

        // Detect @ trigger: look for a fresh @ at cursor
        const cursorPos = e.target.selectionStart;
        if (cursorPos > 0 && val[cursorPos - 1] === '@') {
            const charBefore = cursorPos > 1 ? val[cursorPos - 2] : ' ';
            if (charBefore === ' ' || charBefore === '\n' || cursorPos === 1) {
                setShowMentionPicker(true);
                setMentionCategory(null);
                setMentionTitle('');
                setAtPosition(cursorPos - 1); // remember where @ is
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

        // Add the item to today's status
        await addItemToActive({
            category: mentionCategory,
            title,
            rating: undefined,
            subtitle: '',
            notes: ''
        });

        // Replace the @ in content with the title
        const before = content.substring(0, atPosition);
        const after = content.substring(atPosition + 1); // skip the @
        const newContent = before + title + after;
        setContent(newContent);
        updateActiveStatus(newContent);

        // Reset mention state
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
                className="absolute inset-0 p-3 pointer-events-none whitespace-pre-wrap break-words font-mono text-[16px] sm:text-xs text-transparent leading-relaxed z-0 align-top overflow-hidden"
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
                    className="bg-transparent text-right font-mono text-[16px] sm:text-[10px] text-neutral-500 cursor-pointer outline-none"
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
                    className="relative z-10 w-full text-[16px] sm:text-xs bg-transparent text-neutral-900 caret-black outline-none placeholder:text-neutral-300 min-h-[100px] p-3 font-mono resize-none leading-relaxed align-top overflow-hidden"
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

            {/* Items Table */}
            {items.length > 0 && (
                <div className="border border-neutral-300 bg-white mt-2 overflow-x-auto">
                    <table className="w-full text-xs font-mono border-collapse min-w-[320px]">
                        <thead className="bg-neutral-100 text-neutral-600 uppercase text-[10px]">
                            <tr>
                                <th className="px-2 py-1.5 text-left border-b border-r border-neutral-300 w-14">Type</th>
                                <th className="px-2 py-1.5 text-left border-b border-r border-neutral-300">Title</th>
                                <th className="px-2 py-1.5 text-left border-b border-r border-neutral-300 w-24 hidden sm:table-cell">Details</th>
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
                                        <td className="px-2 py-1.5 border-b border-r border-neutral-200 font-medium truncate max-w-[120px]">
                                            {item.title}
                                        </td>
                                        <td className="px-2 py-1.5 border-b border-r border-neutral-200 text-neutral-500 truncate hidden sm:table-cell">
                                            {item.subtitle || '—'}
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
                        </tbody>
                    </table>
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
