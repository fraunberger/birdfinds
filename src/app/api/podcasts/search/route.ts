import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

interface ITunesPodcastResult {
    collectionId?: number;
    collectionName?: string;
    artistName?: string;
    feedUrl?: string;
    artworkUrl100?: string;
}

interface ITunesPodcastSearchResponse {
    results?: ITunesPodcastResult[];
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
        const upstreamUrl = new URL('https://itunes.apple.com/search');
        upstreamUrl.searchParams.set('term', query);
        upstreamUrl.searchParams.set('media', 'podcast');
        upstreamUrl.searchParams.set('entity', 'podcast');
        upstreamUrl.searchParams.set('limit', '12');

        const response = await fetch(upstreamUrl.toString(), {
            headers: { Accept: 'application/json' },
            next: { revalidate: 300 },
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('Podcast show search failed:', response.status, text);
            return NextResponse.json({ error: 'Failed to fetch podcast shows' }, { status: response.status });
        }

        const data = (await response.json()) as ITunesPodcastSearchResponse;
        const results = (data.results || [])
            .map((item) => ({
                id: String(item.collectionId || ''),
                name: item.collectionName || '',
                author: item.artistName || '',
                feedUrl: item.feedUrl || '',
                image: item.artworkUrl100 || '',
            }))
            .filter((item) => item.id && item.name && item.feedUrl);

        return NextResponse.json(results);
    } catch (error) {
        console.error('Podcast search proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
