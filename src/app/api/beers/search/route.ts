import { NextResponse } from 'next/server';

const CATALOG_BEER_API_KEY = process.env.CATALOG_BEER_API_KEY;

interface OpenFoodFactsProduct {
    code?: string;
    product_name?: string;
    brands?: string;
    quantity?: string;
}

interface OpenFoodFactsResponse {
    products?: OpenFoodFactsProduct[];
}

interface BeerSearchResult {
    id: string;
    title: string;
    brewery: string;
    quantity: string;
}

interface CatalogBeer {
    id?: string;
    name?: string;
    abv?: string | number;
    brewer_id?: string;
    brewer_name?: string;
    brewer?: {
        id?: string;
        name?: string;
    };
}

interface CatalogBeerEnvelope {
    data?: CatalogBeer[];
    items?: CatalogBeer[];
    cursor?: string;
    next_cursor?: string;
}

const getCatalogAuthHeader = () =>
    CATALOG_BEER_API_KEY
        ? `Basic ${Buffer.from(`${CATALOG_BEER_API_KEY}:`).toString('base64')}`
        : '';

const norm = (value?: string | null) => (value || '').trim().toLowerCase();

const toBeerResult = (beer: CatalogBeer): BeerSearchResult | null => {
    const title = (beer.name || '').trim();
    const brewery = (beer.brewer?.name || beer.brewer_name || '').trim();
    const id = (beer.id || '').trim();
    if (!title || !id) return null;
    return {
        id,
        title,
        brewery,
        quantity: beer.abv ? `${beer.abv}% ABV` : '',
    };
};

const parseCatalogItems = (payload: unknown): CatalogBeer[] => {
    if (Array.isArray(payload)) return payload as CatalogBeer[];
    const envelope = payload as CatalogBeerEnvelope;
    if (Array.isArray(envelope.data)) return envelope.data;
    if (Array.isArray(envelope.items)) return envelope.items;
    return [];
};

const parseCatalogCursor = (payload: unknown): string | undefined => {
    const envelope = payload as CatalogBeerEnvelope;
    if (typeof envelope.next_cursor === 'string' && envelope.next_cursor) return envelope.next_cursor;
    if (typeof envelope.cursor === 'string' && envelope.cursor) return envelope.cursor;
    return undefined;
};

async function searchCatalogBeer(query: string): Promise<BeerSearchResult[]> {
    if (!CATALOG_BEER_API_KEY) return [];

    const auth = getCatalogAuthHeader();
    const queryLower = query.toLowerCase();
    const dedupe = new Set<string>();
    const out: BeerSearchResult[] = [];

    const tryCollect = (beers: CatalogBeer[]) => {
        for (const beer of beers) {
            const mapped = toBeerResult(beer);
            if (!mapped) continue;
            const haystack = `${norm(mapped.title)} ${norm(mapped.brewery)}`;
            if (!haystack.includes(queryLower)) continue;
            if (dedupe.has(mapped.id)) continue;
            dedupe.add(mapped.id);
            out.push(mapped);
            if (out.length >= 10) return;
        }
    };

    // Attempt 1: optimistic server-side query params if supported by API.
    for (const searchParam of ['search', 'name']) {
        if (out.length >= 10) break;
        const url = new URL('https://api.catalog.beer/beer');
        url.searchParams.set('count', '100');
        url.searchParams.set(searchParam, query);
        const response = await fetch(url.toString(), {
            headers: {
                Accept: 'application/json',
                Authorization: auth,
            },
            next: { revalidate: 300 },
        });
        if (!response.ok) continue;
        const payload = (await response.json()) as unknown;
        tryCollect(parseCatalogItems(payload));
    }

    // Attempt 2: page through the catalog if query params are not supported.
    let cursor: string | undefined;
    for (let page = 0; page < 4 && out.length < 10; page += 1) {
        const url = new URL('https://api.catalog.beer/beer');
        url.searchParams.set('count', '100');
        if (cursor) url.searchParams.set('cursor', cursor);
        const response = await fetch(url.toString(), {
            headers: {
                Accept: 'application/json',
                Authorization: auth,
            },
            next: { revalidate: 300 },
        });
        if (!response.ok) break;
        const payload = (await response.json()) as unknown;
        tryCollect(parseCatalogItems(payload));
        const nextCursor = parseCatalogCursor(payload);
        if (!nextCursor || nextCursor === cursor) break;
        cursor = nextCursor;
    }

    return out;
}

async function searchOpenFoodFacts(query: string): Promise<BeerSearchResult[]> {
    const upstreamUrl = new URL('https://world.openfoodfacts.org/cgi/search.pl');
    upstreamUrl.searchParams.set('search_terms', query);
    upstreamUrl.searchParams.set('search_simple', '1');
    upstreamUrl.searchParams.set('action', 'process');
    upstreamUrl.searchParams.set('json', '1');
    upstreamUrl.searchParams.set('page_size', '12');
    upstreamUrl.searchParams.set('tagtype_0', 'categories');
    upstreamUrl.searchParams.set('tag_contains_0', 'contains');
    upstreamUrl.searchParams.set('tag_0', 'beers');

    const response = await fetch(upstreamUrl.toString(), {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
    });

    if (!response.ok) {
        const text = await response.text();
        console.error('Beer fallback search failed:', response.status, text);
        return [];
    }

    const data = (await response.json()) as OpenFoodFactsResponse;
    const unique = new Set<string>();
    const results: BeerSearchResult[] = [];

    for (const item of data.products || []) {
        const title = (item.product_name || '').trim();
        const brewery = (item.brands || '').trim();
        const quantity = (item.quantity || '').trim();
        const id = (item.code || `${title}:${brewery}`).trim();

        if (!title || !id) continue;
        const dedupeKey = `${title.toLowerCase()}|${brewery.toLowerCase()}`;
        if (unique.has(dedupeKey)) continue;
        unique.add(dedupeKey);

        results.push({ id, title, brewery, quantity });
        if (results.length >= 10) break;
    }

    return results;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    try {
        const catalogResults = await searchCatalogBeer(query);
        if (catalogResults.length > 0) {
            return NextResponse.json(catalogResults);
        }

        const fallbackResults = await searchOpenFoodFacts(query);
        return NextResponse.json(fallbackResults);
    } catch (error) {
        console.error('Beer search proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
