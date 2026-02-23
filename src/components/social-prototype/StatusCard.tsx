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
}

export function StatusCard({ status, profile, onClickProfile, isOwn = false, isAdmin = false, currentUserId = null, onEdit, showPostReportButton = true, disableItemEditing = false }: StatusCardProps) {
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);
    const [showHabits, setShowHabits] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [commentDraft, setCommentDraft] = useState('');
    const [commentSubmitting, setCommentSubmitting] = useState(false);
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

    type HighlightMatch = {
        start: number;
        end: number;
        itemId: string;
        color: string;
    };

    const findMatches = (source: string): HighlightMatch[] => {
        const matches: HighlightMatch[] = [];

        status.items.forEach((item) => {
            const config = getCategoryConfig(item.category);
            const color = config?.color || HIGHLIGHT_COLOR;
            const terms = getItemHighlightTerms(item);
            terms.forEach((term) => {
                const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escaped, 'gi');
                let found: RegExpExecArray | null;
                while ((found = regex.exec(source)) !== null) {
                    matches.push({
                        start: found.index,
                        end: found.index + found[0].length,
                        itemId: item.id,
                        color,
                    });
                }
            });
        });

        matches.sort((a, b) => {
            const lenDiff = (b.end - b.start) - (a.end - a.start);
            if (lenDiff !== 0) return lenDiff;
            if (a.start !== b.start) return a.start - b.start;
            return a.itemId.localeCompare(b.itemId);
        });

        const chosen: HighlightMatch[] = [];
        matches.forEach((candidate) => {
            const overlaps = chosen.some(
                (existing) => !(candidate.end <= existing.start || candidate.start >= existing.end)
            );
            if (!overlaps) chosen.push(candidate);
        });

        return chosen.sort((a, b) => a.start - b.start);
    };

    const renderContent = () => {
        if (!status.content) return null;

        const text = status.content;
        const matches = findMatches(text);
        const parts: React.ReactNode[] = [];
        let cursor = 0;

        matches.forEach((match, index) => {
            if (match.start > cursor) {
                parts.push(text.slice(cursor, match.start));
            }
            const label = text.slice(match.start, match.end);
            const item = status.items.find((entry) => entry.id === match.itemId);
            parts.push(
                <button
                    key={`${match.itemId}:${match.start}:${index}`}
                    type="button"
                    onClick={() => item && setSelectedItem(item)}
                    className="inline px-[1px] cursor-pointer"
                    style={{ backgroundColor: match.color }}
                >
                    {label}
                </button>
            );
            cursor = match.end;
        });

        if (cursor < text.length) {
            parts.push(text.slice(cursor));
        }

        return (
            <p className="text-neutral-800 text-xs leading-relaxed whitespace-pre-wrap font-mono cursor-default">
                {parts}
            </p>
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
                                    {showPostReportButton && !isOwn && user && (
                                        <button
                                            onClick={handleReportPost}
                                            className="block w-full text-left px-2.5 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
                                        >
                                            Report
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
                                </div>
                            )}
                        </div>
                    )}
                    <span className="text-[10px] text-neutral-400">
                        {new Date(status.date).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC'
                        })}
                    </span>
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
                                                className="inline-flex items-center justify-center h-4 w-4 text-[10px] border border-neutral-300 text-neutral-500 hover:text-neutral-800 hover:border-neutral-500"
                                                title="Open item details"
                                                aria-label="Open item details"
                                            >
                                                ↗
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

            <div className="mt-2 pt-2 border-t border-neutral-100">
                <button
                    onClick={() => setShowComments((prev) => !prev)}
                    className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
                >
                    {showComments ? 'Hide Comments' : `Comments (${status.comments?.length || 0})`}
                </button>

                {showComments && (
                    <div className="mt-2 space-y-2">
                        {(status.comments || []).length === 0 && (
                            <div className="text-[10px] uppercase tracking-widest text-neutral-300 border border-dashed border-neutral-200 p-2">
                                No comments yet.
                            </div>
                        )}

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
