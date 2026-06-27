"use client";

import React, { useState } from 'react';
import { Category, ConsumableItem, getCategoryConfig } from '@/lib/social-prototype/store';
import { getCanonicalItemKey, getRepeatTagVerb } from '@/lib/social-prototype/items';
import { parseItemMeta, serializeItemMeta } from '@/lib/social-prototype/item-meta';
import { ConsumableModal } from './ConsumableModal';

interface CategorySheetProps {
    category: Category;
    items: ConsumableItem[];
    onClose: () => void;
    canAddItem?: boolean;
    onAddItem?: (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => Promise<void>;
    onEditItem?: (itemId: string, item: Partial<Omit<ConsumableItem, 'id' | 'createdAt'>>) => Promise<void>;
    onDeleteItem?: (itemId: string) => Promise<void>;
}

type SortMode = 'latest' | 'top';

interface AggregatedItem {
    key: string;
    latest: ConsumableItem;
    count: number;
    visits: ConsumableItem[];
}

const isEpisodeCategory = (category: Category) => category === 'tv' || category === 'podcast';
const isExerciseCategory = (category: Category) => category === 'exercise' || category === 'bird';
const isBookCategory = (category: Category) => category === 'book';

const getEpisodeSeriesLabel = (category: Category, item: ConsumableItem) => {
    if (category === 'tv') return item.title.trim();
    if (category === 'podcast') return (item.subtitle || '').trim();
    return '';
};

const normalizePart = (value?: string) =>
    (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .trim();

const getAggregateKey = (category: Category, item: ConsumableItem) => {
    if (category === 'exercise' || category === 'bird') return item.id; // each sighting/session is a unique personal log
    if (category === 'restaurant') {
        const meta = parseItemMeta(item.image);
        const location = normalizePart(meta.restaurantLocation);
        return `restaurant::${normalizePart(item.title)}::${location}`;
    }
    return getCanonicalItemKey(item);
};

export function CategorySheet({ category, items, onClose, canAddItem = false, onAddItem, onEditItem, onDeleteItem }: CategorySheetProps) {
    const config = getCategoryConfig(category);
    const [sortMode, setSortMode] = useState<SortMode>('latest');
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [episodeSeriesFilter, setEpisodeSeriesFilter] = useState<string>('all');
    const [episodeTextFilter, setEpisodeTextFilter] = useState('');
    const [exerciseNameFilter, setExerciseNameFilter] = useState<string>('all');
    const [expandedRestaurantKeys, setExpandedRestaurantKeys] = useState<Set<string>>(new Set());
    const [expandedBookKeys, setExpandedBookKeys] = useState<Set<string>>(new Set());
    const [thisYearOnly, setThisYearOnly] = useState(false);

    if (!config) return null;

    // Aggregate items by canonical key (keep latest row + total times tagged).
    const aggregatedItems = (() => {
        const map = new Map<string, AggregatedItem>();
        for (const item of items) {
            const key = getAggregateKey(category, item);
            const existing = map.get(key);
            if (!existing) {
                map.set(key, { key, latest: item, count: Math.max(item.consumedDates?.length ?? 0, 1), visits: [item] });
                continue;
            }
            existing.count += Math.max(item.consumedDates?.length ?? 0, 1);
            existing.visits.push(item);
            if (item.createdAt > existing.latest.createdAt) {
                existing.latest = item;
            }
        }
        return Array.from(map.values()).map((entry) => ({
            ...entry,
            visits: [...entry.visits].sort((a, b) => b.createdAt - a.createdAt),
        }));
    })();

    const totalTaggedCount = items.length;
    const repeatVerb = getRepeatTagVerb(category);
    const episodeFilteringEnabled = isEpisodeCategory(category);
    const exerciseCat = isExerciseCategory(category);
    const bookCat = isBookCategory(category);
    const isRestaurantCategory = category === 'restaurant';

    const episodeSeriesOptions = (() => {
        if (!episodeFilteringEnabled) return [] as string[];
        const names = new Set<string>();
        for (const entry of aggregatedItems) {
            const label = getEpisodeSeriesLabel(category, entry.latest);
            if (label) names.add(label);
        }
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    })();

    const exerciseNameOptions = (() => {
        if (!exerciseCat) return [] as string[];
        const names = new Set<string>();
        for (const entry of aggregatedItems) {
            if (entry.latest.title.trim()) names.add(entry.latest.title.trim());
        }
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    })();

    const hasThisYearFilter = category === 'music' || category === 'movie';
    const currentYear = new Date().getFullYear().toString();

    const filteredItems = (() => {
        let result = aggregatedItems;

        if (thisYearOnly && hasThisYearFilter) {
            result = result.filter(entry => {
                const meta = parseItemMeta(entry.latest.image);
                return meta.releaseDate?.startsWith(currentYear);
            });
        }

        if (exerciseCat) {
            if (exerciseNameFilter === 'all') return result;
            return result.filter(entry => entry.latest.title.trim() === exerciseNameFilter);
        }
        if (!episodeFilteringEnabled) return result;
        const query = episodeTextFilter.trim().toLowerCase();
        return result.filter((entry) => {
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

    // ── Book-specific view data ──────────────────────────────────────────
    const BOOK_COLORS = ['#6ab4f7', '#f472b6', '#7be08a', '#f5d142', '#b78ef5', '#f7756a', '#e8a94f', '#7be0c3'];

    // A book is "finished" if it has an explicit finished flag, OR if it has a
    // rating but no progress data (old-style entries pre-dating progress tracking).
    const isBookFinished = (entry: AggregatedItem): boolean => {
        if (entry.visits.some(v => parseItemMeta(v.image).finished)) return true;
        const hasProgress = entry.visits.some(v => parseItemMeta(v.image).progressPage != null);
        return !hasProgress && entry.visits.some(v => v.rating);
    };
    // Best visit to open for a finished book: explicit finished visit first, else highest-rated
    const getFinishedVisit = (entry: AggregatedItem) =>
        entry.visits.find(v => parseItemMeta(v.image).finished) ??
        [...entry.visits].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];

    // A book is "stopped" when its most recent log was removed from the
    // actively-reading list (without finishing).
    const isBookStopped = (entry: AggregatedItem): boolean =>
        !!parseItemMeta(entry.latest.image).stoppedReading;
    // Remove a book from the actively-reading list by flagging its latest log.
    const stopReadingBook = async (entry: AggregatedItem) => {
        if (!onEditItem) return;
        if (!confirm(`Remove "${entry.latest.title}" from your reading list?`)) return;
        const meta = parseItemMeta(entry.latest.image);
        await onEditItem(entry.latest.id, { image: serializeItemMeta({ ...meta, stoppedReading: true }) });
    };
    const inProgressBooks = bookCat ? aggregatedItems.filter(e => !isBookFinished(e) && !isBookStopped(e)) : [];
    const finishedBooks = bookCat
        ? (() => {
            const finished = aggregatedItems.filter(e => isBookFinished(e));
            if (sortMode === 'top') {
                return finished
                    .filter(e => getFinishedVisit(e)?.rating)
                    .sort((a, b) => (getFinishedVisit(b)?.rating || 0) - (getFinishedVisit(a)?.rating || 0));
            }
            return finished.sort((a, b) => b.latest.createdAt - a.latest.createdAt);
        })()
        : [];
    interface BookGraphEntry extends AggregatedItem { points: { date: number; pct: number }[]; color: string; }
    const graphEntries: BookGraphEntry[] = inProgressBooks.map((entry, i) => {
        // Check if this book has any visit with explicit progress data
        const hasProgressData = entry.visits.some(v => {
            const vm = parseItemMeta(v.image);
            return vm.progressPage != null;
        });
        const points = entry.visits
            .map(v => {
                const vm = parseItemMeta(v.image);
                let pct: number | null = null;
                if (vm.progressMode === 'percent' && vm.progressPage != null) pct = vm.progressPage;
                else if (vm.progressPage != null && vm.totalPages) pct = (vm.progressPage / vm.totalPages) * 100;
                // Use the status (post) date for the graph x-axis, falling back to createdAt
                const dateTs = v.statusDate
                    ? new Date(v.statusDate + 'T12:00:00').getTime()
                    : v.createdAt;
                // Visits without progress (e.g. the initial "started reading" tag)
                // appear as 0% so the graph timeline starts from the first log date,
                // but only if the book has at least one visit with real progress.
                if (pct == null && hasProgressData) pct = 0;
                return pct != null ? { date: dateTs, pct: Math.min(100, pct) } : null;
            })
            .filter((p): p is { date: number; pct: number } => p != null)
            .sort((a, b) => a.date - b.date);
        return { ...entry, points, color: BOOK_COLORS[i % BOOK_COLORS.length] };
    });
    const hasGraph = graphEntries.some(e => e.points.length > 0);

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
                    {hasThisYearFilter && (
                        <button
                            onClick={() => setThisYearOnly(prev => !prev)}
                            className={`text-[10px] uppercase tracking-widest border px-2 py-0.5 transition-colors ${thisYearOnly
                                ? 'bg-neutral-800 text-white border-neutral-800'
                                : 'border-neutral-300 text-neutral-500 hover:text-neutral-800 hover:border-neutral-500'
                                }`}
                        >
                            {currentYear}
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
            {exerciseCat && exerciseNameOptions.length > 1 && (
                <div className="mb-3">
                    <select
                        value={exerciseNameFilter}
                        onChange={(e) => setExerciseNameFilter(e.target.value)}
                        className="w-full text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 bg-white text-neutral-600"
                    >
                        <option value="all">{category === 'bird' ? 'All Species' : 'All Exercises'}</option>
                        {exerciseNameOptions.map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* ── Book-specific layout ─────────────────────────────────────────── */}
            {bookCat && (
                <div>
                    {/* In-progress section */}
                    {inProgressBooks.length > 0 && (
                        <div className="mb-6">
                            <div className="text-[9px] uppercase tracking-widest text-neutral-400 mb-2">In Progress</div>

                            {/* SVG line graph */}
                            {hasGraph && (() => {
                                const allPts = graphEntries.flatMap(e => e.points);
                                const minTs = Math.min(...allPts.map(p => p.date));
                                const maxTs = Math.max(...allPts.map(p => p.date));
                                const W = 400, H = 90;
                                const pad = { t: 6, r: 8, b: 18, l: 28 };
                                const cW = W - pad.l - pad.r;
                                const cH = H - pad.t - pad.b;
                                const xf = (ts: number) => pad.l + ((ts - minTs) / Math.max(maxTs - minTs, 1)) * cW;
                                const yf = (pct: number) => pad.t + (1 - pct / 100) * cH;
                                return (
                                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full border border-neutral-100 bg-neutral-50 mb-3" style={{ height: 90 }}>
                                        {/* Grid lines */}
                                        {[0, 25, 50, 75, 100].map(pct => (
                                            <line key={pct} x1={pad.l} x2={W - pad.r} y1={yf(pct)} y2={yf(pct)} stroke={pct % 50 === 0 ? '#d4d4d4' : '#e5e5e5'} strokeWidth="0.5" />
                                        ))}
                                        {/* Y-axis labels */}
                                        {[0, 50, 100].map(pct => (
                                            <text key={pct} x={pad.l - 3} y={yf(pct) + 3} textAnchor="end" fontSize="6.5" fill="#a3a3a3">{pct}%</text>
                                        ))}
                                        {/* X-axis date labels */}
                                        <text x={pad.l} y={H - 3} textAnchor="start" fontSize="6.5" fill="#a3a3a3">
                                            {new Date(minTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </text>
                                        {minTs !== maxTs && (
                                            <text x={W - pad.r} y={H - 3} textAnchor="end" fontSize="6.5" fill="#a3a3a3">
                                                {new Date(maxTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </text>
                                        )}
                                        {/* Book lines */}
                                        {graphEntries.map(entry => {
                                            if (entry.points.length === 0) return null;
                                            if (entry.points.length === 1) {
                                                return <circle key={entry.key} cx={xf(entry.points[0].date)} cy={yf(entry.points[0].pct)} r={3} fill={entry.color} />;
                                            }
                                            const d = entry.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xf(p.date).toFixed(1)},${yf(p.pct).toFixed(1)}`).join(' ');
                                            return (
                                                <g key={entry.key}>
                                                    <path d={d} stroke={entry.color} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
                                                    {entry.points.map((p, i) => (
                                                        <circle key={i} cx={xf(p.date)} cy={yf(p.pct)} r={2} fill={entry.color} />
                                                    ))}
                                                </g>
                                            );
                                        })}
                                    </svg>
                                );
                            })()}

                            {/* In-progress book list */}
                            <div className="space-y-1">
                                {inProgressBooks.map((entry, i) => {
                                    const color = BOOK_COLORS[i % BOOK_COLORS.length];
                                    const latestMeta = parseItemMeta(entry.latest.image);
                                    const isPercent = latestMeta.progressMode === 'percent';
                                    const pct = isPercent
                                        ? latestMeta.progressPage
                                        : (latestMeta.progressPage != null && latestMeta.totalPages
                                            ? (latestMeta.progressPage / latestMeta.totalPages) * 100
                                            : null);
                                    const progressLabel = isPercent
                                        ? (latestMeta.progressPage != null ? `${latestMeta.progressPage}%` : '—')
                                        : (latestMeta.progressPage != null
                                            ? `p. ${latestMeta.progressPage}${latestMeta.totalPages ? ` / ${latestMeta.totalPages}` : ''}`
                                            : '—');
                                    return (
                                        <div key={entry.key} className="flex items-stretch">
                                            <button type="button" onClick={() => setSelectedItem(entry.latest)} className="flex-1 min-w-0 text-left">
                                                <div className="flex items-center gap-2.5 px-3 py-2 border border-neutral-200 hover:border-neutral-400 bg-white transition-colors">
                                                    <div className="w-2 h-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-bold truncate">{entry.latest.title}</div>
                                                        {entry.latest.subtitle && <div className="text-[10px] text-neutral-500 truncate">{entry.latest.subtitle}</div>}
                                                        {pct != null && (
                                                            <div className="mt-1 h-0.5 bg-neutral-100">
                                                                <div className="h-full" style={{ width: `${Math.min(100, pct).toFixed(1)}%`, backgroundColor: color }} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-neutral-400 flex-shrink-0">{progressLabel}</div>
                                                </div>
                                            </button>
                                            {onEditItem && (
                                                <button type="button" title="Remove from reading list"
                                                    onClick={() => stopReadingBook(entry)}
                                                    className="px-2.5 border border-l-0 border-neutral-200 text-neutral-300 hover:text-neutral-700 hover:border-neutral-400 bg-white text-sm leading-none">
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Finished books */}
                    {finishedBooks.length > 0 && (
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-neutral-400 mb-2">Finished</div>
                            <div className="space-y-1">
                                {finishedBooks.map((entry, idx) => {
                                    const finishedVisit = getFinishedVisit(entry);
                                    const finishDate = finishedVisit
                                        ? new Date(finishedVisit.statusDate ? finishedVisit.statusDate + 'T12:00:00' : finishedVisit.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                        : null;
                                    return (
                                        <button key={entry.key} type="button" onClick={() => finishedVisit && setSelectedItem(finishedVisit)} className="w-full text-left">
                                            <div className="flex items-center gap-2.5 px-3 py-2.5 border border-neutral-200 hover:border-neutral-400 bg-white transition-colors">
                                                {sortMode === 'top' && (
                                                    <span className="text-[10px] text-neutral-400 font-bold w-4 flex-shrink-0">{idx + 1}</span>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-bold truncate">{entry.latest.title}</div>
                                                    {entry.latest.subtitle && <div className="text-[10px] text-neutral-500 truncate">{entry.latest.subtitle}</div>}
                                                    {finishDate && <div className="text-[10px] text-neutral-300 mt-0.5 uppercase tracking-widest">{finishDate}</div>}
                                                </div>
                                                {finishedVisit?.rating ? (
                                                    <div className="flex-shrink-0 text-right">
                                                        <span className="text-sm font-bold text-neutral-800">{finishedVisit.rating}</span>
                                                        <span className="text-[9px] text-neutral-400">/10</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[9px] text-neutral-300 uppercase tracking-widest flex-shrink-0">✓</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {inProgressBooks.length === 0 && finishedBooks.length === 0 && (
                        <div className="text-xs text-neutral-400 py-6 text-center uppercase tracking-widest">No entries yet.</div>
                    )}
                </div>
            )}

            {/* ── Non-book items ────────────────────────────────────────────────── */}
            {!bookCat && (sortedItems.length === 0 ? (
                <div className="text-xs text-neutral-400 py-6 text-center uppercase tracking-widest">
                    {sortMode === 'top' ? 'No rated entries yet.' : 'No entries yet.'}
                </div>
            ) : (
                <div className="space-y-1.5">
                    {sortedItems.map((entry, idx) => (
                        <div key={entry.key} className="w-full text-left group">
                            <button
                                type="button"
                                onClick={() => {
                                    if (isRestaurantCategory) {
                                        setExpandedRestaurantKeys((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(entry.key)) next.delete(entry.key);
                                            else next.add(entry.key);
                                            return next;
                                        });
                                        return;
                                    }
                                    if (bookCat) {
                                        const finishedVisit = entry.visits.find(v => parseItemMeta(v.image).finished);
                                        if (finishedVisit) { setSelectedItem(finishedVisit); return; }
                                        if (entry.count > 1) {
                                            setExpandedBookKeys((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(entry.key)) next.delete(entry.key);
                                                else next.add(entry.key);
                                                return next;
                                            });
                                            return;
                                        }
                                    }
                                    setSelectedItem(entry.latest);
                                }}
                                className="w-full text-left"
                            >
                                <div className="flex items-start gap-2.5 px-3 py-2.5 border border-neutral-200 hover:border-neutral-400 transition-colors bg-white">
                                {/* Rank number for top mode */}
                                {sortMode === 'top' && (
                                    <span className="text-[10px] text-neutral-400 font-bold mt-0.5 w-4 flex-shrink-0">
                                        {idx + 1}
                                    </span>
                                )}

                                {/* Main info */}
                                {(() => {
                                    const bookMeta = bookCat ? parseItemMeta(entry.latest.image) : null;
                                    return (
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <div className="text-xs font-bold">{entry.latest.title}</div>
                                            {entry.count > 1 && !exerciseCat && !bookCat && (
                                                <span className="text-[10px] uppercase tracking-widest border border-neutral-300 px-1.5 py-0.5 text-neutral-600">
                                                    {entry.count}X
                                                </span>
                                            )}
                                            {exerciseCat && (
                                                <span className="text-[10px] text-neutral-400 uppercase tracking-widest">
                                                    {new Date(entry.latest.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                            )}
                                            {bookCat && (bookMeta?.finished || entry.visits.some(v => parseItemMeta(v.image).finished)) && (
                                                <span className="text-[9px] uppercase tracking-widest px-1 py-0.5 bg-neutral-800 text-white">✓</span>
                                            )}
                                        </div>
                                        {entry.count > 1 && !exerciseCat && !bookCat && (
                                            <div className="text-[10px] uppercase tracking-widest text-neutral-500 mt-0.5">
                                                {repeatVerb} {entry.count} times
                                            </div>
                                        )}
                                        {entry.latest.subtitle && (
                                            <div className="text-[11px] text-neutral-600 mt-0.5">
                                                {entry.latest.subtitle.split('\n')[0]}
                                            </div>
                                        )}
                                        {bookCat && (() => {
                                            // Prefer finished review entry for display; fall back to latest progress log
                                            const finishedVisit = entry.visits.find(v => parseItemMeta(v.image).finished);
                                            const displayMeta = finishedVisit ? parseItemMeta(finishedVisit.image) : bookMeta;
                                            const isPercent = displayMeta?.progressMode === 'percent';
                                            const pct = isPercent
                                                ? displayMeta?.progressPage
                                                : (displayMeta?.progressPage != null && displayMeta?.totalPages
                                                    ? (displayMeta.progressPage / displayMeta.totalPages) * 100
                                                    : null);
                                            return (
                                                <div className="mt-1">
                                                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest">
                                                        {isPercent
                                                            ? (displayMeta?.progressPage != null ? `${displayMeta.progressPage}%` : 'No progress')
                                                            : (displayMeta?.progressPage != null ? `p. ${displayMeta.progressPage}` : 'No progress')}
                                                        {!isPercent && displayMeta?.totalPages ? ` / ${displayMeta.totalPages}` : ''}
                                                    </span>
                                                    {pct != null && (
                                                        <div className="mt-1 h-1 bg-neutral-100 border border-neutral-200">
                                                            <div className="h-full bg-neutral-600" style={{ width: `${Math.min(100, pct).toFixed(1)}%` }} />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {!bookCat && entry.latest.notes && (
                                            <div className="text-[10px] text-neutral-500 mt-1 whitespace-pre-wrap leading-relaxed">
                                                {entry.latest.notes}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })()}

                                {/* Rating /10 — prominent on the right */}
                                {entry.latest.rating && entry.latest.rating > 0 && !bookCat && (
                                    <div className="flex-shrink-0 text-right">
                                        <span className="text-sm font-bold text-neutral-800">{entry.latest.rating}</span>
                                        <span className="text-[9px] text-neutral-400">/10</span>
                                    </div>
                                )}
                                {bookCat && (() => {
                                    const finishedVisit = entry.visits.find(v => parseItemMeta(v.image).finished);
                                    if (!finishedVisit?.rating) return null;
                                    return (
                                        <div className="flex-shrink-0 text-right">
                                            <span className="text-sm font-bold text-neutral-800">{finishedVisit.rating}</span>
                                            <span className="text-[9px] text-neutral-400">/10</span>
                                        </div>
                                    );
                                })()}
                                {isRestaurantCategory && entry.count > 1 && (
                                    <div className="flex-shrink-0 text-[10px] uppercase tracking-widest text-neutral-400">
                                        {expandedRestaurantKeys.has(entry.key) ? 'Hide' : 'Show'}
                                    </div>
                                )}
                                {bookCat && entry.count > 1 && (
                                    <div className="flex-shrink-0 text-[10px] uppercase tracking-widest text-neutral-400">
                                        {expandedBookKeys.has(entry.key) ? 'Hide' : `${entry.count} logs`}
                                    </div>
                                )}
                                </div>
                            </button>
                            {isRestaurantCategory && entry.count > 1 && expandedRestaurantKeys.has(entry.key) && (
                                <div className="border-x border-b border-neutral-200 bg-neutral-50 px-3 py-2">
                                    <div className="space-y-1.5">
                                        {entry.visits.map((visit) => (
                                            <div key={visit.id} className="flex items-center justify-between gap-2 text-[11px]">
                                                <div className="text-neutral-700 truncate">
                                                    {visit.subtitle?.trim() || 'No dish listed'}
                                                </div>
                                                <div className="text-neutral-500 uppercase tracking-widest text-[10px] whitespace-nowrap">
                                                    {new Date(visit.createdAt).toLocaleDateString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {bookCat && entry.count > 1 && expandedBookKeys.has(entry.key) && (
                                <div className="border-x border-b border-neutral-200 bg-neutral-50 px-3 py-2">
                                    <div className="space-y-1.5">
                                        {entry.visits.map((visit) => {
                                            const vm = parseItemMeta(visit.image);
                                            return (
                                                <button key={visit.id} type="button" onClick={() => setSelectedItem(visit)}
                                                    className="w-full flex items-center justify-between gap-2 text-[11px] hover:bg-neutral-100 px-1 py-0.5 rounded">
                                                    <div className="text-neutral-500 uppercase tracking-widest text-[10px] whitespace-nowrap">
                                                        {new Date(visit.statusDate ? visit.statusDate + 'T12:00:00' : visit.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    </div>
                                                    <div className="text-neutral-700 text-right">
                                                        {vm.progressPage != null ? `p. ${vm.progressPage}` : '—'}
                                                        {vm.totalPages ? ` / ${vm.totalPages}` : ''}
                                                        {vm.finished ? ' ✓' : ''}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ))}

            {/* Item detail modal */}
            {selectedItem && (() => {
                const isEditing = editingItemId === selectedItem.id;
                return (
                    <ConsumableModal
                        key={`${selectedItem.id}-${isEditing ? 'edit' : 'view'}`}
                        isOpen={true}
                        initialCategory={selectedItem.category}
                        existingItem={selectedItem}
                        readOnly={!isEditing}
                        onClose={() => { setSelectedItem(null); setEditingItemId(null); }}
                        onEdit={onEditItem ? () => setEditingItemId(selectedItem.id) : undefined}
                        onSave={async (item) => {
                            if (onEditItem) {
                                await onEditItem(selectedItem.id, item);
                            }
                            setSelectedItem(null);
                            setEditingItemId(null);
                        }}
                        onDelete={onDeleteItem ? async () => {
                            await onDeleteItem(selectedItem.id);
                            setSelectedItem(null);
                            setEditingItemId(null);
                        } : undefined}
                    />
                );
            })()}

            {showAddModal && (
                <ConsumableModal
                    key={`new-${category}`}
                    isOpen={showAddModal}
                    initialCategory={category}
                    allUserItems={items}
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
