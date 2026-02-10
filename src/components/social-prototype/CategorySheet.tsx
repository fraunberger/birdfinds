"use client";

import React, { useState } from 'react';
import { Category, CATEGORY_CONFIGS, ConsumableItem } from '@/lib/social-prototype/store';
import { ConsumableModal } from './ConsumableModal';

interface CategorySheetProps {
    category: Category;
    items: ConsumableItem[];
    onClose: () => void;
}

type SortMode = 'latest' | 'top';

export function CategorySheet({ category, items, onClose }: CategorySheetProps) {
    const config = CATEGORY_CONFIGS[category];
    const [sortMode, setSortMode] = useState<SortMode>('latest');
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);

    if (!config) return null;

    const sortedItems = sortMode === 'top'
        ? [...items]
            .filter(i => i.rating && i.rating > 0)
            .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        : [...items].sort((a, b) => b.createdAt - a.createdAt);

    return (
        <div className="font-mono animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b border-neutral-300 pb-3">
                <div className="flex items-center gap-2">
                    <span className="text-base">{config.icon}</span>
                    <h3 className="text-xs font-bold uppercase tracking-widest">{config.label}</h3>
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
                        {items.length} {items.length === 1 ? 'entry' : 'entries'}
                    </span>
                </div>
                <div className="flex items-center gap-2">
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
                            <div className="flex items-start gap-2.5 px-3 py-2 border border-neutral-200 hover:border-neutral-400 transition-colors bg-white">
                                {/* Rank number for top mode */}
                                {sortMode === 'top' && (
                                    <span className="text-[10px] text-neutral-400 font-bold mt-0.5 w-4 flex-shrink-0">
                                        {idx + 1}
                                    </span>
                                )}

                                {/* Main info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xs font-bold truncate">{item.title}</span>
                                        {item.subtitle && (
                                            <span className="text-[10px] text-neutral-400 truncate flex-shrink-0">
                                                {item.subtitle.split('\n')[0]}
                                            </span>
                                        )}
                                    </div>
                                    {item.notes && (
                                        <div className="text-[10px] text-neutral-400 mt-0.5 line-clamp-1">
                                            {item.notes.split('\n')[0]}
                                        </div>
                                    )}
                                </div>

                                {/* Rating */}
                                {item.rating && item.rating > 0 && (
                                    <div className="flex-shrink-0 text-[10px] font-bold text-neutral-700 bg-neutral-100 px-1.5 py-0.5 rounded-sm">
                                        {item.rating}
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
                    isOpen={true}
                    initialCategory={selectedItem.category}
                    existingItem={selectedItem}
                    readOnly
                    onClose={() => setSelectedItem(null)}
                    onSave={() => { }}
                />
            )}
        </div>
    );
}
