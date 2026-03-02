import { NextResponse } from 'next/server';

interface ParsedEpisode {
    id: string;
    title: string;
    publishedAt: string;
}

const DEFAULT_EPISODE_LIMIT = 250;
const MAX_EPISODE_LIMIT = 500;
const ITUNES_MAX_EPISODE_LIMIT = 200;

interface ITunesEpisodeResult {
    trackId?: number;
    trackName?: string;
    releaseDate?: string;
    wrapperType?: string;
    kind?: string;
}

interface ITunesLookupResponse {
    results?: ITunesEpisodeResult[];
}

const getTagValue = (source: string, tagName: string): string => {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
    const match = source.match(regex);
    return match?.[1]?.trim() || '';
};

const decodeText = (value: string): string =>
    value
        .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

const parseRssItems = (xml: string): ParsedEpisode[] => {
    const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    const episodes = itemBlocks.map((item) => {
        const title = decodeText(getTagValue(item, 'title'));
        const guid = decodeText(getTagValue(item, 'guid'));
        const pubDate = decodeText(getTagValue(item, 'pubDate'));
        return {
            id: guid || `${title}:${pubDate}`,
            title,
            publishedAt: pubDate,
        };
    }).filter((ep) => ep.title);
    return episodes;
};

const parseAtomEntries = (xml: string): ParsedEpisode[] => {
    const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
    const episodes = entryBlocks.map((entry) => {
        const title = decodeText(getTagValue(entry, 'title'));
        const id = decodeText(getTagValue(entry, 'id'));
        const publishedAt = decodeText(getTagValue(entry, 'published')) || decodeText(getTagValue(entry, 'updated'));
        return {
            id: id || `${title}:${publishedAt}`,
            title,
            publishedAt,
        };
    }).filter((ep) => ep.title);
    return episodes;
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const rawFeedUrl = searchParams.get('feedUrl')?.trim();
    const rawPodcastId = searchParams.get('podcastId')?.trim();
    const requestedLimit = Number(searchParams.get('limit') || DEFAULT_EPISODE_LIMIT);
    const episodeLimit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_EPISODE_LIMIT)
        : DEFAULT_EPISODE_LIMIT;

    if (!rawFeedUrl && !rawPodcastId) {
        return NextResponse.json({ error: 'Query parameter "podcastId" or "feedUrl" is required' }, { status: 400 });
    }

    try {
        // Prefer iTunes lookup by show ID (usually returns more episodes than RSS feeds).
        if (rawPodcastId) {
            const upstreamUrl = new URL('https://itunes.apple.com/lookup');
            upstreamUrl.searchParams.set('id', rawPodcastId);
            upstreamUrl.searchParams.set('entity', 'podcastEpisode');
            upstreamUrl.searchParams.set('limit', String(Math.min(episodeLimit, ITUNES_MAX_EPISODE_LIMIT)));

            const lookupResponse = await fetch(upstreamUrl.toString(), {
                headers: { Accept: 'application/json' },
                next: { revalidate: 300 },
            });

            if (lookupResponse.ok) {
                const lookupData = (await lookupResponse.json()) as ITunesLookupResponse;
                const episodes = (lookupData.results || [])
                    .filter((entry) => entry.wrapperType === 'podcastEpisode' || entry.kind === 'podcast-episode')
                    .map((entry) => ({
                        id: String(entry.trackId || ''),
                        title: (entry.trackName || '').trim(),
                        publishedAt: (entry.releaseDate || '').trim(),
                    }))
                    .filter((entry) => entry.id && entry.title)
                    .slice(0, episodeLimit);

                if (episodes.length > 0) {
                    return NextResponse.json(episodes);
                }
            } else {
                const text = await lookupResponse.text();
                console.error('Podcast iTunes lookup failed:', lookupResponse.status, text.slice(0, 400));
            }
        }

        if (!rawFeedUrl) {
            return NextResponse.json([]);
        }

        let feedUrl: URL;
        try {
            feedUrl = new URL(rawFeedUrl);
        } catch {
            return NextResponse.json({ error: 'Invalid feedUrl' }, { status: 400 });
        }

        if (feedUrl.protocol !== 'http:' && feedUrl.protocol !== 'https:') {
            return NextResponse.json({ error: 'Invalid feed protocol' }, { status: 400 });
        }

        const response = await fetch(feedUrl.toString(), {
            headers: {
                Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
                'User-Agent': 'Birdfinds/1.0 PodcastEpisodeLookup',
            },
            next: { revalidate: 300 },
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('Podcast episode fetch failed:', response.status, text.slice(0, 400));
            return NextResponse.json({ error: 'Failed to fetch podcast episodes' }, { status: response.status });
        }

        const xml = await response.text();
        const rss = parseRssItems(xml);
        const atom = rss.length > 0 ? [] : parseAtomEntries(xml);
        const combined = (rss.length > 0 ? rss : atom)
            .map((ep) => ({
                ...ep,
                sortTs: Date.parse(ep.publishedAt || '') || 0,
            }))
            .sort((a, b) => b.sortTs - a.sortTs)
            .slice(0, episodeLimit)
            .map((ep) => ({
                id: ep.id,
                title: ep.title,
                publishedAt: ep.publishedAt,
            }));

        return NextResponse.json(combined);
    } catch (error) {
        console.error('Podcast episodes proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
