// Everything the views show is derived from the raw ascent list here.

import type { Ascent, PeakLog } from "./log";
import { PEAKS, RANGES, type Peak, type Range } from "./peaks";

export type PeakStatus = {
    peak: Peak;
    /** Oldest first. */
    ascents: Ascent[];
    first: Ascent | null;
    latest: Ascent | null;
    bagged: boolean;
    /** Months (0 = January) with at least one ascent, in any year. */
    months: boolean[];
    /** Climbed at least once in calendar winter. */
    winter: boolean;
};

/**
 * Calendar winter, solstice to equinox, which is what the AMC's winter list
 * counts. A dated log can't see the exact minute, so the boundary days count:
 * December 21 through March 20.
 */
export function isWinterDate(iso: string): boolean {
    const month = Number(iso.slice(5, 7));
    const day = Number(iso.slice(8, 10));
    return month === 1 || month === 2 || (month === 12 && day >= 21) || (month === 3 && day <= 20);
}

export function statusByPeak(log: PeakLog): Map<string, PeakStatus> {
    const grouped = new Map<string, Ascent[]>(PEAKS.map((p) => [p.id, []]));
    for (const ascent of log.ascents) grouped.get(ascent.peakId)?.push(ascent);
    const result = new Map<string, PeakStatus>();
    for (const peak of PEAKS) {
        const ascents = grouped.get(peak.id) ?? [];
        const months = Array.from({ length: 12 }, () => false);
        for (const a of ascents) months[Number(a.date.slice(5, 7)) - 1] = true;
        result.set(peak.id, {
            peak,
            ascents,
            first: ascents[0] ?? null,
            latest: ascents[ascents.length - 1] ?? null,
            bagged: ascents.length > 0,
            months,
            winter: ascents.some((a) => isWinterDate(a.date)),
        });
    }
    return result;
}

export type TimelinePoint = {
    date: string;
    /** Peaks bagged so far, including this date's. */
    count: number;
    /** Peaks bagged for the first time on this date. */
    peaks: Peak[];
};

export type RangeProgress = {
    range: Range;
    peaks: PeakStatus[];
    bagged: number;
};

export type Summary = {
    bagged: number;
    total: number;
    /** Sum of the summit elevations of every peak bagged so far. */
    summitFeet: number;
    ascents: number;
    winterPeaks: number;
    /** Peak-months covered, out of 48 x 12 = 576. */
    gridCells: number;
    firstDate: string | null;
    latestDate: string | null;
    /** The day the 48th peak fell, once it has. */
    finishedOn: string | null;
    timeline: TimelinePoint[];
    /** Ascents per calendar month, all years together. */
    byMonth: number[];
    byRange: RangeProgress[];
    /** Tallest peak still to climb. */
    highestRemaining: Peak | null;
};

export function summarize(status: Map<string, PeakStatus>): Summary {
    const all = PEAKS.map((p) => status.get(p.id)!);
    const bagged = all.filter((s) => s.bagged);
    const ascents = all.flatMap((s) => s.ascents);

    const firsts = new Map<string, Peak[]>();
    for (const s of bagged) {
        const date = s.first!.date;
        firsts.set(date, [...(firsts.get(date) ?? []), s.peak]);
    }
    let running = 0;
    const timeline = [...firsts.keys()].sort().map((date) => {
        const peaks = firsts.get(date)!;
        running += peaks.length;
        return { date, count: running, peaks };
    });

    const byMonth = Array.from({ length: 12 }, () => 0);
    for (const a of ascents) byMonth[Number(a.date.slice(5, 7)) - 1] += 1;

    const dates = ascents.map((a) => a.date).sort();
    const remaining = all.filter((s) => !s.bagged).map((s) => s.peak);

    return {
        bagged: bagged.length,
        total: PEAKS.length,
        summitFeet: bagged.reduce((sum, s) => sum + s.peak.elevation, 0),
        ascents: ascents.length,
        winterPeaks: all.filter((s) => s.winter).length,
        gridCells: all.reduce((sum, s) => sum + s.months.filter(Boolean).length, 0),
        firstDate: dates[0] ?? null,
        latestDate: dates[dates.length - 1] ?? null,
        finishedOn: bagged.length === PEAKS.length ? timeline[timeline.length - 1].date : null,
        timeline,
        byMonth,
        byRange: RANGES.map((range) => {
            const peaks = all.filter((s) => s.peak.range === range.id);
            return { range, peaks, bagged: peaks.filter((s) => s.bagged).length };
        }),
        highestRemaining: remaining.reduce<Peak | null>(
            (best, p) => (!best || p.elevation > best.elevation ? p : best),
            null
        ),
    };
}

// --- Export ---

function csvCell(value: string): string {
    // Spreadsheets run cells that start with these as formulas.
    const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One row per peak, in list order: handy for filling in the AMC application. */
export function toCsv(status: Map<string, PeakStatus>): string {
    const rows = [["Peak", "Elevation (ft)", "Range", "First ascent", "Ascents", "All dates", "Notes"]];
    for (const peak of PEAKS) {
        const s = status.get(peak.id)!;
        rows.push([
            peak.name,
            String(peak.elevation),
            RANGES.find((r) => r.id === peak.range)!.name,
            s.first?.date ?? "",
            String(s.ascents.length),
            s.ascents.map((a) => a.date).join(" "),
            s.ascents
                .map((a) => a.notes)
                .filter(Boolean)
                .join(" | "),
        ]);
    }
    return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
