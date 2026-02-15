"use client";

import React, { useState } from 'react';
import { useSocialStore, Status, ConsumableItem, HIGHLIGHT_COLOR, getCategoryConfig } from '@/lib/social-prototype/store';
import { ConsumableModal } from './ConsumableModal';

export function Feed() {
    const { statuses, activeDate } = useSocialStore();
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);

    // Filter out the currently active date
    const history = statuses.filter(s => s.date !== activeDate);

    // Render content with highlighted items
    const renderContent = (status: Status) => {
        if (!status.content) return null;

        let html = status.content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>');

        status.items.forEach(item => {
            if (!item.title) return;
            const config = getCategoryConfig(item.category);
            const color = config?.color || HIGHLIGHT_COLOR;
            const regex = new RegExp(`(${item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            html = html.replace(
                regex,
                `<mark style="background-color: ${color}; padding: 0 1px;">$1</mark>`
            );
        });

        return (
            <p
                className="text-neutral-800 text-sm leading-relaxed whitespace-pre-wrap font-mono"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        );
    };

    return (
        <div className="font-mono">
            {/* Header */}
            <div className="border-b border-neutral-300 pb-2 mb-6">
                <h2 className="text-xs uppercase tracking-widest text-neutral-500">
                    Previous Entries
                </h2>
            </div>

            {/* History */}
            <div className="space-y-8">
                {history.length === 0 && (
                    <div className="text-center py-8 text-neutral-400 text-xs uppercase tracking-widest">
                        No previous entries.
                    </div>
                )}

                {history.map(status => (
                    <div key={status.id} className="border border-neutral-200 bg-white p-4">
                        {/* Date Header */}
                        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-3 pb-2 border-b border-neutral-100">
                            {new Date(status.date).toLocaleDateString(undefined, {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                timeZone: 'UTC'
                            })}
                        </div>

                        {/* Content */}
                        {renderContent(status)}

                        {/* Items Table */}
                        {status.items.length > 0 && (
                            <div className="mt-4 border border-neutral-200">
                                <table className="w-full text-xs border-collapse">
                                    <thead className="bg-neutral-50 text-neutral-500 uppercase">
                                        <tr>
                                            <th className="px-2 py-1 text-left border-b border-r border-neutral-200 w-12">Type</th>
                                            <th className="px-2 py-1 text-left border-b border-r border-neutral-200">Title</th>
                                            <th className="px-2 py-1 text-center border-b border-neutral-200 w-12">Rate</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {status.items.map(item => {
                                            const config = getCategoryConfig(item.category);
                                            if (!config) return null;
                                            return (
                                                <tr
                                                    key={item.id}
                                                    className="hover:bg-neutral-50 cursor-pointer"
                                                    onClick={() => setSelectedItem(item)}
                                                >
                                                    <td className="px-2 py-1 border-b border-r border-neutral-100 text-neutral-400">
                                                        {config.shortLabel}
                                                    </td>
                                                    <td className="px-2 py-1 border-b border-r border-neutral-100">
                                                        {item.title}
                                                    </td>
                                                    <td className="px-2 py-1 border-b border-neutral-100 text-center">
                                                        {item.rating || '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <ConsumableModal
                key={`${selectedItem?.id ?? 'none'}-${selectedItem?.category ?? 'movie'}`}
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                existingItem={selectedItem || undefined}
            />
        </div>
    );
}
