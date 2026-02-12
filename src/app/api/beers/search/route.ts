import { NextResponse } from 'next/server';

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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    try {
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
            console.error('Beer search failed:', response.status, text);
            return NextResponse.json({ error: 'Failed to fetch beer results' }, { status: response.status });
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

            results.push({
                id,
                title,
                brewery,
                quantity,
            });

            if (results.length >= 10) break;
        }

        return NextResponse.json(results);
    } catch (error) {
        console.error('Beer search proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
