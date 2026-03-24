"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from "next/link";
import { Status, HIGHLIGHT_COLOR, UserProfile, ConsumableItem, useSocialStore, getCategoryConfig } from '@/lib/social-prototype/store';
import { HabitChecklist } from './HabitChecklist';
import { ConsumableModal } from './ConsumableModal';
import { buildItemPath, hasItemAggregatePage } from '@/lib/social-prototype/items';
import { useAuth } from '@/lib/auth';
import { pushToast } from '@/lib/social-prototype/toast';
import { getItemHighlightTerms } from './useTaggingState';
import { parseItemMeta } from '@/lib/social-prototype/item-meta';
import { normalizeTaggedTextForFeed, parseHighlights } from '@/lib/social-prototype/highlighting.mjs';

interface StatusCardProps {
    status: Status;
    profile?: UserProfile | null;
    onClickProfile?: (userId: string) => void;
    isOwn?: boolean;
    isAdmin?: boolean;
    currentUserId?: string | null;
    onEdit?: () => void;
    showPostReportButton?: boolean;
    disableItemEditing?: boolean;
    forceShowComments?: boolean;
}

export function StatusCard({ status, profile, onClickProfile, isOwn = false, isAdmin = false, currentUserId = null, onEdit, showPostReportButton = true, disableItemEditing = false, forceShowComments = false }: StatusCardProps) {
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);
    const [showHabits, setShowHabits] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [commentDraft, setCommentDraft] = useState('');
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [showAllItems, setShowAllItems] = useState(false);
    const ITEM_LIMIT = 5;
    const menuRef = useRef<HTMLDivElement | null>(null);
    const { user } = useAuth();
    const { deleteStatus, addComment, deleteComment, reportStatus, reportComment, softDeleteStatus, softDeleteComment, removeItemFromActive, addItemToStatus } = useSocialStore();

    const defer = (fn: () => void | Promise<void>) => {
        window.setTimeout(() => {
            void fn();
        }, 0);
    };

    const handleReportPost = () => {
        setShowMenu(false);
        defer(async () => {
            try {
                const reason = window.prompt('Report reason (optional):') || '';
                await reportStatus(status.id, reason);
                pushToast({ message: 'Report submitted. Thanks.', tone: 'success' });
            } catch (error) {
                pushToast({ message: error instanceof Error ? error.message : 'Failed to report post', tone: 'error' });
            }
        });
    };

    const handleDeletePost = () => {
        setShowMenu(false);
        defer(async () => {
            if (!window.confirm('Delete this post and all its items?')) return;
            try {
                await deleteStatus(status.id);
            } catch (error) {
                pushToast({ message: error instanceof Error ? error.message : 'Failed to delete post', tone: 'error' });
            }
        });
    };

    const handleHidePost = () => {
        setShowMenu(false);
        defer(async () => {
            if (!window.confirm('Hide this post from public feed?')) return;
            try {
                await softDeleteStatus(status.id, 'Hidden by admin');
                pushToast({ message: 'Post hidden.', tone: 'success' });
            } catch (error) {
                pushToast({ message: error instanceof Error ? error.message : 'Failed to hide post', tone: 'error' });
            }
        });
    };

    useEffect(() => {
        if (!showMenu) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        window.addEventListener('mousedown', onPointerDown);
        return () => window.removeEventListener('mousedown', onPointerDown);
    }, [showMenu]);

    useEffect(() => {
        if (!forceShowComments) return;
        setShowComments(true);
    }, [forceShowComments]);

    const renderContent = () => {
        if (!status.content) return null;

        const text = normalizeTaggedTextForFeed(status.content);
        // Baby bird items are for profile piles only — don't highlight them in the feed
        const entities = status.babyBirdUrl ? [] : status.items.map((item) => {
            const config = getCategoryConfig(item.category);
            return {
                id: item.id,
                entityType: item.category,
                entityId: item.id,
                terms: getItemHighlightTerms(item),
                color: config?.color || HIGHLIGHT_COLOR,
            };
        });
        const decorations = parseHighlights(text, entities);
        const parts: React.ReactNode[] = [];
        let cursor = 0;

        decorations.forEach((dec, index) => {
            if (dec.start > cursor) parts.push(text.slice(cursor, dec.start));
            const item = status.items.find((entry) => entry.id === dec.entityId);
            parts.push(
                <button
                    key={`${dec.entityId}:${dec.start}:${index}`}
                    type="button"
                    onClick={() => item && setSelectedItem(item)}
                    className="inline px-[1px] cursor-pointer"
                    style={{ backgroundColor: dec.color || HIGHLIGHT_COLOR }}
                >
                    {dec.displayText}
                </button>
            );
            cursor = dec.end;
        });

        if (cursor < text.length) parts.push(text.slice(cursor));

        return (
            <p className="text-neutral-800 text-xs leading-relaxed whitespace-pre-wrap font-mono cursor-default break-words">
                {parts}
            </p>
        );
    };

    return (
        <div id={`status-${status.id}`} className="border border-neutral-200 bg-white px-3 py-2.5 font-mono">
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
                    {(status.userId || onEdit || (!isOwn && user) || isOwn) && (
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setShowMenu((prev) => !prev)}
                                aria-label="Open post menu"
                                title="Post menu"
                                className="w-7 h-7 border border-neutral-300 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
                            >
                                <span className="inline-flex items-center gap-0.5">
                                    <span className="w-1 h-1 rounded-full bg-current" />
                                    <span className="w-1 h-1 rounded-full bg-current" />
                                    <span className="w-1 h-1 rounded-full bg-current" />
                                </span>
                            </button>
                            {showMenu && (
                                <div className="absolute right-0 mt-1 w-36 border border-neutral-300 bg-white shadow-sm z-20">
                                    {status.userId && (
                                        <button
                                            onClick={() => {
                                                setShowHabits((prev) => !prev);
                                                setShowMenu(false);
                                            }}
                                            className="block w-full text-left px-2.5 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100"
                                        >
                                            {showHabits ? 'Hide Habits' : 'Show Habits'}
                                        </button>
                                    )}
                                    {onEdit && (
                                        <button
                                            onClick={() => {
                                                onEdit();
                                                setShowMenu(false);
                                            }}
                                            className="block w-full text-left px-2.5 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
                                        >
                                            Edit
                                        </button>
                                    )}
                                    {isOwn && (
                                        <button
                                            onClick={handleDeletePost}
                                            className="block w-full text-left px-2.5 py-2 text-[10px] uppercase tracking-widest text-red-600 hover:bg-red-50 border-t border-neutral-200"
                                        >
                                            Delete
                                        </button>
                                    )}
                                    {isAdmin && !isOwn && (
                                        <button
                                            onClick={handleHidePost}
                                            className="block w-full text-left px-2.5 py-2 text-[10px] uppercase tracking-widest text-red-600 hover:bg-red-50 border-t border-neutral-200"
                                        >
                                            Hide
                                        </button>
                                    )}
                                    {showPostReportButton && !isOwn && user && (
                                        <button
                                            onClick={handleReportPost}
                                            className="block w-full text-left px-2.5 py-1.5 text-[9px] uppercase tracking-widest text-neutral-300 hover:text-red-400 border-t border-dashed border-neutral-100 mt-2"
                                        >
                                            Report
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    <span className="text-[10px] text-neutral-400">
                        {status.bundledDates && status.bundledDates.length > 0
                            ? (() => {
                                const startDate = new Date([...status.bundledDates].sort()[0]);
                                const endDate = new Date(status.date);
                                const startMonth = startDate.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
                                const endMonth = endDate.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
                                const startDay = startDate.toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' });
                                const endDay = endDate.toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' });
                                return startMonth === endMonth
                                    ? `${startMonth} ${startDay}-${endDay}`
                                    : `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
                              })()
                            : new Date(status.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
                        }
                    </span>
                </div>
            </div>

            {/* Body: content + items */}
            <div>
                {status.babyBirdUrl ? (
                    /* ── Baby Bird layout: link box first, commentary below ── */
                    <>
                        <a
                            href={status.babyBirdUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-xs font-mono text-neutral-700 hover:bg-neutral-100 transition-colors truncate"
                        >
                            <span className="text-neutral-400 mr-1.5">↗</span>
                            {status.babyBirdUrl}
                        </a>
                        {status.content && (
                            <div className="mt-2">
                                {renderContent()}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {renderContent()}

                        {/* Items as clickable colored boxes */}
                        {status.items.length > 0 && (() => {
                            // Group TV episodes by show name into compressed cards
                            const tvGroups = new Map<string, ConsumableItem[]>();
                            const nonGrouped: ConsumableItem[] = [];
                            for (const item of status.items) {
                                const meta = parseItemMeta(item.image);
                                if (item.category === 'tv' && meta.externalSource === 'tvmaze-episode') {
                                    const group = tvGroups.get(item.title) || [];
                                    group.push(item);
                                    tvGroups.set(item.title, group);
                                } else {
                                    nonGrouped.push(item);
                                }
                            }
                            // Build display list: grouped TV cards + individual items
                            type DisplayEntry = { type: 'item'; item: ConsumableItem } | { type: 'tv-group'; showName: string; episodes: ConsumableItem[] };
                            const displayItems: DisplayEntry[] = [];
                            const tvGroupOrder: string[] = [];
                            for (const item of status.items) {
                                const meta = parseItemMeta(item.image);
                                if (item.category === 'tv' && meta.externalSource === 'tvmaze-episode') {
                                    if (!tvGroupOrder.includes(item.title)) {
                                        tvGroupOrder.push(item.title);
                                        displayItems.push({ type: 'tv-group', showName: item.title, episodes: tvGroups.get(item.title)! });
                                    }
                                } else {
                                    displayItems.push({ type: 'item', item });
                                }
                            }
                            const visibleItems = showAllItems ? displayItems : displayItems.slice(0, ITEM_LIMIT);
                            const totalDisplayCount = displayItems.length;

                            return (
                                <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-neutral-100">
                                    {visibleItems.map(entry => {
                                        if (entry.type === 'tv-group') {
                                            const { showName, episodes } = entry;
                                            const config = getCategoryConfig('tv');
                                            const firstEp = episodes[0];
                                            return (
                                                <div
                                                    key={`tv-group:${showName}`}
                                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] border min-w-0 max-w-full flex-wrap"
                                                    style={{
                                                        backgroundColor: config.color ? `${config.color}33` : '#f5f5f5',
                                                        borderColor: config.color || '#e5e5e5',
                                                    }}
                                                >
                                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: config.color || '#d4d4d4', border: `1.5px solid ${config.color || '#d4d4d4'}` }} />
                                                    <span className="font-medium text-neutral-800">{showName}</span>
                                                    {hasItemAggregatePage('tv') && (
                                                        <Link
                                                            href={buildItemPath(firstEp)}
                                                            className="inline-flex items-center justify-center h-4 w-4 text-[10px] border border-neutral-300 text-neutral-500 hover:text-neutral-800 hover:border-neutral-500"
                                                            title="Open show details"
                                                        >
                                                            ↗
                                                        </Link>
                                                    )}
                                                    <span className="text-neutral-400 mx-0.5">—</span>
                                                    {episodes.map((ep, i) => (
                                                        <button
                                                            key={ep.id}
                                                            onClick={() => setSelectedItem(ep)}
                                                            className="text-neutral-600 hover:text-neutral-900 hover:underline transition-colors"
                                                            title={ep.subtitle}
                                                        >
                                                            {ep.subtitle?.replace(/\s*-\s*.*$/, '') || `Ep ${i + 1}`}{i < episodes.length - 1 ? ',' : ''}
                                                        </button>
                                                    ))}
                                                </div>
                                            );
                                        }
                                        const { item } = entry;
                                        const config = getCategoryConfig(item.category);
                                        const itemMeta = parseItemMeta(item.image);
                                        const linkHref = item.category === 'link' ? itemMeta.linkUrl : null;
                                        const isLinked = config.coupling === 'api'
                                            ? (item.category === 'book' ? !!itemMeta.imageUrl : !!itemMeta.externalSource)
                                            : !!(item.rating || item.notes?.trim() || item.subtitle?.trim() || itemMeta.recipeUrl || itemMeta.linkUrl);
                                        return (
                                            <div
                                                key={item.id}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] border min-w-0 max-w-full"
                                                style={{
                                                    backgroundColor: config.color ? `${config.color}33` : '#f5f5f5',
                                                    borderColor: config.color || '#e5e5e5',
                                                }}
                                            >
                                                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: isLinked ? (config.color || '#d4d4d4') : 'transparent', border: `1.5px solid ${config.color || '#d4d4d4'}` }} />
                                                <button
                                                    onClick={() => setSelectedItem(item)}
                                                    className="font-medium text-neutral-800 hover:opacity-70 transition-opacity min-w-0 truncate"
                                                    title={item.title}
                                                >
                                                    {item.title}
                                                </button>
                                                {isLinked && hasItemAggregatePage(item.category) && (
                                                    <Link href={buildItemPath(item)} className="inline-flex items-center justify-center h-4 w-4 text-[10px] border border-neutral-300 text-neutral-500 hover:text-neutral-800 hover:border-neutral-500" title="Open item details" aria-label="Open item details">↗</Link>
                                                )}
                                                {linkHref && (
                                                    <a href={linkHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center h-4 w-4 text-[10px] border border-neutral-300 text-neutral-500 hover:text-neutral-800 hover:border-neutral-500" title="Open hyperlink" aria-label="Open hyperlink">↗</a>
                                                )}
                                                {item.rating ? (
                                                    <span className="text-neutral-500 font-mono ml-1">{item.rating}<span className="text-[9px]">/10</span></span>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                    {!showAllItems && totalDisplayCount > ITEM_LIMIT && (
                                        <button
                                            type="button"
                                            onClick={() => setShowAllItems(true)}
                                            className="inline-flex items-center px-1.5 py-0.5 text-[11px] border border-dashed border-neutral-300 text-neutral-400 hover:text-neutral-600 hover:border-neutral-400"
                                        >
                                            +{totalDisplayCount - ITEM_LIMIT} more
                                        </button>
                                    )}
                                </div>
                            );
                        })()}
                    </>
                )}
            </div>

            {/* Habits row — renders below content, no horizontal reflow */}
            {status.userId && showHabits && (
                <div className="mt-2 pt-2 border-t border-dashed border-neutral-200 animate-in fade-in duration-150">
                    <HabitChecklist
                        date={status.date}
                        readOnly={!isOwn}
                        userId={isOwn ? undefined : status.userId}
                        bundledDates={status.bundledDates}
                    />
                </div>
            )}

            <div className="mt-2 pt-2 border-t border-neutral-100">
                <button
                    onClick={() => setShowComments((prev) => !prev)}
                    className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
                >
                    {showComments ? 'Hide Comments' : `Comments (${status.comments?.length || 0})`}
                </button>

                {showComments && (
                    <div className="mt-2 space-y-2">
                        {(status.comments || []).map((comment) => (
                            <div key={comment.id} className="border border-neutral-200 p-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] uppercase tracking-widest text-neutral-500">{comment.username}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-neutral-300">
                                            {new Date(comment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                        {user && (currentUserId === comment.userId || isOwn) && (
                                            <button
                                                onClick={async () => {
                                                    await deleteComment(comment.id);
                                                }}
                                                className="text-[10px] uppercase tracking-widest text-neutral-300 hover:text-red-500"
                                            >
                                                Del
                                            </button>
                                        )}
                                        {user && currentUserId !== comment.userId && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const reason = window.prompt('Report reason (optional):') || '';
                                                        await reportComment(comment.id, reason);
                                                        pushToast({ message: 'Comment reported.', tone: 'success' });
                                                    } catch (error) {
                                                        pushToast({ message: error instanceof Error ? error.message : 'Failed to report comment', tone: 'error' });
                                                    }
                                                }}
                                                className="text-[10px] uppercase tracking-widest text-neutral-300 hover:text-neutral-700"
                                            >
                                                Report
                                            </button>
                                        )}
                                        {isAdmin && user && currentUserId !== comment.userId && (
                                            <button
                                                onClick={async () => {
                                                    if (!confirm('Hide this comment?')) return;
                                                    try {
                                                        await softDeleteComment(comment.id, 'Hidden by admin');
                                                        pushToast({ message: 'Comment hidden.', tone: 'success' });
                                                    } catch (error) {
                                                        pushToast({ message: error instanceof Error ? error.message : 'Failed to hide comment', tone: 'error' });
                                                    }
                                                }}
                                                className="text-[10px] uppercase tracking-widest text-red-300 hover:text-red-500"
                                            >
                                                Hide
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-neutral-700 mt-1 whitespace-pre-wrap">{comment.content}</p>
                            </div>
                        ))}

                        {user ? (
                            <form
                                onSubmit={async (event) => {
                                    event.preventDefault();
                                    if (!commentDraft.trim() || commentSubmitting) return;
                                    setCommentSubmitting(true);
                                    try {
                                        await addComment(status.id, commentDraft.trim());
                                        setCommentDraft('');
                                    } catch (error) {
                                        pushToast({ message: error instanceof Error ? error.message : 'Failed to post comment', tone: 'error' });
                                    } finally {
                                        setCommentSubmitting(false);
                                    }
                                }}
                                className="flex items-center gap-2"
                            >
                                <input
                                    value={commentDraft}
                                    onChange={(event) => setCommentDraft(event.target.value)}
                                    placeholder="Add a comment..."
                                    className="flex-1 border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-neutral-500"
                                />
                                <button
                                    type="submit"
                                    disabled={!commentDraft.trim() || commentSubmitting}
                                    className="px-3 py-1.5 text-[10px] uppercase tracking-widest border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
                                >
                                    Send
                                </button>
                            </form>
                        ) : (
                            <div className="text-[10px] uppercase tracking-widest text-neutral-300">
                                Sign in to comment.
                            </div>
                        )}
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
                readOnly={!isOwn || disableItemEditing}
                sourceUserId={!isOwn ? status.userId ?? undefined : undefined}
                onSave={isOwn && !disableItemEditing ? async (item) => {
                    if (selectedItem) {
                        await removeItemFromActive(selectedItem.id);
                    }
                    await addItemToStatus(status.id, item);
                    setSelectedItem(null);
                } : undefined}
                onDelete={isOwn && !disableItemEditing ? async () => {
                    if (selectedItem) {
                        await removeItemFromActive(selectedItem.id);
                    }
                    setSelectedItem(null);
                } : undefined}
            />
        </div>
    );
}
