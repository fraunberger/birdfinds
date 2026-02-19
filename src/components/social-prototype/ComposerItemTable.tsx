"use client";

import React, { useState } from 'react';
import { Category, ConsumableItem, getCategoryConfig, CategoryConfig } from '@/lib/social-prototype/store';
import { pushToast } from '@/lib/social-prototype/toast';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

interface ComposerItemTableProps {
    /** Items attached to the active status. */
    items: ConsumableItem[];
    /** Whether we're in mobile tagging mode (hides "link" button). */
    isMobileTagging: boolean;
    /** Currently selected text in the textarea — used for link tooltip. */
    selectedPlainText: string;
    /** Active category configurations for the quick-add dropdown. */
    activeCategoryConfigs: CategoryConfig[];
    /** Open the ConsumableModal for an item. */
    onOpenItem: (item: ConsumableItem) => void;
    /** Link an existing item into the post text. */
    onLinkItem: (item: ConsumableItem) => Promise<void>;
    /** Remove an item from the post. */
    onRemoveItem: (itemId: string) => void;
    /** Add a new quick-add item. */
    onAddItem: (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => Promise<void>;
}

export function ComposerItemTable({
    items,
    isMobileTagging,
    selectedPlainText,
    activeCategoryConfigs,
    onOpenItem,
    onLinkItem,
    onRemoveItem,
    onAddItem,
}: ComposerItemTableProps) {
    const [quickAddTitle, setQuickAddTitle] = useState('');
    const [quickAddCategory, setQuickAddCategory] = useState<Category>(activeCategoryConfigs[0]?.id as Category || 'movie');

    const effectiveQuickAddCategory = activeCategoryConfigs.some(c => c.id === quickAddCategory)
        ? quickAddCategory
        : (activeCategoryConfigs[0]?.id as Category ?? 'movie');

    const handleQuickAddRow = async () => {
        if (!quickAddTitle.trim()) return;
        try {
            await onAddItem({
                category: effectiveQuickAddCategory,
                title: quickAddTitle,
                rating: undefined,
                subtitle: '',
                notes: '',
            });
            setQuickAddTitle('');
        } catch (error: unknown) {
            pushToast({ message: `Failed to quick add: ${getErrorMessage(error)}`, tone: 'error' });
        }
    };

    return (
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
                            <tr key={item.id} className="hover:bg-neutral-50 cursor-pointer active:bg-neutral-100" onClick={() => onOpenItem(item)}>
                                <td className="px-2 py-1 border-b border-r border-neutral-200 text-[10px] font-bold" style={{ backgroundColor: config.color || undefined }}>
                                    {config.shortLabel}
                                </td>
                                <td className="px-2 py-1 border-b border-r border-neutral-200 font-medium">
                                    {item.title}
                                    {item.subtitle && <span className="text-neutral-400 ml-1 font-normal">— {item.subtitle}</span>}
                                </td>
                                <td className="px-2 py-1 border-b border-r border-neutral-200 text-center">
                                    {item.rating ? <span>{item.rating}<span className="text-neutral-400 text-[8px]">/10</span></span> : '—'}
                                </td>
                                <td className="px-2 py-1 border-b border-neutral-200 text-center">
                                    {!isMobileTagging && (
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                try { await onLinkItem(item); }
                                                catch (error: unknown) { pushToast({ message: `Failed to link item: ${getErrorMessage(error)}`, tone: 'error' }); }
                                            }}
                                            className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-700 px-1"
                                            title={selectedPlainText.trim() ? `Link "${selectedPlainText.trim()}" to this item` : 'Insert into post text'}
                                        >
                                            link
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onRemoveItem(item.id); }}
                                        className="text-neutral-400 hover:text-neutral-600 p-1"
                                    >
                                        ×
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                    {/* Quick Add Row */}
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
    );
}
