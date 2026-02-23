export interface ReviewHydrationSource {
    signature: string;
    subtitle?: string;
    rating?: number;
    notes?: string;
    image?: string;
}

export interface ReviewHydrationFieldLocks {
    subtitle: boolean;
    rating: boolean;
    notes: boolean;
}

const isBlank = (value?: string) => !value || !value.trim();

export function buildReviewHydrationSource(matchKey: string | null, match?: {
    id: string;
    createdAt: number | string;
    subtitle?: string;
    rating?: number;
    notes?: string;
    image?: string;
} | null): ReviewHydrationSource | null {
    if (!matchKey || !match) return null;
    return {
        signature: `${matchKey}::${match.id}::${match.createdAt}`,
        subtitle: match.subtitle || '',
        rating: match.rating,
        notes: match.notes || '',
        image: match.image,
    };
}

export function hydrateDraftFromReview<T extends { subtitle: string; rating: number | undefined; notes: string; image?: string }>(
    draft: T,
    source: ReviewHydrationSource,
    locks: ReviewHydrationFieldLocks,
    hasHydratedSource: boolean
) {
    let changed = false;
    const nextDraft = { ...draft };

    if (!locks.subtitle && (isBlank(nextDraft.subtitle) || !hasHydratedSource) && !isBlank(source.subtitle)) {
        nextDraft.subtitle = source.subtitle!;
        changed = true;
    }

    if (!locks.rating && (nextDraft.rating === undefined || !hasHydratedSource) && source.rating !== undefined) {
        nextDraft.rating = source.rating;
        changed = true;
    }

    if (!locks.notes && (isBlank(nextDraft.notes) || !hasHydratedSource) && !isBlank(source.notes)) {
        nextDraft.notes = source.notes!;
        changed = true;
    }

    if (!nextDraft.image && source.image) {
        nextDraft.image = source.image;
        changed = true;
    }

    return {
        changed,
        draft: nextDraft,
    };
}

