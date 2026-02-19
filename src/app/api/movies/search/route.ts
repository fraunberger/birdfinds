import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

interface ImdbSuggestionItem {
    id?: string;
    l?: string;
    s?: string;
    y?: number;
    qid?: string;
}

interface ImdbSuggestionResponse {
    d?: ImdbSuggestionItem[];
}

interface ITunesMovieResult {
    trackId?: number;
    trackName?: string;
    trackCensoredName?: string;
    artistName?: string;
    artworkUrl100?: string;
    releaseDate?: string;
    primaryGenreName?: string;
    kind?: string;
}

interface ITunesMovieSearchResponse {
    results?: ITunesMovieResult[];
}

async function searchImdb(query: string) {
    const normalized = query.trim().toLowerCase();
    const first = normalized[0] || 'a';
    const encoded = encodeURIComponent(normalized);
    const url = `https://v2.sg.media-imdb.com/suggestion/${first}/${encoded}.json`;

    const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 60 },
    });

    if (!response.ok) {
        throw new Error(`IMDb search failed: ${response.status}`);
    }

    const data = (await response.json()) as ImdbSuggestionResponse;
    return (data.d || [])
        .filter((item) => item.id?.startsWith('tt'))
        .filter((item) => !item.qid || item.qid === 'feature' || item.qid === 'movie' || item.qid === 'tvMovie')
        .map((item) => ({
            id: item.id || '',
            title: item.l || '',
            subtitle: item.s || '',
            genre: '',
            image: '',
            releaseDate: item.y ? String(item.y) : '',
        }))
        .filter((item) => item.id && item.title)
        .slice(0, 10);
}

async function searchItunes(query: string) {
    const upstreamUrl = new URL('https://itunes.apple.com/search');
    upstreamUrl.searchParams.set('term', query);
    upstreamUrl.searchParams.set('media', 'movie');
    upstreamUrl.searchParams.set('country', 'us');
    upstreamUrl.searchParams.set('limit', '10');

    const response = await fetch(upstreamUrl.toString(), {
        headers: { Accept: 'application/json' },
        next: { revalidate: 60 },
    });

    if (!response.ok) {
        throw new Error(`iTunes search failed: ${response.status}`);
    }

    const data = (await response.json()) as ITunesMovieSearchResponse;
    return (data.results || [])
        .filter((item) => !item.kind || item.kind === 'feature-movie')
        .map((item) => ({
            id: String(item.trackId || ''),
            title: item.trackName || item.trackCensoredName || '',
            subtitle: item.artistName || '',
            genre: item.primaryGenreName || '',
            image: item.artworkUrl100 || '',
            releaseDate: item.releaseDate || '',
        }))
        .filter((item) => item.id && item.title);
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
        const imdbResults = await searchImdb(query);
        if (imdbResults.length > 0) {
            return NextResponse.json(imdbResults);
        }
    } catch (error) {
        console.error('IMDb movie search error:', error);
    }

    try {
        const iTunesResults = await searchItunes(query);
        return NextResponse.json(iTunesResults);
    } catch (error) {
        console.error('Movie search fallback error:', error);
        return NextResponse.json({ error: 'Failed to fetch movie results' }, { status: 502 });
    }
}
