// The range view's geometry, kept free of React so it can be tested and
// reasoned about on its own.
//
// Every peak is a small 3D mound standing at its real position, as tall as its
// real elevation (with the vertical exaggeration every panorama map uses). An
// orthographic camera looks at the whole field from any compass bearing and
// any tilt: low tilts stack the mounds behind each other like a classic
// panorama, high tilts spread them out into a map. Each mound is then drawn
// whole, far to near, so nearer peaks overlap the ones behind them.

import { LANDMARKS, PEAKS, formatFeet, type Peak, type RangeId } from "./peaks";
import {
    BAGGED_LIT,
    BAGGED_SHADE,
    BAGGED_STROKE,
    SKY,
    TOGO_LIT,
    TOGO_SHADE,
    TOGO_STROKE,
    mix,
} from "./palette";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export const FT_PER_KM = 3280.84;
/** Roughly the valley floors the peaks rise from (the notches sit near 2,000 ft). */
export const GROUND_FT = 1500;
/** Vertical exaggeration. Real relief over a 60 km field would barely show. */
export const EXAGGERATION = 4;

function clamp(value: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, value));
}

// --- Local coordinates: km east and north of the middle of the 48 ---

const lats = PEAKS.map((p) => p.lat);
const lons = PEAKS.map((p) => p.lon);
const ORIGIN_LAT = (Math.min(...lats) + Math.max(...lats)) / 2;
const ORIGIN_LON = (Math.min(...lons) + Math.max(...lons)) / 2;
const KM_PER_DEG_LAT = 111.13;
const KM_PER_DEG_LON = 111.32 * Math.cos(ORIGIN_LAT * DEG);

export function toLocal(lat: number, lon: number): { e: number; n: number } {
    return {
        e: (lon - ORIGIN_LON) * KM_PER_DEG_LON,
        n: (lat - ORIGIN_LAT) * KM_PER_DEG_LAT,
    };
}

// --- Mounds ---

/** Vertices around a footprint. */
const FOOT = 48;
/** Height-grid samples per side: fine enough to keep crags crisp. */
const GRID = 41;
const GRID_HALF = (GRID - 1) / 2;

type Harmonic = { a: number; p: number };

type Mound = {
    peak: Peak;
    e: number;
    n: number;
    /** Height above the ground plane, km. */
    relief: number;
    size: number;
    harmonics: readonly Harmonic[];
    /** Footprint outline, km east/north of the summit. */
    footE: Float64Array;
    footN: Float64Array;
    maxRadius: number;
    /** Height as a fraction of relief on a GRID x GRID lattice centered on the summit. */
    grid: Float64Array;
    cellsPerKm: number;
};

function hashString(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Small seeded PRNG, so every mountain keeps its shape across renders and devices. */
function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Profile (1 - t^p)^q. p = 1 gives a pointed summit and anything much above it
// rounds the top into a knob, so even the domes stay close to 1; q > 1 makes
// the flanks concave, flaring out toward the valley.
const PROFILE: Record<"sharp" | "peak" | "dome", readonly [number, number]> = {
    sharp: [1, 1.45],
    peak: [1, 1.2],
    dome: [1.3, 1.1],
};

// Owl's Head is a long north-south ridge rather than a cone.
const ELONGATED: Record<string, { amount: number; bearing: number }> = {
    "owls-head": { amount: 0.32, bearing: 0 },
};

/** Footprint radius (km) toward world angle `alpha` (counterclockwise from east). */
function footprintRadius(m: Pick<Mound, "size" | "harmonics">, alpha: number): number {
    let k = 1;
    m.harmonics.forEach((h, i) => {
        k += h.a * Math.cos((i + 1) * (alpha - h.p));
    });
    return m.size * k;
}

function buildMound(peak: Peak): Mound {
    const rand = mulberry32(hashString(peak.id));
    const { e, n } = toLocal(peak.lat, peak.lon);
    const relief = (peak.elevation - GROUND_FT) / FT_PER_KM;
    const size = (0.75 + relief * 1.15) * (0.9 + rand() * 0.2);

    // A lumpy footprint: a few low harmonics push out spurs and ridges.
    const harmonics: Harmonic[] = [
        { a: 0.08 + rand() * 0.08, p: rand() * TAU },
        { a: 0.05 + rand() * 0.07, p: rand() * TAU },
        { a: 0.02 + rand() * 0.04, p: rand() * TAU },
    ];
    const stretch = ELONGATED[peak.id];
    if (stretch) harmonics[1] = { a: stretch.amount, p: (90 - stretch.bearing) * DEG };
    const outline = { size, harmonics };

    const footE = new Float64Array(FOOT);
    const footN = new Float64Array(FOOT);
    let maxRadius = 0;
    for (let j = 0; j < FOOT; j++) {
        const alpha = (j / FOOT) * TAU;
        const r = footprintRadius(outline, alpha);
        footE[j] = r * Math.cos(alpha);
        footN[j] = r * Math.sin(alpha);
        maxRadius = Math.max(maxRadius, r);
    }

    const [p, q] = PROFILE[peak.shape ?? "peak"];
    // Craggy detail: a few rocky knobs on the flanks, and a ring of sharp-crested
    // ridges with gullies between them, so outlines break up like real slopes.
    const knobs = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => {
        const t = 0.22 + rand() * 0.5;
        const alpha = rand() * TAU;
        return { x: t * Math.cos(alpha), y: t * Math.sin(alpha), height: 0.05 + rand() * 0.08 };
    });
    const ridges = { count: 4 + Math.floor(rand() * 3), phase: rand() * TAU };
    const roughPhase = rand() * TAU;

    // This loop runs for every grid point of every peak, so it saves trig where
    // it can: each harmonic's cos(k(a - p)) comes from cos(a - p) by the
    // multiple-angle formulas, and points beyond the footprint are skipped.
    const phaseCos = harmonics.map((h) => Math.cos(h.p));
    const phaseSin = harmonics.map((h) => Math.sin(h.p));
    const grid = new Float64Array(GRID * GRID);
    const cellsPerKm = GRID_HALF / maxRadius;
    for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
            const ge = (col - GRID_HALF) / cellsPerKm;
            const gn = (row - GRID_HALF) / cellsPerKm;
            const r = Math.sqrt(ge * ge + gn * gn);
            let h = 0;
            if (r === 0) {
                h = 1;
            } else if (r < maxRadius) {
                let reach = 1;
                for (let i = 0; i < harmonics.length; i++) {
                    const c = (ge * phaseCos[i] + gn * phaseSin[i]) / r;
                    reach += harmonics[i].a * (i === 0 ? c : i === 1 ? 2 * c * c - 1 : c * (4 * c * c - 3));
                }
                const radius = size * reach;
                const t = r / radius;
                if (t < 1) {
                    h = p === 1 ? (1 - t) ** q : (1 - t ** p) ** q;
                    const taper = 1 - t * t * t * t;
                    // Zero at the summit and the foot, 1 halfway down.
                    const mid = 4 * t * (1 - t);
                    for (const k of knobs) {
                        const dx = ge / radius - k.x;
                        const dy = gn / radius - k.y;
                        const d2 = dx * dx + dy * dy;
                        // Past this a knob adds under 0.03% of the peak's height.
                        if (d2 < 0.06) h += k.height * Math.exp(-d2 / 0.01) * taper;
                    }
                    const alpha = Math.atan2(gn, ge);
                    // 1 - |sin| has sharp crests and rounded troughs; 0.36 is its mean.
                    const crest = 1 - Math.abs(Math.sin((ridges.count * alpha) / 2 + ridges.phase));
                    h += 0.11 * (crest - 0.36) * mid;
                    // Ledges that wind around the slopes break up the flanks.
                    h += 0.025 * Math.sin(10 * t + 3 * alpha + roughPhase) * mid;
                    // The summit stays the high point.
                    h = clamp(h, 0, 0.97);
                }
            }
            grid[row * GRID + col] = h;
        }
    }

    return { peak, e, n, relief, size, harmonics, footE, footN, maxRadius, grid, cellsPerKm };
}

let mounds: readonly Mound[] | null = null;
let moundById: ReadonlyMap<string, Mound> = new Map();

/** The 48 mounds, built the first time a view needs them rather than on import. */
function allMounds(): readonly Mound[] {
    if (!mounds) {
        mounds = PEAKS.map(buildMound);
        moundById = new Map(mounds.map((m) => [m.peak.id, m]));
    }
    return mounds;
}

function moundFor(peakId: string): Mound | undefined {
    allMounds();
    return moundById.get(peakId);
}

/** Height (fraction of relief) at a point km east/north of the summit. */
function heightAt(m: Mound, e: number, n: number): number {
    const gx = e * m.cellsPerKm + GRID_HALF;
    const gy = n * m.cellsPerKm + GRID_HALF;
    if (gx <= 0 || gy <= 0 || gx >= GRID - 1 || gy >= GRID - 1) return 0;
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const k = j * GRID + i;
    const g = m.grid;
    const a = g[k] + (g[k + 1] - g[k]) * fx;
    const b = g[k + GRID] + (g[k + GRID + 1] - g[k + GRID]) * fx;
    return a + (b - a) * fy;
}

// --- Silhouettes ---

export type Pt = { x: number; y: number };

type Orientation = {
    cosT: number;
    sinT: number;
    sinP: number;
    /** Screen rise per km of relief: cos(tilt) times the vertical exaggeration. */
    lift: number;
};

type Shape = {
    /** Closed outline, for the fill. */
    outline: Pt[];
    /** Just the top edge, foot to summit to foot: the only line that gets inked. */
    ridge: Pt[];
    shade: Pt[];
    summit: Pt;
};

// The light is fixed to the viewer, as in a drawing: it comes from the front
// left, so left flanks catch it and the shadow line runs from each summit down
// to the front right. This is that line's direction in view space (x right,
// d away from the viewer).
const SPLIT_X = 0.6;
const SPLIT_D = -0.8;

const COLUMNS = 32;
const SAMPLES = 12;

/** Sorted column positions, guaranteed to include each of `exact`. */
function columns(lo: number, hi: number, exact: number[]): number[] {
    const span = hi - lo;
    const inset = span * 1e-6;
    const tooClose = span / COLUMNS / 4;
    const xs: number[] = [];
    for (let c = 0; c <= COLUMNS; c++) {
        const x = c === 0 ? lo + inset : c === COLUMNS ? hi - inset : lo + (span * c) / COLUMNS;
        if (exact.every((k) => Math.abs(x - k) > tooClose)) xs.push(x);
    }
    xs.push(...exact);
    return xs.sort((a, b) => a - b);
}

/**
 * Nearest and farthest footprint depth along each column, found by walking the
 * footprint's edges once rather than testing every edge against every column.
 */
function chords(fx: Float64Array, fd: Float64Array, xs: number[]): { lo: Float64Array; hi: Float64Array } {
    const count = xs.length;
    const lo = new Float64Array(count).fill(Infinity);
    const hi = new Float64Array(count).fill(-Infinity);
    for (let j = 0; j < FOOT; j++) {
        const k = j + 1 === FOOT ? 0 : j + 1;
        let x1 = fx[j];
        let x2 = fx[k];
        let d1 = fd[j];
        let d2 = fd[k];
        if (x1 > x2) {
            [x1, x2] = [x2, x1];
            [d1, d2] = [d2, d1];
        }
        let c = 0;
        let top = count;
        while (c < top) {
            const mid = (c + top) >> 1;
            if (xs[mid] < x1) c = mid + 1;
            else top = mid;
        }
        for (; c < count && xs[c] <= x2; c++) {
            const d = x2 === x1 ? d1 : d1 + ((d2 - d1) * (xs[c] - x1)) / (x2 - x1);
            if (d < lo[c]) lo[c] = d;
            if (d > hi[c]) hi[c] = d;
        }
    }
    return { lo, hi };
}

/**
 * The mound's outline as the camera sees it, plus the part of it in shadow.
 * Units are km; x runs right and y runs up from the mound's base point.
 */
function shapeOf(m: Mound, o: Orientation): Shape {
    const fx = new Float64Array(FOOT);
    const fd = new Float64Array(FOOT);
    let xmin = Infinity;
    let xmax = -Infinity;
    for (let j = 0; j < FOOT; j++) {
        const x = m.footE[j] * o.cosT - m.footN[j] * o.sinT;
        fx[j] = x;
        fd[j] = m.footE[j] * o.sinT + m.footN[j] * o.cosT;
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
    }

    const rise = o.lift * m.relief;
    const yAt = (x: number, d: number) =>
        d * o.sinP + rise * heightAt(m, x * o.cosT + d * o.sinT, -x * o.sinT + d * o.cosT);

    // Where the shadow line meets the ground in front of the summit.
    const splitE = SPLIT_X * o.cosT + SPLIT_D * o.sinT;
    const splitN = -SPLIT_X * o.sinT + SPLIT_D * o.cosT;
    const reach = footprintRadius(m, Math.atan2(splitN, splitE)) * 0.995;
    const foot = { x: SPLIT_X * reach, d: SPLIT_D * reach };

    const xs = columns(xmin, xmax, [0, foot.x]);
    const { lo, hi } = chords(fx, fd, xs);
    const top: Pt[] = [];
    const bottom: Pt[] = [];
    for (let c = 0; c < xs.length; c++) {
        const x = xs[c];
        const dmin = lo[c] === Infinity ? 0 : lo[c];
        const dmax = hi[c] === -Infinity ? 0 : hi[c];
        const step = (dmax - dmin) / SAMPLES;
        let best = -Infinity;
        let bestD = dmin;
        for (let k = 0; k <= SAMPLES; k++) {
            const d = dmin + step * k;
            const y = yAt(x, d);
            if (y > best) {
                best = y;
                bestD = d;
            }
        }
        // One refinement either side of the best sample sharpens ridgelines.
        if (bestD - step / 2 > dmin) best = Math.max(best, yAt(x, bestD - step / 2));
        if (bestD + step / 2 < dmax) best = Math.max(best, yAt(x, bestD + step / 2));
        if (x === 0) best = Math.max(best, rise);
        top.push({ x, y: best });
        bottom.push({ x, y: dmin * o.sinP });
    }

    const summitIndex = xs.indexOf(0);
    const footIndex = xs.indexOf(foot.x);
    const split: Pt[] = [];
    for (let k = 0; k < 8; k++) {
        const s = 1 - k / 8;
        split.push({ x: foot.x * s, y: yAt(foot.x * s, foot.d * s) });
    }
    split.push({ x: 0, y: rise });

    return {
        outline: [...top, ...bottom.slice().reverse()],
        ridge: top,
        shade: [...top.slice(summitIndex), ...bottom.slice(footIndex).reverse(), ...split],
        summit: { x: 0, y: rise },
    };
}

/**
 * A peak's side-on profile from the south, for charts. y is in units of the
 * peak's own relief (0 at the ground, 1 at the summit); x is in the same units.
 */
export function profileShape(peakId: string): Shape {
    const m = moundFor(peakId);
    if (!m) throw new Error(`Unknown peak ${peakId}`);
    const shape = shapeOf(m, { cosT: 1, sinT: 0, sinP: 0, lift: 1 });
    const unit = (p: Pt) => ({ x: p.x / m.relief, y: p.y / m.relief });
    return {
        outline: shape.outline.map(unit),
        ridge: shape.ridge.map(unit),
        shade: shape.shade.map(unit),
        summit: unit(shape.summit),
    };
}

// --- The camera ---

export type View = {
    /** Compass bearing the viewer faces, degrees: 0 looks north. */
    azimuth: number;
    /** Camera elevation, degrees: 0 is a side-on profile, 90 looks straight down. */
    tilt: number;
    /** Ground point the view centers on, km east/north of the origin. */
    cx: number;
    cy: number;
    /** Ground radius (km) the view fits on screen. */
    radius: number;
};

export type Camera = {
    width: number;
    height: number;
    /** Pixels per km. */
    scale: number;
    x0: number;
    y0: number;
    cx: number;
    cy: number;
    cosT: number;
    sinT: number;
    sinP: number;
    cosP: number;
};

const PAD_X = 14;
const PAD_TOP = 46;
const PAD_BOTTOM = 16;
const MAX_RELIEF = (Math.max(...PEAKS.map((p) => p.elevation)) - GROUND_FT) / FT_PER_KM;
/** Room around a focused group for the mounds' own spread. */
const FOCUS_MARGIN = 2.4;

export function makeCamera(view: View, width: number, height: number): Camera {
    const t = view.azimuth * DEG;
    const p = clamp(view.tilt, 0, 90) * DEG;
    const sinP = Math.sin(p);
    const cosP = Math.cos(p);
    const r = view.radius;
    const extent = 2 * r * sinP + MAX_RELIEF * EXAGGERATION * cosP;
    const availW = Math.max(1, width - 2 * PAD_X);
    const availH = Math.max(1, height - PAD_TOP - PAD_BOTTOM);
    const scale = Math.min(availW / (2 * r), availH / extent);
    // Spare height goes mostly above the scene, as sky.
    const spare = Math.max(0, availH - extent * scale);
    return {
        width,
        height,
        scale,
        x0: width / 2,
        y0: height - PAD_BOTTOM - spare * 0.25 - r * sinP * scale,
        cx: view.cx,
        cy: view.cy,
        cosT: Math.cos(t),
        sinT: Math.sin(t),
        sinP,
        cosP,
    };
}

/** Screen position of a point `z` km above the ground, and its depth (km, + is away). */
export function project(cam: Camera, e: number, n: number, z = 0): { x: number; y: number; depth: number } {
    const de = e - cam.cx;
    const dn = n - cam.cy;
    const x = de * cam.cosT - dn * cam.sinT;
    const d = de * cam.sinT + dn * cam.cosT;
    return {
        x: cam.x0 + x * cam.scale,
        y: cam.y0 - (d * cam.sinP + z * EXAGGERATION * cam.cosP) * cam.scale,
        depth: d,
    };
}

/**
 * How tall the view wants to be at a given width: a wide, stacked panorama
 * needs only a strip, a spread-out map needs more. Never more than `max`.
 */
export function naturalHeight(view: View, width: number, max: number): number {
    const p = clamp(view.tilt, 0, 90) * DEG;
    const extent = 2 * view.radius * Math.sin(p) + MAX_RELIEF * EXAGGERATION * Math.cos(p);
    const scale = Math.max(1, width - 2 * PAD_X) / (2 * view.radius);
    return Math.round(Math.min(max, PAD_TOP + PAD_BOTTOM + extent * scale + 8));
}

function frame(peaks: readonly Peak[]): { cx: number; cy: number; radius: number } {
    const pts = peaks.map((p) => toLocal(p.lat, p.lon));
    const es = pts.map((p) => p.e);
    const ns = pts.map((p) => p.n);
    const cx = (Math.min(...es) + Math.max(...es)) / 2;
    const cy = (Math.min(...ns) + Math.max(...ns)) / 2;
    const reach = Math.max(...pts.map((p) => Math.hypot(p.e - cx, p.n - cy)));
    return { cx, cy, radius: Math.max(5, reach + FOCUS_MARGIN) };
}

const ALL_FRAME = frame(PEAKS);
const GROUND_RADIUS = ALL_FRAME.radius + 5;

export const DEFAULT_TILT = 38;

export const OVERVIEW: View = { azimuth: 0, tilt: DEFAULT_TILT, ...ALL_FRAME };

/** The same camera angle, re-aimed to fit one range (or all 48). */
export function focusView(range: RangeId | null, from: View): View {
    const group = range ? PEAKS.filter((p) => p.range === range) : PEAKS;
    return { azimuth: from.azimuth, tilt: from.tilt, ...frame(group) };
}

// --- Zooming ---

/** Closest the camera gets: a few km of ground across the view. */
export const MIN_RADIUS = 1.5;
/** Farthest out: a little more than the whole range. */
export const MAX_RADIUS = ALL_FRAME.radius * 1.3;

/** Keep the view's center on the map, however far the cursor reached. */
function keepOnMap(view: View): View {
    const de = view.cx - ALL_FRAME.cx;
    const dn = view.cy - ALL_FRAME.cy;
    const d = Math.hypot(de, dn);
    if (d <= ALL_FRAME.radius) return view;
    const k = ALL_FRAME.radius / d;
    return { ...view, cx: ALL_FRAME.cx + de * k, cy: ALL_FRAME.cy + dn * k };
}

/** A point to zoom around: km east/north, and km up. */
export type Anchor = { e: number; n: number; z: number };

/** Offset (km, from the view's center) of the point `z` km up drawn at a screen point. */
function offsetAt(cam: Camera, at: Pt, z: number): { e: number; n: number } {
    const x = (at.x - cam.x0) / cam.scale;
    const d = ((cam.y0 - at.y) / cam.scale - z * EXAGGERATION * cam.cosP) / Math.max(0.05, cam.sinP);
    return { e: x * cam.cosT + d * cam.sinT, n: -x * cam.sinT + d * cam.cosT };
}

/**
 * What's under a screen point. Over a peak, that's a point on the mountain
 * itself (at the summit's distance), so zooming in climbs toward it rather
 * than toward the ground hidden behind it. Elsewhere it's the ground, held
 * to the map when the point is up in the sky.
 */
export function anchorUnder(
    view: View,
    width: number,
    height: number,
    at: Pt,
    peakId: string | null = null
): Anchor {
    const cam = makeCamera(view, width, height);
    const m = peakId ? moundFor(peakId) : undefined;
    if (m) {
        const x = (at.x - cam.x0) / cam.scale;
        const d = (m.e - cam.cx) * cam.sinT + (m.n - cam.cy) * cam.cosT;
        const z = ((cam.y0 - at.y) / cam.scale - d * cam.sinP) / (EXAGGERATION * Math.max(0.05, cam.cosP));
        if (z >= 0) {
            return { e: cam.cx + x * cam.cosT + d * cam.sinT, n: cam.cy - x * cam.sinT + d * cam.cosT, z };
        }
    }
    const off = offsetAt(cam, at, 0);
    const pinned = keepOnMap({ ...view, cx: view.cx + off.e, cy: view.cy + off.n });
    return { e: pinned.cx, n: pinned.cy, z: 0 };
}

/** The radius at which makeCamera draws `scale` px per km: its fit, inverted. */
function radiusForScale(view: View, width: number, height: number, scale: number): number {
    const p = clamp(view.tilt, 0, 90) * DEG;
    const availW = Math.max(1, width - 2 * PAD_X);
    const availH = Math.max(1, height - PAD_TOP - PAD_BOTTOM);
    const byWidth = availW / (2 * scale);
    const byHeight = (availH / scale - MAX_RELIEF * EXAGGERATION * Math.cos(p)) / (2 * Math.max(0.05, Math.sin(p)));
    return Math.min(byWidth, byHeight);
}

/**
 * Magnify by `factor` and turn by `turn` degrees, keeping `anchor` at the
 * screen point `at`: the wheel zooms toward the cursor, a pinch toward the
 * fingers.
 */
export function zoomView(
    view: View,
    width: number,
    height: number,
    factor: number,
    anchor: Anchor,
    at: Pt,
    turn = 0
): View {
    const scale = makeCamera(view, width, height).scale * factor;
    const radius = clamp(radiusForScale(view, width, height, scale), MIN_RADIUS, MAX_RADIUS);
    const next = { ...view, azimuth: view.azimuth + turn, radius };
    const off = offsetAt(makeCamera(next, width, height), at, anchor.z);
    return keepOnMap({ ...next, cx: anchor.e - off.e, cy: anchor.n - off.n });
}

const COMPASS_16 = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

export function facingName(azimuth: number): string {
    const a = ((azimuth % 360) + 360) % 360;
    return COMPASS_16[Math.round(a / 22.5) % 16];
}

// --- Labels ---

export type Box = { x0: number; y0: number; x1: number; y1: number };

export type LabelRequest = {
    id: string;
    /** The point the label belongs to (the summit). */
    ax: number;
    ay: number;
    /** Clearance above the anchor before the label may start (room for the flag). */
    lift: number;
    width: number;
    height: number;
};

export type LabelPlacement = {
    id: string;
    box: Box;
    /** Leader line from the anchor to the label, when the label sits away from it. */
    leader: { x1: number; y1: number; x2: number; y2: number } | null;
};

const GAP = 2;

function overlaps(a: Box, b: Box): boolean {
    return a.x0 < b.x1 + GAP && b.x0 < a.x1 + GAP && a.y0 < b.y1 + GAP && b.y0 < a.y1 + GAP;
}

function inside(box: Box, bounds: Box): boolean {
    return box.x0 >= bounds.x0 && box.x1 <= bounds.x1 && box.y0 >= bounds.y0 && box.y1 <= bounds.y1;
}

/**
 * Greedy placement in request order (put the most important first). Each label
 * tries a spot right above its anchor, then nudged and raised spots with a
 * leader line; a label with nowhere to go is left out rather than overlapped.
 */
export function layoutLabels(
    requests: LabelRequest[],
    obstacles: Array<Box & { id?: string }>,
    bounds: Box
): LabelPlacement[] {
    const placed: LabelPlacement[] = [];
    for (const req of requests) {
        const { ax, ay, width: w, height: h } = req;
        const base = ay - req.lift;
        const spots: Array<[number, number, boolean]> = [
            [ax - w / 2, base - h, false],
            [ax + 3, base - h + 3, false],
            [ax - w - 3, base - h + 3, false],
            [ax - w / 2, base - h - 14, true],
            [ax + 8, base - h - 12, true],
            [ax - w - 8, base - h - 12, true],
            [ax + 12, ay - h / 2, false],
            [ax - w - 12, ay - h / 2, false],
            [ax - w / 2, base - h - 28, true],
        ];
        for (const [x, y, leader] of spots) {
            const box = { x0: x, y0: y, x1: x + w, y1: y + h };
            if (!inside(box, bounds)) continue;
            if (placed.some((p) => overlaps(p.box, box))) continue;
            if (obstacles.some((o) => o.id !== req.id && overlaps(o, box))) continue;
            placed.push({
                id: req.id,
                box,
                leader: leader
                    ? { x1: ax, y1: base + 2, x2: clamp(ax, box.x0 + 2, box.x1 - 2), y2: box.y1 }
                    : null,
            });
            break;
        }
    }
    return placed;
}

/** Even-odd point-in-polygon. */
function contains(poly: Pt[], x: number, y: number): boolean {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i];
        const b = poly[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
}

// --- The scene ---

export type SceneMound = {
    id: string;
    outline: string;
    /** Open path along the top edge; the base is left unlined so peaks sit in the ground. */
    ridge: string;
    shade: string;
    fill: string;
    shadeFill: string;
    stroke: string;
    summit: Pt;
    bagged: boolean;
    selected: boolean;
    dim: boolean;
};

export type SceneLabel = {
    id: string;
    box: Box;
    name: string;
    elevation: string;
    leader: LabelPlacement["leader"];
    selected: boolean;
    dim: boolean;
};

export type SceneLandmark = {
    name: string;
    x: number;
    y: number;
    /** Where the label text starts (or ends, when `anchor` is "end"). */
    tx: number;
    anchor: "start" | "end";
};

export type Scene = {
    ground: { cx: number; cy: number; rx: number; ry: number };
    graticule: Array<{ x1: number; y1: number; x2: number; y2: number }>;
    graticuleLabels: Array<{ x: number; y: number; text: string }>;
    mounds: SceneMound[];
    labels: SceneLabel[];
    landmarks: SceneLandmark[];
    /** Peaks on screen without a label because there was no room. */
    unlabeled: number;
    scale: number;
};

export type SceneInput = {
    view: View;
    width: number;
    height: number;
    bagged: ReadonlySet<string>;
    focus: RangeId | null;
    selectedId: string | null;
};

/** Label metrics; the SVG pins its text to a monospace stack so these hold. */
export const LABEL_FONT = { name: 10, elevation: 9, landmark: 8.5, charWidth: 0.6, tracking: 0.6 };
const LABEL_HEIGHT = 23;
export const FLAG_HEIGHT = 12;
const HAZE = 0.5;
const DIM = 0.68;

function labelWidth(name: string, elevation: string): number {
    const f = LABEL_FONT;
    const nameW = name.length * (f.name * f.charWidth + f.tracking);
    const elevW = elevation.length * f.elevation * f.charWidth;
    return Math.ceil(Math.max(nameW, elevW)) + 4;
}

export function toPath(points: Pt[], closed = true): string {
    let d = "";
    for (let i = 0; i < points.length; i++) {
        d += `${i === 0 ? "M" : "L"}${Math.round(points[i].x * 10) / 10} ${Math.round(points[i].y * 10) / 10}`;
    }
    return closed ? `${d}Z` : d;
}

export function buildScene(input: SceneInput): Scene {
    const { view, width, height, bagged, focus, selectedId } = input;
    const cam = makeCamera(view, width, height);
    const s = cam.scale;
    const lift = cam.cosP * EXAGGERATION;
    const orientation: Orientation = { cosT: cam.cosT, sinT: cam.sinT, sinP: cam.sinP, lift };
    const onScreen = (p: Pt) => p.x > 4 && p.x < width - 4 && p.y > 4 && p.y < height - 4;

    // Ground, with a faint lat/lon graticule so the map reads as a map.
    const center = project(cam, 0, 0);
    const ground = {
        cx: center.x,
        cy: center.y,
        rx: GROUND_RADIUS * s,
        ry: Math.max(0.5, GROUND_RADIUS * cam.sinP * s),
    };
    const graticule: Scene["graticule"] = [];
    const graticuleLabels: Scene["graticuleLabels"] = [];
    for (let tenths = 438; tenths <= 447; tenths++) {
        const n = (tenths / 10 - ORIGIN_LAT) * KM_PER_DEG_LAT;
        if (Math.abs(n) >= GROUND_RADIUS) continue;
        const half = Math.sqrt(GROUND_RADIUS ** 2 - n ** 2);
        const a = project(cam, -half, n);
        const b = project(cam, half, n);
        graticule.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        const end = a.x < b.x ? a : b;
        if (tenths % 2 === 0 && onScreen(end) && end.x < width - 40) {
            graticuleLabels.push({ x: end.x, y: end.y, text: `${(tenths / 10).toFixed(1)}°N` });
        }
    }
    for (let tenths = 709; tenths <= 720; tenths++) {
        const e = (-tenths / 10 - ORIGIN_LON) * KM_PER_DEG_LON;
        if (Math.abs(e) >= GROUND_RADIUS) continue;
        const half = Math.sqrt(GROUND_RADIUS ** 2 - e ** 2);
        const a = project(cam, e, -half);
        const b = project(cam, e, half);
        graticule.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        const end = a.y > b.y ? a : b;
        if (tenths % 2 === 0 && onScreen(end) && end.x < width - 40) {
            graticuleLabels.push({ x: end.x, y: end.y, text: `${(tenths / 10).toFixed(1)}°W` });
        }
    }

    // Mounds, far to near.
    const near = -view.radius;
    const span = 2 * view.radius;
    const placed = allMounds()
        .map((m) => ({ m, base: project(cam, m.e, m.n) }))
        .filter(({ m, base }) => {
            const reach = m.maxRadius * s;
            const rise = m.relief * lift * s;
            return (
                base.x + reach > 0 &&
                base.x - reach < width &&
                base.y + reach > 0 &&
                base.y - rise - reach < height
            );
        })
        .sort((a, b) => b.base.depth - a.base.depth);

    const mounds: SceneMound[] = [];
    const outlines: Array<{ depth: number; points: Pt[] }> = [];
    for (const { m, base } of placed) {
        const shape = shapeOf(m, orientation);
        const toScreen = (p: Pt) => ({ x: base.x + p.x * s, y: base.y - p.y * s });
        const outline = shape.outline.map(toScreen);
        const isBagged = bagged.has(m.peak.id);
        const selected = m.peak.id === selectedId;
        const dim = focus !== null && m.peak.range !== focus;
        const fade = Math.min(1, (dim ? DIM : 0) + HAZE * clamp((base.depth - near) / span, 0, 1));
        const lit = isBagged ? BAGGED_LIT : TOGO_LIT;
        const shade = isBagged ? BAGGED_SHADE : TOGO_SHADE;
        const stroke = isBagged ? BAGGED_STROKE : TOGO_STROKE;
        outlines.push({ depth: base.depth, points: outline });
        mounds.push({
            id: m.peak.id,
            outline: toPath(outline),
            ridge: toPath(shape.ridge.map(toScreen), false),
            shade: toPath(shape.shade.map(toScreen)),
            fill: mix(lit, SKY, fade),
            shadeFill: mix(shade, SKY, fade),
            stroke: mix(stroke, SKY, selected ? 0 : fade * 0.85),
            summit: toScreen(shape.summit),
            bagged: isBagged,
            selected,
            dim,
        });
    }

    // Peak labels: the selected peak first, then the focused range, then by height.
    const byId = new Map(mounds.map((m) => [m.id, m]));
    const elevation = (id: string) => moundFor(id)?.peak.elevation ?? 0;
    const order = mounds
        .map((m) => m.id)
        .sort((a, b) => {
            const ma = byId.get(a)!;
            const mb = byId.get(b)!;
            if (ma.selected !== mb.selected) return ma.selected ? -1 : 1;
            if (ma.dim !== mb.dim) return ma.dim ? 1 : -1;
            return elevation(b) - elevation(a);
        });
    const texts = new Map(
        order.map((id) => {
            const peak = moundFor(id)!.peak;
            return [id, { name: peak.label.toUpperCase(), elevation: `${formatFeet(peak.elevation)}′` }];
        })
    );
    const requests: LabelRequest[] = order.map((id) => {
        const m = byId.get(id)!;
        const text = texts.get(id)!;
        return {
            id,
            ax: m.summit.x,
            ay: m.summit.y,
            lift: m.bagged ? FLAG_HEIGHT + 2 : 5,
            width: labelWidth(text.name, text.elevation),
            height: LABEL_HEIGHT,
        };
    });
    // Keep labels off other peaks' summit markers and flags.
    const markers = mounds.map((m) => ({
        id: m.id,
        x0: m.summit.x - 3,
        y0: m.summit.y - (m.bagged ? FLAG_HEIGHT : 3),
        x1: m.summit.x + (m.bagged ? 9 : 3),
        y1: m.summit.y + 3,
    }));
    const bounds = { x0: 2, y0: 2, x1: width - 2, y1: height - 2 };
    const placements = layoutLabels(requests, markers, bounds);
    const labels: SceneLabel[] = placements.map((p) => {
        const m = byId.get(p.id)!;
        return { id: p.id, box: p.box, leader: p.leader, ...texts.get(p.id)!, selected: m.selected, dim: m.dim };
    });

    // Landmarks: only where the ground is actually in view, and only where
    // their label fits around the peak labels.
    const taken: Box[] = [...labels.map((l) => l.box), ...markers];
    const landmarks: SceneLandmark[] = [];
    for (const l of LANDMARKS) {
        const { e, n } = toLocal(l.lat, l.lon);
        const p = project(cam, e, n);
        if (!onScreen(p)) continue;
        if (outlines.some((o) => o.depth < p.depth && contains(o.points, p.x, p.y))) continue;
        const w = l.name.length * LABEL_FONT.landmark * LABEL_FONT.charWidth;
        const options: Array<[Box, SceneLandmark]> = [
            [{ x0: p.x + 4, y0: p.y - 6, x1: p.x + 4 + w, y1: p.y + 4 }, { ...l, x: p.x, y: p.y, tx: p.x + 4, anchor: "start" }],
            [{ x0: p.x - 4 - w, y0: p.y - 6, x1: p.x - 4, y1: p.y + 4 }, { ...l, x: p.x, y: p.y, tx: p.x - 4, anchor: "end" }],
        ];
        const fit = options.find(([box]) => inside(box, bounds) && !taken.some((t) => overlaps(t, box)));
        if (!fit) continue;
        taken.push(fit[0]);
        landmarks.push({ name: l.name, x: p.x, y: p.y, tx: fit[1].tx, anchor: fit[1].anchor });
    }

    return {
        ground,
        graticule,
        graticuleLabels,
        mounds,
        labels,
        landmarks,
        unlabeled: mounds.length - labels.length,
        scale: s,
    };
}
