
import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
interface GooglePlace {
    name: string;
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    priceLevel?: string;
    displayName?: {
        text?: string;
    };
    googleMapsUri?: string;
}

interface GooglePlacesResponse {
    places?: GooglePlace[];
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    if (!GOOGLE_PLACES_API_KEY) {
        console.error("Missing GOOGLE_PLACES_API_KEY");
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const rl = rateLimit(`search:${getClientIp(request)}`, 30);
    if (!rl.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    try {
        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
                // Asking for specific fields to save money/bandwidth
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.photos,places.name,places.googleMapsUri'
            },
            body: JSON.stringify({
                textQuery: query
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Google Places API Error:", response.status, errorText);
            return NextResponse.json({ error: 'Failed to fetch places' }, { status: response.status });
        }

        const data = (await response.json()) as GooglePlacesResponse;

        // Transform to our app's internal format
        // Note: Photos need a separate call to get the URL usually, or we construct the reference.
        // For simplicity in this v1, we'll just check if photos exist and maybe offer a generic placeholder if not,
        // or construct the photo URL pattern if we want to display them (requires another API hit or specific URL pattern).
        // The Places API (New) returns 'name' as "places/PLACE_ID", we might want the display name which is accessed via 'displayName'.
        // Wait, field mask 'places.name' returns the resource name. 'places.displayName' returns the localized text. 
        // Let's adjust field mask to 'places.displayName' for the name.

        // Actually, let's re-fetch with a better field mask to get the proper display name.
        // Correction: 'name' is the resource name (ID), 'displayName' is the readable name.

        const results = (data.places || []).map((place) => ({
            name: place.displayName?.text || place.name,
            address: place.formattedAddress,
            rating: place.rating,
            reviewCount: place.userRatingCount,
            priceLevel: place.priceLevel, // PRICE_LEVEL_UNSPECIFIED, PRICE_LEVEL_INEXPENSIVE, etc.
            googleMapsUri: place.googleMapsUri,
            // photo: place.photos?.[0] ? ... : undefined, // We don't have a way to show photos yet without more API calls
            id: place.name // Resource name "places/ChIJ..." acts as ID
        }));

        return NextResponse.json(results);

    } catch (e) {
        console.error("Proxy Error:", e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
