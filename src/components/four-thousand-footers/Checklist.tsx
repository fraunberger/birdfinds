"use client";

import { useState } from "react";
import { PEAKS, RANGES, RANGE_BY_ID, elevationRank, formatFeet, type Range } from "./peaks";
import { isValidDate, logActions } from "./log";
import type { PeakStatus } from "./stats";

type Sort = "height" | "name" | "range" | "date";
type Filter = "all" | "todo" | "done";

const SORTS: Array<[Sort, string]> = [
    ["height", "Height"],
    ["name", "A–Z"],
    ["range", "Range"],
    ["date", "Date"],
];

const FILTERS: Array<[Filter, string]> = [
    ["all", "All"],
    ["todo", "To go"],
    ["done", "Bagged"],
];

type Props = {
    status: Map<string, PeakStatus>;
    today: string;
    selectedId: string | null;
    onSelect: (id: string) => void;
};

function order(items: PeakStatus[], sort: Sort): PeakStatus[] {
    const byHeight = (a: PeakStatus, b: PeakStatus) => b.peak.elevation - a.peak.elevation;
    const list = [...items];
    switch (sort) {
        case "name":
            return list.sort((a, b) => a.peak.name.localeCompare(b.peak.name));
        case "range": {
            const rank = new Map(RANGES.map((r, i) => [r.id, i]));
            return list.sort((a, b) => rank.get(a.peak.range)! - rank.get(b.peak.range)! || byHeight(a, b));
        }
        case "date":
            // Bagged in the order they fell, then the rest tallest first.
            return list.sort((a, b) => {
                if (a.first && b.first) return a.first.date.localeCompare(b.first.date) || byHeight(a, b);
                if (a.first || b.first) return a.first ? -1 : 1;
                return byHeight(a, b);
            });
        default:
            return list.sort(byHeight);
    }
}

export function Checklist({ status, today, selectedId, onSelect }: Props) {
    const [sort, setSort] = useState<Sort>("height");
    const [filter, setFilter] = useState<Filter>("all");

    const all = PEAKS.map((p) => status.get(p.id)!);
    const shown = order(
        all.filter((s) => (filter === "all" ? true : filter === "done" ? s.bagged : !s.bagged)),
        sort
    );
    const groups: Array<{ range: Range | null; items: PeakStatus[] }> =
        sort === "range"
            ? RANGES.map((range) => ({ range, items: shown.filter((s) => s.peak.range === range.id) })).filter(
                  (g) => g.items.length > 0
              )
            : [{ range: null, items: shown }];

    const toggle = (s: PeakStatus) => {
        if (!s.bagged) {
            if (today) logActions.add(s.peak.id, today);
            return;
        }
        const detailed = s.ascents.length > 1 || s.ascents.some((a) => a.notes);
        const what = s.ascents.length > 1 ? `all ${s.ascents.length} logged ascents` : "the logged ascent and its notes";
        if (detailed && !window.confirm(`Un-bag ${s.peak.name}? This deletes ${what}.`)) return;
        logActions.removePeak(s.peak.id);
    };

    const bagged = all.filter((s) => s.bagged).length;

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Segmented label="Show" options={FILTERS} value={filter} onChange={setFilter} />
                <Segmented label="Sort" options={SORTS} value={sort} onChange={setSort} />
            </div>

            <p className="mt-3 text-xs text-neutral-500">
                {filter === "todo"
                    ? `${48 - bagged} to go.`
                    : filter === "done"
                      ? `${bagged} bagged.`
                      : `${bagged} of 48 bagged.`}{" "}
                Checking a peak logs it today; change the date beside it.
            </p>

            {shown.length === 0 ? (
                <p className="py-12 text-center text-xs uppercase tracking-widest text-neutral-500">
                    {filter === "done" ? "Nothing bagged yet." : "All 48 bagged. Go do them in winter."}
                </p>
            ) : (
                <div className="mt-3 border border-black">
                    {groups.map((group) => (
                        <section key={group.range?.id ?? "all"}>
                            {group.range && (
                                <h3 className="flex justify-between border-b border-black bg-neutral-50 px-3 py-1.5 text-[11px] uppercase tracking-widest">
                                    <span>{group.range.name}</span>
                                    <span className="tabular-nums text-neutral-500">
                                        {all.filter((s) => s.peak.range === group.range!.id && s.bagged).length}/
                                        {all.filter((s) => s.peak.range === group.range!.id).length}
                                    </span>
                                </h3>
                            )}
                            <ul className="divide-y divide-neutral-200">
                                {group.items.map((s) => (
                                    <Row
                                        key={s.peak.id}
                                        status={s}
                                        today={today}
                                        selected={s.peak.id === selectedId}
                                        onToggle={() => toggle(s)}
                                        onSelect={() => onSelect(s.peak.id)}
                                    />
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}

function Row({
    status,
    today,
    selected,
    onToggle,
    onSelect,
}: {
    status: PeakStatus;
    today: string;
    selected: boolean;
    onToggle: () => void;
    onSelect: () => void;
}) {
    const { peak, first, ascents } = status;
    return (
        <li className={`flex items-center gap-3 px-3 py-2 ${selected ? "bg-neutral-100" : ""}`}>
            <input
                type="checkbox"
                checked={status.bagged}
                onChange={onToggle}
                aria-label={`${peak.name} bagged`}
                className="size-5 shrink-0 cursor-pointer accent-[#2f7a4b]"
            />
            <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
                <span className="flex items-baseline gap-2">
                    <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-neutral-500">
                        {elevationRank(peak)}
                    </span>
                    <span className={`truncate font-bold ${status.bagged ? "" : "text-neutral-700"}`}>{peak.name}</span>
                </span>
                <span className="block pl-7 text-[11px] text-neutral-500">
                    {formatFeet(peak.elevation)} ft · {RANGE_BY_ID.get(peak.range)?.short}
                </span>
            </button>
            <div className="shrink-0 text-right">
                {first ? (
                    <>
                        <input
                            type="date"
                            value={first.date}
                            max={today || undefined}
                            aria-label={`Date ${peak.name} was bagged`}
                            onChange={(e) => {
                                if (isValidDate(e.target.value)) logActions.update(first.id, { date: e.target.value });
                            }}
                            className="w-[8.75rem] border border-transparent bg-transparent px-1 py-0.5 text-xs tabular-nums hover:border-neutral-300 focus:border-black focus:outline-none"
                        />
                        {ascents.length > 1 && (
                            <span className="block text-[10px] uppercase tracking-widest text-neutral-500">
                                {ascents.length} ascents
                            </span>
                        )}
                    </>
                ) : (
                    <span className="text-xs text-neutral-300">—</span>
                )}
            </div>
        </li>
    );
}

function Segmented<T extends string>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: Array<[T, string]>;
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <div className="flex items-center gap-2" role="group" aria-label={label}>
            <span className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</span>
            <div className="flex">
                {options.map(([key, text]) => (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={value === key}
                        onClick={() => onChange(key)}
                        className={`-ml-px border px-2.5 py-1 text-[11px] uppercase tracking-widest first:ml-0 ${
                            value === key
                                ? "relative z-10 border-black bg-black text-white"
                                : "border-neutral-300 hover:border-black"
                        }`}
                    >
                        {text}
                    </button>
                ))}
            </div>
        </div>
    );
}
