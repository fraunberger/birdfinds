/**
 * Shared utilities for parsing and serializing item metadata.
 *
 * The `image` column in `social_items` doubles as a metadata store:
 *   - Plain URL string  → just an image
 *   - `meta:<encoded JSON>` → structured metadata (image, aliases, recipe URL, etc.)
 */

export interface ItemMetaData {
    imageUrl?: string;
    recipeUrl?: string;
    aliases?: string[];
    restaurantLocation?: string;
    externalSource?: string;
    externalId?: string;
}

const META_PREFIX = 'meta:';

/** Parse item metadata from the raw `image` column value. */
export const parseItemMeta = (raw?: string): ItemMetaData => {
    if (!raw) return {};
    if (!raw.startsWith(META_PREFIX)) return { imageUrl: raw };
    try {
        const decoded = decodeURIComponent(raw.slice(META_PREFIX.length));
        const parsed = JSON.parse(decoded) as ItemMetaData;
        return {
            imageUrl: parsed.imageUrl,
            recipeUrl: typeof parsed.recipeUrl === 'string' ? parsed.recipeUrl : undefined,
            aliases: Array.isArray(parsed.aliases) ? parsed.aliases.filter(Boolean) : [],
            restaurantLocation: typeof parsed.restaurantLocation === 'string' ? parsed.restaurantLocation : undefined,
            externalSource: typeof parsed.externalSource === 'string' ? parsed.externalSource : undefined,
            externalId: typeof parsed.externalId === 'string' ? parsed.externalId : undefined,
        };
    } catch {
        return {};
    }
};

/** Serialize structured metadata back into the `image` column format. */
export const serializeItemMeta = (meta: ItemMetaData): string | undefined => {
    const aliases = (meta.aliases || []).map((value) => value.trim()).filter(Boolean);
    if (!meta.imageUrl && !meta.recipeUrl && !meta.restaurantLocation && aliases.length === 0) return undefined;
    const externalSource = meta.externalSource?.trim();
    const externalId = meta.externalId?.trim();
    if (!meta.recipeUrl && !meta.restaurantLocation && aliases.length === 0 && !externalSource && !externalId && meta.imageUrl) return meta.imageUrl;
    return `${META_PREFIX}${encodeURIComponent(JSON.stringify({
        imageUrl: meta.imageUrl,
        recipeUrl: meta.recipeUrl,
        restaurantLocation: meta.restaurantLocation,
        aliases,
        externalSource,
        externalId,
    }))}`;
};

/** Extract the display image URL from a raw `image` column value. */
export const parseMetaImage = (raw?: string): string | undefined => {
    if (!raw) return undefined;
    if (!raw.startsWith(META_PREFIX)) return raw;
    try {
        const decoded = decodeURIComponent(raw.slice(META_PREFIX.length));
        const parsed = JSON.parse(decoded) as { imageUrl?: string };
        return parsed.imageUrl;
    } catch {
        return undefined;
    }
};

/** Build a Google Maps search link from item metadata. */
export const toGoogleMapsLink = (raw?: string, title?: string, subtitle?: string): string | null => {
    const imageRef = parseMetaImage(raw);
    const meta = parseItemMeta(raw);
    if (imageRef?.startsWith('mapsurl:')) {
        const encoded = imageRef.slice('mapsurl:'.length);
        if (encoded) {
            try {
                return decodeURIComponent(encoded);
            } catch {
                return encoded;
            }
        }
    }
    const normalized = imageRef?.startsWith('place:') ? imageRef.slice('place:'.length) : imageRef;
    if (normalized?.startsWith('places/')) {
        const placeId = normalized.slice('places/'.length);
        if (placeId) {
            return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`;
        }
    }
    const query = [title || '', meta.restaurantLocation || subtitle || ''].join(' ').trim();
    if (!query) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

const normalizeIdentityPart = (value?: string) => (value || '').trim().toLowerCase();

export const getItemExternalIdentityKey = (category: string, raw?: string): string | null => {
    const meta = parseItemMeta(raw);
    const source = normalizeIdentityPart(meta.externalSource);
    const id = normalizeIdentityPart(meta.externalId);
    if (!source || !id) return null;
    return `${normalizeIdentityPart(category)}::${source}::${id}`;
};
