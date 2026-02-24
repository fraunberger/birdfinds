"use client";

import React, { useState } from 'react';
import { Category, ConsumableItem, getCategoryConfig } from '@/lib/social-prototype/store';
import { getCanonicalItemKey, getRepeatTagVerb } from '@/lib/social-prototype/items';
import { ConsumableModal } from './ConsumableModal';

interface CategorySheetProps {
    category: Category;
    items: ConsumableItem[];
    onClose: () => void;
    canAddItem?: boolean;
    onAddItem?: (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => Promise<void>;
}

type SortMode = 'latest' | 'top';

interface AggregatedItem {
    key: string;
    latest: ConsumableItem;
    count: number;
}

const isEpisodeCategory = (category: Category) => category === 'tv' || category === 'podcast';

const getEpisodeSeriesLabel = (category: Category, item: ConsumableItem) => {
    if (category === 'tv') return item.title.trim();
    if (category === 'podcast') return (item.subtitle || '').trim();
    return '';
};

export function CategorySheet({ category, items, onClose, canAddItem = false, onAddItem }: CategorySheetProps) {
    const config = getCategoryConfig(category);
    const [sortMode, setSortMode] = useState<SortMode>('latest');
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [episodeSeriesFilter, setEpisodeSeriesFilter] = useState<string>('all');
    const [episodeTextFilter, setEpisodeTextFilter] = useState('');

    if (!config) return null;

    // Aggregate items by canonical key (keep latest row + total times tagged).
    const aggregatedItems = (() => {
        const map = new Map<string, AggregatedItem>();
        for (const item of items) {
            const key = getCanonicalItemKey(item);
            const existing = map.get(key);
            if (!existing) {
                map.set(key, { key, latest: item, count: 1 });
                continue;
            }
            existing.count += 1;
            if (item.createdAt > existing.latest.createdAt) {
                existing.latest = item;
            }
        }
        return Array.from(map.values());
    })();

    const totalTaggedCount = items.length;
    const repeatVerb = getRepeatTagVerb(category);
    const episodeFilteringEnabled = isEpisodeCategory(category);

    const episodeSeriesOptions = (() => {
        if (!episodeFilteringEnabled) return [] as string[];
        const names = new Set<string>();
        for (const entry of aggregatedItems) {
            const label = getEpisodeSeriesLabel(category, entry.latest);
            if (label) names.add(label);
        }
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    })();

    const filteredItems = (() => {
        if (!episodeFilteringEnabled) return aggregatedItems;
        const query = episodeTextFilter.trim().toLowerCase();
        return aggregatedItems.filter((entry) => {
            const series = getEpisodeSeriesLabel(category, entry.latest);
            if (episodeSeriesFilter !== 'all' && series !== episodeSeriesFilter) return false;
            if (!query) return true;
            const haystack = `${entry.latest.title} ${entry.latest.subtitle || ''} ${entry.latest.notes || ''}`.toLowerCase();
            return haystack.includes(query);
        });
    })();

    const sortedItems = sortMode === 'top'
        ? [...filteredItems]
            .filter((entry) => entry.latest.rating && entry.latest.rating > 0)
            .sort((a, b) => (b.latest.rating || 0) - (a.latest.rating || 0))
        : [...filteredItems].sort((a, b) => b.latest.createdAt - a.latest.createdAt);

    return (
        <div className="font-mono animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b border-neutral-300 pb-3">
                <div className="flex items-center gap-2">
                    <span className="text-base">{config.icon}</span>
                    <h3 className="text-xs font-bold uppercase tracking-widest">{config.label}</h3>
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
                        {aggregatedItems.length} {aggregatedItems.length === 1 ? 'entry' : 'entries'} • {totalTaggedCount} total tags
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

            {episodeFilteringEnabled && (
                <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                        value={episodeSeriesFilter}
                        onChange={(e) => setEpisodeSeriesFilter(e.target.value)}
                        className="w-full text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 bg-white text-neutral-600"
                    >
                        <option value="all">All Series</option>
                        {episodeSeriesOptions.map((series) => (
                            <option key={series} value={series}>
                                {series}
                            </option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={episodeTextFilter}
                        onChange={(e) => setEpisodeTextFilter(e.target.value)}
                        placeholder={category === 'tv' ? 'Filter episodes...' : 'Filter podcast episodes...'}
                        className="w-full text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 bg-white text-neutral-700 placeholder:text-neutral-400"
                    />
                </div>
            )}

            {/* Items */}
            {sortedItems.length === 0 ? (
                <div className="text-xs text-neutral-400 py-6 text-center uppercase tracking-widest">
                    {sortMode === 'top' ? 'No rated entries yet.' : 'No entries yet.'}
                </div>
            ) : (
                <div className="space-y-1.5">
                    {sortedItems.map((entry, idx) => (
                        <button
                            key={entry.key}
                            onClick={() => setSelectedItem(entry.latest)}
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
                                    <div className="text-xs font-bold">{entry.latest.title}</div>
                                    {entry.count > 1 && (
                                        <div className="text-[10px] uppercase tracking-widest text-neutral-500 mt-0.5">
                                            {repeatVerb} {entry.count} times
                                        </div>
                                    )}
                                    {entry.latest.subtitle && (
                                        <div className="text-[11px] text-neutral-600 mt-0.5">
                                            {entry.latest.subtitle.split('\n')[0]}
                                        </div>
                                    )}
                                    {entry.latest.notes && (
                                        <div className="text-[10px] text-neutral-500 mt-1 whitespace-pre-wrap leading-relaxed">
                                            {entry.latest.notes}
                                        </div>
                                    )}
                                </div>

                                {/* Rating /10 — prominent on the right */}
                                {entry.latest.rating && entry.latest.rating > 0 && (
                                    <div className="flex-shrink-0 text-right">
                                        <span className="text-sm font-bold text-neutral-800">{entry.latest.rating}</span>
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
