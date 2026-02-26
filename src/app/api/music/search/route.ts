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
    score?: string;
    'first-release-date'?: string;
    'primary-type'?: string;
    'artist-credit'?: MusicBrainzArtistCredit[];
    'secondary-types'?: string[];
}

interface MusicBrainzSearchResponse {
    'release-groups'?: MusicBrainzReleaseGroup[];
}

function parseReleaseYear(value?: string): number {
    if (!value) return 0;
    const match = value.match(/^(\d{4})/);
    if (!match) return 0;
    const year = Number.parseInt(match[1], 10);
    if (!Number.isFinite(year)) return 0;
    return year;
}

function parseScore(value?: string): number {
    if (!value) return 0;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 0;
    return parsed;
}

function normalizeText(value?: string): string {
    return (value || '').toLowerCase().trim();
}

function tokenizeQuery(query: string): string[] {
    return normalizeText(query)
        .split(/\s+/)
        .filter((token) => token.length > 1);
}

function getArtistNames(item: MusicBrainzReleaseGroup): string {
    return (item['artist-credit'] || [])
        .map((credit) => credit.name || credit.artist?.name || '')
        .filter(Boolean)
        .join(', ');
}

function getTextMatchScore(item: MusicBrainzReleaseGroup, query: string): number {
    const title = normalizeText(item.title);
    const artist = normalizeText(getArtistNames(item));
    const normalizedQuery = normalizeText(query);
    const queryTokens = tokenizeQuery(query);

    let score = 0;

    if (title === normalizedQuery) score += 120;
    else if (title.startsWith(normalizedQuery)) score += 80;
    else if (title.includes(normalizedQuery)) score += 55;

    if (artist === normalizedQuery) score += 75;
    else if (artist.startsWith(normalizedQuery)) score += 45;
    else if (artist.includes(normalizedQuery)) score += 30;

    for (const token of queryTokens) {
        if (title.includes(token)) score += 14;
        if (artist.includes(token)) score += 8;
    }

    return score;
}

function getReleaseRecencyBonus(item: MusicBrainzReleaseGroup): number {
    const year = parseReleaseYear(item['first-release-date']);
    if (!year) return 0;
    return Math.max(0, Math.min(15, Math.floor((year - 1980) / 3)));
}

function getSecondaryTypePenalty(item: MusicBrainzReleaseGroup): number {
    const secondaryTypes = (item['secondary-types'] || []).map((value) => normalizeText(value));
    const penalties: Record<string, number> = {
        live: 18,
        remix: 14,
        compilation: 14,
        soundtrack: 8,
    };

    return secondaryTypes.reduce((total, secondaryType) => total + (penalties[secondaryType] || 0), 0);
}

function getCompositeScore(item: MusicBrainzReleaseGroup, query: string): number {
    const musicBrainzScore = parseScore(item.score);
    const textMatchScore = getTextMatchScore(item, query);
    const recencyBonus = getReleaseRecencyBonus(item);
    const secondaryTypePenalty = getSecondaryTypePenalty(item);

    return musicBrainzScore * 4 + textMatchScore + recencyBonus - secondaryTypePenalty;
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
            .sort((a, b) => {
                // MusicBrainz score is useful but not enough on its own; blend it with local text-match
                // scoring so exact/near-exact title + artist matches float to the top.
                const scoreDelta = getCompositeScore(b, query) - getCompositeScore(a, query);
                if (scoreDelta !== 0) return scoreDelta;

                const musicBrainzScoreDelta = parseScore(b.score) - parseScore(a.score);
                if (musicBrainzScoreDelta !== 0) return musicBrainzScoreDelta;

                return parseReleaseYear(b['first-release-date']) - parseReleaseYear(a['first-release-date']);
            })
            .map((item) => ({
                id: item.id,
                title: item.title || '',
                artist: getArtistNames(item),
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
