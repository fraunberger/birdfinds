import { ConsumableItem } from '@/lib/social-prototype/store';

const normalizeValue = (value?: string) => (value || '').trim().toLowerCase();
const hasReviewContent = (item: Pick<ConsumableItem, 'rating' | 'notes'>) => item.rating !== undefined || !!item.notes?.trim();

export const buildReviewMatchKey = (item: Pick<ConsumableItem, 'category' | 'title' | 'subtitle'>) => {
    const title = normalizeValue(item.title);
    const subtitle = normalizeValue(item.subtitle);
    return subtitle ? `${item.category}::${title}::${subtitle}` : `${item.category}::${title}`;
};

export const isSameReviewTarget = (
    left: Pick<ConsumableItem, 'category' | 'title' | 'subtitle'>,
    right: Pick<ConsumableItem, 'category' | 'title' | 'subtitle'>
) => {
    const leftTitle = normalizeValue(left.title);
    const rightTitle = normalizeValue(right.title);
    if (!leftTitle || !rightTitle || left.category !== right.category) return false;

    return leftTitle === rightTitle;
};

const isExactReviewTarget = (
    left: Pick<ConsumableItem, 'category' | 'title' | 'subtitle'>,
    right: Pick<ConsumableItem, 'category' | 'title' | 'subtitle'>
) => {
    const leftTitle = normalizeValue(left.title);
    const rightTitle = normalizeValue(right.title);
    const leftSubtitle = normalizeValue(left.subtitle);
    const rightSubtitle = normalizeValue(right.subtitle);
    return left.category === right.category && leftTitle === rightTitle && leftSubtitle === rightSubtitle;
};

export const findMostRecentExactReviewMatch = (
    items: ConsumableItem[],
    candidate: Pick<ConsumableItem, 'category' | 'title' | 'subtitle'>,
    excludeItemId?: string
) => {
    const matches = items
        .filter((item) => item.id !== excludeItemId && isSameReviewTarget(item, candidate))
        .sort((a, b) => b.createdAt - a.createdAt);

    const exactWithReview = matches.find((item) => isExactReviewTarget(item, candidate) && hasReviewContent(item));
    if (exactWithReview) return exactWithReview;

    const exact = matches.find((item) => isExactReviewTarget(item, candidate));
    if (exact) return exact;

    const inexactWithReview = matches.find(hasReviewContent);
    if (inexactWithReview) return inexactWithReview;

    return matches[0];
};

export const countExactReviewMatches = (
    items: ConsumableItem[],
    candidate: Pick<ConsumableItem, 'category' | 'title' | 'subtitle'>,
    excludeItemId?: string
) => items.filter((item) => item.id !== excludeItemId && isSameReviewTarget(item, candidate)).length;
