import { NextResponse } from 'next/server';

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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    try {
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
            const text = await response.text();
            console.error('Book search failed:', response.status, text);
            return NextResponse.json({ error: 'Failed to fetch books' }, { status: response.status });
        }

        const data = (await response.json()) as GoogleBooksResponse;
        const results = (data.items || [])
            .map((item) => ({
                id: item.id || '',
                title: item.volumeInfo?.title || '',
                author: (item.volumeInfo?.authors || []).join(', '),
                publishedDate: item.volumeInfo?.publishedDate || '',
            }))
            .filter((item) => item.id && item.title)
            .slice(0, 10);

        return NextResponse.json(results);
    } catch (error) {
        console.error('Book search proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
