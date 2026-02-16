import { NextResponse } from 'next/server';

interface TvMazeEpisode {
    id?: number;
    name?: string;
    season?: number;
    number?: number;
    airdate?: string;
    airstamp?: string;
}

const pad2 = (value?: number) => String(value || 0).padStart(2, '0');

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const showId = searchParams.get('showId')?.trim();

    if (!showId) {
        return NextResponse.json({ error: 'Query parameter "showId" is required' }, { status: 400 });
    }

    if (!/^\d+$/.test(showId)) {
        return NextResponse.json({ error: 'Invalid showId' }, { status: 400 });
    }

    try {
        const upstreamUrl = new URL(`https://api.tvmaze.com/shows/${showId}/episodes`);
        upstreamUrl.searchParams.set('specials', '1');

        const response = await fetch(upstreamUrl.toString(), {
            headers: { Accept: 'application/json' },
            next: { revalidate: 300 },
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('TV episodes fetch failed:', response.status, text);
            return NextResponse.json({ error: 'Failed to fetch TV episodes' }, { status: response.status });
        }

        const data = (await response.json()) as TvMazeEpisode[];
        const results = (data || [])
            .map((ep) => {
                const season = ep.season || 0;
                const episode = ep.number || 0;
                const label = `S${pad2(season)}E${pad2(episode)}${ep.name ? ` - ${ep.name}` : ''}`;
                const stamp = ep.airstamp || ep.airdate || '';
                return {
                    id: String(ep.id || `${season}-${episode}-${ep.name || ''}`),
                    label,
                    season,
                    episode,
                    airdate: ep.airdate || '',
                    stamp,
                };
            })
            .filter((ep) => ep.id && ep.label)
            .sort((a, b) => (Date.parse(b.stamp) || 0) - (Date.parse(a.stamp) || 0))
            .slice(0, 500);

        return NextResponse.json(results);
    } catch (error) {
        console.error('TV episodes proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
