import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

interface EBirdTaxon {
    speciesCode?: string;
    comName?: string;
    sciName?: string;
    familyComName?: string;
    orderComName?: string;
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

    const apiKey = process.env.EBIRD_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'eBird API key not configured' }, { status: 503 });
    }

    try {
        const url = new URL('https://api.ebird.org/v2/ref/taxon/find');
        url.searchParams.set('q', query);
        url.searchParams.set('maxResults', '12');
        url.searchParams.set('locale', 'en');

        const response = await fetch(url.toString(), {
            headers: {
                'X-eBirdApiToken': apiKey,
                Accept: 'application/json',
            },
            next: { revalidate: 3600 },
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('eBird search failed:', response.status, text);
            return NextResponse.json(
                { error: `eBird API error ${response.status}${text ? ': ' + text.slice(0, 200) : ''}` },
                { status: response.status }
            );
        }

        const data = (await response.json()) as EBirdTaxon[];
        const results = data
            .filter((t) => t.speciesCode && t.comName)
            .map((t) => ({
                id: t.speciesCode!,
                comName: t.comName!,
                sciName: t.sciName || '',
                familyComName: t.familyComName || '',
                orderComName: t.orderComName || '',
            }));

        return NextResponse.json(results);
    } catch (error) {
        console.error('Bird search proxy error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
