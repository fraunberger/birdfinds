"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Category, ConsumableItem, DEFAULT_CATEGORIES, getCategoryConfig } from '@/lib/social-prototype/store';
import { buildItemPath, hasItemAggregatePage } from '@/lib/social-prototype/items';

interface ConsumableModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave?: (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => void;
    onDelete?: () => void;
    initialCategory?: Category;
    existingItem?: ConsumableItem;
    readOnly?: boolean;
}

interface ModalDraft {
    category: Category;
    title: string;
    subtitle: string;
    rating: number | undefined;
    notes: string;
    image?: string;
}

interface MusicSearchResult {
    id: string;
    title: string;
    artist: string;
    genre: string;
    image: string;
    releaseDate: string;
}

interface MovieSearchResult {
    id: string;
    title: string;
    subtitle: string;
    genre: string;
    image: string;
    releaseDate: string;
}

interface PodcastShowResult {
    id: string;
    name: string;
    author: string;
    feedUrl: string;
    image: string;
}

interface PodcastEpisodeResult {
    id: string;
    title: string;
    publishedAt: string;
}

interface TvShowResult {
    id: string;
    name: string;
    network: string;
    premiered: string;
    image: string;
}

interface TvEpisodeResult {
    id: string;
    label: string;
    season: number;
    episode: number;
    airdate: string;
    stamp: string;
}

interface RestaurantSearchResult {
    id: string;
    name: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
    priceLevel?: string;
}

interface BookSearchResult {
    id: string;
    title: string;
    author: string;
    publishedDate: string;
}

interface BrewerySearchResult {
    id: string;
    name: string;
    location: string;
}

function buildInitialDraft(initialCategory: Category, existingItem?: ConsumableItem): ModalDraft {
    if (existingItem) {
        return {
            category: existingItem.category,
            title: existingItem.title,
            subtitle: existingItem.subtitle || '',
            rating: existingItem.rating,
            notes: existingItem.notes || '',
            image: existingItem.image,
        };
    }
    return {
        category: initialCategory,
        title: '',
        subtitle: '',
        rating: undefined,
        notes: '',
        image: undefined,
    };
}

const parseMetaImage = (raw?: string): string | undefined => {
    if (!raw) return undefined;
    if (!raw.startsWith('meta:')) return raw;
    try {
        const decoded = decodeURIComponent(raw.slice('meta:'.length));
        const parsed = JSON.parse(decoded) as { imageUrl?: string };
        return parsed.imageUrl;
    } catch {
        return undefined;
    }
};

const toGoogleMapsLink = (raw?: string, title?: string, subtitle?: string): string | null => {
    const imageRef = parseMetaImage(raw);
    const normalized = imageRef?.startsWith('place:') ? imageRef.slice('place:'.length) : imageRef;
    if (normalized?.startsWith('places/')) {
        const placeId = normalized.slice('places/'.length);
        if (placeId) {
            return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`;
        }
    }
    const query = [title || '', subtitle || ''].join(' ').trim();
    if (!query) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

export function ConsumableModal({ isOpen, onClose, onSave, onDelete, initialCategory = 'movie', existingItem, readOnly = false }: ConsumableModalProps) {
    const [draft, setDraft] = useState<ModalDraft>(() => buildInitialDraft(initialCategory, existingItem));
    const [musicResults, setMusicResults] = useState<MusicSearchResult[]>([]);
    const [isSearchingMusic, setIsSearchingMusic] = useState(false);
    const [showMusicResults, setShowMusicResults] = useState(false);
    const [movieResults, setMovieResults] = useState<MovieSearchResult[]>([]);
    const [isSearchingMovies, setIsSearchingMovies] = useState(false);
    const [showMovieResults, setShowMovieResults] = useState(false);
    const [podcastShows, setPodcastShows] = useState<PodcastShowResult[]>([]);
    const [podcastEpisodes, setPodcastEpisodes] = useState<PodcastEpisodeResult[]>([]);
    const [selectedPodcast, setSelectedPodcast] = useState<PodcastShowResult | null>(null);
    const [isSearchingPodcasts, setIsSearchingPodcasts] = useState(false);
    const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
    const [showPodcastPicker, setShowPodcastPicker] = useState(false);
    const [tvShows, setTvShows] = useState<TvShowResult[]>([]);
    const [tvEpisodes, setTvEpisodes] = useState<TvEpisodeResult[]>([]);
    const [selectedTvShow, setSelectedTvShow] = useState<TvShowResult | null>(null);
    const [isSearchingTvShows, setIsSearchingTvShows] = useState(false);
    const [isLoadingTvEpisodes, setIsLoadingTvEpisodes] = useState(false);
    const [showTvPicker, setShowTvPicker] = useState(false);
    const [restaurantResults, setRestaurantResults] = useState<RestaurantSearchResult[]>([]);
    const [isSearchingRestaurants, setIsSearchingRestaurants] = useState(false);
    const [showRestaurantResults, setShowRestaurantResults] = useState(false);
    const [bookResults, setBookResults] = useState<BookSearchResult[]>([]);
    const [isSearchingBooks, setIsSearchingBooks] = useState(false);
    const [showBookResults, setShowBookResults] = useState(false);
    const [breweryResults, setBreweryResults] = useState<BrewerySearchResult[]>([]);
    const [isSearchingBreweries, setIsSearchingBreweries] = useState(false);
    const [showBreweryResults, setShowBreweryResults] = useState(false);
    const [restaurantSearchToken, setRestaurantSearchToken] = useState(0);
    const [brewerySearchToken, setBrewerySearchToken] = useState(0);
    const { category, title, subtitle, rating, notes } = draft;

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
        ? toGoogleMapsLink(existingItem?.image || draft.image, title, subtitle)
        : null;

    useEffect(() => {
        if (readOnly || category !== 'music') {
            setMusicResults([]);
            setShowMusicResults(false);
            setIsSearchingMusic(false);
            return;
        }

        const query = title.trim();
        if (query.length < 2) {
            setMusicResults([]);
            setIsSearchingMusic(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsSearchingMusic(true);
                const response = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    setMusicResults([]);
                    return;
                }
                const results = (await response.json()) as MusicSearchResult[];
                setMusicResults(results);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('Music search failed:', error);
                }
            } finally {
                setIsSearchingMusic(false);
            }
        }, 220);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [category, readOnly, title]);

    useEffect(() => {
        if (readOnly || category !== 'beer') {
            setBreweryResults([]);
            setShowBreweryResults(false);
            setIsSearchingBreweries(false);
            return;
        }

        if (!showBreweryResults) return;
        const query = subtitle.trim();
        if (query.length < 2) {
            setBreweryResults([]);
            setIsSearchingBreweries(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsSearchingBreweries(true);
                const response = await fetch(`/api/breweries/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    setBreweryResults([]);
                    return;
                }
                const results = (await response.json()) as BrewerySearchResult[];
                setBreweryResults(results);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('Brewery search failed:', error);
                }
            } finally {
                setIsSearchingBreweries(false);
            }
        }, 220);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [category, readOnly, subtitle, showBreweryResults, brewerySearchToken]);

    useEffect(() => {
        if (readOnly || category !== 'movie') {
            setMovieResults([]);
            setShowMovieResults(false);
            setIsSearchingMovies(false);
            return;
        }

        const query = title.trim();
        if (query.length < 2) {
            setMovieResults([]);
            setIsSearchingMovies(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsSearchingMovies(true);
                const response = await fetch(`/api/movies/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    setMovieResults([]);
                    return;
                }
                const results = (await response.json()) as MovieSearchResult[];
                setMovieResults(results);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('Movie search failed:', error);
                }
            } finally {
                setIsSearchingMovies(false);
            }
        }, 220);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [category, readOnly, title]);

    useEffect(() => {
        if (readOnly || category !== 'podcast') {
            setPodcastShows([]);
            setPodcastEpisodes([]);
            setSelectedPodcast(null);
            setShowPodcastPicker(false);
            setIsSearchingPodcasts(false);
            setIsLoadingEpisodes(false);
            return;
        }

        if (selectedPodcast) return;

        const query = title.trim();
        if (query.length < 2) {
            setPodcastShows([]);
            setIsSearchingPodcasts(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsSearchingPodcasts(true);
                const response = await fetch(`/api/podcasts/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    setPodcastShows([]);
                    return;
                }
                const results = (await response.json()) as PodcastShowResult[];
                setPodcastShows(results);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('Podcast show search failed:', error);
                }
            } finally {
                setIsSearchingPodcasts(false);
            }
        }, 220);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [category, readOnly, selectedPodcast, title]);

    useEffect(() => {
        if (readOnly || category !== 'podcast' || !selectedPodcast?.feedUrl) {
            if (!selectedPodcast) setPodcastEpisodes([]);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsLoadingEpisodes(true);
                const response = await fetch(`/api/podcasts/episodes?feedUrl=${encodeURIComponent(selectedPodcast.feedUrl)}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    setPodcastEpisodes([]);
                    return;
                }
                const results = (await response.json()) as PodcastEpisodeResult[];
                setPodcastEpisodes(results);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('Podcast episode fetch failed:', error);
                }
            } finally {
                setIsLoadingEpisodes(false);
            }
        }, 120);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [category, readOnly, selectedPodcast]);

    useEffect(() => {
        if (readOnly || category !== 'tv') {
            setTvShows([]);
            setTvEpisodes([]);
            setSelectedTvShow(null);
            setShowTvPicker(false);
            setIsSearchingTvShows(false);
            setIsLoadingTvEpisodes(false);
            return;
        }

        if (selectedTvShow) return;

        const query = title.trim();
        if (query.length < 2) {
            setTvShows([]);
            setIsSearchingTvShows(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsSearchingTvShows(true);
                const response = await fetch(`/api/tv/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    setTvShows([]);
                    return;
                }
                const results = (await response.json()) as TvShowResult[];
                setTvShows(results);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('TV show search failed:', error);
                }
            } finally {
                setIsSearchingTvShows(false);
            }
        }, 220);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [category, readOnly, selectedTvShow, title]);

    useEffect(() => {
        if (readOnly || category !== 'tv' || !selectedTvShow?.id) {
            if (!selectedTvShow) setTvEpisodes([]);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsLoadingTvEpisodes(true);
                const response = await fetch(`/api/tv/episodes?showId=${encodeURIComponent(selectedTvShow.id)}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    setTvEpisodes([]);
                    return;
                }
                const results = (await response.json()) as TvEpisodeResult[];
                setTvEpisodes(results);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('TV episode fetch failed:', error);
                }
            } finally {
                setIsLoadingTvEpisodes(false);
            }
        }, 120);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [category, readOnly, selectedTvShow]);

    useEffect(() => {
        if (readOnly || category !== 'restaurant') {
            setRestaurantResults([]);
            setShowRestaurantResults(false);
            setIsSearchingRestaurants(false);
            return;
        }

        if (!showRestaurantResults) return;
        const query = title.trim();
        if (query.length < 2) {
            setRestaurantResults([]);
            setIsSearchingRestaurants(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsSearchingRestaurants(true);
                const response = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    setRestaurantResults([]);
                    return;
                }
                const results = (await response.json()) as RestaurantSearchResult[];
                setRestaurantResults(results);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('Restaurant search failed:', error);
                }
            } finally {
                setIsSearchingRestaurants(false);
            }
        }, 220);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [category, readOnly, title, showRestaurantResults, restaurantSearchToken]);

    useEffect(() => {
        if (readOnly || category !== 'book') {
            setBookResults([]);
            setShowBookResults(false);
            setIsSearchingBooks(false);
            return;
        }

        const query = title.trim();
        if (query.length < 2) {
            setBookResults([]);
            setIsSearchingBooks(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsSearchingBooks(true);
                const response = await fetch(`/api/books/search?q=${encodeURIComponent(query)}`, {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    setBookResults([]);
                    return;
                }
                const results = (await response.json()) as BookSearchResult[];
                setBookResults(results);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('Book search failed:', error);
                }
            } finally {
                setIsSearchingBooks(false);
            }
        }, 220);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [category, readOnly, title]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isOpen) handleSave();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, handleSave]);

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
                        {/* Category Label / Dropdown */}
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
                                        if (category === 'music') {
                                            setShowMusicResults(true);
                                        }
                                        if (category === 'movie') {
                                            setShowMovieResults(true);
                                        }
                                        if (category === 'podcast') {
                                            if (selectedPodcast) {
                                                setSelectedPodcast(null);
                                                setPodcastEpisodes([]);
                                            }
                                            setShowPodcastPicker(true);
                                        }
                                        if (category === 'tv') {
                                            if (selectedTvShow) {
                                                setSelectedTvShow(null);
                                                setTvEpisodes([]);
                                            }
                                            setShowTvPicker(true);
                                        }
                                        if (category === 'book') {
                                            setShowBookResults(true);
                                        }
                                    }}
                                    onFocus={() => {
                                        if (category === 'music') {
                                            setShowMusicResults(true);
                                        }
                                        if (category === 'movie') {
                                            setShowMovieResults(true);
                                        }
                                        if (category === 'podcast') {
                                            setShowPodcastPicker(true);
                                        }
                                        if (category === 'tv') {
                                            setShowTvPicker(true);
                                        }
                                        if (category === 'book') {
                                            setShowBookResults(true);
                                        }
                                    }}
                                    className="w-full text-base font-mono outline-none border-b border-neutral-200 focus:border-neutral-400 py-1 bg-transparent disabled:text-neutral-600 disabled:border-transparent"
                                />
                                {category === 'restaurant' && !readOnly && (
                                    <div className="mt-2 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowRestaurantResults(true);
                                                setRestaurantSearchToken((prev) => prev + 1);
                                            }}
                                            className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:border-neutral-500"
                                        >
                                            Search Places
                                        </button>
                                    </div>
                                )}
                                {category === 'music' && !readOnly && showMusicResults && (
                                    <div className="mt-2 border border-neutral-300 bg-white max-h-44 overflow-y-auto">
                                        {isSearchingMusic && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                Searching...
                                            </div>
                                        )}
                                        {!isSearchingMusic && musicResults.length === 0 && title.trim().length >= 2 && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                No matches
                                            </div>
                                        )}
                                        {!isSearchingMusic && musicResults.map((result) => (
                                            <button
                                                key={result.id}
                                                type="button"
                                                onClick={() => {
                                                    setDraft((prev) => ({
                                                        ...prev,
                                                        title: result.title,
                                                        subtitle: result.artist || prev.subtitle,
                                                    }));
                                                    setShowMusicResults(false);
                                                }}
                                                className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                                            >
                                                <div className="text-sm text-neutral-900">{result.title}</div>
                                                <div className="text-xs text-neutral-500">{result.artist}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {category === 'movie' && !readOnly && showMovieResults && (
                                    <div className="mt-2 border border-neutral-300 bg-white max-h-44 overflow-y-auto">
                                        {isSearchingMovies && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                Searching...
                                            </div>
                                        )}
                                        {!isSearchingMovies && movieResults.length === 0 && title.trim().length >= 2 && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                No matches
                                            </div>
                                        )}
                                        {!isSearchingMovies && movieResults.map((result) => (
                                            <button
                                                key={result.id}
                                                type="button"
                                                onClick={() => {
                                                    setDraft((prev) => ({
                                                        ...prev,
                                                        title: result.title,
                                                        subtitle: result.subtitle || prev.subtitle,
                                                    }));
                                                    setShowMovieResults(false);
                                                }}
                                                className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                                            >
                                                <div className="text-sm text-neutral-900">{result.title}</div>
                                                <div className="text-xs text-neutral-500">{result.subtitle}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {category === 'podcast' && !readOnly && showPodcastPicker && (
                                    <div className="mt-2 border border-neutral-300 bg-white max-h-56 overflow-y-auto">
                                        {!selectedPodcast && isSearchingPodcasts && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                Searching shows...
                                            </div>
                                        )}
                                        {!selectedPodcast && !isSearchingPodcasts && podcastShows.length === 0 && title.trim().length >= 2 && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                No shows
                                            </div>
                                        )}
                                        {!selectedPodcast && !isSearchingPodcasts && podcastShows.map((show) => (
                                            <button
                                                key={show.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedPodcast(show);
                                                    setPodcastEpisodes([]);
                                                    setDraft((prev) => ({
                                                        ...prev,
                                                        title: '',
                                                        subtitle: show.name,
                                                    }));
                                                    setShowPodcastPicker(true);
                                                }}
                                                className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                                            >
                                                <div className="text-sm text-neutral-900">{show.name}</div>
                                                <div className="text-xs text-neutral-500">{show.author}</div>
                                            </button>
                                        ))}

                                        {selectedPodcast && (
                                            <>
                                                <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] uppercase tracking-wider text-neutral-500">Show</div>
                                                        <div className="text-xs text-neutral-800 truncate">{selectedPodcast.name}</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedPodcast(null);
                                                            setPodcastEpisodes([]);
                                                            setDraft((prev) => ({ ...prev, title: '' }));
                                                        }}
                                                        className="text-[10px] uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                                                    >
                                                        Change
                                                    </button>
                                                </div>
                                                {isLoadingEpisodes && (
                                                    <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                        Loading episodes...
                                                    </div>
                                                )}
                                                {!isLoadingEpisodes && podcastEpisodes.length === 0 && (
                                                    <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                        No episodes
                                                    </div>
                                                )}
                                                {!isLoadingEpisodes && podcastEpisodes.map((episode) => (
                                                    <button
                                                        key={episode.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setDraft((prev) => ({
                                                                ...prev,
                                                                title: episode.title,
                                                                subtitle: selectedPodcast.name,
                                                            }));
                                                            setShowPodcastPicker(false);
                                                        }}
                                                        className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                                                    >
                                                        <div className="text-sm text-neutral-900">{episode.title}</div>
                                                        <div className="text-xs text-neutral-500">{episode.publishedAt || 'Recent episode'}</div>
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                                {category === 'tv' && !readOnly && showTvPicker && (
                                    <div className="mt-2 border border-neutral-300 bg-white max-h-56 overflow-y-auto">
                                        {!selectedTvShow && isSearchingTvShows && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                Searching shows...
                                            </div>
                                        )}
                                        {!selectedTvShow && !isSearchingTvShows && tvShows.length === 0 && title.trim().length >= 2 && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                No shows
                                            </div>
                                        )}
                                        {!selectedTvShow && !isSearchingTvShows && tvShows.map((show) => (
                                            <button
                                                key={show.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedTvShow(show);
                                                    setTvEpisodes([]);
                                                    setDraft((prev) => ({
                                                        ...prev,
                                                        title: show.name,
                                                        subtitle: '',
                                                    }));
                                                    setShowTvPicker(true);
                                                }}
                                                className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                                            >
                                                <div className="text-sm text-neutral-900">{show.name}</div>
                                                <div className="text-xs text-neutral-500">
                                                    {show.network || 'TV'}{show.premiered ? ` • ${show.premiered}` : ''}
                                                </div>
                                            </button>
                                        ))}
                                        {selectedTvShow && (
                                            <>
                                                <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] uppercase tracking-wider text-neutral-500">Show</div>
                                                        <div className="text-xs text-neutral-800 truncate">{selectedTvShow.name}</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedTvShow(null);
                                                            setTvEpisodes([]);
                                                            setDraft((prev) => ({ ...prev, title: '', subtitle: '' }));
                                                        }}
                                                        className="text-[10px] uppercase tracking-wider text-neutral-600 hover:text-neutral-900"
                                                    >
                                                        Change
                                                    </button>
                                                </div>
                                                {isLoadingTvEpisodes && (
                                                    <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                        Loading episodes...
                                                    </div>
                                                )}
                                                {!isLoadingTvEpisodes && tvEpisodes.length === 0 && (
                                                    <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                        No episodes
                                                    </div>
                                                )}
                                                {!isLoadingTvEpisodes && tvEpisodes.map((episode) => (
                                                    <button
                                                        key={episode.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setDraft((prev) => ({
                                                                ...prev,
                                                                title: selectedTvShow.name,
                                                                subtitle: episode.label,
                                                            }));
                                                            setShowTvPicker(false);
                                                        }}
                                                        className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                                                    >
                                                        <div className="text-sm text-neutral-900">{episode.label}</div>
                                                        <div className="text-xs text-neutral-500">{episode.airdate || 'Recent episode'}</div>
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                )}
                                {category === 'restaurant' && !readOnly && showRestaurantResults && (
                                    <div className="mt-2 border border-neutral-300 bg-white max-h-56 overflow-y-auto">
                                        {isSearchingRestaurants && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                Searching places...
                                            </div>
                                        )}
                                        {!isSearchingRestaurants && restaurantResults.length === 0 && title.trim().length >= 2 && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                No places
                                            </div>
                                        )}
                                        {!isSearchingRestaurants && restaurantResults.map((place) => (
                                            <button
                                                key={place.id}
                                                type="button"
                                                onClick={() => {
                                                    setDraft((prev) => ({
                                                        ...prev,
                                                        title: place.name,
                                                        subtitle: place.address || prev.subtitle,
                                                        image: `place:${place.id}`,
                                                    }));
                                                    setShowRestaurantResults(false);
                                                }}
                                                className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                                            >
                                                <div className="text-sm text-neutral-900">{place.name}</div>
                                                <div className="text-xs text-neutral-500">{place.address || 'No address'}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {category === 'book' && !readOnly && showBookResults && (
                                    <div className="mt-2 border border-neutral-300 bg-white max-h-56 overflow-y-auto">
                                        {isSearchingBooks && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                Searching books...
                                            </div>
                                        )}
                                        {!isSearchingBooks && bookResults.length === 0 && title.trim().length >= 2 && (
                                            <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                No books
                                            </div>
                                        )}
                                        {!isSearchingBooks && bookResults.map((book) => (
                                            <button
                                                key={book.id}
                                                type="button"
                                                onClick={() => {
                                                    setDraft((prev) => ({
                                                        ...prev,
                                                        title: book.title,
                                                        subtitle: book.author || prev.subtitle,
                                                    }));
                                                    setShowBookResults(false);
                                                }}
                                                className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                                            >
                                                <div className="text-sm text-neutral-900">{book.title}</div>
                                                <div className="text-xs text-neutral-500">
                                                    {book.author || 'Unknown author'}
                                                    {book.publishedDate ? ` • ${book.publishedDate}` : ''}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Subtitle (if not recipe split view, but we can just render here for now or conditional logic) */}
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
                                                if (category === 'podcast') {
                                                    setShowPodcastPicker(true);
                                                }
                                                if (category === 'tv') {
                                                    setShowTvPicker(true);
                                                }
                                            }}
                                            placeholder={config.subtitlePlaceholder}
                                            className="w-full text-sm font-mono border border-neutral-300 focus:border-neutral-400 outline-none p-2 bg-transparent"
                                        />
                                    )}
                                    {category === 'beer' && !readOnly && (
                                        <div className="mt-2 flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowBreweryResults(true);
                                                    setBrewerySearchToken((prev) => prev + 1);
                                                }}
                                                className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:border-neutral-500"
                                            >
                                                Search Breweries
                                            </button>
                                        </div>
                                    )}
                                    {category === 'beer' && !readOnly && showBreweryResults && (
                                        <div className="mt-2 border border-neutral-300 bg-white max-h-56 overflow-y-auto">
                                            {isSearchingBreweries && (
                                                <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                    Searching breweries...
                                                </div>
                                            )}
                                            {!isSearchingBreweries && breweryResults.length === 0 && subtitle.trim().length >= 2 && (
                                                <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                                                    No breweries
                                                </div>
                                            )}
                                            {!isSearchingBreweries && breweryResults.map((brewery) => (
                                                <button
                                                    key={brewery.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setDraft((prev) => ({
                                                            ...prev,
                                                            subtitle: brewery.name,
                                                        }));
                                                        setShowBreweryResults(false);
                                                    }}
                                                    className="w-full text-left px-3 py-2 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                                                >
                                                    <div className="text-sm text-neutral-900">{brewery.name}</div>
                                                    <div className="text-xs text-neutral-500">{brewery.location || 'Unknown location'}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Score Box — Styled transparent box with thick border */}
                        <div className="flex-shrink-0 pt-6"> {/* Align with input baseline roughly */}
                            {readOnly ? (
                                <div className="w-16 h-16 border-2 border-neutral-200 flex flex-col items-center justify-center bg-neutral-50/50">
                                    <span className="text-2xl font-bold text-neutral-800 leading-none">{rating || '—'}</span>
                                    <span className="text-[9px] text-neutral-400 mt-0.5">/ 10</span>
                                </div>
                            ) : (
                                <div className="w-16 h-16 border-2 border-neutral-300 hover:border-neutral-400 flex flex-col items-center justify-center relative bg-white">
                                    <input
                                        type="number"
                                        min="0"
                                        max="10"
                                        step="0.1"
                                        value={rating || ''}
                                        onChange={(e) => setDraft((prev) => ({ ...prev, rating: parseFloat(e.target.value) || undefined }))}
                                        className="w-full h-full bg-transparent text-center text-2xl font-bold text-neutral-800 outline-none absolute inset-0 z-10 p-0"
                                        placeholder="-"
                                    />
                                    <span className="text-[9px] text-neutral-400 absolute bottom-1.5 z-0 pointer-events-none">/ 10</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Subtitle — for cooking, this is ingredients */}
                    {/* Subtitle — for cooking, this is ingredients */}
                    {category === 'cooking' ? (
                        /* Recipe Split View: Ingredients left, Instructions right */
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                    {config.subtitleLabel}
                                </label>
                                {readOnly ? (
                                    <div className="text-sm font-mono text-neutral-700 whitespace-pre-wrap bg-neutral-50 p-3 border border-neutral-200">
                                        {subtitle || <span className="text-neutral-300">No ingredients</span>}
                                    </div>
                                ) : (
                                    <textarea
                                        value={subtitle}
                                        onChange={(e) => setDraft((prev) => ({ ...prev, subtitle: e.target.value }))}
                                        rows={8}
                                        placeholder="One ingredient per line..."
                                        className="w-full text-sm font-mono outline-none bg-neutral-50 p-3 border border-neutral-200 focus:border-neutral-400 resize-y placeholder:text-neutral-300"
                                    />
                                )}
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                    {config.notesLabel || 'Instructions'}
                                </label>
                                {readOnly ? (
                                    <div className="text-sm font-mono text-neutral-700 whitespace-pre-wrap bg-neutral-50 p-3 border border-neutral-200">
                                        {notes || <span className="text-neutral-300">No instructions</span>}
                                    </div>
                                ) : (
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                                        rows={8}
                                        placeholder="Step-by-step instructions..."
                                        className="w-full text-sm font-mono outline-none bg-neutral-50 p-3 border border-neutral-200 focus:border-neutral-400 resize-y placeholder:text-neutral-300"
                                    />
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Standard layout for non-cooking */
                        <div>
                            <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                {config.notesLabel || 'Notes'}
                            </label>
                            {readOnly ? (
                                <div className="text-sm font-mono text-neutral-700 whitespace-pre-wrap leading-relaxed py-2 border-t border-neutral-100 min-h-[100px]">
                                    {notes || <span className="text-neutral-400 italic">No notes</span>}
                                </div>
                            ) : (
                                <textarea
                                    value={notes}
                                    onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                                    rows={8}
                                    placeholder={config.notesPlaceholder || 'Add notes...'}
                                    className="w-full text-sm font-mono outline-none border border-neutral-300 focus:border-neutral-400 p-3 bg-transparent resize-y placeholder:text-neutral-300"
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-300 bg-neutral-50">
                    <div>
                        {existingItem && onDelete && !readOnly && (
                            <button
                                onClick={handleDelete}
                                className="text-xs uppercase tracking-widest text-neutral-400 hover:text-red-600"
                            >
                                Delete
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        {restaurantMapHref && (
                            <a
                                href={restaurantMapHref}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs uppercase tracking-widest text-neutral-600 hover:text-neutral-900 px-3 py-1 border border-neutral-300 hover:border-neutral-500"
                            >
                                Open Google
                            </a>
                        )}
                        {showItemPageLink && itemPageHref && (
                            <Link
                                href={itemPageHref}
                                className="text-xs uppercase tracking-widest text-neutral-600 hover:text-neutral-900 px-3 py-1 border border-neutral-300 hover:border-neutral-500"
                            >
                                Open Item Page
                            </Link>
                        )}
                        <button
                            onClick={onClose}
                            className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-700 px-3 py-1"
                        >
                            Cancel
                        </button>
                        {!readOnly && (
                            <button
                                onClick={handleSave}
                                disabled={!title.trim()}
                                className="text-xs uppercase tracking-widest bg-neutral-800 text-white px-4 py-1 hover:bg-neutral-700 disabled:opacity-30"
                            >
                                Save
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
