import { NextResponse } from 'next/server';

interface ITunesResult {
    trackId?: number;
    collectionId?: number;
    trackName?: string;
    collectionName?: string;
    artistName?: string;
    primaryGenreName?: string;
    artworkUrl100?: string;
    releaseDate?: string;
}

interface ITunesSearchResponse {
    results?: ITunesResult[];
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    try {
        const upstreamUrl = new URL('https://itunes.apple.com/search');
        upstreamUrl.searchParams.set('term', query);
        upstreamUrl.searchParams.set('entity', 'album');
        upstreamUrl.searchParams.set('limit', '8');

        const response = await fetch(upstreamUrl.toString(), {
            headers: { Accept: 'application/json' },
            next: { revalidate: 60 },
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('iTunes search failed:', response.status, text);
            return NextResponse.json({ error: 'Failed to fetch music results' }, { status: response.status });
        }

        const data = (await response.json()) as ITunesSearchResponse;
        const results = (data.results || []).map((item) => ({
            id: item.collectionId ?? item.trackId ?? 0,
            title: item.collectionName || item.trackName || '',
            artist: item.artistName || '',
            genre: item.primaryGenreName || '',
            image: item.artworkUrl100 || '',
            releaseDate: item.releaseDate || '',
        })).filter((item) => item.id && item.title);

        return NextResponse.json(results);
    } catch (error) {
        console.error('Music search proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
