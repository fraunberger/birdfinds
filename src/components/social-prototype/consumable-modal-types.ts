import { Category, ConsumableItem } from '@/lib/social-prototype/store';
import { serializeItemMeta } from '@/lib/social-prototype/item-meta';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface ConsumableModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave?: (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => void;
    onDelete?: () => void;
    initialCategory?: Category;
    initialTitle?: string;
    existingItem?: ConsumableItem;
    readOnly?: boolean;
    allUserItems?: ConsumableItem[];
    sourceUserId?: string;
}

// ---------------------------------------------------------------------------
// Internal draft state
// ---------------------------------------------------------------------------
export interface ModalDraft {
    category: Category;
    title: string;
    subtitle: string;
    rating: number | undefined;
    notes: string;
    image?: string;
}

// ---------------------------------------------------------------------------
// Search result types — one per category that has API search
// ---------------------------------------------------------------------------
export interface MusicSearchResult {
    id: string;
    title: string;
    artist: string;
    genre: string;
    image: string;
    releaseDate: string;
}

export interface MovieSearchResult {
    id: string;
    title: string;
    subtitle: string;
    genre: string;
    image: string;
    releaseDate: string;
}

export interface PodcastShowResult {
    id: string;
    name: string;
    author: string;
    feedUrl: string;
    image: string;
}

export interface PodcastEpisodeResult {
    id: string;
    title: string;
    publishedAt: string;
}

export interface TvShowResult {
    id: string;
    name: string;
    network: string;
    premiered: string;
    image: string;
}

export interface TvEpisodeResult {
    id: string;
    label: string;
    season: number;
    episode: number;
    airdate: string;
    stamp: string;
}

export interface RestaurantSearchResult {
    id: string;
    name: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
    priceLevel?: string;
    googleMapsUri?: string;
}

export interface BookSearchResult {
    id: string;
    title: string;
    author: string;
    publishedDate: string;
}

export interface BrewerySearchResult {
    id: string;
    name: string;
    location: string;
}

export interface BirdSearchResult {
    id: string;       // eBird species code
    comName: string;  // common name
    sciName: string;  // scientific name
    familyComName: string;
    orderComName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function buildInitialDraft(initialCategory: Category, existingItem?: ConsumableItem, initialTitle?: string): ModalDraft {
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
    // Exercise: auto-inject a unique session ID so each log creates a distinct item
    // that can have its own effort rating and notes, while grouping under the same
    // exercise name on the item page.
    const image = initialCategory === 'exercise' || initialCategory === 'bird'
        ? serializeItemMeta({ externalSource: `${initialCategory}-sighting`, externalId: new Date().toISOString() })
        : undefined;
    return {
        category: initialCategory,
        title: initialTitle || '',
        subtitle: '',
        rating: undefined,
        notes: '',
        image,
    };
}
