"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { Category, DEFAULT_CATEGORIES, getCategoryConfig, useSocialStore, usePublicProfile } from '@/lib/social-prototype/store';
import { useAuth } from '@/lib/auth';
import { buildItemPath, getCanonicalItemKey, getItemPageSlug, getRepeatTagVerb, hasItemAggregatePage } from '@/lib/social-prototype/items';
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
    BirdSearchResult,
    buildInitialDraft,
} from './consumable-modal-types';

export type { ConsumableModalProps } from './consumable-modal-types';

export function ConsumableModal({ isOpen, onClose, onSave, onDelete, initialCategory = 'movie', initialTitle, existingItem, readOnly = false, allUserItems, sourceUserId }: ConsumableModalProps) {
    const { user } = useAuth();
    const { savedItems, toggleSaveItem, getAllItemsByCategory } = useSocialStore();
    const isSaved = useMemo(() => existingItem ? savedItems.some(s => s.itemId === existingItem.id) : false, [savedItems, existingItem]);
    const { profile: sourceProfile } = usePublicProfile(sourceUserId || '');
    const [draft, setDraft] = useState<ModalDraft>(() => buildInitialDraft(initialCategory, existingItem, initialTitle));
    const { category, title, subtitle, rating, notes } = draft;
    const parsedMeta = parseItemMeta(draft.image);
    const recipeUrl = parsedMeta.recipeUrl || '';
    const linkUrl = parsedMeta.linkUrl || '';
    const restaurantLocation = parsedMeta.restaurantLocation || '';

    // Parent/child categories (podcast, tv) require an episode-level external key before
    // showing notes, rating, or repeat-tag info. Without one the entry is a bare "dead card".
    const isParentChildCategory = category === 'podcast' || category === 'tv' || category === 'beer';
    const isEpisodeLinked = !isParentChildCategory ||
        parsedMeta.externalSource === 'itunes-podcast-episode' ||
        parsedMeta.externalSource === 'tvmaze-episode' ||
        category === 'beer';

    // ── Search visibility & token state ────────────────────────────────
    const [showMusicResults, setShowMusicResults] = useState(false);
    const [musicSearchToken, setMusicSearchToken] = useState(0);
    const [showMovieResults, setShowMovieResults] = useState(false);
    const [movieSearchToken, setMovieSearchToken] = useState(0);
    const [showRestaurantResults, setShowRestaurantResults] = useState(false);
    const [restaurantSearchToken, setRestaurantSearchToken] = useState(0);
    const [showLocationResults, setShowLocationResults] = useState(false);
    const [locationSearchToken, setLocationSearchToken] = useState(0);
    const [showBookResults, setShowBookResults] = useState(false);
    const [bookSearchToken, setBookSearchToken] = useState(0);
    const [showBreweryResults, setShowBreweryResults] = useState(false);
    const [brewerySearchToken, setBrewerySearchToken] = useState(0);
    const [showBirdResults, setShowBirdResults] = useState(false);
    const [birdSearchToken, setBirdSearchToken] = useState(0);

    // Podcast two-step picker
    const [showPodcastPicker, setShowPodcastPicker] = useState(false);
    const [podcastShowSearchToken, setPodcastShowSearchToken] = useState(0);
    const [selectedPodcast, setSelectedPodcast] = useState<PodcastShowResult | null>(null);
    const [podcastEpisodeSearchToken, setPodcastEpisodeSearchToken] = useState(0);

    // Gate — tracks whether the user has explicitly clicked "Review without linking"
    const [gateClicked, setGateClicked] = useState(false);

    // Exercise combobox
    const [showExerciseDropdown, setShowExerciseDropdown] = useState(false);

    // Beer combobox
    const [showBeerDropdown, setShowBeerDropdown] = useState(false);

    // Bird multi-select
    const [birdQuery, setBirdQuery] = useState('');

    // TV two-step picker
    const [showTvPicker, setShowTvPicker] = useState(false);
    const [tvShowSearchToken, setTvShowSearchToken] = useState(0);
    const [selectedTvShow, setSelectedTvShow] = useState<TvShowResult | null>(null);
    const [tvEpisodeSearchToken, setTvEpisodeSearchToken] = useState(0);

    // ── Generic search hooks ───────────────────────────────────────────
    const music = useSearchPicker<MusicSearchResult>({ category, targetCategory: 'music', readOnly, enabled: showMusicResults, query: title, endpoint: '/api/music/search', token: musicSearchToken });
    const movies = useSearchPicker<MovieSearchResult>({ category, targetCategory: 'movie', readOnly, enabled: showMovieResults, query: title, endpoint: '/api/movies/search', token: movieSearchToken });
    const restaurants = useSearchPicker<RestaurantSearchResult>({ category, targetCategory: 'restaurant', readOnly, enabled: showRestaurantResults, query: title, endpoint: '/api/places/search', token: restaurantSearchToken });
    const locationPlaces = useSearchPicker<RestaurantSearchResult>({ category, targetCategory: 'location', readOnly, enabled: showLocationResults, query: title, endpoint: '/api/places/search', token: locationSearchToken });
    const books = useSearchPicker<BookSearchResult>({ category, targetCategory: 'book', readOnly, enabled: showBookResults, query: title, endpoint: '/api/books/search', token: bookSearchToken });
    const breweries = useSearchPicker<BrewerySearchResult>({ category, targetCategory: 'beer', readOnly, enabled: showBreweryResults, query: subtitle, endpoint: '/api/breweries/search', token: brewerySearchToken });
    const birds = useSearchPicker<BirdSearchResult>({ category, targetCategory: 'bird', readOnly, enabled: showBirdResults, query: birdQuery, endpoint: '/api/birds/search', token: birdSearchToken });

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
                const response = await fetch(
                    `/api/podcasts/episodes?podcastId=${encodeURIComponent(selectedPodcast.id)}&feedUrl=${encodeURIComponent(selectedPodcast.feedUrl)}&limit=300`,
                    { signal: controller.signal }
                );
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

    const config = getCategoryConfig(category);

    // ── Linkage status — determines whether the card is "alive" ────────
    // API categories need externalSource, URL categories need a URL,
    // coupling:'none' categories are always linked (no linkage step).
    const isLinked = config.coupling === 'none'
        || (config.coupling === 'url' && !!(parsedMeta.recipeUrl || parsedMeta.linkUrl))
        || (config.coupling === 'api' && !!parsedMeta.externalSource);

    // Clear the card back to dead state (reset everything).
    const clearLinkage = useCallback(() => {
        setDraft(prev => ({
            ...prev,
            title: '',
            subtitle: '',
            rating: undefined,
            notes: '',
            image: undefined,
        }));
        setPopulatedFromId(null);
        setGateClicked(false);
        // Reset parent-child picker state
        setSelectedPodcast(null);
        setPodcastEpisodes([]);
        setPodcastEpisodeSearchToken(0);
        setSelectedTvShow(null);
        setTvEpisodes([]);
        setTvEpisodeSearchToken(0);
    }, []);

    // ── Repeat-tag detection (client-side, canonical key) ─────────────
    // Only compute after linkage.
    const repeatInfo = useMemo(() => {
        if (!allUserItems || !title.trim() || category === 'book') return null;
        if (!isLinked) return null;
        const draftExternalKey = getItemExternalIdentityKey(category, draft.image);
        const draftKey = getCanonicalItemKey({ category, title, subtitle });
        // For TV: also match at show level so any previously watched episode of
        // the same show counts as a repeat (show-level key = title only).
        const draftShowKey = category === 'tv' ? `tv::${getItemPageSlug('tv', title)}` : null;
        const matches = allUserItems.filter(item => {
            if (existingItem && item.id === existingItem.id) return false;
            if (draftExternalKey) {
                const itemExternalKey = getItemExternalIdentityKey(item.category, item.image);
                if (itemExternalKey === draftExternalKey) return true;
            }
            if (getCanonicalItemKey(item) === draftKey) return true;
            // TV show-level fallback: match any episode of the same show
            if (draftShowKey && item.category === 'tv') {
                return `tv::${getItemPageSlug('tv', item.title)}` === draftShowKey;
            }
            return false;
        });
        if (matches.length === 0) return null;
        const sorted = [...matches].sort((a, b) => b.createdAt - a.createdAt);
        const latestWithReviewData = sorted.find((item) => {
            const hasRating = item.rating !== undefined && item.rating !== null;
            const hasNotes = !!item.notes?.trim();
            return hasRating || hasNotes;
        });
        return {
            count: matches.reduce((sum, m) => sum + Math.max(m.consumedDates?.length ?? 0, 1), 0) + 1,
            verb: getRepeatTagVerb(category),
            latestPrevious: latestWithReviewData || sorted[0],
        };
    }, [allUserItems, category, title, subtitle, existingItem, draft.image]);

    // ── Auto-populate from previous repeat ─────────────────────────────
    const [populatedFromId, setPopulatedFromId] = useState<string | null>(null);
    useEffect(() => {
        if (!repeatInfo?.latestPrevious) return;
        // Each episode of a podcast/TV show has its own notes & rating — don't carry over
        if (isParentChildCategory) return;
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
        setGateClicked(false);
        setShowBookResults(false);
        books.setResults([]);
        setShowMusicResults(false);
        music.setResults([]);
        setShowMovieResults(false);
        movies.setResults([]);
        setShowRestaurantResults(false);
        restaurants.setResults([]);
        setShowLocationResults(false);
        locationPlaces.setResults([]);
        setShowBreweryResults(false);
        breweries.setResults([]);
        setShowBirdResults(false);
        birds.setResults([]);
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

    // ── Book: propagate last page, total pages, cover, and mode from previous logs ──
    useEffect(() => {
        if (category !== 'book' || !allUserItems || !title.trim() || readOnly) return;
        const norm = (s: string) => s.trim().toLowerCase();
        // Sort all matching logs newest-first; exclude finished reviews (book-review) for progressPage
        const prevLogs = [...allUserItems]
            .filter(i => i.category === 'book' && norm(i.title) === norm(title))
            .sort((a, b) => b.createdAt - a.createdAt);
        if (prevLogs.length === 0) return;
        // Most recent progress log (not a finished review) gives us last known page
        const lastProgress = prevLogs.find(i => parseItemMeta(i.image).externalSource !== 'book-review');
        // Any log may carry totalPages / imageUrl
        const withTotal = prevLogs.find(i => parseItemMeta(i.image).totalPages);
        const withCover = prevLogs.find(i => parseItemMeta(i.image).imageUrl);
        setDraft(prev => {
            const prevMeta = parseItemMeta(prev.image);
            const updates: Record<string, unknown> = {};
            if (lastProgress && prevMeta.progressPage == null) {
                const lm = parseItemMeta(lastProgress.image);
                if (lm.progressPage != null) updates.progressPage = lm.progressPage;
                if (!prevMeta.progressMode && lm.progressMode) updates.progressMode = lm.progressMode;
            }
            if (withTotal && prevMeta.totalPages == null) updates.totalPages = parseItemMeta(withTotal.image).totalPages;
            if (withCover && !prevMeta.imageUrl) updates.imageUrl = parseItemMeta(withCover.image).imageUrl;
            if (Object.keys(updates).length === 0) return prev;
            return { ...prev, image: serializeItemMeta({ ...prevMeta, ...updates }) };
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, title, allUserItems, readOnly]);

    // ── Handlers ───────────────────────────────────────────────────────
    const handleSave = useCallback(() => {
        if (!draft.title.trim() && draft.category !== 'bird') return;
        let imageToSave = draft.image;
        if (draft.category === 'book' && parseItemMeta(draft.image).finished) {
            // Transition to SSOT on finish: use a stable external identity so
            // subsequent edits to the finished review merge rather than insert.
            const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const stableId = [norm(draft.title), norm((draft.subtitle || '').split(',')[0] || '')].filter(Boolean).join('-');
            imageToSave = serializeItemMeta({ ...parseItemMeta(draft.image), externalSource: 'book-review', externalId: stableId }) ?? draft.image;
        }
        onSave?.({
            category: draft.category,
            title: draft.title,
            subtitle: draft.subtitle,
            rating: draft.rating,
            notes: draft.notes,
            image: imageToSave,
        });
        onClose();
    }, [draft, onClose, onSave]);

    const handleDelete = () => {
        if (onDelete && confirm('Delete this entry?')) {
            onDelete();
            onClose();
        }
    };

    // All API-coupled categories support a "Review without linking" gate.
    // For parent/child the bar is episode-level; for single-entity any externalSource counts.
    // Gate hides when: already linked, already has review content, user clicked through, or readOnly.
    const hasSearchableApi = config.coupling === 'api';
    const isApiLinked = isParentChildCategory
        ? isEpisodeLinked
        : !!parsedMeta.externalSource;
    const hasReviewContent = !!(notes?.trim()) || rating !== undefined;
    // Beer is excluded: only the brewery (subtitle) is searchable, not the beer itself
    const showReviewGate = hasSearchableApi && category !== 'beer' && !isApiLinked && !hasReviewContent && !gateClicked && !readOnly;

    // For book: linked means the user confirmed via API search (cover URL fetched).
    // For all other categories: linked means externalSource+externalId are set.
    const isCoupled = category === 'book' ? !!parsedMeta.imageUrl : !!getItemExternalIdentityKey(category, draft.image);
    // Unified linkage check for the header badge — mirrors StatusCard logic.
    const isLinkedForDisplay = config.coupling === 'api'
        ? isCoupled
        : category === 'bird'
            ? !!((parsedMeta.birdList && parsedMeta.birdList.length > 0) || (parsedMeta.checklist && parsedMeta.checklist.length > 0))
            : config.coupling === 'none'
                ? true
                : !!(draft.rating || draft.notes?.trim() || draft.subtitle?.trim() || parsedMeta.recipeUrl || parsedMeta.linkUrl);
    const itemPageHref = existingItem ? buildItemPath(existingItem) : null;
    const showItemPageLink = !!existingItem && hasItemAggregatePage(existingItem.category) && isLinkedForDisplay;
    const restaurantMapHref = (existingItem?.category === 'restaurant' || category === 'restaurant' || existingItem?.category === 'location' || category === 'location')
        ? toGoogleMapsLink(draft.image || existingItem?.image, title, subtitle)
        : null;
    const linkCardHref = (existingItem?.category === 'link' || category === 'link') && linkUrl ? linkUrl : null;

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
        if (category === 'location') { setShowLocationResults(true); setLocationSearchToken((p) => p + 1); }
        if (category === 'book') { setShowBookResults(true); setBookSearchToken((p) => p + 1); }
        if (category === 'bird') { setShowBirdResults(true); setBirdSearchToken((p) => p + 1); }
    };

    const searchButtonLabel =
        category === 'restaurant' ? 'Search Places'
            : category === 'location' ? 'Search Places'
                : category === 'podcast' ? 'Search Shows'
                    : category === 'tv' ? 'Search Shows'
                        : category === 'book' ? 'Search Books'
                            : category === 'bird' ? 'Search eBird'
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
                        {(config.coupling !== 'none' || category === 'bird') && (
                            isLinkedForDisplay ? (
                                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: (config.color ?? '#d4d4d4') + '60', color: '#444' }}>
                                    filled
                                </span>
                            ) : !readOnly ? (
                                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                    {category === 'bird' ? 'search birds to fill' : config.coupling === 'api' ? 'search to fill' : 'add detail to fill'}
                                </span>
                            ) : null
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {readOnly && existingItem && user && sourceUserId && (
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        await toggleSaveItem(existingItem, sourceUserId);
                                    } catch { /* ignore */ }
                                }}
                                className="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-neutral-800 transition-colors"
                                title={isSaved ? 'Remove from Want to Check Out' : 'Save to Want to Check Out'}
                                aria-label={isSaved ? 'Unsave item' : 'Save item'}
                            >
                                <Bookmark size={22} className={isSaved ? 'fill-current' : ''} />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="text-neutral-500 hover:text-neutral-800 text-2xl leading-none w-8 h-8 flex items-center justify-center -mr-2"
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Attribution — shown when viewing another user's saved tag */}
                {readOnly && sourceUserId && existingItem && sourceProfile && (
                    <div className="px-4 py-2 border-b border-neutral-200 bg-neutral-50 flex items-center gap-2">
                        <span className="text-[10px] text-neutral-500">
                            Tagged by{' '}
                            <span className="font-semibold text-neutral-700">@{sourceProfile.username}</span>
                            {' · '}
                            {new Date(existingItem.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                    </div>
                )}

                {/* Form — scrollable */}
                <div className="p-4 space-y-6 overflow-y-auto flex-1">
                    {/* Top Section: Title/Subtitle + Score Box */}
                    <div className="flex gap-4">
                        <div className="flex-1 min-w-0 space-y-4">
                            {/* Beer: Brewery first (API-gated like other coupled cards) */}
                            {category === 'beer' && (() => {
                                const breweryLinked = parsedMeta.externalSource === 'openbrewerydb';
                                return (
                                <div>
                                    <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                        Brewery
                                    </label>
                                    {readOnly ? (
                                        <div className="text-sm font-mono text-neutral-700 py-1">
                                            {subtitle || '—'}
                                        </div>
                                    ) : breweryLinked ? (
                                        <div className="flex items-center border-b border-neutral-200">
                                            <span className="flex-1 text-base font-mono py-1 text-neutral-800 truncate">{subtitle}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDraft(prev => ({
                                                        ...prev,
                                                        subtitle: '',
                                                        title: '',
                                                        rating: undefined,
                                                        notes: '',
                                                        image: undefined,
                                                    }));
                                                    setPopulatedFromId(null);
                                                    setShowBreweryResults(false);
                                                }}
                                                className="ml-1 px-1.5 text-neutral-400 hover:text-neutral-700 text-sm"
                                                title="Clear brewery"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                        <input
                                            autoFocus
                                            type="text"
                                            value={subtitle}
                                            onChange={(e) => {
                                                setDraft((prev) => ({ ...prev, subtitle: e.target.value }));
                                            }}
                                            placeholder="Brewery name"
                                            className="w-full text-base font-mono outline-none border-b border-neutral-200 focus:border-neutral-400 py-1 bg-transparent"
                                        />
                                        <div className="mt-2 flex justify-end">
                                            <button type="button" onClick={() => { setShowBreweryResults(true); setBrewerySearchToken((p) => p + 1); }}
                                                className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:border-neutral-500">
                                                Search Breweries
                                            </button>
                                        </div>
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
                                                    setDraft((prev) => {
                                                        const beerTitle = prev.title.trim();
                                                        const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                                                        const childId = beerTitle ? `${brewery.id}:${norm(beerTitle)}` : brewery.id;
                                                        return {
                                                            ...prev,
                                                            subtitle: brewery.name,
                                                            image: serializeItemMeta({
                                                                externalSource: 'openbrewerydb',
                                                                externalId: childId,
                                                            }),
                                                        };
                                                    });
                                                    setPopulatedFromId(null);
                                                    setShowBreweryResults(false);
                                                }}
                                                    className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                    <div className="text-sm text-neutral-900">{brewery.name}</div>
                                                    <div className="text-xs text-neutral-500">{brewery.location || 'Unknown location'}</div>
                                                </button>
                                            )}
                                        />
                                        </>
                                    )}
                                </div>
                                );
                            })()}
                            {/* Title — for beer, gated behind brewery API link */}
                            {(category !== 'beer' || parsedMeta.externalSource === 'openbrewerydb' || readOnly) && <div>
                                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                    {category === 'beer' ? 'Beer Name' : config.titleLabel}
                                </label>
                                {category === 'beer' && !readOnly ? (() => {
                                    const currentBrewery = subtitle.trim().toLowerCase();
                                    const breweryBeers = getAllItemsByCategory('beer')
                                        .filter(i => i.title.trim() && (i.subtitle || '').trim().toLowerCase() === currentBrewery);
                                    const allBeerNames: string[] = Array.from(new Set<string>(
                                        breweryBeers.map(i => i.title.trim())
                                    )).sort();
                                    // Count occurrences for top-5 chips
                                    const beerCounts = new Map<string, number>();
                                    breweryBeers.forEach(i => {
                                        const name = i.title.trim();
                                        beerCounts.set(name, (beerCounts.get(name) || 0) + 1);
                                    });
                                    const topBeers = [...beerCounts.entries()]
                                        .sort((a, b) => b[1] - a[1])
                                        .slice(0, 5)
                                        .map(([name]) => name);
                                    const filtered: string[] = title.trim()
                                        ? allBeerNames.filter(n => n.toLowerCase().includes(title.toLowerCase()))
                                        : allBeerNames;
                                    return (
                                        <>
                                        <div className="relative">
                                            <div className="flex items-center border-b border-neutral-200 focus-within:border-neutral-400">
                                                <input
                                                    type="text"
                                                    value={title}
                                                    onChange={(e) => {
                                                        setDraft((prev) => ({ ...prev, title: e.target.value }));
                                                        setShowBeerDropdown(true);
                                                    }}
                                                    onFocus={() => setShowBeerDropdown(true)}
                                                    onBlur={() => setShowBeerDropdown(false)}
                                                    placeholder="Type or pick…"
                                                    className="flex-1 text-base font-mono outline-none py-1 bg-transparent"
                                                />
                                                {allBeerNames.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onMouseDown={(e) => { e.preventDefault(); setShowBeerDropdown(v => !v); }}
                                                        className="px-1 text-neutral-400 hover:text-neutral-700"
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 8L1 3h10z"/></svg>
                                                    </button>
                                                )}
                                            </div>
                                            {showBeerDropdown && filtered.length > 0 && (
                                                <div className="absolute z-50 top-full left-0 right-0 bg-white border border-neutral-200 shadow-md max-h-48 overflow-y-auto">
                                                    {filtered.map(name => (
                                                        <button
                                                            key={name}
                                                            type="button"
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                setDraft(prev => ({ ...prev, title: name }));
                                                                setShowBeerDropdown(false);
                                                            }}
                                                            className={`w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-neutral-50 ${title.trim() === name ? 'bg-neutral-100 font-semibold' : ''}`}
                                                        >
                                                            {name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {topBeers.length > 0 && (
                                            <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                                                <span className="text-[9px] uppercase tracking-wider text-neutral-400">Common:</span>
                                                {topBeers.map(name => (
                                                    <button key={name} type="button"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            setDraft(prev => ({ ...prev, title: name }));
                                                            setShowBeerDropdown(false);
                                                        }}
                                                        className={`text-[10px] border px-1.5 py-0.5 hover:border-neutral-500 hover:bg-neutral-50 ${title.trim() === name ? 'border-neutral-500 bg-neutral-100 font-semibold' : 'border-neutral-300 text-neutral-600'}`}>
                                                        {name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        </>
                                    );
                                })() : (config.coupling === 'none' && category !== 'bird' || category === 'cooking') && !readOnly ? (() => {
                                    const allExerciseNames: string[] = Array.from(new Set<string>(
                                        getAllItemsByCategory(category).filter(i => i.title.trim()).map(i => i.title.trim())
                                    )).sort();
                                    const filtered: string[] = title.trim()
                                        ? allExerciseNames.filter(n => n.toLowerCase().includes(title.toLowerCase()))
                                        : allExerciseNames;
                                    return (
                                        <div className="relative">
                                            <div className="flex items-center border-b border-neutral-200 focus-within:border-neutral-400">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={title}
                                                    onChange={(e) => {
                                                        setDraft((prev) => ({ ...prev, title: e.target.value }));
                                                        setShowExerciseDropdown(true);
                                                    }}
                                                    onFocus={() => setShowExerciseDropdown(true)}
                                                    onBlur={() => setShowExerciseDropdown(false)}
                                                    placeholder="Type or pick…"
                                                    className="flex-1 text-base font-mono outline-none py-1 bg-transparent"
                                                />
                                                {allExerciseNames.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onMouseDown={(e) => { e.preventDefault(); setShowExerciseDropdown(v => !v); }}
                                                        className="px-1 text-neutral-400 hover:text-neutral-700"
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 8L1 3h10z"/></svg>
                                                    </button>
                                                )}
                                            </div>
                                            {showExerciseDropdown && filtered.length > 0 && (
                                                <div className="absolute z-50 top-full left-0 right-0 bg-white border border-neutral-200 shadow-md max-h-48 overflow-y-auto">
                                                    {filtered.map(name => (
                                                        <button
                                                            key={name}
                                                            type="button"
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                setDraft(prev => ({ ...prev, title: name }));
                                                                setShowExerciseDropdown(false);
                                                            }}
                                                            className={`w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-neutral-50 ${title.trim() === name ? 'bg-neutral-100 font-semibold' : ''}`}
                                                        >
                                                            {name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })() : isLinked && config.coupling !== 'none' && !readOnly ? (
                                <div className="flex items-center border-b border-neutral-200">
                                    <span className="flex-1 text-base font-mono py-1 text-neutral-800 truncate">{title}</span>
                                    <button
                                        type="button"
                                        onClick={clearLinkage}
                                        className="ml-1 px-1.5 text-neutral-400 hover:text-neutral-700 text-sm"
                                        title="Clear and re-search"
                                    >
                                        ×
                                    </button>
                                </div>
                                ) : (
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
                                    className="w-full text-base font-mono outline-none border-b border-neutral-200 focus:border-neutral-400 py-1 bg-transparent disabled:text-neutral-600 disabled:border-transparent min-w-0"
                                />
                                )}
                                {repeatInfo && title.trim() && (
                                    <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-700">
                                        {repeatInfo.verb} × {repeatInfo.count}{repeatInfo.latestPrevious && !existingItem && !['exercise', 'bird', 'beer'].includes(category) ? ' • previous review loaded' : ''}
                                    </div>
                                )}
                                {category === 'book' && !readOnly && !isLinked && (() => {
                                    const seen = new Set<string>();
                                    const inProgressBooks = (allUserItems || [])
                                        .filter(i => {
                                            if (i.category !== 'book') return false;
                                            const m = parseItemMeta(i.image);
                                            // Show any book not finished — whether or not progressPage is set
                                            return !m.finished && m.externalSource !== 'book-review';
                                        })
                                        .sort((a, b) => b.createdAt - a.createdAt)
                                        .filter(i => {
                                            const key = i.title.trim().toLowerCase();
                                            if (seen.has(key)) return false;
                                            seen.add(key);
                                            return true;
                                        });
                                    if (inProgressBooks.length === 0) return null;
                                    return (
                                        <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                                            <span className="text-[9px] uppercase tracking-wider text-neutral-400">Recent:</span>
                                            {inProgressBooks.map(book => {
                                                const m = parseItemMeta(book.image);
                                                return (
                                                    <button key={book.id} type="button"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            setDraft(prev => ({
                                                                ...prev,
                                                                title: book.title,
                                                                subtitle: book.subtitle || '',
                                                                rating: undefined,
                                                                notes: '',
                                                                image: serializeItemMeta({
                                                                    externalSource: 'book-progress',
                                                                    externalId: new Date().toISOString(),
                                                                    imageUrl: m.imageUrl,
                                                                    totalPages: m.totalPages,
                                                                    progressPage: m.progressPage,
                                                                    progressMode: m.progressMode,
                                                                    releaseDate: m.releaseDate,
                                                                }),
                                                            }));
                                                            setPopulatedFromId(null);
                                                        }}
                                                        className="text-[10px] border border-neutral-300 px-1.5 py-0.5 text-neutral-600 hover:border-neutral-500 hover:bg-neutral-50">
                                                        {book.title}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                                {!readOnly && ['music', 'movie', 'podcast', 'tv', 'restaurant', 'location', 'book'].includes(category) && (
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
                                                    rating: undefined,
                                                    notes: '',
                                                    image: serializeItemMeta({
                                                        imageUrl: r.image || undefined,
                                                        externalSource: 'musicbrainz',
                                                        externalId: r.id,
                                                        releaseDate: r.releaseDate || undefined,
                                                    }),
                                                }));
                                                setPopulatedFromId(null);
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
                                                    subtitle: r.subtitle || '',
                                                    rating: undefined,
                                                    notes: '',
                                                    image: serializeItemMeta({
                                                        imageUrl: r.image || undefined,
                                                        externalSource: source,
                                                        externalId: r.id,
                                                        releaseDate: r.releaseDate || undefined,
                                                    }),
                                                }));
                                                setPopulatedFromId(null);
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
                                    <div className="mt-2 border border-neutral-300 bg-white max-h-96 overflow-y-auto">
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
                                                            rating: undefined,
                                                            notes: '',
                                                            image: serializeItemMeta({
                                                                imageUrl: show.image || undefined,
                                                                externalSource: 'itunes-podcast-show',
                                                                externalId: show.id,
                                                            }),
                                                        }));
                                                        setPopulatedFromId(null);
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
                                                            rating: undefined,
                                                            notes: '',
                                                            image: serializeItemMeta({
                                                                imageUrl: selectedPodcast.image || undefined,
                                                                externalSource: 'itunes-podcast-episode',
                                                                externalId: episodeIdentity,
                                                                releaseDate: ep.publishedAt || undefined,
                                                            }),
                                                        }));
                                                        setPopulatedFromId(null);
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
                                                            rating: undefined,
                                                            notes: '',
                                                            image: serializeItemMeta({
                                                                imageUrl: show.image || undefined,
                                                                externalSource: 'tvmaze-show',
                                                                externalId: show.id,
                                                                releaseDate: show.premiered || undefined,
                                                            }),
                                                        }));
                                                        setPopulatedFromId(null);
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
                                                            rating: undefined,
                                                            notes: '',
                                                            image: serializeItemMeta({
                                                                imageUrl: selectedTvShow.image || undefined,
                                                                externalSource: 'tvmaze-episode',
                                                                externalId: episodeIdentity,
                                                                releaseDate: ep.airdate || undefined,
                                                            }),
                                                        }));
                                                        setPopulatedFromId(null);
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
                                                    rating: undefined,
                                                    notes: '',
                                                    image: serializeItemMeta({
                                                        imageUrl: nextImageRef,
                                                        restaurantLocation: place.address || undefined,
                                                        externalSource: 'google-places',
                                                        externalId: place.id,
                                                    }),
                                                }));
                                                setPopulatedFromId(null);
                                                setShowRestaurantResults(false);
                                            }} className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                <div className="text-sm text-neutral-900">{place.name}</div>
                                                <div className="text-xs text-neutral-500">{place.address || 'No address'}</div>
                                            </button>
                                        )}
                                    />
                                )}
                                {/* Location results */}
                                {category === 'location' && !readOnly && (
                                    <SearchResultsPanel
                                        visible={showLocationResults}
                                        isSearching={locationPlaces.isSearching}
                                        results={locationPlaces.results}
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
                                                    rating: undefined,
                                                    notes: '',
                                                    image: serializeItemMeta({
                                                        imageUrl: nextImageRef,
                                                        restaurantLocation: place.address || undefined,
                                                        externalSource: 'google-places',
                                                        externalId: place.id,
                                                    }),
                                                }));
                                                setPopulatedFromId(null);
                                                setShowLocationResults(false);
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
                                                const isOL = /^OL\d+W$/i.test(book.id);
                                                const coverUrl = isOL
                                                    ? `https://covers.openlibrary.org/b/olid/${book.id}-M.jpg`
                                                    : `https://books.google.com/books/content?id=${book.id}&printsec=frontcover&img=1&zoom=1`;
                                                setDraft((prev) => {
                                                    const prevMeta = parseItemMeta(prev.image);
                                                    return {
                                                        ...prev,
                                                        title: book.title,
                                                        subtitle: book.author || '',
                                                        rating: undefined,
                                                        notes: '',
                                                        image: serializeItemMeta({
                                                            ...prevMeta,
                                                            imageUrl: coverUrl,
                                                            releaseDate: book.publishedDate || undefined,
                                                        }),
                                                    };
                                                });
                                                setPopulatedFromId(null);
                                                setShowBookResults(false);
                                            }}
                                                className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                                                <div className="text-sm text-neutral-900">{book.title}</div>
                                                <div className="text-xs text-neutral-500">{book.author || 'Unknown author'}{book.publishedDate ? ` • ${book.publishedDate}` : ''}</div>
                                            </button>
                                        )}
                                    />
                                )}
                            </div>}
                            {/* Subtitle (skip for beer — brewery is rendered above title) */}
                            {category !== 'cooking' && category !== 'link' && category !== 'beer' && (
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
                                    {(category === 'restaurant' || category === 'location') && (
                                        <div className="mt-3">
                                            <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                                Address
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
                            {/* Wishlist scoring inputs — compact horizontal row in main column */}
                            {category === 'wishlist' && (() => {
                                const desire = parsedMeta.wishlistDesire ?? 5;
                                const impact = parsedMeta.wishlistImpact ?? 5;
                                const cost = parsedMeta.wishlistCost ?? 5;
                                const updateScores = (d: number, i: number, c: number) => {
                                    setDraft(prev => ({
                                        ...prev,
                                        rating: Math.round(d * i * c) / 100,
                                        image: serializeItemMeta({ ...parseItemMeta(prev.image), wishlistDesire: d, wishlistImpact: i, wishlistCost: c }),
                                    }));
                                };
                                return (
                                    <div className="mt-2 flex gap-3">
                                        {([
                                            { label: 'Desire', val: desire, onChange: (v: number) => updateScores(v, impact, cost) },
                                            { label: 'Impact', val: impact, onChange: (v: number) => updateScores(desire, v, cost) },
                                            { label: 'Cost ↓', val: cost, title: '10=cheap · 1=expensive', onChange: (v: number) => updateScores(desire, impact, v) },
                                        ] as { label: string; val: number; title?: string; onChange: (v: number) => void }[]).map(({ label, val, title, onChange }) => (
                                            <div key={label} className="flex flex-col items-center gap-0.5">
                                                <span className="text-[9px] uppercase tracking-widest text-neutral-400" title={title}>{label}</span>
                                                {readOnly
                                                    ? <span className="text-sm font-bold text-neutral-800">{val}</span>
                                                    : <input type="number" min="1" max="10" step="1" value={val}
                                                        onChange={e => onChange(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                                                        className="w-10 text-center text-sm font-bold border border-neutral-300 outline-none focus:border-pink-400 py-0.5 bg-white" />
                                                }
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                            {/* Bird spotted + checklist — single shared search bar */}
                            {category === 'bird' && (() => {
                                const birdList = parsedMeta.birdList || [];
                                const checklist = parsedMeta.checklist || [];

                                const addBird = (bird: BirdSearchResult) => {
                                    if (birdList.some(b => b.id === bird.id)) return;
                                    const next = [...birdList, { id: bird.id, comName: bird.comName, sciName: bird.sciName }];
                                    const nextTitle = next.length === 1 ? next[0].comName : `${next[0].comName} +${next.length - 1}`;
                                    setDraft(prev => ({
                                        ...prev,
                                        title: nextTitle,
                                        image: serializeItemMeta({ ...parseItemMeta(prev.image), birdList: next }),
                                    }));
                                    setBirdQuery('');
                                    birds.setResults([]);
                                    setShowBirdResults(false);
                                };
                                const removeBird = (id: string) => {
                                    const next = birdList.filter(b => b.id !== id);
                                    const nextTitle = next.length === 0 ? '' : next.length === 1 ? next[0].comName : `${next[0].comName} +${next.length - 1}`;
                                    setDraft(prev => ({
                                        ...prev,
                                        title: nextTitle,
                                        image: serializeItemMeta({ ...parseItemMeta(prev.image), birdList: next }),
                                    }));
                                };

                                const addToChecklist = (name: string) => {
                                    const trimmed = name.trim();
                                    if (!trimmed) return;
                                    const id = trimmed.toLowerCase().replace(/\s+/g, '-');
                                    if (checklist.some(b => b.id === id)) return;
                                    const next = [...checklist, { id, comName: trimmed }];
                                    setDraft(prev => ({
                                        ...prev,
                                        image: serializeItemMeta({ ...parseItemMeta(prev.image), checklist: next }),
                                    }));
                                    setBirdQuery('');
                                    birds.setResults([]);
                                    setShowBirdResults(false);
                                };
                                const removeFromChecklist = (id: string) => {
                                    const next = checklist.filter(b => b.id !== id);
                                    setDraft(prev => ({
                                        ...prev,
                                        image: serializeItemMeta({ ...parseItemMeta(prev.image), checklist: next }),
                                    }));
                                };

                                const allBirdNames = [...birdList.map(b => b.comName), ...checklist.map(b => b.comName)];
                                return (
                                    <div>
                                        {readOnly ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {allBirdNames.length === 0
                                                    ? <span className="text-sm text-neutral-400">—</span>
                                                    : allBirdNames.map((name, i) => (
                                                        <span key={i} className="text-xs border border-neutral-300 px-2 py-0.5 text-neutral-700">{name}</span>
                                                    ))
                                                }
                                            </div>
                                        ) : (
                                            <>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={birdQuery}
                                                        onChange={(e) => {
                                                            setBirdQuery(e.target.value);
                                                            setShowBirdResults(true);
                                                            setBirdSearchToken(p => p + 1);
                                                        }}
                                                        onBlur={() => setTimeout(() => setShowBirdResults(false), 150)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                addToChecklist(birdQuery);
                                                            }
                                                        }}
                                                        placeholder="Search species…"
                                                        className="w-full text-base font-mono outline-none border-b border-neutral-200 focus:border-neutral-400 py-1 bg-transparent"
                                                    />
                                                    {(birds.isSearching || birds.results.length > 0) && showBirdResults && (
                                                        <div className="absolute z-50 top-full left-0 right-0 bg-white border border-neutral-200 shadow-md max-h-56 overflow-y-auto">
                                                            {birds.isSearching && (
                                                                <div className="px-3 py-2 text-xs text-neutral-400">Searching eBird…</div>
                                                            )}
                                                            {birds.results.map(bird => (
                                                                <button
                                                                    key={bird.id}
                                                                    type="button"
                                                                    onMouseDown={() => addToChecklist(bird.comName)}
                                                                    className={`w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 ${checklist.some(b => b.comName === bird.comName) ? 'opacity-40' : ''}`}
                                                                >
                                                                    <div className="text-sm text-neutral-900">{bird.comName}</div>
                                                                    <div className="text-xs text-neutral-500 italic">{bird.sciName}{bird.familyComName ? ` · ${bird.familyComName}` : ''}</div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="mt-2 border border-neutral-200 bg-neutral-50 min-h-[2.5rem] p-2">
                                                    {checklist.length === 0 ? (
                                                        <span className="text-[10px] uppercase tracking-widest text-neutral-400">Species added here</span>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {checklist.map(b => (
                                                                <span key={b.id} className="flex items-center gap-1 text-xs border border-neutral-300 bg-white px-2 py-0.5 text-neutral-700">
                                                                    {b.comName}
                                                                    <button type="button" onClick={() => removeFromChecklist(b.id)} className="text-neutral-400 hover:text-neutral-800 leading-none">×</button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Score Box — numeric for rated categories, liked signal for likedSignal extra */}
                        {/* For books: only show after marking finished. For beer: only show after brewery linked. */}
                        {config.hasRating && !config.extras.includes('likedSignal') && !config.extras.includes('wishlistScoring') && !showReviewGate && !(category === 'book' && !parsedMeta.finished) && !(category === 'beer' && parsedMeta.externalSource !== 'openbrewerydb') && (
                        <div className={`flex-shrink-0 flex flex-col items-center gap-1 ${isParentChildCategory && isEpisodeLinked ? '' : 'pt-6'}`}>
                            {isParentChildCategory && isEpisodeLinked && (
                                <div className="text-[9px] uppercase tracking-widest text-neutral-400 text-center">Ep. Score</div>
                            )}
                            {readOnly ? (
                                <div className="w-16 h-16 border-2 border-neutral-200 flex items-center justify-center bg-neutral-50/50">
                                    <span className="text-2xl font-bold text-neutral-800 leading-none">{rating || '—'}</span>
                                </div>
                            ) : (
                                <div className="w-16 h-16 border-2 border-neutral-300 hover:border-neutral-400 flex items-center justify-center relative bg-white">
                                    <input
                                        type="number" min="0" max="10" step="0.1"
                                        value={rating || ''}
                                        onChange={(e) => {
                                            setDraft((prev) => ({ ...prev, rating: parseFloat(e.target.value) || undefined }));
                                        }}
                                        className="w-full h-full bg-transparent text-center text-2xl font-bold text-neutral-800 outline-none absolute inset-0 z-10 p-0"
                                        placeholder="-"
                                    />
                                </div>
                            )}
                            <span className="text-[9px] text-neutral-400 uppercase tracking-widest">{config.ratingLabel !== 'Rating' ? config.ratingLabel.toUpperCase() : '/ 10'}</span>
                        </div>
                        )}
                        {/* Wishlist — score box only in right column */}
                        {config.extras.includes('wishlistScoring') && (() => {
                            const score = Math.round((parsedMeta.wishlistDesire ?? 5) * (parsedMeta.wishlistImpact ?? 5) * (parsedMeta.wishlistCost ?? 5)) / 100;
                            return (
                                <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-6">
                                    <div className="w-16 h-16 border-2 border-pink-300 bg-pink-50 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-bold text-neutral-800 leading-none">{score.toFixed(1)}</span>
                                    </div>
                                    <span className="text-[9px] text-neutral-400 uppercase tracking-widest">Priority</span>
                                </div>
                            );
                        })()}
                        {/* Liked/disliked signal for recipes */}
                        {config.extras.includes('likedSignal') && (
                        <div className="flex-shrink-0 pt-6 flex flex-col gap-1">
                            <button
                                type="button"
                                disabled={readOnly}
                                onClick={() => setDraft((prev) => ({ ...prev, rating: prev.rating === 10 ? undefined : 10 }))}
                                className={`w-16 h-7 border text-base flex items-center justify-center transition-colors ${rating === 10 ? 'border-emerald-400 bg-emerald-50' : 'border-neutral-300 bg-white hover:border-neutral-400'}`}
                                title="Liked"
                            >👍</button>
                            <button
                                type="button"
                                disabled={readOnly}
                                onClick={() => setDraft((prev) => ({ ...prev, rating: prev.rating === 0 ? undefined : 0 }))}
                                className={`w-16 h-7 border text-base flex items-center justify-center transition-colors ${rating === 0 ? 'border-red-300 bg-red-50' : 'border-neutral-300 bg-white hover:border-neutral-400'}`}
                                title="Disliked"
                            >👎</button>
                        </div>
                        )}
                    </div>

                    {(category === 'link' || category === 'wishlist') && (
                        <div>
                            <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">{category === 'wishlist' ? 'Link' : 'URL'}</label>
                            {readOnly ? (
                                linkUrl ? (
                                    <a href={linkUrl} target="_blank" rel="noreferrer" className="text-xs text-neutral-700 underline hover:text-neutral-900 break-all">{linkUrl}</a>
                                ) : (
                                    <div className="text-sm font-mono text-neutral-300">No link added</div>
                                )
                            ) : (
                                <input
                                    type="url"
                                    value={linkUrl}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setDraft((prev) => {
                                            const meta = parseItemMeta(prev.image);
                                            return { ...prev, image: serializeItemMeta({ ...meta, linkUrl: next.trim() || undefined }) };
                                        });
                                    }}
                                    placeholder="https://..."
                                    className="w-full text-xs font-mono outline-none border border-neutral-300 focus:border-neutral-500 p-2 bg-white"
                                />
                            )}
                        </div>
                    )}

                    {/* Book reading progress */}
                    {category === 'book' && !parsedMeta.finished && (
                        <div>
                            {/* Mode toggle: Pages vs Audio % */}
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs uppercase tracking-widest text-neutral-500">Progress</label>
                                {!readOnly && (
                                    <div className="flex border border-neutral-200 text-[9px] uppercase tracking-widest">
                                        <button type="button"
                                            onClick={() => setDraft(prev => ({ ...prev, image: serializeItemMeta({ ...parseItemMeta(prev.image), progressMode: undefined }) }))}
                                            className={`px-2 py-0.5 transition-colors ${parsedMeta.progressMode !== 'percent' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:bg-neutral-50'}`}>
                                            Pages
                                        </button>
                                        <button type="button"
                                            onClick={() => setDraft(prev => ({ ...prev, image: serializeItemMeta({ ...parseItemMeta(prev.image), progressMode: 'percent' }) }))}
                                            className={`px-2 py-0.5 border-l border-neutral-200 transition-colors ${parsedMeta.progressMode === 'percent' ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:bg-neutral-50'}`}>
                                            Audio %
                                        </button>
                                    </div>
                                )}
                            </div>

                            {parsedMeta.progressMode === 'percent' ? (
                                /* ── Percent / Audio mode ── */
                                <div className="flex items-center gap-3">
                                    {readOnly ? (
                                        <span className="text-2xl font-bold text-neutral-800 font-mono">
                                            {parsedMeta.progressPage ?? '—'}%
                                        </span>
                                    ) : (
                                        <>
                                            <input
                                                type="number" min="0" max="100" step="1"
                                                value={parsedMeta.progressPage ?? ''}
                                                placeholder="0"
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? undefined : Math.min(100, parseInt(e.target.value, 10));
                                                    setDraft((prev) => ({
                                                        ...prev,
                                                        image: serializeItemMeta({ ...parseItemMeta(prev.image), progressPage: val }),
                                                    }));
                                                }}
                                                className="w-20 text-sm font-mono border border-neutral-300 focus:border-neutral-400 outline-none p-1 text-center bg-transparent"
                                            />
                                            <span className="text-sm text-neutral-500">%</span>
                                        </>
                                    )}
                                    {!readOnly && (
                                        <button type="button"
                                            onClick={() => {
                                                const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                                                const stableId = [norm(title), norm(subtitle.split(',')[0] || '')].filter(Boolean).join('-');
                                                setDraft((prev) => ({ ...prev, image: serializeItemMeta({ ...parseItemMeta(prev.image), finished: true, externalSource: 'book-review', externalId: stableId }) }));
                                            }}
                                            className="ml-auto text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 hover:bg-neutral-800 hover:text-white hover:border-neutral-800 transition-colors">
                                            ✓ Mark Finished
                                        </button>
                                    )}
                                </div>
                            ) : (
                                /* ── Pages mode ── */
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-neutral-500">p.</span>
                                        {readOnly ? (
                                            <span className="text-sm font-bold text-neutral-800 w-16 text-center font-mono">
                                                {parsedMeta.progressPage ?? '—'}
                                            </span>
                                        ) : (
                                            <input
                                                type="number" min="0" step="1"
                                                value={parsedMeta.progressPage ?? ''}
                                                placeholder="0"
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                                                    setDraft((prev) => ({
                                                        ...prev,
                                                        image: serializeItemMeta({ ...parseItemMeta(prev.image), progressPage: val }),
                                                    }));
                                                }}
                                                className="w-20 text-sm font-mono border border-neutral-300 focus:border-neutral-400 outline-none p-1 text-center bg-transparent"
                                            />
                                        )}
                                    </div>
                                    <span className="text-xs text-neutral-400">/</span>
                                    <div className="flex items-center gap-1.5">
                                        {readOnly ? (
                                            <span className="text-sm text-neutral-600">
                                                {parsedMeta.totalPages ? `${parsedMeta.totalPages} pages` : '—'}
                                            </span>
                                        ) : (
                                            <input
                                                type="number" min="1" step="1"
                                                value={parsedMeta.totalPages ?? ''}
                                                placeholder="total pages"
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                                                    setDraft((prev) => ({
                                                        ...prev,
                                                        image: serializeItemMeta({ ...parseItemMeta(prev.image), totalPages: val }),
                                                    }));
                                                }}
                                                className="w-28 text-sm font-mono border border-neutral-300 focus:border-neutral-400 outline-none p-1 text-center bg-transparent"
                                            />
                                        )}
                                    </div>
                                    {!readOnly && (
                                        <button type="button"
                                            onClick={() => {
                                                const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                                                const stableId = [norm(title), norm(subtitle.split(',')[0] || '')].filter(Boolean).join('-');
                                                setDraft((prev) => ({ ...prev, image: serializeItemMeta({ ...parseItemMeta(prev.image), finished: true, externalSource: 'book-review', externalId: stableId }) }));
                                            }}
                                            className="ml-auto text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 hover:bg-neutral-800 hover:text-white hover:border-neutral-800 transition-colors">
                                            ✓ Mark Finished
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Progress bar */}
                            {(() => {
                                const pct = parsedMeta.progressMode === 'percent'
                                    ? parsedMeta.progressPage
                                    : (parsedMeta.progressPage != null && parsedMeta.totalPages
                                        ? (parsedMeta.progressPage / parsedMeta.totalPages) * 100
                                        : null);
                                if (pct == null) return null;
                                return (
                                    <div className="mt-2 h-1.5 bg-neutral-100 border border-neutral-200">
                                        <div className="h-full bg-neutral-700 transition-all" style={{ width: `${Math.min(100, pct).toFixed(1)}%` }} />
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Book finished — show as review mode */}
                    {category === 'book' && parsedMeta.finished && (
                        <div className="border border-neutral-200 px-3 py-2 bg-neutral-50 flex items-center justify-between">
                            <span className="text-xs uppercase tracking-widest text-neutral-800 font-bold">✓ Finished</span>
                            {!readOnly && (
                                <button type="button"
                                    onClick={() => setDraft((prev) => ({ ...prev, image: serializeItemMeta({ ...parseItemMeta(prev.image), finished: undefined, externalSource: 'book-progress', externalId: new Date().toISOString() }) }))}
                                    className="text-[9px] uppercase tracking-widest text-neutral-400 hover:text-neutral-700">
                                    undo
                                </button>
                            )}
                        </div>
                    )}

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
                    ) : showReviewGate ? (
                        <button type="button" onClick={() => setGateClicked(true)}
                            className="text-[10px] uppercase tracking-widest text-neutral-400 border border-dashed border-neutral-300 w-full py-3 hover:text-neutral-700 hover:border-neutral-500">
                            Review without linking
                        </button>
                    ) : category === 'book' && !parsedMeta.finished ? (
                        null
                    ) : category === 'beer' && parsedMeta.externalSource !== 'openbrewerydb' ? (
                        null
                    ) : (
                        <div>
                            <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                {isParentChildCategory && isEpisodeLinked ? 'Episode Notes' : (config.notesLabel || 'Notes')}
                            </label>
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
                    <div className="flex items-center gap-3">
                        {existingItem && onDelete && !readOnly && (
                            <button onClick={handleDelete} className="text-xs uppercase tracking-widest text-neutral-400 hover:text-red-600">
                                Delete
                            </button>
                        )}
                        {linkCardHref && (
                            <a href={linkCardHref} target="_blank" rel="noreferrer"
                                className="text-xs uppercase tracking-widest text-neutral-400 hover:text-neutral-700">
                                Open Link
                            </a>
                        )}
                        {restaurantMapHref && (
                            <a href={restaurantMapHref} target="_blank" rel="noreferrer"
                                className="text-xs uppercase tracking-widest text-neutral-400 hover:text-neutral-700">
                                Maps
                            </a>
                        )}
                        {showItemPageLink && itemPageHref && (
                            <Link href={itemPageHref}
                                className="text-xs uppercase tracking-widest text-neutral-400 hover:text-neutral-700">
                                Item Page
                            </Link>
                        )}
                    </div>
                    <div className="flex gap-3">
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
