"use client";

import React from 'react';
import { Category, CATEGORY_CONFIGS, ConsumableItem } from '@/lib/social-prototype/store';

interface CategorySheetProps {
    category: Category;
    items: ConsumableItem[];
    onClose: () => void;
}

export function CategorySheet({ category, items, onClose }: CategorySheetProps) {
    const config = CATEGORY_CONFIGS[category];
    if (!config) return null;

    // Latest items (by createdAt descending)
    const latest = [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);

    // Top ranked items (by rating descending, only those with ratings)
    const topRanked = [...items]
        .filter(i => i.rating && i.rating > 0)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 20);

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
                <button
                    onClick={onClose}
                    className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
                >
                    ✕
                </button>
            </div>

            {/* Latest */}
            <div className="mb-6">
                <h4 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
                    Latest
                </h4>
                {latest.length === 0 ? (
                    <div className="text-xs text-neutral-400 py-3">No entries yet.</div>
                ) : (
                    <div className="border border-neutral-200">
                        <table className="w-full text-xs border-collapse">
                            <thead className="bg-neutral-50 text-neutral-500 uppercase text-[10px]">
                                <tr>
                                    <th className="px-2 py-1.5 text-left border-b border-r border-neutral-200">Title</th>
                                    <th className="px-2 py-1.5 text-left border-b border-r border-neutral-200 w-28">{config.subtitleLabel || 'Details'}</th>
                                    <th className="px-2 py-1.5 text-center border-b border-neutral-200 w-10">★</th>
                                </tr>
                            </thead>
                            <tbody>
                                {latest.map((item) => (
                                    <tr key={item.id} className="hover:bg-neutral-50">
                                        <td className="px-2 py-1.5 border-b border-r border-neutral-200 font-medium">{item.title}</td>
                                        <td className="px-2 py-1.5 border-b border-r border-neutral-200 text-neutral-500 truncate">{item.subtitle || '—'}</td>
                                        <td className="px-2 py-1.5 border-b border-neutral-200 text-center">{item.rating || ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Top Ranked */}
            {topRanked.length > 0 && (
                <div className="mb-6">
                    <h4 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
                        Top Ranked
                    </h4>
                    <div className="border border-neutral-200">
                        <table className="w-full text-xs border-collapse">
                            <thead className="bg-neutral-50 text-neutral-500 uppercase text-[10px]">
                                <tr>
                                    <th className="px-2 py-1.5 text-left border-b border-r border-neutral-200 w-6">#</th>
                                    <th className="px-2 py-1.5 text-left border-b border-r border-neutral-200">Title</th>
                                    <th className="px-2 py-1.5 text-center border-b border-neutral-200 w-10">★</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topRanked.map((item, idx) => (
                                    <tr key={item.id} className="hover:bg-neutral-50">
                                        <td className="px-2 py-1.5 border-b border-r border-neutral-200 text-neutral-400">{idx + 1}</td>
                                        <td className="px-2 py-1.5 border-b border-r border-neutral-200 font-medium">{item.title}</td>
                                        <td className="px-2 py-1.5 border-b border-neutral-200 text-center font-bold">{item.rating}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
