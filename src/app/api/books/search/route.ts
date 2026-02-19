import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

interface OpenLibraryDoc {
    key?: string;
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
}

interface OpenLibraryResponse {
    docs?: OpenLibraryDoc[];
}

interface GoogleBookVolumeInfo {
    title?: string;
    authors?: string[];
    publishedDate?: string;
}

interface GoogleBookItem {
    id?: string;
    volumeInfo?: GoogleBookVolumeInfo;
}

interface GoogleBooksResponse {
    items?: GoogleBookItem[];
}

async function searchOpenLibrary(query: string) {
    const upstreamUrl = new URL('https://openlibrary.org/search.json');
    upstreamUrl.searchParams.set('q', query);
    upstreamUrl.searchParams.set('limit', '12');
    upstreamUrl.searchParams.set('fields', 'key,title,author_name,first_publish_year');

    const response = await fetch(upstreamUrl.toString(), {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
    });

    if (!response.ok) {
        throw new Error(`Open Library search failed: ${response.status}`);
    }

    const data = (await response.json()) as OpenLibraryResponse;
    return (data.docs || [])
        .map((doc) => ({
            id: (doc.key || '').replace('/works/', ''),
            title: doc.title || '',
            author: (doc.author_name || []).join(', '),
            publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
        }))
        .filter((item) => item.id && item.title)
        .slice(0, 10);
}

async function searchGoogleBooks(query: string) {
    const upstreamUrl = new URL('https://www.googleapis.com/books/v1/volumes');
    upstreamUrl.searchParams.set('q', query);
    upstreamUrl.searchParams.set('maxResults', '12');
    upstreamUrl.searchParams.set('printType', 'books');
    upstreamUrl.searchParams.set('langRestrict', 'en');

    const response = await fetch(upstreamUrl.toString(), {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
    });

    if (!response.ok) {
        throw new Error(`Google Books search failed: ${response.status}`);
    }

    const data = (await response.json()) as GoogleBooksResponse;
    return (data.items || [])
        .map((item) => ({
            id: item.id || '',
            title: item.volumeInfo?.title || '',
            author: (item.volumeInfo?.authors || []).join(', '),
            publishedDate: item.volumeInfo?.publishedDate || '',
        }))
        .filter((item) => item.id && item.title)
        .slice(0, 10);
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
        const primaryResults = await searchOpenLibrary(query);
        if (primaryResults.length > 0) {
            return NextResponse.json(primaryResults);
        }
    } catch (error) {
        console.error('Open Library search error:', error);
    }

    try {
        const fallbackResults = await searchGoogleBooks(query);
        return NextResponse.json(fallbackResults);
    } catch (error) {
        console.error('Book search proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
