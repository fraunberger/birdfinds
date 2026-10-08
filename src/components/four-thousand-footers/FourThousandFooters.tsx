"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { statusByPeak, summarize } from "./stats";
import { useHydrated, useLog, useSaveFailed, useSyncState, useToday } from "./hooks";
import { takeHandoff } from "./log";
import { AccountBar } from "./Account";
import { RangeView } from "./RangeView";
import { Checklist } from "./Checklist";
import { Progress } from "./Progress";
import { PeakSheet } from "./PeakSheet";
import * as C from "./palette";

type Tab = "range" | "checklist" | "progress";

const TABS: Array<[Tab, string]> = [
    ["range", "Range"],
    ["checklist", "Checklist"],
    ["progress", "Progress"],
];

/**
 * A log of New Hampshire's 48 four-thousand footers. With `accounts`, signed-in
 * hikers' logs are kept on their account (needs Clerk to be set up).
 */
export function FourThousandFooters({ accounts = false }: { accounts?: boolean }) {
    const hydrated = useHydrated();
    const log = useLog();
    const today = useToday();
    const saveFailed = useSaveFailed();
    const sync = useSyncState();
    const ready = hydrated && sync !== "loading";
    const status = useMemo(() => statusByPeak(log), [log]);
    const summary = useMemo(() => summarize(status), [status]);
    const [tab, setTab] = useState<Tab>("range");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const close = useCallback(() => setSelectedId(null), []);
    const selected = selectedId ? status.get(selectedId) : undefined;

    // A log carried over from birdpile.com rides in on the address.
    useEffect(() => {
        takeHandoff();
    }, []);

    return (
        <div className="mx-auto w-full max-w-5xl font-mono text-black">
            <header>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">4000 Footers</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            New Hampshire&apos;s 48 peaks over 4,000 feet.
                        </p>
                    </div>
                    {/* Counts wait for the browser: the log lives there, not on the server. */}
                    <p className="text-sm tabular-nums" aria-live="polite">
                        {ready ? (
                            <>
                                <span className="text-2xl font-bold">{summary.bagged}</span>
                                <span className="text-neutral-500"> / 48 bagged</span>
                            </>
                        ) : (
                            <span className="text-neutral-500">Loading your log…</span>
                        )}
                    </p>
                </div>
                <div className="mt-3 h-1.5" style={{ background: C.BAGGED_TRACK }} aria-hidden="true">
                    <div
                        className="h-full transition-[width] duration-500"
                        style={{ width: `${ready ? (summary.bagged / 48) * 100 : 0}%`, background: C.BAGGED }}
                    />
                </div>
                {accounts && (
                    <div className="mt-2 min-h-4">
                        <AccountBar sync={sync} />
                    </div>
                )}
            </header>

            <nav className="mt-5 flex border-b border-black" role="tablist" aria-label="Views">
                {TABS.map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`nh48-tab-${key}`}
                        aria-controls="nh48-panel"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={`-mb-px border border-b-0 px-4 py-2 text-xs uppercase tracking-widest ${
                            tab === key
                                ? "border-black bg-black text-white"
                                : "border-transparent text-neutral-500 hover:text-black"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </nav>

            {sync === "save-error" && (
                <p role="alert" className="mt-3 border border-black bg-yellow-50 px-3 py-2 text-xs">
                    That change didn&apos;t reach your account, so this shows what&apos;s saved there. Try it
                    again in a moment.
                </p>
            )}
            {sync === "load-error" && (
                <p role="alert" className="mt-3 border border-black bg-yellow-50 px-3 py-2 text-xs">
                    Couldn&apos;t load your account&apos;s log, so this is the one saved in this browser. Reload
                    the page to try again.
                </p>
            )}
            {saveFailed && (
                <p role="alert" className="mt-3 border border-black bg-yellow-50 px-3 py-2 text-xs">
                    This browser isn&apos;t letting the log save (private browsing, or storage is full). Your
                    climbs will be lost when you close the tab; download a backup from Progress.
                </p>
            )}

            <main id="nh48-panel" className="mt-4" role="tabpanel" aria-labelledby={`nh48-tab-${tab}`}>
                {!ready ? (
                    <div className="h-80 border border-neutral-200" />
                ) : tab === "range" ? (
                    <RangeView status={status} selectedId={selectedId} onSelect={setSelectedId} />
                ) : tab === "checklist" ? (
                    <Checklist status={status} today={today} selectedId={selectedId} onSelect={setSelectedId} />
                ) : (
                    <Progress status={status} summary={summary} today={today} onSelect={setSelectedId} />
                )}
            </main>

            {selected && (
                <>
                    {/* Room to scroll the page's end out from under the sheet on phones. */}
                    <div className="h-[60vh] sm:hidden" aria-hidden="true" />
                    <PeakSheet key={selected.peak.id} status={selected} today={today} onClose={close} />
                </>
            )}
        </div>
    );
}
