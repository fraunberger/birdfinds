import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

interface EBirdTaxon {
    speciesCode: string;
    comName: string;
    sciName: string;
    category: string;
    order?: string;
    familyComName?: string;
}

interface TaxonomyCache {
    data: EBirdTaxon[];
    fetchedAt: number;
}

let taxonomyCache: TaxonomyCache | null = null;

async function getTaxonomy(apiKey: string): Promise<EBirdTaxon[]> {
    const TTL = 24 * 60 * 60 * 1000;
    if (taxonomyCache && Date.now() - taxonomyCache.fetchedAt < TTL) {
        return taxonomyCache.data;
    }

    const response = await fetch('https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json', {
        headers: { 'X-eBirdApiToken': apiKey },
        next: { revalidate: 86400 },
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`eBird taxonomy ${response.status}${text ? ': ' + text.slice(0, 200) : ''}`);
    }

    const all = (await response.json()) as EBirdTaxon[];
    const species = all.filter((t) => t.category === 'species' && t.speciesCode && t.comName);
    taxonomyCache = { data: species, fetchedAt: Date.now() };
    return species;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const testKey = searchParams.get('_key')?.trim();

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    const rl = rateLimit(`search:${getClientIp(request)}`, 30);
    if (!rl.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const apiKey = testKey || process.env.EBIRD_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'eBird API key not configured' }, { status: 503 });
    }

    try {
        const taxonomy = await getTaxonomy(apiKey);
        const q = query.toLowerCase();

        const results = taxonomy
            .filter((t) => t.comName.toLowerCase().includes(q) || t.sciName.toLowerCase().includes(q))
            .sort((a, b) => {
                const aStarts = a.comName.toLowerCase().startsWith(q) ? 0 : 1;
                const bStarts = b.comName.toLowerCase().startsWith(q) ? 0 : 1;
                return aStarts - bStarts;
            })
            .slice(0, 12)
            .map((t) => ({
                id: t.speciesCode,
                comName: t.comName,
                sciName: t.sciName,
                familyComName: t.familyComName || '',
                orderComName: t.order || '',
            }));

        return NextResponse.json(results);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal server error';
        console.error('Bird search error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
