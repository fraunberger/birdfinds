"use client";

import React, { useState } from 'react';
import { Category, ConsumableItem, getCategoryConfig } from '@/lib/social-prototype/store';
import { getCanonicalItemKey } from '@/lib/social-prototype/items';
import { ConsumableModal } from './ConsumableModal';

interface CategorySheetProps {
    category: Category;
    items: ConsumableItem[];
    onClose: () => void;
    canAddItem?: boolean;
    onAddItem?: (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => Promise<void>;
}

type SortMode = 'latest' | 'top';

export function CategorySheet({ category, items, onClose, canAddItem = false, onAddItem }: CategorySheetProps) {
    const config = getCategoryConfig(category);
    const [sortMode, setSortMode] = useState<SortMode>('latest');
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);

    if (!config) return null;

    // Deduplicate items by canonical key, keeping the most recently created version
    const deduped = (() => {
        const map = new Map<string, ConsumableItem>();
        for (const item of items) {
            const key = getCanonicalItemKey(item);
            const existing = map.get(key);
            if (!existing || item.createdAt > existing.createdAt) {
                map.set(key, item);
            }
        }
        return Array.from(map.values());
    })();

    const sortedItems = sortMode === 'top'
        ? [...deduped]
            .filter(i => i.rating && i.rating > 0)
            .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        : [...deduped].sort((a, b) => b.createdAt - a.createdAt);

    return (
        <div className="font-mono animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b border-neutral-300 pb-3">
                <div className="flex items-center gap-2">
                    <span className="text-base">{config.icon}</span>
                    <h3 className="text-xs font-bold uppercase tracking-widest">{config.label}</h3>
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
                        {deduped.length} {deduped.length === 1 ? 'entry' : 'entries'}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {canAddItem && (
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-0.5 text-neutral-600 hover:text-neutral-800 hover:border-neutral-500"
                        >
                            Add Find
                        </button>
                    )}
                    {/* Sort Toggle */}
                    <div className="flex text-[10px] border border-neutral-300">
                        <button
                            onClick={() => setSortMode('latest')}
                            className={`px-2 py-0.5 uppercase tracking-wider transition-colors ${sortMode === 'latest'
                                ? 'bg-neutral-800 text-white'
                                : 'text-neutral-500 hover:bg-neutral-100'
                                }`}
                        >
                            Latest
                        </button>
                        <button
                            onClick={() => setSortMode('top')}
                            className={`px-2 py-0.5 uppercase tracking-wider transition-colors border-l border-neutral-300 ${sortMode === 'top'
                                ? 'bg-neutral-800 text-white'
                                : 'text-neutral-500 hover:bg-neutral-100'
                                }`}
                        >
                            Top
                        </button>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-800 ml-1"
                    >
                        x
                    </button>
                </div>
            </div>

            {/* Items */}
            {sortedItems.length === 0 ? (
                <div className="text-xs text-neutral-400 py-6 text-center uppercase tracking-widest">
                    {sortMode === 'top' ? 'No rated entries yet.' : 'No entries yet.'}
                </div>
            ) : (
                <div className="space-y-1.5">
                    {sortedItems.map((item, idx) => (
                        <button
                            key={item.id}
                            onClick={() => setSelectedItem(item)}
                            className="w-full text-left group"
                        >
                            <div className="flex items-start gap-2.5 px-3 py-2.5 border border-neutral-200 hover:border-neutral-400 transition-colors bg-white">
                                {/* Rank number for top mode */}
                                {sortMode === 'top' && (
                                    <span className="text-[10px] text-neutral-400 font-bold mt-0.5 w-4 flex-shrink-0">
                                        {idx + 1}
                                    </span>
                                )}

                                {/* Main info */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold">{item.title}</div>
                                    {item.subtitle && (
                                        <div className="text-[11px] text-neutral-600 mt-0.5">
                                            {item.subtitle.split('\n')[0]}
                                        </div>
                                    )}
                                    {item.notes && (
                                        <div className="text-[10px] text-neutral-500 mt-1 whitespace-pre-wrap leading-relaxed">
                                            {item.notes}
                                        </div>
                                    )}
                                </div>

                                {/* Rating /10 — prominent on the right */}
                                {item.rating && item.rating > 0 && (
                                    <div className="flex-shrink-0 text-right">
                                        <span className="text-sm font-bold text-neutral-800">{item.rating}</span>
                                        <span className="text-[9px] text-neutral-400">/10</span>
                                    </div>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Item detail modal */}
            {selectedItem && (
                <ConsumableModal
                    key={selectedItem.id}
                    isOpen={true}
                    initialCategory={selectedItem.category}
                    existingItem={selectedItem}
                    readOnly
                    onClose={() => setSelectedItem(null)}
                    onSave={() => { }}
                />
            )}

            {showAddModal && (
                <ConsumableModal
                    key={`new-${category}`}
                    isOpen={showAddModal}
                    initialCategory={category}
                    onClose={() => setShowAddModal(false)}
                    onSave={async (item) => {
                        if (onAddItem) {
                            await onAddItem(item);
                        }
                        setShowAddModal(false);
                    }}
                />
            )}
        </div>
    );
}
