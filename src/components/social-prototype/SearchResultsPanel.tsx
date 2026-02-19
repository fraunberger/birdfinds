"use client";

import React from 'react';

interface SearchResultsPanelProps<T> {
    /** Whether to render the panel at all. */
    visible: boolean;
    /** Whether a search is in progress. */
    isSearching: boolean;
    /** The result items to render. */
    results: T[];
    /** The current query text — used to decide if "no results" should show. */
    query: string;
    /** Loading label shown during search. */
    searchingLabel?: string;
    /** Empty-state label shown when no results found. */
    emptyLabel?: string;
    /** Render a single result row. */
    renderResult: (item: T) => React.ReactNode;
    /** Unique key extractor. */
    keyExtractor: (item: T) => string;
    /** Max height CSS value (default "max-h-44"). */
    maxHeightClass?: string;
}

/**
 * Reusable dropdown panel for search results — replaces the repeated
 * JSX blocks in ConsumableModal for music, movies, books, restaurants,
 * breweries, etc.
 */
export function SearchResultsPanel<T>({
    visible,
    isSearching,
    results,
    query,
    searchingLabel = 'Searching...',
    emptyLabel = 'No results',
    renderResult,
    keyExtractor,
    maxHeightClass = 'max-h-44',
}: SearchResultsPanelProps<T>) {
    if (!visible) return null;

    return (
        <div className={`mt-2 border border-neutral-300 bg-white ${maxHeightClass} overflow-y-auto`}>
            {isSearching && (
                <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                    {searchingLabel}
                </div>
            )}
            {!isSearching && results.length === 0 && query.trim().length >= 2 && (
                <div className="px-3 py-2 text-xs text-neutral-500 uppercase tracking-wider">
                    {emptyLabel}
                </div>
            )}
            {!isSearching && results.map((item) => (
                <React.Fragment key={keyExtractor(item)}>
                    {renderResult(item)}
                </React.Fragment>
            ))}
        </div>
    );
}
