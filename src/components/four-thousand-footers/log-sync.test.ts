import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
    connectAccount,
    disconnectAccount,
    getLog,
    getSyncState,
    logActions,
    takeHandoff,
    type Ascent,
} from "./log";

// ---- a pretend browser and account -----------------------------------------

const KEY = "birdpile.nh48.log.v1";
const storage = new Map<string, string>();
let address = { pathname: "/dark_eyed_junco", search: "", hash: "" };
let saved: Ascent[] = [];
let down = false;
const calls: string[] = [];

Object.assign(globalThis, {
    window: {
        localStorage: {
            getItem: (k: string) => storage.get(k) ?? null,
            setItem: (k: string, v: string) => void storage.set(k, v),
            removeItem: (k: string) => void storage.delete(k),
        },
        location: {
            get pathname() {
                return address.pathname;
            },
            get search() {
                return address.search;
            },
            get hash() {
                return address.hash;
            },
        },
        history: {
            state: null,
            replaceState: (_s: unknown, _t: string, url: string) => {
                address = { pathname: url, search: "", hash: "" };
            },
        },
        addEventListener() {},
        removeEventListener() {},
    },
    fetch: async (url: string, init: { method: string; body?: string }) => {
        calls.push(`${init.method} ${url}`);
        if (down) return { ok: false, status: 503, json: async () => ({}) };
        const query = new URL(url, "https://birdfinds.com").searchParams;
        if (init.method === "POST") {
            const incoming = JSON.parse(init.body!).ascents as Ascent[];
            for (const a of incoming) if (!saved.some((s) => s.id === a.id)) saved.push(a);
        } else if (init.method === "PATCH") {
            const { id, ...change } = JSON.parse(init.body!);
            saved = saved.map((a) => (a.id === id ? { ...a, ...change } : a));
        } else if (init.method === "DELETE") {
            saved = saved.filter((a) => a.id !== query.get("id") && a.peakId !== query.get("peakId"));
        }
        return { ok: true, status: 200, json: async () => ({ ascents: saved }) };
    },
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
    disconnectAccount();
    storage.clear();
    saved = [];
    down = false;
    calls.length = 0;
});

// ---- tests -------------------------------------------------------------------

test("signing in folds this browser's climbs into the account, once", async () => {
    storage.set(KEY, JSON.stringify({ version: 1, ascents: [{ id: "b1", peakId: "garfield", date: "2024-07-04", notes: "" }] }));
    saved = [{ id: "s1", peakId: "washington", date: "2023-08-01", notes: "" }];
    await connectAccount("user_1");
    assert.equal(getSyncState(), "account");
    assert.deepEqual(getLog().ascents.map((a) => a.id), ["s1", "b1"]);
    assert.deepEqual(saved.map((a) => a.id), ["s1", "b1"]);
    assert.equal(storage.has(KEY), false, "the browser copy is cleared");

    // Signing out shows this browser's (now empty) log; signing back in adds nothing.
    disconnectAccount();
    assert.equal(getLog().ascents.length, 0);
    await connectAccount("user_1");
    assert.equal(saved.length, 2);
});

test("signed in, each change is sent to the account in order", async () => {
    await connectAccount("user_1");
    logActions.add("lafayette", "2024-09-01", "windy");
    const id = getLog().ascents[0].id;
    logActions.update(id, { notes: "very windy" });
    logActions.removePeak("lafayette");
    assert.equal(getLog().ascents.length, 0, "the screen doesn't wait for the network");
    await settle();
    assert.deepEqual(calls.slice(-3), [
        "POST /api/nh48/ascents",
        "PATCH /api/nh48/ascents",
        "DELETE /api/nh48/ascents?peakId=lafayette",
    ]);
    assert.equal(saved.length, 0);
    assert.equal(storage.has(KEY), false, "nothing goes to this browser");
});

test("a change that doesn't land is rolled back to what the account holds", async () => {
    saved = [{ id: "s1", peakId: "washington", date: "2023-08-01", notes: "" }];
    await connectAccount("user_1");
    down = true;
    logActions.remove("s1");
    assert.equal(getLog().ascents.length, 0);
    await settle();
    assert.equal(getSyncState(), "save-error");
    down = false;
    logActions.add("carrigain", "2024-10-01");
    await settle();
    assert.equal(getSyncState(), "account");
});

test("if the account can't be reached, the browser's log carries on", async () => {
    storage.set(KEY, JSON.stringify({ version: 1, ascents: [{ id: "b1", peakId: "garfield", date: "2024-07-04", notes: "" }] }));
    down = true;
    await connectAccount("user_1");
    assert.equal(getSyncState(), "load-error");
    assert.deepEqual(getLog().ascents.map((a) => a.id), ["b1"]);
    logActions.add("isolation", "2024-08-15");
    assert.equal(JSON.parse(storage.get(KEY)!).ascents.length, 2);
});

test("a log handed over from birdpile.com is merged and the address tidied", () => {
    const handed = [
        { id: "p1", peakId: "moosilauke", date: "2022-06-11", notes: "first!" },
        { id: "p2", peakId: "not-a-peak", date: "2022-06-11", notes: "" },
    ];
    address.hash = `#import=${encodeURIComponent(JSON.stringify({ version: 1, ascents: handed }))}`;
    assert.equal(takeHandoff(), 1);
    assert.equal(address.hash, "");
    assert.deepEqual(getLog().ascents.map((a) => a.id), ["p1"]);
    assert.equal(JSON.parse(storage.get(KEY)!).ascents.length, 1);
    // A second visit with the same handoff adds nothing.
    address.hash = `#import=${encodeURIComponent(JSON.stringify(handed))}`;
    assert.equal(takeHandoff(), 0);
    address.hash = "#import=%7Bnot json";
    assert.equal(takeHandoff(), 0);
});
