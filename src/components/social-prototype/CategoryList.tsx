"use client";

import React, { useState } from 'react';
import { useSocialStore, Category, ConsumableItem, getCategoryConfig } from '@/lib/social-prototype/store';
import { ConsumableModal } from './ConsumableModal';

interface CategoryListProps {
    category: Category;
    title: string;
}

export function CategoryList({ category, title }: CategoryListProps) {
    const { getAllItemsByCategory, addItemToActive, removeItemFromActive } = useSocialStore();
    const items = getAllItemsByCategory(category);
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);
    const [sortBy, setSortBy] = useState<'date' | 'rank'>('date');

    // Sort items based on selection
    const sortedItems = [...items].sort((a, b) => {
        if (sortBy === 'rank') {
            if ((b.rating || 0) !== (a.rating || 0)) {
                return (b.rating || 0) - (a.rating || 0);
            }
        }
        return b.createdAt - a.createdAt;
    });

    const config = getCategoryConfig(category);

    return (
        <div className="font-mono">
            {/* Header */}
            <div className="border-b border-neutral-300 pb-3 mb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-xl font-bold uppercase tracking-tight">{title}</h2>
                    <p className="text-xs text-neutral-500 uppercase tracking-widest mt-1">
                        {items.length} {items.length === 1 ? 'ENTRY' : 'ENTRIES'} LOGGED
                    </p>
                </div>
                {/* Sort Controls */}
                <div className="flex text-xs space-x-4">
                    <button
                        onClick={() => setSortBy('date')}
                        className={`uppercase tracking-wider hover:text-black ${sortBy === 'date' ? 'text-black font-bold border-b border-black' : 'text-neutral-400'}`}
                    >
                        Date
                    </button>
                    <button
                        onClick={() => setSortBy('rank')}
                        className={`uppercase tracking-wider hover:text-black ${sortBy === 'rank' ? 'text-black font-bold border-b border-black' : 'text-neutral-400'}`}
                    >
                        Rank
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="border border-neutral-300 bg-white">
                <table className="w-full text-sm border-collapse">
                    <thead className="bg-neutral-100 text-neutral-600 uppercase text-xs">
                        <tr>
                            <th className="px-3 py-2 text-left border-b border-r border-neutral-300 w-8">#</th>
                            <th className="px-3 py-2 text-left border-b border-r border-neutral-300">Title</th>
                            <th className="px-3 py-2 text-left border-b border-r border-neutral-300 w-40">{config?.subtitleLabel || 'Details'}</th>
                            <th className="px-3 py-2 text-center border-b border-neutral-300 w-16">Rating</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedItems.map((item, index) => (
                            <tr
                                key={item.id}
                                className="hover:bg-neutral-50 cursor-pointer"
                                onClick={() => setSelectedItem(item)}
                            >
                                <td className="px-3 py-2 border-b border-r border-neutral-200 text-neutral-400 text-xs">
                                    {index + 1}
                                </td>
                                <td className="px-3 py-2 border-b border-r border-neutral-200">
                                    <div className="font-medium">{item.title}</div>
                                    {item.notes && (
                                        <div className="text-xs text-neutral-500 mt-1 italic truncate max-w-md">
                                            &quot;{item.notes}&quot;
                                        </div>
                                    )}
                                </td>
                                <td className="px-3 py-2 border-b border-r border-neutral-200 text-neutral-500">
                                    {item.subtitle || '—'}
                                </td>
                                <td className="px-3 py-2 border-b border-neutral-200 text-center font-medium">
                                    {item.rating || '—'}
                                </td>
                            </tr>
                        ))}

                        {items.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-3 py-8 text-center text-neutral-400 text-xs uppercase tracking-widest">
                                    No entries logged.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <ConsumableModal
                key={`${selectedItem?.id ?? 'new'}-${category}`}
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                existingItem={selectedItem || undefined}
                onSave={async (item) => {
                    if (selectedItem) {
                        await removeItemFromActive(selectedItem.id);
                    }
                    await addItemToActive(item);
                    setSelectedItem(null);
                }}
                onDelete={async () => {
                    if (selectedItem) await removeItemFromActive(selectedItem.id);
                    setSelectedItem(null);
                }}
                initialCategory={category}
            />
        </div>
    );
}
