"use client";

import React, { useEffect, useId, useState } from "react";
import { Snowflake, Trash2, X } from "lucide-react";
import {
    RANGE_BY_ID,
    bearingName,
    elevationRank,
    feetToMeters,
    formatFeet,
    nearestPeak,
    superlatives,
} from "./peaks";
import { formatDate, isValidDate, logActions } from "./log";
import { isWinterDate, type PeakStatus } from "./stats";

type Props = {
    status: PeakStatus;
    /** YYYY-MM-DD; empty if not known yet. */
    today: string;
    onClose: () => void;
};

const field =
    "border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-black focus:outline-none";

/** The selected peak: what it is, every logged climb, and a form to log another. */
export function PeakSheet({ status, today, onClose }: Props) {
    const { peak, ascents } = status;
    const titleId = useId();
    const [date, setDate] = useState("");
    const [notes, setNotes] = useState("");
    const logDate = date || today;
    const near = nearestPeak(peak);
    const facts = [...superlatives(peak), ...(peak.note ? [peak.note] : [])];

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValidDate(logDate)) return;
        logActions.add(peak.id, logDate, notes);
        setDate("");
        setNotes("");
    };

    const remove = (id: string, hasNotes: boolean) => {
        if (hasNotes && !window.confirm("Delete this ascent and its notes?")) return;
        logActions.remove(id);
    };

    return (
        <aside
            role="dialog"
            aria-labelledby={titleId}
            className="fixed inset-x-0 bottom-0 z-40 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-96"
        >
            <div className="max-h-[70vh] overflow-y-auto border-t border-black bg-white p-4 font-mono text-black shadow-[0_-6px_24px_rgba(0,0,0,0.12)] sm:border">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 id={titleId} className="text-xl font-bold tracking-tight">
                            {peak.name}
                        </h2>
                        <p className="mt-0.5 text-xs text-neutral-500">
                            {formatFeet(peak.elevation)} ft · {formatFeet(feetToMeters(peak.elevation))} m · #
                            {elevationRank(peak)} of 48
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="-mr-1 -mt-1 p-1 text-neutral-500 hover:text-black"
                    >
                        <X size={18} />
                    </button>
                </div>

                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-neutral-500">Range</dt>
                    <dd>{RANGE_BY_ID.get(peak.range)?.name}</dd>
                    <dt className="text-neutral-500">Summit</dt>
                    <dd className="tabular-nums">
                        {peak.lat.toFixed(4)}° N, {Math.abs(peak.lon).toFixed(4)}° W
                    </dd>
                    <dt className="text-neutral-500">Nearest</dt>
                    <dd>
                        {near.peak.name}, {near.miles.toFixed(1)} mi {bearingName(peak, near.peak)}
                    </dd>
                </dl>
                {facts.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-neutral-600">
                        {facts.map((fact) => (
                            <li key={fact}>{fact}</li>
                        ))}
                    </ul>
                )}

                <div className="mt-4 border-t border-neutral-200 pt-3">
                    <p className="text-xs uppercase tracking-widest">
                        {status.first ? (
                            <>
                                <span className="font-bold text-[#2f7a4b]">Bagged</span>{" "}
                                {formatDate(status.first.date)}
                                {ascents.length > 1 && (
                                    <span className="text-neutral-500"> · {ascents.length} ascents</span>
                                )}
                            </>
                        ) : (
                            <span className="text-neutral-500">Not bagged yet</span>
                        )}
                    </p>

                    {ascents.length > 0 && (
                        <ol className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
                            {ascents.map((a, i) => (
                                <li key={a.id} className="flex items-center gap-2 py-2">
                                    <span className="w-4 text-[10px] tabular-nums text-neutral-500">{i + 1}</span>
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="date"
                                                value={a.date}
                                                max={today || undefined}
                                                aria-label={`Date of ascent ${i + 1}`}
                                                onChange={(e) => {
                                                    if (isValidDate(e.target.value)) {
                                                        logActions.update(a.id, { date: e.target.value });
                                                    }
                                                }}
                                                className={`${field} py-1 text-xs`}
                                            />
                                            {isWinterDate(a.date) && (
                                                <span
                                                    className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-neutral-500"
                                                    title="Calendar winter: December 21 to March 20"
                                                >
                                                    <Snowflake size={11} aria-hidden="true" /> Winter
                                                </span>
                                            )}
                                        </div>
                                        <input
                                            key={`${a.id}:${a.notes}`}
                                            defaultValue={a.notes}
                                            placeholder="Add a note"
                                            aria-label={`Notes for ascent ${i + 1}`}
                                            onBlur={(e) => {
                                                if (e.target.value !== a.notes) {
                                                    logActions.update(a.id, { notes: e.target.value.trim() });
                                                }
                                            }}
                                            className={`${field} w-full py-1 text-xs`}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => remove(a.id, a.notes.length > 0)}
                                        aria-label={`Delete ascent ${i + 1}`}
                                        className="p-1.5 text-neutral-500 hover:text-black"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>

                <form onSubmit={submit} className="mt-4">
                    <p className="text-xs uppercase tracking-widest text-neutral-500">
                        {status.bagged ? "Log another ascent" : "Log an ascent"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <input
                            type="date"
                            value={logDate}
                            max={today || undefined}
                            required
                            aria-label="Date climbed"
                            onChange={(e) => setDate(e.target.value)}
                            className={field}
                        />
                        <input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Notes (trail, weather, company)"
                            aria-label="Notes"
                            className={`${field} min-w-0 flex-1`}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!isValidDate(logDate)}
                        className="mt-2 w-full bg-black py-2.5 text-sm uppercase tracking-widest text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                    >
                        {status.bagged ? "Log it" : "Bag it"}
                    </button>
                </form>
            </div>
        </aside>
    );
}
