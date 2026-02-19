"use client";

import { useEffect, useState } from 'react';

interface UseSearchPickerOptions {
    /** The current category of the modal draft. */
    category: string;
    /** Only search when this category matches. */
    targetCategory: string;
    /** Skip search in read-only mode. */
    readOnly: boolean;
    /** Whether the results panel is visible / user has clicked "Search". */
    enabled: boolean;
    /** The search query string (typically `title` or `subtitle`). */
    query: string;
    /** API endpoint path, e.g. `/api/music/search`. */
    endpoint: string;
    /** Debounce delay in ms (default 220). */
    debounceMs?: number;
    /** Incrementing token to force a new search even with the same query. */
    token: number;
}

interface UseSearchPickerResult<T> {
    results: T[];
    isSearching: boolean;
    setResults: React.Dispatch<React.SetStateAction<T[]>>;
}

/**
 * Generic debounced search hook — replaces the 8 nearly identical
 * `useEffect` blocks in ConsumableModal.
 *
 * The hook fetches `endpoint?q=<query>` with debounce + AbortController
 * and cleans up on unmount / dependency change.
 */
export function useSearchPicker<T>({
    category,
    targetCategory,
    readOnly,
    enabled,
    query,
    endpoint,
    debounceMs = 220,
    token,
}: UseSearchPickerOptions): UseSearchPickerResult<T> {
    const [results, setResults] = useState<T[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (readOnly || category !== targetCategory) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        if (!enabled) return;

        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setIsSearching(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            try {
                setIsSearching(true);
                const response = await fetch(
                    `${endpoint}?q=${encodeURIComponent(trimmed)}`,
                    { signal: controller.signal },
                );
                if (!response.ok) {
                    setResults([]);
                    return;
                }
                const data = (await response.json()) as T[];
                setResults(data);
            } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error(`Search failed (${endpoint}):`, error);
                }
            } finally {
                setIsSearching(false);
            }
        }, debounceMs);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, readOnly, enabled, token]);

    return { results, isSearching, setResults };
}
