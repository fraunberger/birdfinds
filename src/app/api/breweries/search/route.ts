import { NextResponse } from 'next/server';

interface OpenBreweryResult {
    id?: string;
    name?: string;
    city?: string;
    state?: string;
    country?: string;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    try {
        const upstreamUrl = new URL('https://api.openbrewerydb.org/v1/breweries/search');
        upstreamUrl.searchParams.set('query', query);
        upstreamUrl.searchParams.set('per_page', '12');

        const response = await fetch(upstreamUrl.toString(), {
            headers: { Accept: 'application/json' },
            next: { revalidate: 300 },
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('Brewery search failed:', response.status, text);
            return NextResponse.json({ error: 'Failed to fetch breweries' }, { status: response.status });
        }

        const data = (await response.json()) as OpenBreweryResult[];
        const results = (data || [])
            .map((item) => ({
                id: item.id || '',
                name: item.name || '',
                location: [item.city, item.state, item.country].filter(Boolean).join(', '),
            }))
            .filter((item) => item.id && item.name)
            .slice(0, 10);

        return NextResponse.json(results);
    } catch (error) {
        console.error('Brewery search proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
