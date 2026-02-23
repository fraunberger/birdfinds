import { Category, ConsumableItem } from '@/lib/social-prototype/store';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface ConsumableModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave?: (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => void;
    onDelete?: () => void;
    initialCategory?: Category;
    existingItem?: ConsumableItem;
    readOnly?: boolean;
    allUserItems?: ConsumableItem[];
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function buildInitialDraft(initialCategory: Category, existingItem?: ConsumableItem): ModalDraft {
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
