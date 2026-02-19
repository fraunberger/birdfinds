import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

interface TvMazeShowImage {
    medium?: string;
    original?: string;
}

interface TvMazeShow {
    id?: number;
    name?: string;
    premiered?: string;
    image?: TvMazeShowImage;
    network?: {
        name?: string;
    };
    webChannel?: {
        name?: string;
    };
}

interface TvMazeSearchResult {
    show?: TvMazeShow;
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
        const upstreamUrl = new URL('https://api.tvmaze.com/search/shows');
        upstreamUrl.searchParams.set('q', query);

        const response = await fetch(upstreamUrl.toString(), {
            headers: { Accept: 'application/json' },
            next: { revalidate: 300 },
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('TV show search failed:', response.status, text);
            return NextResponse.json({ error: 'Failed to fetch TV shows' }, { status: response.status });
        }

        const data = (await response.json()) as TvMazeSearchResult[];
        const results = (data || [])
            .map((item) => ({
                id: String(item.show?.id || ''),
                name: item.show?.name || '',
                network: item.show?.network?.name || item.show?.webChannel?.name || '',
                premiered: item.show?.premiered || '',
                image: item.show?.image?.medium || item.show?.image?.original || '',
            }))
            .filter((item) => item.id && item.name)
            .slice(0, 12);

        return NextResponse.json(results);
    } catch (error) {
        console.error('TV search proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
