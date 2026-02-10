"use client";

import React, { useState } from 'react';
import { Status, CATEGORY_CONFIGS, HIGHLIGHT_COLOR, UserProfile, ConsumableItem } from '@/lib/social-prototype/store';
import { HabitChecklist } from './HabitChecklist';
import { ConsumableModal } from './ConsumableModal';

interface StatusCardProps {
    status: Status;
    profile?: UserProfile | null;
    onClickProfile?: (userId: string) => void;
    isOwn?: boolean;
}

export function StatusCard({ status, profile, onClickProfile, isOwn = false }: StatusCardProps) {
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);

    // Render content with highlighted items
    const renderContent = () => {
        if (!status.content) return null;

        let html = status.content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>');

        status.items.forEach(item => {
            if (!item.title) return;
            const config = CATEGORY_CONFIGS[item.category];
            const color = config?.color || HIGHLIGHT_COLOR;
            const regex = new RegExp(`(${item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            html = html.replace(
                regex,
                `<mark style="background-color: ${color}; padding: 0 1px;">$1</mark>`
            );
        });

        return (
            <p
                className="text-neutral-800 text-xs leading-relaxed whitespace-pre-wrap font-mono"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        );
    };

    return (
        <div className="border border-neutral-200 bg-white px-3 py-2.5 font-mono">
            {/* Header: Avatar + Username + Date — compact single line */}
            <div className="flex items-center gap-2 mb-2">
                {profile && (
                    <button
                        onClick={() => status.userId && onClickProfile?.(status.userId)}
                        className="flex items-center gap-1.5 hover:opacity-70 transition-opacity min-w-0"
                    >
                        <div className="w-5 h-5 rounded-full bg-neutral-200 overflow-hidden flex-shrink-0">
                            {profile.avatarUrl ? (
                                <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-neutral-400 text-[8px] font-bold">
                                    {profile.username?.[0]?.toUpperCase() || '?'}
                                </div>
                            )}
                        </div>
                        <span className="text-[11px] font-bold text-neutral-700 truncate">
                            {profile.username}
                        </span>
                    </button>
                )}
                <span className="text-[10px] text-neutral-400 ml-auto flex-shrink-0">
                    {new Date(status.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        timeZone: 'UTC'
                    })}
                </span>
            </div>

            {/* Body: two-column — content left, habits right */}
            <div className="flex gap-2">
                {/* Left: content + items */}
                <div className="flex-1 min-w-0">
                    {renderContent()}

                    {/* Items as clickable colored boxes */}
                    {status.items.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-neutral-100">
                            {status.items.map(item => {
                                const config = CATEGORY_CONFIGS[item.category];
                                if (!config) return null;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setSelectedItem(item)}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] border cursor-pointer hover:opacity-80 transition-opacity"
                                        style={{
                                            backgroundColor: config.color ? `${config.color}33` : '#f5f5f5',
                                            borderColor: config.color || '#e5e5e5',
                                        }}
                                    >
                                        <span className="font-medium text-neutral-800">{item.title}</span>
                                        {item.rating && (
                                            <span className="text-neutral-500 font-mono">[{item.rating}]</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right: habits column */}
                {status.userId && (
                    <div className="flex-shrink-0 border-l border-neutral-100 pl-1.5">
                        <HabitChecklist
                            date={status.date}
                            readOnly={!isOwn}
                            userId={isOwn ? undefined : status.userId}
                            vertical
                        />
                    </div>
                )}
            </div>

            {/* Item detail modal */}
            <ConsumableModal
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                existingItem={selectedItem || undefined}
                initialCategory={selectedItem?.category || 'movie'}
            />
        </div>
    );
}
