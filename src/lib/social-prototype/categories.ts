/**
 * categories.ts — Single source of truth for all category behavior.
 *
 * Every part of the app (card rendering, item pages, coupling flows,
 * counters, extras) reads from this config. Adding a new category means
 * adding one entry here.
 */

export type SsotPattern =
    | 'single'        // Same entity repeated (movie, book, music, restaurant)
    | 'parent-child'  // Parent entity with rated children (tv, podcast, beer)
    | 'none';         // No SSOT / no item page (link)

export type CouplingType =
    | 'api'   // User searches an external API to link the tag
    | 'url'   // Tags sharing the same URL are the same entity
    | 'none'; // No coupling mechanism

export type RatingScope =
    | 'entity'  // One rating on the SSOT (movies, books, albums)
    | 'child';  // Each child gets its own rating (episodes, beers)

export type CategoryExtra =
    | 'progressTracking'  // Per-session numeric progress (books: page/chapter)
    | 'dishList'          // Accumulating list of dishes tried (restaurants)
    | 'likedSignal'       // Binary 👍/👎 instead of star rating (recipes)
    | 'notes'             // Freeform notes per engagement (recipes, links)
    | 'wishlistScoring';  // Three-factor priority score: desire × impact × cost / 100

export interface CategoryDefinition {
    id: string;
    label: string;
    shortLabel: string;

    // Behavioral config (from spec)
    verb: string;                      // Past-tense verb for counter: "watched", "read" …
    ssotPattern: SsotPattern;
    coupling: CouplingType;
    hasRating: boolean;
    ratingScope: RatingScope | null;   // null when hasRating is false
    childLabel: string | null;         // "episode", "beer" — null for Pattern A
    extras: CategoryExtra[];

    // Display config (matches existing CategoryConfig fields)
    titleLabel: string;
    subtitleLabel: string;
    subtitlePlaceholder: string;
    ratingLabel: string;
    notesLabel?: string;
    notesPlaceholder?: string;
    color?: string;
    icon?: string;
}

export const CATEGORY_DEFINITIONS: Record<string, CategoryDefinition> = {
    movie: {
        id: 'movie',
        label: 'Movie', shortLabel: 'FILM',
        verb: 'watched',
        ssotPattern: 'single', coupling: 'api',
        hasRating: true, ratingScope: 'entity',
        childLabel: null, extras: [],
        titleLabel: 'Film Title', subtitleLabel: 'Lead Actors', subtitlePlaceholder: 'Lead Actors',
        ratingLabel: 'Score', color: '#f5d142', icon: '',
    },
    tv: {
        id: 'tv',
        label: 'TV Show', shortLabel: 'TV',
        verb: 'watched',
        ssotPattern: 'parent-child', coupling: 'api',
        hasRating: true, ratingScope: 'child',
        childLabel: 'episode', extras: [],
        titleLabel: 'Show Name', subtitleLabel: 'Season/Ep', subtitlePlaceholder: 'S1E1',
        ratingLabel: 'Episode Rating', color: '#62d9f7', icon: '',
    },
    music: {
        id: 'music',
        label: 'Music', shortLabel: 'MUSIC',
        verb: 'listened',
        ssotPattern: 'single', coupling: 'api',
        hasRating: true, ratingScope: 'entity',
        childLabel: null, extras: [],
        titleLabel: 'Album', subtitleLabel: 'Artist', subtitlePlaceholder: 'Artist',
        ratingLabel: 'Rating', color: '#f78be0', icon: '',
    },
    restaurant: {
        id: 'restaurant',
        label: 'Restaurant', shortLabel: 'RESTAURANT',
        verb: 'visited',
        ssotPattern: 'single', coupling: 'api',
        hasRating: true, ratingScope: 'entity',
        childLabel: null, extras: ['dishList'],
        titleLabel: 'Place Name', subtitleLabel: 'Dish', subtitlePlaceholder: 'Dish',
        ratingLabel: 'Rating', color: '#7be08a', icon: '',
    },
    beer: {
        id: 'beer',
        label: 'Beer', shortLabel: 'BEER',
        verb: 'drank',
        ssotPattern: 'parent-child', coupling: 'api',
        hasRating: true, ratingScope: 'child',
        childLabel: 'beer', extras: [],
        titleLabel: 'Drink Name', subtitleLabel: 'Brewery/Type', subtitlePlaceholder: 'Brewery',
        ratingLabel: 'Beer Rating', color: '#e8a94f', icon: '',
    },
    cooking: {
        id: 'cooking',
        label: 'Recipe', shortLabel: 'RECIPE',
        verb: 'cooked',
        ssotPattern: 'single', coupling: 'url',
        hasRating: true, ratingScope: 'entity',
        childLabel: null, extras: ['notes'],
        titleLabel: 'Dish Name', subtitleLabel: 'Ingredients', subtitlePlaceholder: 'One per line',
        ratingLabel: 'Rating',
        notesLabel: 'Instructions', notesPlaceholder: 'Step-by-step instructions...',
        color: '#f7756a', icon: '',
    },
    podcast: {
        id: 'podcast',
        label: 'Podcast', shortLabel: 'POD',
        verb: 'listened',
        ssotPattern: 'parent-child', coupling: 'api',
        hasRating: true, ratingScope: 'child',
        childLabel: 'episode', extras: [],
        titleLabel: 'Episode Title', subtitleLabel: 'Podcast Name', subtitlePlaceholder: 'Podcast Name',
        ratingLabel: 'Episode Rating', color: '#b78ef5', icon: '',
    },
    book: {
        id: 'book',
        label: 'Book', shortLabel: 'BOOK',
        verb: 'read',
        ssotPattern: 'single', coupling: 'api',
        hasRating: true, ratingScope: 'entity',
        childLabel: null, extras: ['progressTracking'],
        titleLabel: 'Book Title', subtitleLabel: 'Author', subtitlePlaceholder: 'Author',
        ratingLabel: 'Rating', color: '#6ab4f7', icon: '',
    },
    link: {
        id: 'link',
        label: 'URL', shortLabel: 'URL',
        verb: 'shared',
        ssotPattern: 'none', coupling: 'url',
        hasRating: false, ratingScope: null,
        childLabel: null, extras: ['notes'],
        titleLabel: 'Title', subtitleLabel: 'Context', subtitlePlaceholder: 'Optional context',
        ratingLabel: 'Rating',
        notesLabel: 'Notes', notesPlaceholder: 'Add notes about this link...',
        color: '#94a3b8', icon: '',
    },
    location: {
        id: 'location',
        label: 'Location', shortLabel: 'PLACE',
        verb: 'visited',
        ssotPattern: 'single', coupling: 'api',
        hasRating: true, ratingScope: 'entity',
        childLabel: null, extras: ['notes'],
        titleLabel: 'Place Name', subtitleLabel: 'Type', subtitlePlaceholder: 'e.g. park, museum',
        ratingLabel: 'Rating',
        notesLabel: 'Notes', notesPlaceholder: 'Add notes...',
        color: '#7be0c3', icon: '',
    },
    exercise: {
        id: 'exercise',
        label: 'Exercise', shortLabel: 'EXERCISE',
        verb: 'did',
        ssotPattern: 'none', coupling: 'none',
        hasRating: true, ratingScope: 'entity',
        childLabel: null, extras: ['notes'],
        titleLabel: 'Exercise', subtitleLabel: 'Duration', subtitlePlaceholder: 'e.g. 45 min',
        ratingLabel: 'Effort',
        notesLabel: 'Notes', notesPlaceholder: 'Add notes...',
        color: '#f7a55a', icon: '',
    },
    wishlist: {
        id: 'wishlist',
        label: 'Wishlist', shortLabel: 'WISH',
        verb: 'wants',
        ssotPattern: 'none', coupling: 'none',
        hasRating: true, ratingScope: 'entity',
        childLabel: null, extras: ['wishlistScoring', 'notes'],
        titleLabel: 'Item Name', subtitleLabel: 'Category', subtitlePlaceholder: 'e.g. gear, experience, book',
        ratingLabel: 'Priority',
        notesLabel: 'Notes', notesPlaceholder: 'Why you want this...',
        color: '#f472b6', icon: '🎁',
    },
    bird: {
        id: 'bird',
        label: 'Bird', shortLabel: 'BIRD',
        verb: 'spotted',
        ssotPattern: 'none', coupling: 'none',
        hasRating: false, ratingScope: null,
        childLabel: null, extras: ['notes'],
        titleLabel: 'Species', subtitleLabel: 'Location', subtitlePlaceholder: 'Where spotted',
        ratingLabel: 'Rating',
        notesLabel: 'Notes', notesPlaceholder: 'Add notes...',
        color: '#6ab4f7', icon: '🐦',
    },
};

/** Look up a category definition by id. Returns null for unknown categories. */
export function getCategoryDef(id: string): CategoryDefinition | null {
    return CATEGORY_DEFINITIONS[id] ?? null;
}
