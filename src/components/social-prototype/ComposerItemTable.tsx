"use client";

import React, { useState, useMemo } from 'react';
import { Category, ConsumableItem, getCategoryConfig, CategoryConfig } from '@/lib/social-prototype/store';
import { pushToast } from '@/lib/social-prototype/toast';
import { getItemHighlightTerms } from './useTaggingState';

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

/** Find the earliest position of any of the item's highlight terms in the content. */
const getFirstPosition = (item: ConsumableItem, lowerContent: string): number => {
    const terms = getItemHighlightTerms(item);
    let earliest = Infinity;
    for (const term of terms) {
        const pos = lowerContent.indexOf(term.toLowerCase());
        if (pos >= 0 && pos < earliest) earliest = pos;
    }
    return earliest;
};

interface ComposerItemTableProps {
    /** Items attached to the active status. */
    items: ConsumableItem[];
    /** The current post content text — used to order items by text position. */
    content: string;
    /** Whether we're in mobile tagging mode (hides "link" button). */
    isMobileTagging: boolean;
    /** Currently selected text in the textarea — used for link tooltip. */
    selectedPlainText: string;
    /** Active category configurations for the quick-add dropdown. */
    activeCategoryConfigs: CategoryConfig[];
    /** Optional helper message that indicates linking is currently available. */
    linkHint?: string | null;
    /** Open the ConsumableModal for an item. */
    onOpenItem: (item: ConsumableItem) => void;
    /** Link an existing item into the post text. */
    onLinkItem: (item: ConsumableItem) => Promise<void>;
    /** Whether table row taps should link instead of opening modal. */
    isLinkingMode?: boolean;
    /** Remove an item from the post. */
    onRemoveItem: (itemId: string) => void;
    /** Add a new quick-add item. */
    onAddItem: (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => Promise<void>;
}

export function ComposerItemTable({
    items,
    content,
    isMobileTagging,
    selectedPlainText,
    activeCategoryConfigs,
    linkHint,
    onOpenItem,
    onLinkItem,
    isLinkingMode = false,
    onRemoveItem,
    onAddItem,
}: ComposerItemTableProps) {
    const [quickAddTitle, setQuickAddTitle] = useState('');
    const [quickAddCategory, setQuickAddCategory] = useState<Category>(activeCategoryConfigs[0]?.id as Category || 'movie');
    const [isQuickAdding, setIsQuickAdding] = useState(false);

    // Sort items by first occurrence position in the post text
    const sortedItems = useMemo(() => {
        if (!content) return items;
        const lowerContent = content.toLowerCase();
        return [...items].sort((a, b) => {
            const posA = getFirstPosition(a, lowerContent);
            const posB = getFirstPosition(b, lowerContent);
            return posA - posB;
        });
    }, [items, content]);

    const effectiveQuickAddCategory = activeCategoryConfigs.some(c => c.id === quickAddCategory)
        ? quickAddCategory
        : (activeCategoryConfigs[0]?.id as Category ?? 'movie');
    const canLinkFromTable = isLinkingMode || selectedPlainText.trim().length > 0;

    const handleQuickAddRow = async () => {
        if (!quickAddTitle.trim() || isQuickAdding) return;
        try {
            setIsQuickAdding(true);
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
        } finally {
            setIsQuickAdding(false);
        }
    };

    return (
        <div className={`border bg-white overflow-x-auto transition-colors ${linkHint ? 'border-green-500 ring-1 ring-green-200' : 'border-neutral-300'}`}>
            {linkHint && (
                <div className="px-2 py-1 border-b border-green-200 bg-green-50 text-[10px] uppercase tracking-widest text-green-800">
                    {linkHint}
                </div>
            )}
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
                    {sortedItems.map((item) => {
                        const config = getCategoryConfig(item.category);
                        return (
                            <tr
                                key={item.id}
                                className="hover:bg-neutral-50 cursor-pointer active:bg-neutral-100"
                                onClick={async () => {
                                    if (isLinkingMode) {
                                        try { await onLinkItem(item); }
                                        catch (error: unknown) { pushToast({ message: `Failed to link item: ${getErrorMessage(error)}`, tone: 'error' }); }
                                        return;
                                    }
                                    onOpenItem(item);
                                }}
                            >
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
                                    {!isMobileTagging && canLinkFromTable && (
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
                                disabled={!quickAddTitle.trim() || isQuickAdding}
                                className="text-neutral-400 hover:text-neutral-600 disabled:opacity-30 p-1 w-full h-full flex items-center justify-center"
                            >
                                {isQuickAdding ? '…' : '+'}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
