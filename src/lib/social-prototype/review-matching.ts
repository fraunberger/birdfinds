import { ConsumableItem } from '@/lib/social-prototype/store';

const normalizeValue = (value?: string) => (value || '').trim().toLowerCase();

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

    const leftSubtitle = normalizeValue(left.subtitle);
    const rightSubtitle = normalizeValue(right.subtitle);
    if (leftSubtitle || rightSubtitle) {
        return leftTitle === rightTitle && leftSubtitle === rightSubtitle;
    }

    return leftTitle === rightTitle;
};

export const findMostRecentExactReviewMatch = (
    items: ConsumableItem[],
    candidate: Pick<ConsumableItem, 'category' | 'title' | 'subtitle'>,
    excludeItemId?: string
) => {
    return items
        .filter((item) => item.id !== excludeItemId && isSameReviewTarget(item, candidate))
        .sort((a, b) => b.createdAt - a.createdAt)[0];
};

export const countExactReviewMatches = (
    items: ConsumableItem[],
    candidate: Pick<ConsumableItem, 'category' | 'title' | 'subtitle'>,
    excludeItemId?: string
) => items.filter((item) => item.id !== excludeItemId && isSameReviewTarget(item, candidate)).length;
