"use client";

import React, { useMemo, useRef, useState } from "react";
import { Download, Snowflake, Upload } from "lucide-react";
import { PEAKS, formatFeet, type Peak } from "./peaks";
import { formatDate, getLog, logActions, monthName, parseLog, todayISO } from "./log";
import { toCsv, type PeakStatus, type Summary } from "./stats";
import { FLAG_HEIGHT } from "./scene";
import {
    SKYLINE_FLOOR_FT,
    SKYLINE_MIN_WIDTH,
    monthLayout,
    skylineLayout,
    timelineLayout,
} from "./charts";
import { useElementWidth, useSyncState } from "./hooks";
import * as C from "./palette";

type Props = {
    status: Map<string, PeakStatus>;
    summary: Summary;
    today: string;
    onSelect: (id: string) => void;
};

const EVEREST_FT = 29032;

export function Progress({ status, summary, today, onSelect }: Props) {
    const repeats = summary.ascents - summary.bagged;
    return (
        <div>
            <Hero status={status} summary={summary} />

            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Tile
                    label="Summit feet"
                    value={`${formatFeet(summary.summitFeet)} ft`}
                    note={
                        summary.summitFeet > 0
                            ? `${(summary.summitFeet / EVEREST_FT).toFixed(1)} Everests, stacked`
                            : "Every summit you bag adds its height"
                    }
                />
                <Tile
                    label="Ascents logged"
                    value={summary.ascents}
                    note={repeats > 0 ? `Including ${repeats} repeat${repeats === 1 ? "" : "s"}` : "Repeats count here"}
                />
                <Tile label="Winter peaks" value={`${summary.winterPeaks} / 48`} note="Climbed Dec 21 to Mar 20" />
                <Tile label="The Grid" value={`${summary.gridCells} / 576`} note="Every peak in every month" />
                <Tile label="First summit" value={summary.firstDate ? formatDate(summary.firstDate) : "—"} />
                <Tile
                    label={summary.finishedOn ? "Finished the 48" : "Latest summit"}
                    value={
                        summary.finishedOn
                            ? formatDate(summary.finishedOn)
                            : summary.latestDate
                              ? formatDate(summary.latestDate)
                              : "—"
                    }
                />
            </div>

            <Section title="The 48 by height" aside={`From the notches (${formatFeet(SKYLINE_FLOOR_FT)} ft) up`}>
                <SkylineChart status={status} onSelect={onSelect} />
            </Section>

            <Section title="By range">
                <RangeBars summary={summary} onSelect={onSelect} />
            </Section>

            <Section title="Peaks over time" aside={summary.finishedOn ? `All 48 by ${formatDate(summary.finishedOn)}` : undefined}>
                <TimelineChart summary={summary} today={today} />
            </Section>

            <Section title="Ascents by month">
                {summary.ascents > 0 ? (
                    <MonthChart byMonth={summary.byMonth} />
                ) : (
                    <Empty>Log a climb to see which months you hike.</Empty>
                )}
            </Section>

            <Section title="The Grid" aside={`${summary.gridCells} of 576 peak-months`}>
                <Grid status={status} onSelect={onSelect} />
            </Section>

            <Section title="Your data">
                <DataTools status={status} />
            </Section>
        </div>
    );
}

// --- Layout pieces ---

function Section({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
    return (
        <section className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-black pb-1.5">
                <h2 className="text-xs font-bold uppercase tracking-widest">{title}</h2>
                {aside && <span className="text-[11px] text-neutral-500">{aside}</span>}
            </div>
            <div className="mt-3">{children}</div>
        </section>
    );
}

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
    return (
        <div className="border border-neutral-200 p-3">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</p>
            <p className="mt-1 text-lg font-bold leading-tight">{value}</p>
            {note && <p className="mt-1 text-[11px] text-neutral-500">{note}</p>}
        </div>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="py-8 text-center text-xs uppercase tracking-widest text-neutral-500">{children}</p>;
}

/** The headline: how many, and one block per peak, filled in the order they fell. */
function Hero({ status, summary }: { status: Map<string, PeakStatus>; summary: Summary }) {
    const blocks = PEAKS.map((p) => status.get(p.id)!).sort((a, b) => {
        if (a.first && b.first) return a.first.date.localeCompare(b.first.date);
        if (a.first || b.first) return a.first ? -1 : 1;
        return b.peak.elevation - a.peak.elevation;
    });
    const pct = Math.round((summary.bagged / summary.total) * 100);
    return (
        <div>
            <div className="flex flex-wrap items-end justify-between gap-2">
                <p className="text-5xl font-bold leading-none">
                    {summary.bagged}
                    <span className="text-2xl text-neutral-500"> of {summary.total}</span>
                </p>
                <p className="text-xs text-neutral-500">
                    {summary.finishedOn
                        ? "Every one of them."
                        : `${summary.total - summary.bagged} to go · ${pct}%${
                              summary.highestRemaining
                                  ? ` · tallest left: ${summary.highestRemaining.name} (${formatFeet(summary.highestRemaining.elevation)} ft)`
                                  : ""
                          }`}
                </p>
            </div>
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={summary.total}
                aria-valuenow={summary.bagged}
                aria-label="Peaks bagged"
                className="mt-3 flex h-4 gap-[2px]"
            >
                {blocks.map((s) => (
                    <span
                        key={s.peak.id}
                        title={s.first ? `${s.peak.name}, ${formatDate(s.first.date)}` : `${s.peak.name}: to go`}
                        className="h-full flex-1 first:rounded-l last:rounded-r"
                        style={{ background: s.bagged ? C.BAGGED : C.BAGGED_TRACK }}
                    />
                ))}
            </div>
        </div>
    );
}

// --- Charts ---

function ChartTooltip({
    x,
    y,
    lines,
    width,
}: {
    x: number;
    y: number;
    lines: [string, ...string[]];
    width: number;
}) {
    const boxW = Math.max(...lines.map((l, i) => l.length * (i === 0 ? 6.6 : 6))) + 16;
    const boxH = 12 + lines.length * 13;
    const left = Math.min(Math.max(2, x - boxW / 2), width - boxW - 2);
    const top = y - boxH - 10 < 2 ? y + 12 : y - boxH - 10;
    return (
        <g pointerEvents="none">
            <rect x={left} y={top} width={boxW} height={boxH} fill="#fff" stroke={C.INK} />
            {lines.map((line, i) => (
                <text
                    key={i}
                    x={left + 8}
                    y={top + 16 + i * 13}
                    fontSize={i === 0 ? 11 : 10}
                    fontWeight={i === 0 ? 700 : 400}
                    fill={i === 0 ? C.INK : C.INK_SOFT}
                >
                    {line}
                </text>
            ))}
        </g>
    );
}

function SkylineChart({ status, onSelect }: { status: Map<string, PeakStatus>; onSelect: (id: string) => void }) {
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const [hover, setHover] = useState<string | null>(null);
    const sky = useMemo(() => skylineLayout(width ?? SKYLINE_MIN_WIDTH), [width]);
    const hovered = hover ? sky.mountains.find((m) => m.id === hover) : undefined;
    const hoveredStatus = hovered ? status.get(hovered.id) : undefined;
    const { margin } = sky;

    return (
        <div ref={ref} className="overflow-x-auto">
            <svg
                width={sky.width}
                height={sky.height}
                className="block"
                style={{ fontFamily: C.MONO_STACK }}
                role="img"
                aria-label="All 48 peaks side by side, tallest first; bagged peaks are green with a flag."
                onPointerLeave={() => setHover(null)}
            >
                {sky.gridlines.map((g) => (
                    <g key={g.feet}>
                        <line
                            x1={margin.left}
                            x2={sky.width - margin.right}
                            y1={g.y}
                            y2={g.y}
                            stroke={g.feet === 4000 ? C.AXIS : C.GRID}
                        />
                        <text x={margin.left - 6} y={g.y + 3} textAnchor="end" fontSize={9} fill={C.MUTED}>
                            {formatFeet(g.feet)}
                        </text>
                    </g>
                ))}
                <line
                    x1={margin.left}
                    x2={sky.width - margin.right}
                    y1={sky.baseline}
                    y2={sky.baseline}
                    stroke={C.AXIS}
                />

                {sky.mountains.map((m) => {
                    const bagged = status.get(m.id)?.bagged ?? false;
                    return (
                        <g
                            key={m.id}
                            className="cursor-pointer"
                            onPointerEnter={() => setHover(m.id)}
                            onClick={() => onSelect(m.id)}
                        >
                            <path d={m.outline} fill={bagged ? C.BAGGED_LIT : C.TOGO_LIT} />
                            <path d={m.shade} fill={bagged ? C.BAGGED_SHADE : C.TOGO_SHADE} />
                            <path
                                d={m.ridge}
                                fill="none"
                                stroke={bagged ? C.BAGGED_STROKE : hover === m.id ? C.INK : C.MUTED}
                                strokeWidth={hover === m.id ? 2 : 1}
                                strokeLinejoin="round"
                            />
                            {bagged && (
                                <>
                                    <line
                                        x1={m.summit.x}
                                        y1={m.summit.y}
                                        x2={m.summit.x}
                                        y2={m.summit.y - FLAG_HEIGHT + 2}
                                        stroke={C.INK}
                                    />
                                    <path
                                        d={`M${m.summit.x} ${m.summit.y - FLAG_HEIGHT + 2}l6 2l-6 2z`}
                                        fill={C.FLAG}
                                    />
                                </>
                            )}
                        </g>
                    );
                })}

                {sky.mountains.map((m) => (
                    <text
                        key={m.id}
                        transform={`translate(${m.x} ${sky.baseline + 9}) rotate(-55)`}
                        textAnchor="end"
                        fontSize={9}
                        fontWeight={status.get(m.id)?.bagged || hover === m.id ? 700 : 400}
                        fill={status.get(m.id)?.bagged ? C.INK : C.INK_SOFT}
                    >
                        {m.label}
                    </text>
                ))}

                {hovered && hoveredStatus && (
                    <ChartTooltip
                        x={hovered.summit.x}
                        y={hovered.summit.y - FLAG_HEIGHT}
                        width={sky.width}
                        lines={[
                            `${hoveredStatus.peak.name} · ${formatFeet(hoveredStatus.peak.elevation)} ft`,
                            hoveredStatus.first ? `Bagged ${formatDate(hoveredStatus.first.date)}` : "To go",
                        ]}
                    />
                )}
            </svg>
        </div>
    );
}

function RangeBars({ summary, onSelect }: { summary: Summary; onSelect: (id: string) => void }) {
    const most = Math.max(...summary.byRange.map((r) => r.peaks.length));
    return (
        <ul className="space-y-2.5">
            {summary.byRange.map(({ range, peaks, bagged }) => (
                <li key={range.id} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-xs sm:grid-cols-[13rem_1fr_2.5rem]">
                    <span className="truncate" title={range.name}>
                        <span className="sm:hidden">{range.short}</span>
                        <span className="hidden sm:inline">{range.name}</span>
                    </span>
                    {/* One block per peak, so longer bars are bigger ranges. */}
                    <span className="flex h-3.5 gap-[2px]" style={{ width: `${(peaks.length / most) * 100}%` }}>
                        {peaks.map((s) => (
                            <button
                                key={s.peak.id}
                                type="button"
                                onClick={() => onSelect(s.peak.id)}
                                title={`${s.peak.name}${s.first ? `, bagged ${formatDate(s.first.date)}` : ": to go"}`}
                                aria-label={`${s.peak.name}: ${s.bagged ? "bagged" : "to go"}`}
                                className="h-full flex-1 first:rounded-l last:rounded-r hover:opacity-70"
                                style={{ background: s.bagged ? C.BAGGED : C.BAGGED_TRACK }}
                            />
                        ))}
                    </span>
                    <span className="text-right tabular-nums">
                        {bagged}/{peaks.length}
                    </span>
                </li>
            ))}
        </ul>
    );
}

function TimelineChart({ summary, today }: { summary: Summary; today: string }) {
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const chart = useMemo(
        () => (width ? timelineLayout(summary.timeline, today, width) : null),
        [summary.timeline, today, width]
    );

    const onMove = (e: React.PointerEvent<SVGRectElement>) => {
        if (!chart) return;
        const box = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - box.left + chart.margin.left;
        let best = 0;
        chart.points.forEach((p, i) => {
            if (Math.abs(p.x - x) < Math.abs(chart.points[best].x - x)) best = i;
        });
        setHover(best);
    };

    if (summary.timeline.length === 0) {
        return (
            <div ref={ref}>
                <Empty>Your first summit starts the line.</Empty>
            </div>
        );
    }

    const active = chart && hover !== null ? chart.points[hover] : null;
    return (
        <div ref={ref}>
            {chart && (
                <svg
                    width={chart.width}
                    height={chart.height}
                    className="block"
                    style={{ fontFamily: C.MONO_STACK }}
                    role="img"
                    aria-label={`Peaks bagged over time: ${summary.bagged} so far.`}
                >
                    {chart.gridlines.map((g) => (
                        <g key={g.count}>
                            <line
                                x1={chart.margin.left}
                                x2={chart.width - chart.margin.right}
                                y1={g.y}
                                y2={g.y}
                                stroke={g.count === 0 ? C.AXIS : C.GRID}
                            />
                            <text x={chart.margin.left - 6} y={g.y + 3} textAnchor="end" fontSize={9} fill={C.MUTED}>
                                {g.count}
                            </text>
                        </g>
                    ))}
                    {chart.ticks.map((t) => (
                        <text
                            key={t.x}
                            x={t.x}
                            y={chart.height - chart.margin.bottom + 16}
                            textAnchor="middle"
                            fontSize={9}
                            fill={C.MUTED}
                        >
                            {t.label}
                        </text>
                    ))}

                    <path d={chart.area} fill={C.BAGGED} fillOpacity={0.1} />
                    <path d={chart.line} fill="none" stroke={C.BAGGED} strokeWidth={2} strokeLinejoin="round" />
                    {chart.points.map((p) => (
                        <circle key={p.point.date} cx={p.x} cy={p.y} r={4} fill={C.BAGGED} stroke="#fff" strokeWidth={2} />
                    ))}
                    {/* Direct label on the end of the line. */}
                    <text
                        x={chart.points[chart.points.length - 1].x + 8}
                        y={chart.points[chart.points.length - 1].y - 8}
                        fontSize={10}
                        fontWeight={700}
                        fill={C.INK}
                    >
                        {summary.bagged}
                    </text>

                    {active && (
                        <>
                            <line
                                x1={active.x}
                                x2={active.x}
                                y1={chart.margin.top}
                                y2={chart.height - chart.margin.bottom}
                                stroke={C.INK}
                                strokeWidth={1}
                                pointerEvents="none"
                            />
                            <ChartTooltip
                                x={active.x}
                                y={active.y}
                                width={chart.width}
                                lines={[
                                    `${active.point.count} of 48 · ${formatDate(active.point.date)}`,
                                    ...wrap(active.point.peaks.map((p) => p.name).join(", "), 36),
                                ]}
                            />
                        </>
                    )}
                    <rect
                        x={chart.margin.left}
                        y={chart.margin.top}
                        width={Math.max(0, chart.width - chart.margin.left - chart.margin.right)}
                        height={chart.height - chart.margin.top - chart.margin.bottom}
                        fill="transparent"
                        onPointerMove={onMove}
                        onPointerLeave={() => setHover(null)}
                    />
                </svg>
            )}
        </div>
    );
}

/** Break text into lines of at most `max` characters, at commas. */
function wrap(text: string, max: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const part of text.split(", ")) {
        const next = line ? `${line}, ${part}` : part;
        if (next.length > max && line) {
            lines.push(`${line},`);
            line = part;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function MonthChart({ byMonth }: { byMonth: number[] }) {
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const chart = useMemo(() => (width ? monthLayout(byMonth, width) : null), [byMonth, width]);
    const active = chart && hover !== null ? chart.bars[hover] : null;
    return (
        <div ref={ref}>
            {chart && (
                <svg
                    width={chart.width}
                    height={chart.height}
                    className="block"
                    style={{ fontFamily: C.MONO_STACK }}
                    role="img"
                    aria-label={`Ascents by month: ${byMonth.map((n, i) => `${monthName(i)} ${n}`).join(", ")}.`}
                    onPointerLeave={() => setHover(null)}
                >
                    {chart.gridlines.map((g) => (
                        <g key={g.value}>
                            <line
                                x1={chart.margin.left}
                                x2={chart.width - chart.margin.right}
                                y1={g.y}
                                y2={g.y}
                                stroke={g.value === 0 ? C.AXIS : C.GRID}
                            />
                            <text x={chart.margin.left - 6} y={g.y + 3} textAnchor="end" fontSize={9} fill={C.MUTED}>
                                {g.value}
                            </text>
                        </g>
                    ))}
                    {chart.bars.map((b) => {
                        const band = (chart.width - chart.margin.left - chart.margin.right) / 12;
                        const bandX = chart.margin.left + band * b.month;
                        return (
                            <g key={b.month} onPointerEnter={() => setHover(b.month)}>
                                {/* The whole column band is the hover target, not just the bar. */}
                                <rect
                                    x={bandX}
                                    y={chart.margin.top}
                                    width={band}
                                    height={chart.height - chart.margin.top - chart.margin.bottom}
                                    fill={hover === b.month ? C.GRID : "transparent"}
                                    fillOpacity={0.5}
                                />
                                {b.path && <path d={b.path} fill={C.BAGGED} />}
                                <text
                                    x={bandX + band / 2}
                                    y={chart.height - chart.margin.bottom + 14}
                                    textAnchor="middle"
                                    fontSize={9}
                                    fill={C.MUTED}
                                >
                                    {monthName(b.month).slice(0, band < 26 ? 1 : 3)}
                                </text>
                            </g>
                        );
                    })}
                    {chart.bars[chart.peak].count > 0 && (
                        <text
                            x={chart.bars[chart.peak].x + chart.bars[chart.peak].w / 2}
                            y={chart.bars[chart.peak].y - 5}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={700}
                            fill={C.INK}
                        >
                            {chart.bars[chart.peak].count}
                        </text>
                    )}
                    {active && (
                        <ChartTooltip
                            x={active.x + active.w / 2}
                            y={active.y}
                            width={chart.width}
                            lines={[`${active.count} ascent${active.count === 1 ? "" : "s"}`, monthName(active.month)]}
                        />
                    )}
                </svg>
            )}
        </div>
    );
}

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Every peak in every month: the 576-cell list some people chase for years. */
function Grid({ status, onSelect }: { status: Map<string, PeakStatus>; onSelect: (id: string) => void }) {
    const half = Math.ceil(PEAKS.length / 2);
    return (
        <div className="grid gap-x-12 gap-y-1 md:grid-cols-2">
            <GridTable peaks={PEAKS.slice(0, half)} status={status} onSelect={onSelect} />
            <GridTable peaks={PEAKS.slice(half)} status={status} onSelect={onSelect} />
        </div>
    );
}

function GridTable({
    peaks,
    status,
    onSelect,
}: {
    peaks: readonly Peak[];
    status: Map<string, PeakStatus>;
    onSelect: (id: string) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="border-collapse text-[11px]">
                <thead>
                    <tr>
                        <th scope="col" className="pr-2 text-left font-normal text-neutral-500">
                            Peak
                        </th>
                        {MONTH_INITIALS.map((initial, i) => (
                            <th key={i} scope="col" title={monthName(i)} className="w-[17px] font-normal text-neutral-500">
                                <span aria-hidden="true">{initial}</span>
                                <span className="sr-only">{monthName(i)}</span>
                            </th>
                        ))}
                        <th scope="col" title="Calendar winter, Dec 21 to Mar 20" className="w-[22px] pl-1 font-normal text-neutral-500">
                            <Snowflake size={11} className="mx-auto" aria-hidden="true" />
                            <span className="sr-only">Winter</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {peaks.map((peak) => {
                        const s = status.get(peak.id)!;
                        return (
                            <tr key={peak.id}>
                                <th scope="row" className="pr-2 text-left font-normal">
                                    <button
                                        type="button"
                                        onClick={() => onSelect(peak.id)}
                                        className={`whitespace-nowrap hover:underline ${s.bagged ? "" : "text-neutral-500"}`}
                                    >
                                        {peak.name}
                                    </button>
                                </th>
                                {s.months.map((climbed, i) => (
                                    <td key={i} className="p-[2px]">
                                        <span
                                            className="block size-[13px] rounded-[2px]"
                                            style={{ background: climbed ? C.BAGGED : C.BAGGED_TRACK }}
                                            title={`${peak.name}, ${monthName(i)}: ${climbed ? "climbed" : "not yet"}`}
                                        />
                                        <span className="sr-only">{climbed ? "climbed" : "not yet"}</span>
                                    </td>
                                ))}
                                <td className="p-[2px] pl-1">
                                    <span
                                        className="mx-auto block size-[13px] rounded-full"
                                        style={{ background: s.winter ? C.BAGGED : C.BAGGED_TRACK }}
                                        title={`${peak.name} in winter: ${s.winter ? "climbed" : "not yet"}`}
                                    />
                                    <span className="sr-only">{s.winter ? "climbed in winter" : "not yet in winter"}</span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// --- Backup and restore ---

function download(filename: string, text: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DataTools({ status }: { status: Map<string, PeakStatus> }) {
    const [message, setMessage] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const sync = useSyncState();
    const onAccount = sync === "account" || sync === "save-error";

    const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        try {
            const incoming = parseLog(JSON.parse(await file.text()));
            if (incoming.ascents.length === 0) {
                setMessage("No ascents found in that file.");
                return;
            }
            const added = logActions.merge(incoming);
            setMessage(
                added === 0
                    ? "Everything in that file is already in your log."
                    : `Added ${added} ascent${added === 1 ? "" : "s"}.`
            );
        } catch {
            setMessage("That file isn't a log backup.");
        }
    };

    const button =
        "flex items-center gap-2 border border-black px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-black hover:text-white";

    return (
        <div>
            <p className="text-xs text-neutral-500">
                {onAccount
                    ? "Your log is saved to your account. "
                    : "Your log is saved in this browser only. Download a backup now and then; "}
                {onAccount ? "The" : "the"} spreadsheet lists every peak with its dates, ready for the AMC
                application.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    className={button}
                    onClick={() =>
                        download(`nh48-log-${todayISO()}.json`, JSON.stringify(getLog(), null, 2), "application/json")
                    }
                >
                    <Download size={14} /> Backup
                </button>
                <button
                    type="button"
                    className={button}
                    onClick={() => download(`nh48-log-${todayISO()}.csv`, toCsv(status), "text/csv")}
                >
                    <Download size={14} /> Spreadsheet
                </button>
                <button type="button" className={button} onClick={() => fileInput.current?.click()}>
                    <Upload size={14} /> Restore
                </button>
                <input
                    ref={fileInput}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={importFile}
                />
            </div>
            {message && (
                <p role="status" className="mt-2 text-xs">
                    {message}
                </p>
            )}
        </div>
    );
}
