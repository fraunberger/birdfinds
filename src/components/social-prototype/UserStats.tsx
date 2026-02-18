"use client";

import React, { useState } from 'react';
import { useSocialStore, Category, CATEGORY_CONFIGS, ConsumableItem, getCategoryConfig } from '@/lib/social-prototype/store';
import { ConsumableModal } from './ConsumableModal';

export function UserStats() {
    const { isLoaded, getAllItemsByCategory, removeItemFromActive, addItemToActive } = useSocialStore();
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [sortBy, setSortBy] = useState<'date' | 'rank'>('date');

    if (!isLoaded) {
        return (
            <div className="flex items-center justify-center py-12 font-mono">
                <div className="text-neutral-400 text-xs uppercase tracking-widest">
                    Loading...
                </div>
            </div>
        );
    }

    // Items by category
    const itemsByCategory = (Object.keys(CATEGORY_CONFIGS) as Category[]).map(cat => {
        const items = getAllItemsByCategory(cat).sort((a, b) => {
            if (sortBy === 'date') return b.createdAt - a.createdAt;
            if (sortBy === 'rank') return (b.rating || 0) - (a.rating || 0);
            return 0;
        });

        return {
            category: cat,
            config: getCategoryConfig(cat),
            count: items.length,
            items: items,
        };
    }).filter(c => c.count > 0);
    // We can sort categories themselves if needed, but keeping fixed order is often better for profiles unless requested.

    const totalItems = itemsByCategory.reduce((sum, c) => sum + c.count, 0);

    const handleItemClick = (item: ConsumableItem) => {
        setSelectedItem(item);
        setSelectedCategory(item.category);
    };

    const handleCloseModal = () => {
        setSelectedItem(null);
        setSelectedCategory(null);
    };

    return (
        <div className="font-mono">
            {/* Header */}
            <div className="border-b border-neutral-300 pb-3 mb-6 flex justify-between items-end">
                <div>
                    <h2 className="text-xl font-bold uppercase tracking-tight">User Profile</h2>
                    <p className="text-xs text-neutral-500 uppercase tracking-widest mt-1">
                        {totalItems} TOTAL {totalItems === 1 ? 'ENTRY' : 'ENTRIES'}
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

            {/* Items by Category */}
            {itemsByCategory.map(({ category, config, items }) => (
                <div key={category} className="mb-8">
                    <div className="text-xs uppercase tracking-widest text-neutral-500 mb-3 border-b border-neutral-200 pb-1 flex justify-between">
                        <span>{config.label}</span>
                        <span>{items.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {items.map(item => (
                            <button
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                className="text-xs text-left px-2 py-1 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 hover:border-neutral-400 cursor-pointer transition-colors"
                            >
                                <span className="font-medium">{item.title}</span>
                                {item.rating && (
                                    <span className="ml-2 text-neutral-400">[{item.rating}]</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            ))}

            {itemsByCategory.length === 0 && (
                <div className="text-center py-12 text-neutral-400 text-xs uppercase tracking-widest border border-dashed border-neutral-300">
                    No entries logged.
                </div>
            )}

            {/* Item Modal */}
            {selectedItem && selectedCategory && (
                <ConsumableModal
                    key={`${selectedItem.id}-${selectedCategory}`}
                    initialCategory={selectedCategory}
                    isOpen={true}
                    onClose={handleCloseModal}
                    onSave={async (item) => {
                        await removeItemFromActive(selectedItem.id);
                        await addItemToActive(item);
                        handleCloseModal();
                    }}
                    onDelete={async () => {
                        await removeItemFromActive(selectedItem.id);
                        handleCloseModal();
                    }}
                    existingItem={selectedItem}
                />
            )}
        </div>
    );
}
