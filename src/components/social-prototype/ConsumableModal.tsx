"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Category, DEFAULT_CATEGORIES, getCategoryConfig } from '@/lib/social-prototype/store';
import { buildItemPath, getCanonicalItemKey, getRepeatTagVerb, hasItemAggregatePage } from '@/lib/social-prototype/items';
import { getItemExternalIdentityKey, parseItemMeta, serializeItemMeta, toGoogleMapsLink } from '@/lib/social-prototype/item-meta';
import { useSearchPicker } from './useSearchPicker';
import { SearchResultsPanel } from './SearchResultsPanel';
import {
    ConsumableModalProps,
    ModalDraft,
    MusicSearchResult,
    MovieSearchResult,
    PodcastShowResult,
    PodcastEpisodeResult,
    TvShowResult,
    TvEpisodeResult,
    RestaurantSearchResult,
    BookSearchResult,
    BrewerySearchResult,
    buildInitialDraft,
} from './consumable-modal-types';

export type { ConsumableModalProps } from './consumable-modal-types';

export function ConsumableModal({ isOpen, onClose, onSave, onDelete, initialCategory = 'movie', existingItem, readOnly = false, allUserItems }: ConsumableModalProps) {
    const [draft, setDraft] = useState<ModalDraft>(() => buildInitialDraft(initialCategory, existingItem));
    const { category, title, subtitle, rating, notes } = draft;
    const parsedMeta = parseItemMeta(draft.image);
    const recipeUrl = parsedMeta.recipeUrl || '';
    const restaurantLocation = parsedMeta.restaurantLocation || '';

    // ── Search visibility & token state ────────────────────────────────
    const [showMusicResults, setShowMusicResults] = useState(false);
    const [musicSearchToken, setMusicSearchToken] = useState(0);
    const [showMovieResults, setShowMovieResults] = useState(false);
    const [movieSearchToken, setMovieSearchToken] = useState(0);
    const [showRestaurantResults, setShowRestaurantResults] = useState(false);
    const [restaurantSearchToken, setRestaurantSearchToken] = useState(0);
    const [showBookResults, setShowBookResults] = useState(false);
    const [bookSearchToken, setBookSearchToken] = useState(0);
    const [showBreweryResults, setShowBreweryResults] = useState(false);
    const [brewerySearchToken, setBrewerySearchToken] = useState(0);

    // Podcast two-step picker
    const [showPodcastPicker, setShowPodcastPicker] = useState(false);
    const [podcastShowSearchToken, setPodcastShowSearchToken] = useState(0);
    const [selectedPodcast, setSelectedPodcast] = useState<PodcastShowResult | null>(null);
    const [podcastEpisodeSearchToken, setPodcastEpisodeSearchToken] = useState(0);

    // TV two-step picker
    const [showTvPicker, setShowTvPicker] = useState(false);
    const [tvShowSearchToken, setTvShowSearchToken] = useState(0);
    const [selectedTvShow, setSelectedTvShow] = useState<TvShowResult | null>(null);
    const [tvEpisodeSearchToken, setTvEpisodeSearchToken] = useState(0);

    // ── Generic search hooks ───────────────────────────────────────────
    const music = useSearchPicker<MusicSearchResult>({ category, targetCategory: 'music', readOnly, enabled: showMusicResults, query: title, endpoint: '/api/music/search', token: musicSearchToken });
    const movies = useSearchPicker<MovieSearchResult>({ category, targetCategory: 'movie', readOnly, enabled: showMovieResults, query: title, endpoint: '/api/movies/search', token: movieSearchToken });
    const restaurants = useSearchPicker<RestaurantSearchResult>({ category, targetCategory: 'restaurant', readOnly, enabled: showRestaurantResults, query: title, endpoint: '/api/places/search', token: restaurantSearchToken });
    const books = useSearchPicker<BookSearchResult>({ category, targetCategory: 'book', readOnly, enabled: showBookResults, query: title, endpoint: '/api/books/search', token: bookSearchToken });
    const breweries = useSearchPicker<BrewerySearchResult>({ category, targetCategory: 'beer', readOnly, enabled: showBreweryResults, query: subtitle, endpoint: '/api/breweries/search', token: brewerySearchToken });

    // Podcast show search (only when no show selected)
    const podcastShows = useSearchPicker<PodcastShowResult>({ category, targetCategory: 'podcast', readOnly, enabled: showPodcastPicker && !selectedPodcast, query: title, endpoint: '/api/podcasts/search', token: podcastShowSearchToken });

    // TV show search (only when no show selected)
    const tvShows = useSearchPicker<TvShowResult>({ category, targetCategory: 'tv', readOnly, enabled: showTvPicker && !selectedTvShow, query: title, endpoint: '/api/tv/search', token: tvShowSearchToken });

    // ── Podcast episode fetch ──────────────────────────────────────────
    const [podcastEpisodes, setPodcastEpisodes] = useState<PodcastEpisodeResult[]>([]);
    const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);

    useEffect(() => {
        if (readOnly || category !== 'podcast' || !selectedPodcast?.feedUrl) {
            if (!selectedPodcast) setPodcastEpisodes([]);
            return;
        }
        if (podcastEpisodeSearchToken === 0) return;
        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsLoadingEpisodes(true);
                const response = await fetch(`/api/podcasts/episodes?feedUrl=${encodeURIComponent(selectedPodcast.feedUrl)}`, { signal: controller.signal });
                if (!response.ok) { setPodcastEpisodes([]); return; }
                const results = (await response.json()) as PodcastEpisodeResult[];
                setPodcastEpisodes(results);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) console.error('Podcast episode fetch failed:', error);
            } finally { setIsLoadingEpisodes(false); }
        }, 120);
        return () => { controller.abort(); window.clearTimeout(timeoutId); };
    }, [category, readOnly, selectedPodcast, podcastEpisodeSearchToken]);

    // ── TV episode fetch ───────────────────────────────────────────────
    const [tvEpisodes, setTvEpisodes] = useState<TvEpisodeResult[]>([]);
    const [isLoadingTvEpisodes, setIsLoadingTvEpisodes] = useState(false);

    // ── Repeat-tag detection (client-side, canonical key) ─────────────
    const repeatInfo = useMemo(() => {
        if (!allUserItems || !title.trim()) return null;
        const draftExternalKey = getItemExternalIdentityKey(category, draft.image);
        const draftKey = getCanonicalItemKey({ category, title, subtitle });
        const matches = allUserItems.filter(item => {
            if (existingItem && item.id === existingItem.id) return false;
            if (draftExternalKey) {
                return getItemExternalIdentityKey(item.category, item.image) === draftExternalKey;
            }
            return getCanonicalItemKey(item) === draftKey;
        });
        if (matches.length === 0) return null;
        const sorted = [...matches].sort((a, b) => b.createdAt - a.createdAt);
        const latestWithReviewData = sorted.find((item) => {
            const hasRating = item.rating !== undefined && item.rating !== null;
            const hasNotes = !!item.notes?.trim();
            return hasRating || hasNotes;
        });
        return {
            count: matches.length + 1,
            verb: getRepeatTagVerb(category),
            latestPrevious: latestWithReviewData || sorted[0],
        };
    }, [allUserItems, category, title, subtitle, existingItem, draft.image]);

    // ── Auto-populate from previous repeat ─────────────────────────────
    const [populatedFromId, setPopulatedFromId] = useState<string | null>(null);
    useEffect(() => {
        if (!repeatInfo?.latestPrevious) return;
        const prev = repeatInfo.latestPrevious;
        // Only re-populate if this is a different previous item than last time
        if (populatedFromId === prev.id) return;

        const shouldApplyRating = (rating === undefined || rating === null) && (prev.rating !== undefined && prev.rating !== null);
        const shouldApplyNotes = (!notes || notes.trim() === '') && !!prev.notes?.trim();
        if (!shouldApplyRating && !shouldApplyNotes) {
            setPopulatedFromId(prev.id);
            return;
        }

        setDraft((d) => ({
            ...d,
            rating: shouldApplyRating ? prev.rating : d.rating,
            notes: shouldApplyNotes ? (prev.notes || '') : d.notes,
        }));
        setPopulatedFromId(prev.id);
    }, [repeatInfo, populatedFromId, rating, notes]);

    useEffect(() => {
        if (!isOpen) return;
        setDraft(buildInitialDraft(initialCategory, existingItem));
        setPopulatedFromId(null);
    }, [existingItem, initialCategory, isOpen]);

    useEffect(() => {
        if (readOnly || category !== 'tv' || !selectedTvShow?.id) {
            if (!selectedTvShow) setTvEpisodes([]);
            return;
        }
        if (tvEpisodeSearchToken === 0) return;
        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsLoadingTvEpisodes(true);
                const response = await fetch(`/api/tv/episodes?showId=${encodeURIComponent(selectedTvShow.id)}`, { signal: controller.signal });
                if (!response.ok) { setTvEpisodes([]); return; }
                const results = (await response.json()) as TvEpisodeResult[];
                setTvEpisodes(results);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) console.error('TV episode fetch failed:', error);
            } finally { setIsLoadingTvEpisodes(false); }
        }, 120);
        return () => { controller.abort(); window.clearTimeout(timeoutId); };
    }, [category, readOnly, selectedTvShow, tvEpisodeSearchToken]);

    // ── Handlers ───────────────────────────────────────────────────────
    const handleSave = useCallback(() => {
        if (!draft.title.trim()) return;
        onSave?.({
            category: draft.category,
            title: draft.title,
            subtitle: draft.subtitle,
            rating: draft.rating,
            notes: draft.notes,
            image: draft.image,
        });
        onClose();
    }, [draft, onClose, onSave]);

    const handleDelete = () => {
        if (onDelete && confirm('Delete this entry?')) {
            onDelete();
            onClose();
        }
    };

    const config = getCategoryConfig(category);
    const itemPageHref = existingItem ? buildItemPath(existingItem) : null;
    const showItemPageLink = !!existingItem && hasItemAggregatePage(existingItem.category);
    const restaurantMapHref = (existingItem?.category === 'restaurant' || category === 'restaurant')
        ? toGoogleMapsLink(draft.image || existingItem?.image, title, subtitle)
        : null;

    // ── Keyboard shortcuts ─────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isOpen) handleSave();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, handleSave]);

    // ── Trigger search for a category ──────────────────────────────────
    const triggerSearch = () => {
        if (category === 'music') { setShowMusicResults(true); setMusicSearchToken((p) => p + 1); }
        if (category === 'movie') { setShowMovieResults(true); setMovieSearchToken((p) => p + 1); }
        if (category === 'podcast') { setShowPodcastPicker(true); setSelectedPodcast(null); setPodcastEpisodes([]); setPodcastShowSearchToken((p) => p + 1); }
        if (category === 'tv') { setShowTvPicker(true); setSelectedTvShow(null); setTvEpisodes([]); setTvShowSearchToken((p) => p + 1); }
        if (category === 'restaurant') { setShowRestaurantResults(true); setRestaurantSearchToken((p) => p + 1); }
        if (category === 'book') { setShowBookResults(true); setBookSearchToken((p) => p + 1); }
    };

    const searchButtonLabel =
        category === 'restaurant' ? 'Search Places'
            : category === 'podcast' ? 'Search Shows'
                : category === 'tv' ? 'Search Shows'
                    : category === 'book' ? 'Search Books'
                        : 'Search';

    // ── Render ──────────────────────────────────────────────────────────
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-white/95 z-50 flex items-start sm:items-center justify-center pt-4 sm:pt-0"
            onClick={onClose}
        >
            <div
                className="bg-white border border-neutral-300 w-full sm:max-w-md font-mono flex flex-col" style={{ maxHeight: '90vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header — category colored */}
                <div
                    className="flex items-center justify-between px-4 py-3 border-b border-neutral-300"
                    style={{ backgroundColor: config.color + '40' }}
                >
                    <div className="flex items-center gap-2">
                        {readOnly ? (
                            <span className="text-xs font-bold uppercase tracking-widest text-neutral-800">
                                {config.shortLabel}
                            </span>
                        ) : (
                            <div className="relative group">
                                <select
                                    value={category}
                                    onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value as Category }))}
                                    className="appearance-none bg-transparent text-xs font-bold uppercase tracking-widest text-neutral-800 outline-none cursor-pointer pr-4 min-w-[130px]"
                                >
                                    {Array.from(new Set([category, ...DEFAULT_CATEGORIES])).map((cat) => {
                                        const optionConfig = getCategoryConfig(cat);
                                        return (
                                            <option key={optionConfig.id} value={optionConfig.id}>
                                                {optionConfig.shortLabel}
                                            </option>
                                        );
                                    })}
                                </select>
                                <span className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-[8px] text-neutral-500">
                                    ▼
                                </span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-neutral-500 hover:text-neutral-800 text-2xl leading-none w-8 h-8 flex items-center justify-center -mr-2"
                    >
                        ×
                    </button>
                </div>

                {/* Form — scrollable */}
                <div className="p-4 space-y-6 overflow-y-auto flex-1">
                    {/* Top Section: Title/Subtitle + Score Box */}
                    <div className="flex gap-4">
                        <div className="flex-1 space-y-4">
                            {/* Title */}
                            <div>
                                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                    {config.titleLabel}
                                </label>
                                <input
                                    autoFocus={!readOnly}
                                    disabled={readOnly}
                                    type="text"
                                    value={title}
                                    onChange={(e) => {
                                        setDraft((prev) => ({ ...prev, title: e.target.value }));
                                        if (category === 'podcast' && selectedPodcast) { setSelectedPodcast(null); setPodcastEpisodes([]); }
                                        if (category === 'tv' && selectedTvShow) { setSelectedTvShow(null); setTvEpisodes([]); }
                                    }}
                                    className="w-full text-base font-mono outline-none border-b border-neutral-200 focus:border-neutral-400 py-1 bg-transparent disabled:text-neutral-600 disabled:border-transparent"
                                />
                                {repeatInfo && title.trim() && (
                                    <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-700">
                                        {repeatInfo.verb} × {repeatInfo.count}{repeatInfo.latestPrevious && !existingItem ? ' • previous review loaded' : ''}
                                    </div>
                                )}
                                {!readOnly && ['music', 'movie', 'podcast', 'tv', 'restaurant', 'book'].includes(category) && (
                                    <div className="mt-2 flex justify-end">
                                        <button type="button" onClick={triggerSearch}
                                            className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:border-neutral-500">
                                            {searchButtonLabel}
                                        </button>
                                    </div>
                                )}
                                {/* Music results */}
                                {category === 'music' && !readOnly && (
                                    <SearchResultsPanel
                                        visible={showMusicResults}
                                        isSearching={music.isSearching}
                                        results={music.results}
                                        query={title}
                                        searchingLabel="Searching..."
                                        emptyLabel="No results"
                                        keyExtractor={(r) => r.id}
                                        renderResult={(r) => (
                                            <button type="button" onClick={() => {
                                                setDraft((prev) => ({
                                                    ...prev,
                                                    title: r.title,
                                                    subtitle: r.artist,
                                                    image: serializeItemMeta({
                                                        ...parseItemMeta(prev.image),
                                                        imageUrl: r.image || parseItemMeta(prev.image).imageUrl,
                                                        externalSource: 'musicbrainz',
                                                        externalId: r.id,
                                                    }),
                                                }));
                                                setShowMusicResults(false);
                                            }}
                                                className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                <div className="text-sm text-neutral-900">{r.title}</div>
                                                <div className="text-xs text-neutral-500">{r.artist || 'Unknown artist'}{r.releaseDate ? ` • ${r.releaseDate}` : ''}</div>
                                            </button>
                                        )}
                                    />
                                )}
                                {/* Movie results */}
                                {category === 'movie' && !readOnly && (
                                    <SearchResultsPanel
                                        visible={showMovieResults}
                                        isSearching={movies.isSearching}
                                        results={movies.results}
                                        query={title}
                                        searchingLabel="Searching..."
                                        emptyLabel="No results"
                                        keyExtractor={(r) => r.id}
                                        renderResult={(r) => (
                                            <button type="button" onClick={() => {
                                                const source = r.id.startsWith('tt') ? 'imdb' : 'itunes';
                                                setDraft((prev) => ({
                                                    ...prev,
                                                    title: r.title,
                                                    subtitle: r.subtitle || prev.subtitle,
                                                    image: serializeItemMeta({
                                                        ...parseItemMeta(prev.image),
                                                        imageUrl: r.image || parseItemMeta(prev.image).imageUrl,
                                                        externalSource: source,
                                                        externalId: r.id,
                                                    }),
                                                }));
                                                setShowMovieResults(false);
                                            }}
                                                className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                <div className="text-sm text-neutral-900">{r.title}</div>
                                                <div className="text-xs text-neutral-500">{r.subtitle || 'Unknown'}{r.releaseDate ? ` • ${r.releaseDate}` : ''}</div>
                                            </button>
                                        )}
                                    />
                                )}
                                {/* Podcast picker */}
                                {category === 'podcast' && !readOnly && showPodcastPicker && (
                                    <div className="mt-2 border border-neutral-300 bg-white max-h-56 overflow-y-auto">
                                        {!selectedPodcast && (
                                            <SearchResultsPanel
                                                visible={true}
                                                isSearching={podcastShows.isSearching}
                                                results={podcastShows.results}
                                                query={title}
                                                searchingLabel="Searching shows..."
                                                emptyLabel="No shows"
                                                keyExtractor={(r) => r.id}
                                                renderResult={(show) => (
                                                    <button type="button" onClick={() => {
                                                        setSelectedPodcast(show);
                                                        setPodcastEpisodes([]);
                                                        setPodcastEpisodeSearchToken(0);
                                                        setDraft((prev) => ({
                                                            ...prev,
                                                            title: show.name,
                                                            subtitle: '',
                                                            image: serializeItemMeta({
                                                                ...parseItemMeta(prev.image),
                                                                imageUrl: show.image || parseItemMeta(prev.image).imageUrl,
                                                                externalSource: 'itunes-podcast-show',
                                                                externalId: show.id,
                                                            }),
                                                        }));
                                                    }} className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                        <div className="text-sm text-neutral-900">{show.name}</div>
                                                        <div className="text-xs text-neutral-500">{show.author || 'Unknown'}</div>
                                                    </button>
                                                )}
                                            />
                                        )}
                                        {selectedPodcast && (
                                            <>
                                                <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] uppercase tracking-wider text-neutral-500">Show</div>
                                                        <div className="text-xs text-neutral-800 truncate">{selectedPodcast.name}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button type="button" onClick={() => setPodcastEpisodeSearchToken((p) => p + 1)}
                                                            className="text-[10px] uppercase tracking-wider border border-neutral-300 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:border-neutral-500">
                                                            Load Episodes
                                                        </button>
                                                        <button type="button" onClick={() => { setSelectedPodcast(null); setPodcastEpisodes([]); setPodcastEpisodeSearchToken(0); setDraft((prev) => ({ ...prev, title: '' })); }}
                                                            className="text-[10px] uppercase tracking-wider text-neutral-600 hover:text-neutral-900">
                                                            Change
                                                        </button>
                                                    </div>
                                                </div>
                                                {isLoadingEpisodes && <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">Loading episodes...</div>}
                                                {!isLoadingEpisodes && podcastEpisodeSearchToken === 0 && <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">Click load episodes</div>}
                                                {!isLoadingEpisodes && podcastEpisodeSearchToken > 0 && podcastEpisodes.length === 0 && <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">No episodes</div>}
                                                {!isLoadingEpisodes && podcastEpisodes.map((ep) => (
                                                    <button key={ep.id} type="button" onClick={() => {
                                                        const episodeIdentity = `${selectedPodcast.id}:${ep.id}`;
                                                        setDraft((prev) => ({
                                                            ...prev,
                                                            title: ep.title,
                                                            subtitle: selectedPodcast.name,
                                                            image: serializeItemMeta({
                                                                ...parseItemMeta(prev.image),
                                                                imageUrl: selectedPodcast.image || parseItemMeta(prev.image).imageUrl,
                                                                externalSource: 'itunes-podcast-episode',
                                                                externalId: episodeIdentity,
                                                            }),
                                                        }));
                                                        setShowPodcastPicker(false);
                                                    }}
                                                        className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                        <div className="text-sm text-neutral-900">{ep.title}</div>
                                                        <div className="text-xs text-neutral-500">{ep.publishedAt || 'Recent episode'}</div>
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                                {/* TV picker */}
                                {category === 'tv' && !readOnly && showTvPicker && (
                                    <div className="mt-2 border border-neutral-300 bg-white max-h-56 overflow-y-auto">
                                        {!selectedTvShow && (
                                            <SearchResultsPanel
                                                visible={true}
                                                isSearching={tvShows.isSearching}
                                                results={tvShows.results}
                                                query={title}
                                                searchingLabel="Searching shows..."
                                                emptyLabel="No shows"
                                                keyExtractor={(r) => r.id}
                                                renderResult={(show) => (
                                                    <button type="button" onClick={() => {
                                                        setSelectedTvShow(show);
                                                        setTvEpisodes([]);
                                                        setTvEpisodeSearchToken(0);
                                                        setDraft((prev) => ({
                                                            ...prev,
                                                            title: show.name,
                                                            subtitle: '',
                                                            image: serializeItemMeta({
                                                                ...parseItemMeta(prev.image),
                                                                imageUrl: show.image || parseItemMeta(prev.image).imageUrl,
                                                                externalSource: 'tvmaze-show',
                                                                externalId: show.id,
                                                            }),
                                                        }));
                                                        setShowTvPicker(true);
                                                    }} className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                        <div className="text-sm text-neutral-900">{show.name}</div>
                                                        <div className="text-xs text-neutral-500">{show.network || 'TV'}{show.premiered ? ` • ${show.premiered}` : ''}</div>
                                                    </button>
                                                )}
                                            />
                                        )}
                                        {selectedTvShow && (
                                            <>
                                                <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] uppercase tracking-wider text-neutral-500">Show</div>
                                                        <div className="text-xs text-neutral-800 truncate">{selectedTvShow.name}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button type="button" onClick={() => setTvEpisodeSearchToken((p) => p + 1)}
                                                            className="text-[10px] uppercase tracking-wider border border-neutral-300 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:border-neutral-500">
                                                            Load Episodes
                                                        </button>
                                                        <button type="button" onClick={() => { setSelectedTvShow(null); setTvEpisodes([]); setTvEpisodeSearchToken(0); setDraft((prev) => ({ ...prev, title: '', subtitle: '' })); }}
                                                            className="text-[10px] uppercase tracking-wider text-neutral-600 hover:text-neutral-900">
                                                            Change
                                                        </button>
                                                    </div>
                                                </div>
                                                {isLoadingTvEpisodes && <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">Loading episodes...</div>}
                                                {!isLoadingTvEpisodes && tvEpisodeSearchToken === 0 && <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">Click load episodes</div>}
                                                {!isLoadingTvEpisodes && tvEpisodeSearchToken > 0 && tvEpisodes.length === 0 && <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">No episodes</div>}
                                                {!isLoadingTvEpisodes && tvEpisodes.map((ep) => (
                                                    <button key={ep.id} type="button" onClick={() => {
                                                        const episodeIdentity = `${selectedTvShow.id}:${ep.id}`;
                                                        setDraft((prev) => ({
                                                            ...prev,
                                                            title: selectedTvShow.name,
                                                            subtitle: ep.label,
                                                            image: serializeItemMeta({
                                                                ...parseItemMeta(prev.image),
                                                                imageUrl: selectedTvShow.image || parseItemMeta(prev.image).imageUrl,
                                                                externalSource: 'tvmaze-episode',
                                                                externalId: episodeIdentity,
                                                            }),
                                                        }));
                                                        setShowTvPicker(false);
                                                    }}
                                                        className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                        <div className="text-sm text-neutral-900">{ep.label}</div>
                                                        <div className="text-xs text-neutral-500">{ep.airdate || 'Recent episode'}</div>
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                                {/* Restaurant results */}
                                {category === 'restaurant' && !readOnly && (
                                    <SearchResultsPanel
                                        visible={showRestaurantResults}
                                        isSearching={restaurants.isSearching}
                                        results={restaurants.results}
                                        query={title}
                                        searchingLabel="Searching places..."
                                        emptyLabel="No places"
                                        maxHeightClass="max-h-56"
                                        keyExtractor={(r) => r.id}
                                        renderResult={(place) => (
                                            <button type="button" onClick={() => {
                                                const nextImageRef = place.googleMapsUri
                                                    ? `mapsurl:${encodeURIComponent(place.googleMapsUri)}`
                                                    : `place:${place.id}`;
                                                setDraft((prev) => ({
                                                    ...prev,
                                                    title: place.name,
                                                    image: serializeItemMeta({
                                                        ...parseItemMeta(prev.image),
                                                        imageUrl: nextImageRef,
                                                        restaurantLocation: place.address || parseItemMeta(prev.image).restaurantLocation,
                                                        externalSource: 'google-places',
                                                        externalId: place.id,
                                                    }),
                                                }));
                                                setShowRestaurantResults(false);
                                            }} className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                <div className="text-sm text-neutral-900">{place.name}</div>
                                                <div className="text-xs text-neutral-500">{place.address || 'No address'}</div>
                                            </button>
                                        )}
                                    />
                                )}
                                {/* Book results */}
                                {category === 'book' && !readOnly && (
                                    <SearchResultsPanel
                                        visible={showBookResults}
                                        isSearching={books.isSearching}
                                        results={books.results}
                                        query={title}
                                        searchingLabel="Searching books..."
                                        emptyLabel="No books"
                                        maxHeightClass="max-h-56"
                                        keyExtractor={(r) => r.id}
                                        renderResult={(book) => (
                                            <button type="button" onClick={() => {
                                                const source = /^OL\d+W$/i.test(book.id) ? 'openlibrary' : 'googlebooks';
                                                setDraft((prev) => ({
                                                    ...prev,
                                                    title: book.title,
                                                    subtitle: book.author || prev.subtitle,
                                                    image: serializeItemMeta({
                                                        ...parseItemMeta(prev.image),
                                                        externalSource: source,
                                                        externalId: book.id,
                                                    }),
                                                }));
                                                setShowBookResults(false);
                                            }}
                                                className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                <div className="text-sm text-neutral-900">{book.title}</div>
                                                <div className="text-xs text-neutral-500">{book.author || 'Unknown author'}{book.publishedDate ? ` • ${book.publishedDate}` : ''}</div>
                                            </button>
                                        )}
                                    />
                                )}
                            </div>
                            {/* Subtitle */}
                            {category !== 'cooking' && (
                                <div>
                                    <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                        {config.subtitleLabel}
                                    </label>
                                    {readOnly ? (
                                        <div className="text-sm font-mono text-neutral-700 py-1">
                                            {subtitle || '—'}
                                        </div>
                                    ) : (
                                        <textarea
                                            rows={2}
                                            value={subtitle}
                                            onChange={(e) => {
                                                setDraft((prev) => ({ ...prev, subtitle: e.target.value }));
                                                if (category === 'podcast') setShowPodcastPicker(true);
                                                if (category === 'tv') setShowTvPicker(true);
                                            }}
                                            placeholder={config.subtitlePlaceholder}
                                            className="w-full text-sm font-mono border border-neutral-300 focus:border-neutral-400 outline-none p-2 bg-transparent"
                                        />
                                    )}
                                    {category === 'beer' && !readOnly && (
                                        <div className="mt-2 flex justify-end">
                                            <button type="button" onClick={() => { setShowBreweryResults(true); setBrewerySearchToken((p) => p + 1); }}
                                                className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:border-neutral-500">
                                                Search Breweries
                                            </button>
                                        </div>
                                    )}
                                    {category === 'beer' && !readOnly && (
                                        <SearchResultsPanel
                                            visible={showBreweryResults}
                                            isSearching={breweries.isSearching}
                                            results={breweries.results}
                                            query={subtitle}
                                            searchingLabel="Searching breweries..."
                                            emptyLabel="No breweries"
                                            maxHeightClass="max-h-56"
                                            keyExtractor={(r) => r.id}
                                            renderResult={(brewery) => (
                                                <button type="button" onClick={() => {
                                                    setDraft((prev) => ({
                                                        ...prev,
                                                        subtitle: brewery.name,
                                                        image: serializeItemMeta({
                                                            ...parseItemMeta(prev.image),
                                                            externalSource: 'openbrewerydb',
                                                            externalId: brewery.id,
                                                        }),
                                                    }));
                                                    setShowBreweryResults(false);
                                                }}
                                                    className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                    <div className="text-sm text-neutral-900">{brewery.name}</div>
                                                    <div className="text-xs text-neutral-500">{brewery.location || 'Unknown location'}</div>
                                                </button>
                                            )}
                                        />
                                    )}
                                    {category === 'restaurant' && (
                                        <div className="mt-3">
                                            <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                                Location
                                            </label>
                                            {readOnly ? (
                                                <div className="text-sm font-mono text-neutral-700 py-1">
                                                    {restaurantLocation || <span className="text-neutral-400">—</span>}
                                                </div>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={restaurantLocation}
                                                    onChange={(e) => {
                                                        const nextLocation = e.target.value;
                                                        setDraft((prev) => ({
                                                            ...prev,
                                                            image: serializeItemMeta({
                                                                ...parseItemMeta(prev.image),
                                                                restaurantLocation: nextLocation.trim() || undefined,
                                                            }),
                                                        }));
                                                    }}
                                                    placeholder="Restaurant location/address"
                                                    className="w-full text-sm font-mono border border-neutral-300 focus:border-neutral-400 outline-none p-2 bg-transparent"
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Score Box */}
                        <div className="flex-shrink-0 pt-6">
                            {readOnly ? (
                                <div className="w-16 h-16 border-2 border-neutral-200 flex flex-col items-center justify-center bg-neutral-50/50">
                                    <span className="text-2xl font-bold text-neutral-800 leading-none">{rating || '—'}</span>
                                    <span className="text-[9px] text-neutral-400 mt-0.5">/ 10</span>
                                </div>
                            ) : (
                                <div className="w-16 h-16 border-2 border-neutral-300 hover:border-neutral-400 flex flex-col items-center justify-center relative bg-white">
                                    <input
                                        type="number" min="0" max="10" step="0.1"
                                        value={rating || ''}
                                        onChange={(e) => {
                                            setDraft((prev) => ({ ...prev, rating: parseFloat(e.target.value) || undefined }));
                                        }}
                                        className="w-full h-full bg-transparent text-center text-2xl font-bold text-neutral-800 outline-none absolute inset-0 z-10 p-0"
                                        placeholder="-"
                                    />
                                    <span className="text-[9px] text-neutral-400 absolute bottom-1.5 z-0 pointer-events-none">/ 10</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Notes / Cooking layout */}
                    {category === 'cooking' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">Recipe URL</label>
                                {readOnly ? (
                                    recipeUrl ? (
                                        <a href={recipeUrl} target="_blank" rel="noreferrer" className="text-xs text-neutral-700 underline hover:text-neutral-900 break-all">{recipeUrl}</a>
                                    ) : (
                                        <div className="text-sm font-mono text-neutral-300">No URL</div>
                                    )
                                ) : (
                                    <input type="url" value={recipeUrl}
                                        onChange={(e) => {
                                            const next = e.target.value;
                                            setDraft((prev) => {
                                                const meta = parseItemMeta(prev.image);
                                                return { ...prev, image: serializeItemMeta({ ...meta, recipeUrl: next.trim() || undefined }) };
                                            });
                                        }}
                                        placeholder="https://..."
                                        className="w-full text-xs font-mono outline-none border border-neutral-300 focus:border-neutral-500 p-2 bg-white"
                                    />
                                )}
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">{config.subtitleLabel}</label>
                                {readOnly ? (
                                    <div className="text-sm font-mono text-neutral-700 whitespace-pre-wrap bg-neutral-50 p-3 border border-neutral-200">
                                        {subtitle || <span className="text-neutral-300">No ingredients</span>}
                                    </div>
                                ) : (
                                    <textarea value={subtitle} onChange={(e) => {
                                        setDraft((prev) => ({ ...prev, subtitle: e.target.value }));
                                    }}
                                        rows={8} placeholder="One ingredient per line..."
                                        className="w-full text-sm font-mono outline-none bg-neutral-50 p-3 border border-neutral-200 focus:border-neutral-400 resize-y placeholder:text-neutral-300" />
                                )}
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">{config.notesLabel || 'Instructions'}</label>
                                {readOnly ? (
                                    <div className="text-sm font-mono text-neutral-700 whitespace-pre-wrap bg-neutral-50 p-3 border border-neutral-200">
                                        {notes || <span className="text-neutral-300">No instructions</span>}
                                    </div>
                                ) : (
                                    <textarea value={notes} onChange={(e) => {
                                        setDraft((prev) => ({ ...prev, notes: e.target.value }));
                                    }}
                                        rows={8} placeholder="Step-by-step instructions..."
                                        className="w-full text-sm font-mono outline-none bg-neutral-50 p-3 border border-neutral-200 focus:border-neutral-400 resize-y placeholder:text-neutral-300" />
                                )}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">{config.notesLabel || 'Notes'}</label>
                            {readOnly ? (
                                <div className="text-sm font-mono text-neutral-700 whitespace-pre-wrap leading-relaxed py-2 border-t border-neutral-100 min-h-[100px]">
                                    {notes || <span className="text-neutral-400 italic">No notes</span>}
                                </div>
                            ) : (
                                <textarea value={notes} onChange={(e) => {
                                    setDraft((prev) => ({ ...prev, notes: e.target.value }));
                                }}
                                    rows={8} placeholder={config.notesPlaceholder || 'Add notes...'}
                                    className="w-full text-sm font-mono outline-none border border-neutral-300 focus:border-neutral-400 p-3 bg-transparent resize-y placeholder:text-neutral-300" />
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 z-10 flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-t border-neutral-300 bg-neutral-50/95 backdrop-blur supports-[backdrop-filter]:bg-neutral-50/90 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
                    <div>
                        {existingItem && onDelete && !readOnly && (
                            <button onClick={handleDelete} className="text-xs uppercase tracking-widest text-neutral-400 hover:text-red-600">
                                Delete
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        {restaurantMapHref && (
                            <a href={restaurantMapHref} target="_blank" rel="noreferrer"
                                className="text-xs uppercase tracking-widest text-neutral-600 hover:text-neutral-900 px-3 py-1 border border-neutral-300 hover:border-neutral-500">
                                Open Google
                            </a>
                        )}
                        {showItemPageLink && itemPageHref && (
                            <Link href={itemPageHref}
                                className="text-xs uppercase tracking-widest text-neutral-600 hover:text-neutral-900 px-3 py-1 border border-neutral-300 hover:border-neutral-500">
                                Open Item Page
                            </Link>
                        )}
                        <button onClick={onClose} className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-700 px-3 py-2">
                            Cancel
                        </button>
                        {!readOnly && (
                            <button onClick={handleSave} disabled={!title.trim()}
                                className="text-xs uppercase tracking-widest bg-neutral-800 text-white px-4 sm:px-5 py-2 min-h-[40px] hover:bg-neutral-700 disabled:opacity-30">
                                Save
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
