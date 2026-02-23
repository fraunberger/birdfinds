import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

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

    const rl = rateLimit(`search:${getClientIp(request)}`, 30);
    if (!rl.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    try {
        const endpointVariants: Array<{ path: string; queryParam: string }> = [
            { path: '/v1/breweries/search', queryParam: 'query' },
            { path: '/v1/breweries', queryParam: 'by_name' },
        ];

        let data: OpenBreweryResult[] = [];
        let lastErrorStatus = 500;

        for (const variant of endpointVariants) {
            const upstreamUrl = new URL(`https://api.openbrewerydb.org${variant.path}`);
            upstreamUrl.searchParams.set(variant.queryParam, query);
            upstreamUrl.searchParams.set('per_page', '12');

            const response = await fetch(upstreamUrl.toString(), {
                headers: { Accept: 'application/json' },
                next: { revalidate: 300 },
            });

            if (!response.ok) {
                lastErrorStatus = response.status;
                const text = await response.text();
                console.error('Brewery search failed:', response.status, variant.path, text);
                continue;
            }

            data = (await response.json()) as OpenBreweryResult[];
            break;
        }

        if (!Array.isArray(data)) {
            return NextResponse.json({ error: 'Failed to fetch breweries' }, { status: lastErrorStatus });
        }

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
