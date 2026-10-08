// The ascent log and where it lives.
//
// Signed out, the log is kept in this browser's localStorage; signed in, it's
// kept in the BirdFinds account. Everything that touches either is in the
// "Persistence" section at the bottom. The rest of the app only sees `PeakLog`
// and the actions, and doesn't know which one it's talking to.

import { PEAK_BY_ID } from "./peaks";

export type Ascent = {
    id: string;
    peakId: string;
    /** Local calendar date, YYYY-MM-DD. */
    date: string;
    notes: string;
};

export type PeakLog = {
    version: 1;
    ascents: Ascent[];
};

export const EMPTY_LOG: PeakLog = { version: 1, ascents: [] };

// --- Dates ---

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in YYYY-MM-DD form (no Feb 30th). */
export function isValidDate(value: string): boolean {
    const match = DATE_PATTERN.exec(value);
    if (!match) return false;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

/** Today in the hiker's own time zone. */
export function todayISO(now: Date = new Date()): string {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-08-12" -> "Aug 12, 2025". Locale-free so server and client agree. */
export function formatDate(iso: string): string {
    const match = DATE_PATTERN.exec(iso);
    if (!match) return iso;
    return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

export function monthName(index: number): string {
    return MONTHS[index];
}

// --- Pure log operations ---

function byDate(a: Ascent, b: Ascent): number {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sorted(ascents: Ascent[]): Ascent[] {
    return [...ascents].sort(byDate);
}

/**
 * Accepts anything (a saved log, an imported file) and keeps only well-formed
 * ascents of real peaks on real dates. Never throws.
 */
export function parseLog(raw: unknown): PeakLog {
    const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && Array.isArray((raw as { ascents?: unknown }).ascents)
          ? (raw as { ascents: unknown[] }).ascents
          : [];
    const seen = new Set<string>();
    const ascents: Ascent[] = [];
    for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const { id, peakId, date, notes } = item as Record<string, unknown>;
        if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
        if (typeof peakId !== "string" || !PEAK_BY_ID.has(peakId)) continue;
        if (typeof date !== "string" || !isValidDate(date)) continue;
        seen.add(id);
        ascents.push({ id, peakId, date, notes: typeof notes === "string" ? notes : "" });
    }
    return { version: 1, ascents: sorted(ascents) };
}

export function withAscent(log: PeakLog, ascent: Ascent): PeakLog {
    return { version: 1, ascents: sorted([...log.ascents.filter((a) => a.id !== ascent.id), ascent]) };
}

export function withAscentChanged(
    log: PeakLog,
    id: string,
    change: Partial<Pick<Ascent, "date" | "notes">>
): PeakLog {
    if (change.date !== undefined && !isValidDate(change.date)) return log;
    return {
        version: 1,
        ascents: sorted(log.ascents.map((a) => (a.id === id ? { ...a, ...change } : a))),
    };
}

export function withoutAscent(log: PeakLog, id: string): PeakLog {
    return { version: 1, ascents: log.ascents.filter((a) => a.id !== id) };
}

export function withoutPeak(log: PeakLog, peakId: string): PeakLog {
    return { version: 1, ascents: log.ascents.filter((a) => a.peakId !== peakId) };
}

/**
 * Folds an imported log into this one. Entries already here (same id, or the
 * same peak, date and notes) are skipped, so importing a backup twice is harmless.
 */
export function mergeLogs(log: PeakLog, incoming: PeakLog): { log: PeakLog; added: number; fresh: Ascent[] } {
    const ids = new Set(log.ascents.map((a) => a.id));
    const keys = new Set(log.ascents.map((a) => `${a.peakId}|${a.date}|${a.notes}`));
    const fresh = incoming.ascents.filter(
        (a) => !ids.has(a.id) && !keys.has(`${a.peakId}|${a.date}|${a.notes}`)
    );
    return { log: { version: 1, ascents: sorted([...log.ascents, ...fresh]) }, added: fresh.length, fresh };
}

export function newAscentId(): string {
    const uuid = globalThis.crypto?.randomUUID?.();
    return uuid ?? `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// --- Persistence ---
//
// Signed out, the log lives in localStorage. Signed in, the log in memory is the
// account's: each change shows at once and is sent to /api/nh48/ascents behind
// it. On signing in, anything logged in this browser beforehand is folded into
// the account and cleared from here, so it's never counted twice.

/**
 * - local: this browser's log.
 * - loading: waiting on sign-in or the account's log; the app holds still.
 * - account: the signed-in account's log.
 * - save-error: a change didn't reach the account; showing what it holds.
 * - load-error: the account couldn't be reached; showing this browser's log.
 */
export type SyncState = "local" | "loading" | "account" | "save-error" | "load-error";

const STORAGE_KEY = "birdpile.nh48.log.v1";
const API = "/api/nh48/ascents";

let cache: PeakLog | null = null;
/** The signed-in user whose log is in use, or null for this browser's. */
let account: string | null = null;
let sync: SyncState = "local";
let saveFailed = false;
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((listener) => listener());
}

function readLocal(): PeakLog {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? parseLog(JSON.parse(raw)) : EMPTY_LOG;
    } catch {
        return EMPTY_LOG;
    }
}

function writeLocal(next: PeakLog | null): boolean {
    try {
        if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        else window.localStorage.removeItem(STORAGE_KEY);
        return true;
    } catch {
        return false;
    }
}

/** Snapshot for useSyncExternalStore; stable until the log changes. */
export function getLog(): PeakLog {
    if (cache === null) cache = account ? EMPTY_LOG : readLocal();
    return cache;
}

/** Nothing is known about the log during server rendering. */
export function getServerLog(): PeakLog {
    return EMPTY_LOG;
}

export function getSyncState(): SyncState {
    return sync;
}

/** True once a write to localStorage has failed (private mode, storage full). */
export function getSaveFailed(): boolean {
    return account === null && saveFailed;
}

export function subscribeLog(listener: () => void): () => void {
    listeners.add(listener);
    // Another tab wrote this browser's log: drop the cache and re-read.
    const onStorage = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY || account !== null) return;
        cache = null;
        listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

// Requests go one at a time, in order, so an edit never overtakes the add it
// edits. Signing in or out bumps the generation, and anything from before is
// dropped.
let queue: Promise<unknown> = Promise.resolve();
let generation = 0;

async function request(method: string, body?: unknown, query = ""): Promise<unknown> {
    const response = await fetch(`${API}${query}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
    });
    if (!response.ok) throw new Error(`${method} ${API} failed: ${response.status}`);
    return response.json();
}

function send(method: string, body?: unknown, query?: string): void {
    const gen = generation;
    queue = queue
        .then(async () => {
            if (gen !== generation) return;
            await request(method, body, query);
            if (gen === generation && sync === "save-error") {
                sync = "account";
                notify();
            }
        })
        .catch(async () => {
            if (gen !== generation) return;
            sync = "save-error";
            notify();
            // Show what the account really holds, not the change that didn't land.
            try {
                const saved = parseLog(await request("GET"));
                if (gen !== generation) return;
                cache = saved;
                notify();
            } catch {
                // Still unreachable; keep what's on screen.
            }
        });
}

function commit(next: PeakLog, toAccount: () => void): void {
    cache = next;
    if (account) {
        toAccount();
    } else {
        saveFailed = !writeLocal(next);
    }
    notify();
}

/** Sign-in is still being checked: hold the app still rather than flash this browser's log. */
export function awaitAccount(): void {
    if (account !== null || sync !== "local") return;
    sync = "loading";
    notify();
}

/** Switch to a signed-in user's log, folding in anything logged here first. */
export async function connectAccount(userId: string): Promise<void> {
    if (account === userId) return;
    const gen = ++generation;
    queue = Promise.resolve();
    account = userId;
    cache = EMPTY_LOG;
    sync = "loading";
    notify();
    try {
        const remote = parseLog(await request("GET"));
        if (gen !== generation) return;
        const { log, fresh } = mergeLogs(remote, readLocal());
        if (fresh.length > 0) await request("POST", { ascents: fresh });
        if (gen !== generation) return;
        writeLocal(null);
        cache = log;
        sync = "account";
    } catch {
        if (gen !== generation) return;
        // Carry on with this browser's log; a reload tries the account again.
        account = null;
        cache = null;
        sync = "load-error";
    }
    notify();
}

/** Signed out: back to this browser's log. */
export function disconnectAccount(): void {
    if (account === null && sync === "local") return;
    generation += 1;
    account = null;
    cache = null;
    sync = "local";
    notify();
}

export const logActions = {
    add(peakId: string, date: string, notes = ""): void {
        if (!PEAK_BY_ID.has(peakId) || !isValidDate(date)) return;
        const ascent = { id: newAscentId(), peakId, date, notes: notes.trim() };
        commit(withAscent(getLog(), ascent), () => send("POST", { ascents: [ascent] }));
    },
    update(id: string, change: Partial<Pick<Ascent, "date" | "notes">>): void {
        const next = withAscentChanged(getLog(), id, change);
        const ascent = next.ascents.find((a) => a.id === id);
        if (next === getLog() || !ascent) return;
        commit(next, () => send("PATCH", { id, date: ascent.date, notes: ascent.notes }));
    },
    remove(id: string): void {
        commit(withoutAscent(getLog(), id), () => send("DELETE", undefined, `?id=${encodeURIComponent(id)}`));
    },
    removePeak(peakId: string): void {
        commit(withoutPeak(getLog(), peakId), () =>
            send("DELETE", undefined, `?peakId=${encodeURIComponent(peakId)}`)
        );
    },
    /** Merge an imported backup; returns how many ascents were new. */
    merge(incoming: PeakLog): number {
        const { log, fresh } = mergeLogs(getLog(), incoming);
        if (fresh.length > 0) commit(log, () => send("POST", { ascents: fresh }));
        return fresh.length;
    },
};

/**
 * birdpile.com hands its browser's log over in the address
 * (`#import=<json>`), since this site can't read that site's storage.
 * Folds it in and tidies the address; returns how many climbs were new.
 */
export function takeHandoff(): number {
    const prefix = "#import=";
    const { hash, pathname, search } = window.location;
    if (!hash.startsWith(prefix)) return 0;
    window.history.replaceState(window.history.state, "", pathname + search);
    let incoming: PeakLog;
    try {
        incoming = parseLog(JSON.parse(decodeURIComponent(hash.slice(prefix.length))));
    } catch {
        return 0;
    }
    if (account !== null && sync !== "loading") return logActions.merge(incoming);
    // Not signed in, or not yet known: it goes in this browser's log, which
    // signing in folds into the account.
    const { log, fresh } = mergeLogs(readLocal(), incoming);
    if (fresh.length > 0) {
        saveFailed = !writeLocal(log);
        if (account === null) cache = log;
        notify();
    }
    return fresh.length;
}
