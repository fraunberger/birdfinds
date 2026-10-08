// Layout for the progress charts, kept as plain data like the range scene.

import { PEAKS } from "./peaks";
import { profileShape, toPath, type Pt } from "./scene";
import type { TimelinePoint } from "./stats";

export type Margin = { top: number; right: number; bottom: number; left: number };

const DAY_MS = 86_400_000;

// --- The 48 by height ---

/** The skyline starts at the notches, roughly where every climb begins. */
export const SKYLINE_FLOOR_FT = 2000;
const SKYLINE_CEILING_FT = 6500;
export const SKYLINE_MIN_WIDTH = 640;

export type SkylineMountain = {
    id: string;
    label: string;
    outline: string;
    ridge: string;
    shade: string;
    summit: Pt;
    /** Center of the mountain's slot, where its name hangs. */
    x: number;
};

export type Skyline = {
    width: number;
    height: number;
    margin: Margin;
    baseline: number;
    gridlines: Array<{ y: number; feet: number }>;
    mountains: SkylineMountain[];
};

/** All 48 side by side, tallest first, each overlapping the one before it. */
export function skylineLayout(width: number): Skyline {
    const w = Math.max(width, SKYLINE_MIN_WIDTH);
    const height = 240;
    const margin = { top: 18, right: 10, bottom: 78, left: 44 };
    const plotW = w - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const y = (feet: number) =>
        margin.top + plotH * (1 - (feet - SKYLINE_FLOOR_FT) / (SKYLINE_CEILING_FT - SKYLINE_FLOOR_FT));
    const baseline = y(SKYLINE_FLOOR_FT);
    // Each mountain is wider than its slot so neighbors overlap; inset the
    // first and last so their flanks stay inside the plot.
    const spread = (plotW / PEAKS.length) * 3.2;
    const step = (plotW - spread) / (PEAKS.length - 1);

    const mountains = PEAKS.map((peak, i) => {
        const shape = profileShape(peak.id);
        const xs = shape.outline.map((p) => p.x);
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        const cx = margin.left + spread / 2 + step * i;
        const rise = baseline - y(peak.elevation);
        const place = (p: Pt) => ({
            x: cx + ((p.x - (lo + hi) / 2) / (hi - lo)) * spread,
            y: baseline - p.y * rise,
        });
        return {
            id: peak.id,
            label: peak.label,
            outline: toPath(shape.outline.map(place)),
            ridge: toPath(shape.ridge.map(place), false),
            shade: toPath(shape.shade.map(place)),
            summit: place(shape.summit),
            x: cx,
        };
    });

    return {
        width: w,
        height,
        margin,
        baseline,
        gridlines: [3000, 4000, 5000, 6000].map((feet) => ({ y: y(feet), feet })),
        mountains,
    };
}

// --- Peaks over time ---

export function dayNumber(iso: string): number {
    return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Month or year ticks between two day numbers, at most `max` of them. */
export function timeTicks(start: number, end: number, max: number): Array<{ day: number; label: string }> {
    const from = new Date(start * DAY_MS);
    const to = new Date(end * DAY_MS);
    const months =
        (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
    if (months > 36) {
        const years: Array<{ day: number; label: string }> = [];
        const step = Math.max(1, Math.ceil(months / 12 / Math.max(1, max)));
        for (let year = from.getUTCFullYear() + 1; year <= to.getUTCFullYear(); year += step) {
            years.push({ day: Date.UTC(year, 0, 1) / DAY_MS, label: String(year) });
        }
        return years;
    }
    const step = [1, 2, 3, 6, 12].find((s) => months / s <= Math.max(1, max)) ?? 12;
    const ticks: Array<{ day: number; label: string }> = [];
    let year = from.getUTCFullYear();
    let month = from.getUTCMonth() + 1;
    if (month > 11) {
        month = 0;
        year += 1;
    }
    while (month % step !== 0) {
        month += 1;
        if (month > 11) {
            month = 0;
            year += 1;
        }
    }
    for (;;) {
        const day = Date.UTC(year, month, 1) / DAY_MS;
        if (day > end) break;
        // Januaries, and the first tick, carry the year.
        const label =
            month === 0 || ticks.length === 0 ? `${MONTH_SHORT[month]} '${String(year).slice(2)}` : MONTH_SHORT[month];
        ticks.push({ day, label });
        month += step;
        if (month > 11) {
            month -= 12;
            year += 1;
        }
    }
    return ticks;
}

export type TimelineChart = {
    width: number;
    height: number;
    margin: Margin;
    line: string;
    area: string;
    points: Array<{ x: number; y: number; point: TimelinePoint }>;
    gridlines: Array<{ y: number; count: number }>;
    ticks: Array<{ x: number; label: string }>;
    xEnd: number;
};

/** A step line of peaks bagged so far, from the first summit to today. */
export function timelineLayout(timeline: TimelinePoint[], today: string, width: number): TimelineChart | null {
    if (timeline.length === 0) return null;
    const height = 220;
    const margin = { top: 14, right: 18, bottom: 28, left: 34 };
    const plotW = Math.max(1, width - margin.left - margin.right);
    const plotH = height - margin.top - margin.bottom;
    const start = dayNumber(timeline[0].date);
    const last = dayNumber(timeline[timeline.length - 1].date);
    const end = Math.max(last, today ? dayNumber(today) : last, start + 30);
    const x = (day: number) => margin.left + ((day - start) / (end - start)) * plotW;
    const y = (count: number) => margin.top + plotH * (1 - count / PEAKS.length);

    const points = timeline.map((point) => ({ x: x(dayNumber(point.date)), y: y(point.count), point }));
    let line = `M${x(start)} ${y(0)}`;
    for (const p of points) line += `H${p.x}V${p.y}`;
    line += `H${x(end)}`;

    return {
        width,
        height,
        margin,
        line,
        area: `${line}V${y(0)}H${x(start)}Z`,
        points,
        gridlines: [0, 12, 24, 36, 48].map((count) => ({ y: y(count), count })),
        ticks: timeTicks(start, end, Math.floor(plotW / 64)).map((t) => ({ x: x(t.day), label: t.label })),
        xEnd: x(end),
    };
}

// --- Ascents by month ---

export type MonthChart = {
    width: number;
    height: number;
    margin: Margin;
    bars: Array<{ month: number; count: number; x: number; y: number; w: number; h: number; path: string }>;
    gridlines: Array<{ y: number; value: number }>;
    /** Index of the busiest month (the one bar that gets a value label). */
    peak: number;
};

/** A round axis top and tick step: at most five whole-number intervals. */
export function niceScale(n: number): { max: number; step: number } {
    if (n <= 4) return { max: 4, step: 1 };
    for (const step of [2, 5, 10, 20, 25, 50, 100, 250, 500]) {
        const intervals = Math.ceil(n / step);
        if (intervals <= 5) return { max: intervals * step, step };
    }
    return { max: Math.ceil(n / 1000) * 1000, step: 1000 };
}

/** Column with a 4px rounded top and a square foot on the baseline. */
function column(x: number, y: number, w: number, h: number): string {
    if (h <= 0) return "";
    const r = Math.min(4, w / 2, h);
    return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
}

export function monthLayout(byMonth: number[], width: number): MonthChart {
    const height = 180;
    const margin = { top: 18, right: 8, bottom: 24, left: 30 };
    const plotW = Math.max(1, width - margin.left - margin.right);
    const plotH = height - margin.top - margin.bottom;
    const { max: top, step } = niceScale(Math.max(...byMonth));
    const band = plotW / 12;
    const barW = Math.min(24, band * 0.6);
    const y = (v: number) => margin.top + plotH * (1 - v / top);
    const bars = byMonth.map((count, month) => {
        const bx = margin.left + band * month + (band - barW) / 2;
        const by = y(count);
        return { month, count, x: bx, y: by, w: barW, h: y(0) - by, path: column(bx, by, barW, y(0) - by) };
    });
    return {
        width,
        height,
        margin,
        bars,
        gridlines: Array.from({ length: top / step + 1 }, (_, i) => ({ y: y(i * step), value: i * step })),
        peak: byMonth.indexOf(Math.max(...byMonth)),
    };
}
