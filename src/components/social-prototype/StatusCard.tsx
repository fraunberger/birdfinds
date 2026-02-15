"use client";

import React, { useState } from 'react';
import Link from "next/link";
import { Status, HIGHLIGHT_COLOR, UserProfile, ConsumableItem, useSocialStore, getCategoryConfig } from '@/lib/social-prototype/store';
import { HabitChecklist } from './HabitChecklist';
import { ConsumableModal } from './ConsumableModal';
import { buildItemPath, hasItemAggregatePage } from '@/lib/social-prototype/items';

interface StatusCardProps {
    status: Status;
    profile?: UserProfile | null;
    onClickProfile?: (userId: string) => void;
    isOwn?: boolean;
    onEdit?: () => void;
}

interface ItemMeta {
    imageUrl?: string;
    aliases?: string[];
}

const META_PREFIX = 'meta:';

const parseItemMeta = (raw?: string): ItemMeta => {
    if (!raw) return {};
    if (!raw.startsWith(META_PREFIX)) return { imageUrl: raw };
    try {
        const decoded = decodeURIComponent(raw.slice(META_PREFIX.length));
        const parsed = JSON.parse(decoded) as ItemMeta;
        return {
            imageUrl: parsed.imageUrl,
            aliases: Array.isArray(parsed.aliases) ? parsed.aliases.filter(Boolean) : [],
        };
    } catch {
        return {};
    }
};

const getItemHighlightTerms = (item: ConsumableItem): string[] => {
    const meta = parseItemMeta(item.image);
    const terms = [item.title, ...(meta.aliases || [])].map((v) => (v || '').trim()).filter(Boolean);
    return Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
};

export function StatusCard({ status, profile, onClickProfile, isOwn = false, onEdit }: StatusCardProps) {
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);
    const [showHabits, setShowHabits] = useState(false);
    const { deleteStatus } = useSocialStore();

    // Render content with highlighted items
    const renderContent = () => {
        if (!status.content) return null;

        let html = status.content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>');

        status.items.forEach(item => {
            const config = getCategoryConfig(item.category);
            const color = config?.color || HIGHLIGHT_COLOR;
            const terms = getItemHighlightTerms(item);
            terms.forEach((term) => {
                const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                html = html.replace(
                    regex,
                    `<mark data-item-id="${item.id}" style="background-color: ${color}; padding: 0 1px; cursor: pointer;">$1</mark>`
                );
            });
        });

        return (
            <p
                onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'MARK') {
                        const id = target.getAttribute('data-item-id');
                        const item = status.items.find(i => i.id === id);
                        if (item) setSelectedItem(item);
                    }
                }}
                className="text-neutral-800 text-xs leading-relaxed whitespace-pre-wrap font-mono cursor-default"
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
                <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                    {onEdit && (
                        <button
                            onClick={onEdit}
                            className="text-[10px] text-neutral-400 hover:text-neutral-600 uppercase tracking-widest"
                        >
                            edit
                        </button>
                    )}
                    {isOwn && (
                        <button
                            onClick={() => {
                                if (confirm('Delete this post and all its items?')) {
                                    deleteStatus(status.id);
                                }
                            }}
                            className="text-[10px] text-neutral-400 hover:text-red-500 uppercase tracking-widest"
                        >
                            DEL
                        </button>
                    )}
                    <span className="text-[10px] text-neutral-400">
                        {new Date(status.date).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC'
                        })}
                    </span>
                    {/* Habit Toggle */}
                    {status.userId && (
                        <button
                            onClick={() => setShowHabits(!showHabits)}
                            className={`text-[10px] uppercase tracking-widest border px-3 py-1.5 ml-1 transition-colors min-w-[44px] flex items-center justify-center ${showHabits ? 'border-neutral-400 text-neutral-800' : 'border-transparent text-neutral-300 hover:text-neutral-500'}`}
                            title={showHabits ? "Hide habits" : "Show habits"}
                        >
                            {showHabits ? 'Habits' : 'Habits ▼'}
                        </button>
                    )}
                </div>
            </div>

            {/* Body: two-column — content left, habits right (conditional) */}
            <div className="flex gap-2">
                {/* Left: content + items */}
                <div className="flex-1 min-w-0">
                    {renderContent()}

                    {/* Items as clickable colored boxes */}
                    {status.items.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-neutral-100">
                            {status.items.map(item => {
                                const config = getCategoryConfig(item.category);
                                return (
                                    <div
                                        key={item.id}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] border"
                                        style={{
                                            backgroundColor: config.color ? `${config.color}33` : '#f5f5f5',
                                            borderColor: config.color || '#e5e5e5',
                                        }}
                                    >
                                        <button
                                            onClick={() => setSelectedItem(item)}
                                            className="font-medium text-neutral-800 hover:opacity-70 transition-opacity"
                                        >
                                            {item.title}
                                        </button>
                                        {hasItemAggregatePage(item.category) && (
                                            <Link
                                                href={buildItemPath(item)}
                                                className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
                                                title="Open item page"
                                            >
                                                page
                                            </Link>
                                        )}
                                        {item.rating ? (
                                            <span className="text-neutral-500 font-mono ml-1">
                                                {item.rating}<span className="text-[9px]">/10</span>
                                            </span>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right: habits column */}
                {status.userId && showHabits && (
                    <div className="flex-shrink-0 border-l border-neutral-100 pl-1.5 animate-in fade-in slide-in-from-right-1 duration-150">
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
                key={`${selectedItem?.id ?? 'none'}-${selectedItem?.category ?? 'movie'}`}
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                existingItem={selectedItem || undefined}
                initialCategory={selectedItem?.category || 'movie'}
                readOnly={!isOwn}
            />
        </div>
    );
}
