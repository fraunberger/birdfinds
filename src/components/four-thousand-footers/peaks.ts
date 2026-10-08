// The 48 White Mountain four-thousand footers, as the AMC Four Thousand Footer
// Committee lists them on its application form. Elevations are the committee's
// figures (feet); a few differ by 10-25 ft from newer lidar surveys, and the
// notes below call out the ones hikers argue about. Coordinates are summit
// positions (WGS84) cross-checked against Wikipedia, SummitPost and Peakbagger.

export type RangeId =
    | "presidential"
    | "carter"
    | "franconia"
    | "pemi"
    | "willey"
    | "kinsman"
    | "hancock"
    | "sandwich"
    | "north";

export type Range = {
    id: RangeId;
    name: string;
    /** Chip-sized name. */
    short: string;
};

export type PeakShape = "sharp" | "dome";

export type Peak = {
    id: string;
    name: string;
    /** Compact name for crowded map labels. */
    label: string;
    elevation: number;
    lat: number;
    lon: number;
    range: RangeId;
    /** Silhouette character; omitted means an ordinary peak. */
    shape?: PeakShape;
    note?: string;
};

export const RANGES: readonly Range[] = [
    { id: "presidential", name: "Presidential Range", short: "Presidentials" },
    { id: "carter", name: "Carter-Moriah & Wildcats", short: "Carters" },
    { id: "franconia", name: "Franconia Range", short: "Franconia" },
    { id: "pemi", name: "Twins, Bonds & the Pemi", short: "Pemi" },
    { id: "willey", name: "Willey Range", short: "Willey" },
    { id: "kinsman", name: "Kinsmans, Cannon & Moosilauke", short: "Kinsmans" },
    { id: "hancock", name: "Carrigain & the Hancocks", short: "Hancocks" },
    { id: "sandwich", name: "Sandwich Range & Waterville", short: "Sandwich" },
    { id: "north", name: "North Country", short: "North" },
];

export const PEAKS: readonly Peak[] = [
    { id: "washington", name: "Washington", label: "Washington", elevation: 6288, lat: 44.2705, lon: -71.3033, range: "presidential", note: "Highest peak in the Northeast." },
    { id: "adams", name: "Adams", label: "Adams", elevation: 5774, lat: 44.3206, lon: -71.2914, range: "presidential", shape: "sharp" },
    { id: "jefferson", name: "Jefferson", label: "Jefferson", elevation: 5712, lat: 44.3042, lon: -71.3169, range: "presidential", shape: "sharp" },
    { id: "monroe", name: "Monroe", label: "Monroe", elevation: 5372, lat: 44.2556, lon: -71.3225, range: "presidential", shape: "sharp" },
    { id: "madison", name: "Madison", label: "Madison", elevation: 5367, lat: 44.3288, lon: -71.2768, range: "presidential", shape: "sharp" },
    { id: "lafayette", name: "Lafayette", label: "Lafayette", elevation: 5260, lat: 44.1607, lon: -71.6444, range: "franconia", shape: "sharp" },
    { id: "lincoln", name: "Lincoln", label: "Lincoln", elevation: 5089, lat: 44.1489, lon: -71.6445, range: "franconia", shape: "sharp" },
    { id: "south-twin", name: "South Twin", label: "S. Twin", elevation: 4902, lat: 44.1875, lon: -71.5553, range: "pemi" },
    { id: "carter-dome", name: "Carter Dome", label: "Carter Dome", elevation: 4832, lat: 44.2673, lon: -71.1793, range: "carter", shape: "dome" },
    { id: "moosilauke", name: "Moosilauke", label: "Moosilauke", elevation: 4802, lat: 44.0245, lon: -71.8309, range: "kinsman", shape: "dome" },
    { id: "eisenhower", name: "Eisenhower", label: "Eisenhower", elevation: 4780, lat: 44.2407, lon: -71.3502, range: "presidential", shape: "dome", note: "The AMC figure is an estimate; lidar puts the summit nearer 4,760 ft." },
    { id: "north-twin", name: "North Twin", label: "N. Twin", elevation: 4761, lat: 44.2023, lon: -71.5583, range: "pemi" },
    { id: "carrigain", name: "Carrigain", label: "Carrigain", elevation: 4700, lat: 44.0936, lon: -71.4468, range: "hancock", shape: "sharp" },
    { id: "bond", name: "Bond", label: "Bond", elevation: 4698, lat: 44.153, lon: -71.5312, range: "pemi" },
    { id: "middle-carter", name: "Middle Carter", label: "M. Carter", elevation: 4610, lat: 44.3031, lon: -71.1673, range: "carter" },
    { id: "west-bond", name: "West Bond", label: "W. Bond", elevation: 4540, lat: 44.1547, lon: -71.5435, range: "pemi", shape: "sharp" },
    { id: "garfield", name: "Garfield", label: "Garfield", elevation: 4500, lat: 44.187, lon: -71.6109, range: "pemi", shape: "sharp" },
    { id: "liberty", name: "Liberty", label: "Liberty", elevation: 4459, lat: 44.1158, lon: -71.6421, range: "franconia", shape: "sharp" },
    { id: "south-carter", name: "South Carter", label: "S. Carter", elevation: 4430, lat: 44.2897, lon: -71.1761, range: "carter" },
    { id: "wildcat-a", name: "Wildcat A", label: "Wildcat A", elevation: 4422, lat: 44.2589, lon: -71.2014, range: "carter" },
    { id: "hancock", name: "Hancock", label: "Hancock", elevation: 4420, lat: 44.0837, lon: -71.4937, range: "hancock" },
    { id: "south-kinsman", name: "South Kinsman", label: "S. Kinsman", elevation: 4358, lat: 44.123, lon: -71.7367, range: "kinsman" },
    { id: "field", name: "Field", label: "Field", elevation: 4340, lat: 44.1962, lon: -71.4345, range: "willey", shape: "dome" },
    { id: "osceola", name: "Osceola", label: "Osceola", elevation: 4340, lat: 44.0016, lon: -71.5356, range: "sandwich" },
    { id: "flume", name: "Flume", label: "Flume", elevation: 4328, lat: 44.109, lon: -71.6279, range: "franconia", shape: "sharp" },
    { id: "south-hancock", name: "South Hancock", label: "S. Hancock", elevation: 4319, lat: 44.0733, lon: -71.4869, range: "hancock" },
    { id: "pierce", name: "Pierce", label: "Pierce", elevation: 4312, lat: 44.2265, lon: -71.366, range: "presidential", shape: "dome" },
    { id: "north-kinsman", name: "North Kinsman", label: "N. Kinsman", elevation: 4293, lat: 44.1334, lon: -71.7369, range: "kinsman" },
    { id: "willey", name: "Willey", label: "Willey", elevation: 4285, lat: 44.1836, lon: -71.4219, range: "willey" },
    { id: "bondcliff", name: "Bondcliff", label: "Bondcliff", elevation: 4265, lat: 44.1407, lon: -71.5406, range: "pemi", shape: "sharp" },
    { id: "zealand", name: "Zealand", label: "Zealand", elevation: 4260, lat: 44.1797, lon: -71.5213, range: "pemi", shape: "dome" },
    { id: "north-tripyramid", name: "North Tripyramid", label: "N. Tripyramid", elevation: 4180, lat: 43.9733, lon: -71.4429, range: "sandwich", shape: "sharp" },
    { id: "cabot", name: "Cabot", label: "Cabot", elevation: 4170, lat: 44.506, lon: -71.4144, range: "north", shape: "dome" },
    { id: "east-osceola", name: "East Osceola", label: "E. Osceola", elevation: 4156, lat: 44.0062, lon: -71.5206, range: "sandwich" },
    { id: "middle-tripyramid", name: "Middle Tripyramid", label: "M. Tripyramid", elevation: 4140, lat: 43.9647, lon: -71.44, range: "sandwich", shape: "sharp" },
    { id: "cannon", name: "Cannon", label: "Cannon", elevation: 4100, lat: 44.1565, lon: -71.6984, range: "kinsman", shape: "dome" },
    { id: "wildcat-d", name: "Wildcat D", label: "Wildcat D", elevation: 4062, lat: 44.2494, lon: -71.2236, range: "carter" },
    { id: "hale", name: "Hale", label: "Hale", elevation: 4054, lat: 44.2217, lon: -71.512, range: "pemi", shape: "dome" },
    { id: "jackson", name: "Jackson", label: "Jackson", elevation: 4052, lat: 44.1945, lon: -71.3887, range: "presidential" },
    { id: "tom", name: "Tom", label: "Tom", elevation: 4051, lat: 44.2103, lon: -71.4459, range: "willey", shape: "dome" },
    { id: "moriah", name: "Moriah", label: "Moriah", elevation: 4049, lat: 44.3403, lon: -71.1315, range: "carter" },
    { id: "passaconaway", name: "Passaconaway", label: "Passaconaway", elevation: 4043, lat: 43.9547, lon: -71.3814, range: "sandwich", shape: "dome" },
    { id: "owls-head", name: "Owl's Head", label: "Owl's Head", elevation: 4025, lat: 44.1444, lon: -71.605, range: "pemi", note: "The true summit is about a fifth of a mile north of the old summit cairn (found in 2005)." },
    { id: "galehead", name: "Galehead", label: "Galehead", elevation: 4024, lat: 44.1848, lon: -71.5734, range: "pemi", shape: "dome" },
    { id: "whiteface", name: "Whiteface", label: "Whiteface", elevation: 4020, lat: 43.934, lon: -71.4059, range: "sandwich" },
    { id: "waumbek", name: "Waumbek", label: "Waumbek", elevation: 4006, lat: 44.4328, lon: -71.417, range: "north", shape: "dome" },
    { id: "isolation", name: "Isolation", label: "Isolation", elevation: 4004, lat: 44.2148, lon: -71.3092, range: "presidential", shape: "dome" },
    { id: "tecumseh", name: "Tecumseh", label: "Tecumseh", elevation: 4003, lat: 43.9673, lon: -71.5581, range: "sandwich", note: "A 2019 USGS survey marker reads 3,997 ft. Tecumseh stays on the list under a grandfather rule." },
];

/** Notches and towns drawn faintly on the ground, for orientation only. */
export const LANDMARKS: ReadonlyArray<{ name: string; lat: number; lon: number }> = [
    { name: "Franconia Notch", lat: 44.165, lon: -71.683 },
    { name: "Crawford Notch", lat: 44.2187, lon: -71.4108 },
    { name: "Pinkham Notch", lat: 44.2571, lon: -71.2531 },
    { name: "Kinsman Notch", lat: 44.0398, lon: -71.792 },
    { name: "Lincoln", lat: 44.0456, lon: -71.6703 },
    { name: "North Conway", lat: 44.0537, lon: -71.1284 },
    { name: "Gorham", lat: 44.3876, lon: -71.1731 },
    { name: "Twin Mountain", lat: 44.2731, lon: -71.5428 },
];

export const PEAK_BY_ID: ReadonlyMap<string, Peak> = new Map(PEAKS.map((p) => [p.id, p]));

export const RANGE_BY_ID: ReadonlyMap<RangeId, Range> = new Map(RANGES.map((r) => [r.id, r]));

export function peaksInRange(range: RangeId): Peak[] {
    return PEAKS.filter((p) => p.range === range);
}

/** 1-based rank by elevation; ties share a rank (Field and Osceola are both 23rd). */
export function elevationRank(peak: Peak): number {
    return 1 + PEAKS.filter((p) => p.elevation > peak.elevation).length;
}

export function feetToMeters(feet: number): number {
    return Math.round(feet * 0.3048);
}

export function formatFeet(feet: number): string {
    return feet.toLocaleString("en-US");
}

// --- Distances ---

const KM_PER_MILE = 1.609344;
const EARTH_RADIUS_KM = 6371.0088;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

/** Great-circle distance in miles. */
export function milesBetween(a: Peak, b: Peak): number {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return (2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))) / KM_PER_MILE;
}

/** Eight-point compass direction from `a` to `b`. */
export function bearingName(a: Peak, b: Peak): (typeof COMPASS)[number] {
    const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
    const x =
        Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
        Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
    const degrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    return COMPASS[Math.round(degrees / 45) % 8];
}

export function nearestPeak(peak: Peak): { peak: Peak; miles: number } {
    let best: { peak: Peak; miles: number } | null = null;
    for (const other of PEAKS) {
        if (other.id === peak.id) continue;
        const miles = milesBetween(peak, other);
        if (!best || miles < best.miles) best = { peak: other, miles };
    }
    // There are always 47 others.
    return best as { peak: Peak; miles: number };
}

/** "Northernmost of the 48" and friends, worked out from the data. */
export function superlatives(peak: Peak): string[] {
    const facts: string[] = [];
    const by = (key: (p: Peak) => number, pick: "max" | "min") => {
        const values = PEAKS.map(key);
        const target = pick === "max" ? Math.max(...values) : Math.min(...values);
        return key(peak) === target;
    };
    if (by((p) => p.elevation, "min")) facts.push("Lowest of the 48.");
    if (by((p) => p.lat, "max")) facts.push("Northernmost of the 48.");
    if (by((p) => p.lat, "min")) facts.push("Southernmost of the 48.");
    if (by((p) => p.lon, "max")) facts.push("Easternmost of the 48.");
    if (by((p) => p.lon, "min")) facts.push("Westernmost of the 48.");
    return facts;
}
