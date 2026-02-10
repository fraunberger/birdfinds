
'use client';

import { useState, useEffect, useRef } from 'react';

// ... (imports remain same)

interface Restaurant {
    name: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
    priceLevel?: string;
    photo?: string;
    id?: string;
}

interface RestaurantSearchProps {
    onSelect: (restaurant: Restaurant) => void;
    placeholder?: string;
}

export function RestaurantSearch({ onSelect, placeholder = "Search for a restaurant..." }: RestaurantSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length < 2) {
                setResults([]);
                setIsOpen(false);
                return;
            }

            setLoading(true);
            try {
                const res = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`);
                const data = await res.json();

                // Add "Custom Nomination" option
                const customOption: Restaurant = {
                    name: query,
                    id: `custom-${Date.now()}`,
                    // No metadata for custom
                };

                // If API fails or returns empty, we still show custom option
                const apiResults = Array.isArray(data) ? data : [];
                setResults([...apiResults, customOption]);
                setIsOpen(true);
            } catch (e) {
                console.error("Search error:", e);
                // Fallback to just custom option on error
                setResults([{ name: query, id: `custom-${Date.now()}` }]);
                setIsOpen(true);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    return (
        <div className="relative">
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-white border-2 border-gray-200 p-4 pl-12 text-lg font-bold outline-none focus:border-black transition-colors placeholder:font-normal placeholder:text-gray-300 rounded-none"
            />
            {/* Search Icon */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                🔍
            </div>

            {/* Loading Indicator */}
            {loading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
                </div>
            )}

            {/* Results Dropdown */}
            {isOpen && results.length > 0 && (
                <div className="absolute z-50 w-full left-0 mt-1 bg-white border-2 border-black shadow-[4px_4px_0px_#000] max-h-60 overflow-y-auto">
                    {results.map((place, idx) => {
                        const isCustom = !place.address;
                        return (
                            <button
                                key={idx}
                                onClick={() => {
                                    onSelect(place);
                                    setQuery('');
                                    setIsOpen(false);
                                }}
                                className="w-full text-left p-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-start gap-3 transition-colors group"
                            >
                                {/* Only show photo container if photo exists OR it's custom trigger (plus icon maybe?) */}
                                {place.photo ? (
                                    <span className="text-2xl bg-gray-100 w-12 h-12 flex items-center justify-center rounded group-hover:bg-white group-hover:scale-110 transition-all border border-transparent group-hover:border-black">
                                        {place.photo}
                                    </span>
                                ) : isCustom ? (
                                    <span className="text-xl bg-gray-100 w-12 h-12 flex items-center justify-center rounded group-hover:bg-white transition-all border border-transparent text-gray-400">
                                        ➕
                                    </span>
                                ) : null}

                                <div>
                                    <div className="font-bold text-gray-900 group-hover:underline decoration-2 decoration-black underline-offset-2">
                                        {isCustom ? `Add "${place.name}"` : place.name}
                                    </div>
                                    {place.address && <div className="text-xs text-gray-500 truncate">{place.address}</div>}
                                    {!isCustom && (
                                        <div className="text-xs font-mono mt-1 text-gray-400 flex gap-2">
                                            {place.rating && <span className="text-yellow-600 font-bold">★ {place.rating}</span>}
                                            {place.reviewCount && <span>({place.reviewCount})</span>}
                                            {place.priceLevel && <span className="text-green-600 font-bold">{place.priceLevel}</span>}
                                        </div>
                                    )}
                                    {isCustom && <div className="text-xs text-gray-400 italic">Custom Nomination</div>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
