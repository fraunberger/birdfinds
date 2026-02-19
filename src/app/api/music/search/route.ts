import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

interface MusicBrainzArtistCredit {
    name?: string;
    artist?: {
        name?: string;
    };
}

interface MusicBrainzReleaseGroup {
    id: string;
    title?: string;
    'first-release-date'?: string;
    'primary-type'?: string;
    'artist-credit'?: MusicBrainzArtistCredit[];
    'secondary-types'?: string[];
}

interface MusicBrainzSearchResponse {
    'release-groups'?: MusicBrainzReleaseGroup[];
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
        const upstreamUrl = new URL('https://musicbrainz.org/ws/2/release-group');
        upstreamUrl.searchParams.set('query', query);
        upstreamUrl.searchParams.set('fmt', 'json');
        upstreamUrl.searchParams.set('limit', '12');

        const response = await fetch(upstreamUrl.toString(), {
            headers: {
                Accept: 'application/json',
                // MusicBrainz requests should identify the client.
                'User-Agent': 'Birdfinds/1.0 (cardinal social album lookup)',
            },
            next: { revalidate: 60 },
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('MusicBrainz search failed:', response.status, text);
            return NextResponse.json({ error: 'Failed to fetch music results' }, { status: response.status });
        }

        const data = (await response.json()) as MusicBrainzSearchResponse;
        const results = (data['release-groups'] || [])
            .filter((item) => item['primary-type'] === 'Album')
            .map((item) => ({
                id: item.id,
                title: item.title || '',
                artist: (item['artist-credit'] || [])
                    .map((credit) => credit.name || credit.artist?.name || '')
                    .filter(Boolean)
                    .join(', '),
                genre: '',
                image: '',
                releaseDate: item['first-release-date'] || '',
            }))
            .filter((item) => item.id && item.title);

        return NextResponse.json(results);
    } catch (error) {
        console.error('Music search proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
