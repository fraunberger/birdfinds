import { NextResponse } from 'next/server';

interface ITunesMovieResult {
    trackId?: number;
    trackName?: string;
    artistName?: string;
    artworkUrl100?: string;
    releaseDate?: string;
    primaryGenreName?: string;
}

interface ITunesMovieSearchResponse {
    results?: ITunesMovieResult[];
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
        upstreamUrl.searchParams.set('entity', 'movie');
        upstreamUrl.searchParams.set('limit', '10');

        const response = await fetch(upstreamUrl.toString(), {
            headers: { Accept: 'application/json' },
            next: { revalidate: 60 },
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('Movie search failed:', response.status, text);
            return NextResponse.json({ error: 'Failed to fetch movie results' }, { status: response.status });
        }

        const data = (await response.json()) as ITunesMovieSearchResponse;
        const results = (data.results || [])
            .map((item) => ({
                id: String(item.trackId || ''),
                title: item.trackName || '',
                subtitle: item.artistName || '',
                genre: item.primaryGenreName || '',
                image: item.artworkUrl100 || '',
                releaseDate: item.releaseDate || '',
            }))
            .filter((item) => item.id && item.title);

        return NextResponse.json(results);
    } catch (error) {
        console.error('Movie search proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
