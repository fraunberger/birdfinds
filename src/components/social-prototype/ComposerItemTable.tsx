"use client";

import React, { useState, useMemo, useRef } from 'react';
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
    /** Open the ConsumableModal for an item. */
    onOpenItem: (item: ConsumableItem) => void;
    /** Link an existing item into the post text. */
    onLinkItem: (item: ConsumableItem) => Promise<void>;
    /** Whether table row taps should link instead of opening modal. */
    isLinkingMode?: boolean;
    /** Remove an item from the post. */
    onRemoveItem: (itemId: string) => Promise<void> | void;
    /** Add a new quick-add item. */
    onAddItem: (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => Promise<void>;
}

export function ComposerItemTable({
    items,
    content,
    isMobileTagging,
    selectedPlainText,
    activeCategoryConfigs,
    onOpenItem,
    onLinkItem,
    isLinkingMode = false,
    onRemoveItem,
    onAddItem,
}: ComposerItemTableProps) {
    const isInteractiveTarget = (target: EventTarget | null) => {
        if (!(target instanceof Element)) return false;
        return Boolean(target.closest('button, input, select, textarea, a, [role="button"]'));
    };

    const lastRowActionRef = useRef<{ itemId: string; at: number } | null>(null);
    const removingItemIdsRef = useRef<Set<string>>(new Set());
    const [quickAddTitle, setQuickAddTitle] = useState('');
    const [quickAddCategory, setQuickAddCategory] = useState<Category>(activeCategoryConfigs[0]?.id as Category || 'movie');
    const [isQuickAdding, setIsQuickAdding] = useState(false);
    const [removingItemIds, setRemovingItemIds] = useState<Set<string>>(new Set());

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

    const handleRowAction = async (item: ConsumableItem) => {
        const now = Date.now();
        const recent = lastRowActionRef.current;
        if (recent && recent.itemId === item.id && now - recent.at < 450) return;
        lastRowActionRef.current = { itemId: item.id, at: now };

        if (isLinkingMode) {
            try { await onLinkItem(item); }
            catch (error: unknown) { pushToast({ message: `Failed to link item: ${getErrorMessage(error)}`, tone: 'error' }); }
            return;
        }
        onOpenItem(item);
    };

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

    const handleRemoveItem = async (
        e: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>,
        itemId: string,
    ) => {
        e.preventDefault();
        e.stopPropagation();
        if (removingItemIdsRef.current.has(itemId)) return;
        removingItemIdsRef.current.add(itemId);
        setRemovingItemIds((prev) => new Set(prev).add(itemId));
        try {
            await Promise.resolve(onRemoveItem(itemId));
        } catch (error: unknown) {
            pushToast({ message: `Failed to remove item: ${getErrorMessage(error)}`, tone: 'error' });
        } finally {
            removingItemIdsRef.current.delete(itemId);
            setRemovingItemIds((prev) => {
                const next = new Set(prev);
                next.delete(itemId);
                return next;
            });
        }
    };

    return (
        <div className={`border bg-white overflow-x-auto transition-colors ${isLinkingMode ? 'border-amber-500 shadow-[0_0_0_1px_rgba(245,158,11,0.35)]' : 'border-neutral-300'}`}>
            {isLinkingMode && (
                <div className="px-2 py-1 border-b border-amber-300 bg-amber-50 text-[10px] font-bold uppercase tracking-widest text-amber-800">
                    Link mode active — tap any row to link
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
                        const isRemoving = removingItemIds.has(item.id);
                        return (
                            <tr
                                key={item.id}
                                className={`cursor-pointer active:bg-neutral-100 touch-manipulation ${isLinkingMode ? 'bg-amber-50/40 hover:bg-amber-100/60' : 'hover:bg-neutral-50'}`}
                                onPointerUp={async (e) => {
                                    if (isInteractiveTarget(e.target)) return;
                                    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                                        await handleRowAction(item);
                                    }
                                }}
                                onClick={async (e) => {
                                    if (isInteractiveTarget(e.target)) return;
                                    await handleRowAction(item);
                                }}
                            >
                                <td className="px-2 py-1 border-b border-r border-neutral-200 text-[10px] font-bold" style={{ backgroundColor: config.color || undefined }}>
                                    {config.shortLabel}
                                </td>
                                <td className="px-2 py-1 border-b border-r border-neutral-200 font-medium">
                                    {item.title}
                                    {item.subtitle && <span className="text-neutral-400 ml-1 font-normal">— {item.subtitle}</span>}
                                    {isLinkingMode && (
                                        <span className="ml-2 inline-block text-[9px] uppercase tracking-widest text-amber-700">tap to link</span>
                                    )}
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
                                        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                        onPointerUp={(e) => void handleRemoveItem(e, item.id)}
                                        onClick={(e) => void handleRemoveItem(e, item.id)}
                                        disabled={isRemoving}
                                        aria-label={`Delete ${item.title}`}
                                        title={`Delete ${item.title}`}
                                        className="text-neutral-400 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 text-[12px] leading-none"
                                    >
                                        {isRemoving ? '…' : '×'}
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
