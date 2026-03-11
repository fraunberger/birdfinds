"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface BirdResult {
  id: string;
  comName: string;
  sciName: string;
  familyComName: string;
  orderComName: string;
}

export default function FindBirdPage() {
  const [apiKey, setApiKey] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BirdResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [spotted, setSpotted] = useState<BirdResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist key in localStorage so it survives a refresh
  useEffect(() => {
    const saved = localStorage.getItem("ebird_test_key");
    if (saved) setApiKey(saved);
  }, []);

  const saveKey = (k: string) => {
    setApiKey(k);
    localStorage.setItem("ebird_test_key", k);
  };

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setError(null);

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        let data: BirdResult[];

        if (apiKey.trim()) {
          // Call eBird directly from the browser using the provided key
          const url = new URL("https://api.ebird.org/v2/ref/taxon/find");
          url.searchParams.set("q", trimmed);
          url.searchParams.set("maxResults", "12");
          url.searchParams.set("locale", "en");
          const res = await fetch(url.toString(), {
            headers: { "X-eBirdApiToken": apiKey.trim() },
            signal: controller.signal,
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`eBird ${res.status}${text ? ": " + text.slice(0, 120) : ""}`);
          }
          type EBirdTaxon = { speciesCode?: string; comName?: string; sciName?: string; familyComName?: string; orderComName?: string };
          const raw: EBirdTaxon[] = await res.json();
          data = raw
            .filter((t) => t.speciesCode && t.comName)
            .map((t) => ({
              id: t.speciesCode!,
              comName: t.comName!,
              sciName: t.sciName ?? "",
              familyComName: t.familyComName ?? "",
              orderComName: t.orderComName ?? "",
            }));
        } else {
          // Fall back to our server-side proxy
          const res = await fetch(
            `/api/birds/search?q=${encodeURIComponent(trimmed)}`,
            { signal: controller.signal }
          );
          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            throw new Error(json.error ?? `HTTP ${res.status}`);
          }
          data = await res.json();
        }

        setResults(data);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 220);
  }, [query, apiKey]);

  const pick = (bird: BirdResult) => {
    setSpotted((prev) =>
      prev.some((b) => b.id === bird.id) ? prev : [...prev, bird]
    );
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (id: string) =>
    setSpotted((prev) => prev.filter((b) => b.id !== id));

  const usingDirectKey = apiKey.trim().length > 0;

  return (
    <div className="min-h-screen bg-white font-mono text-neutral-900">
      <div className="max-w-2xl mx-auto p-3 sm:p-6 min-h-screen flex flex-col">

        {/* Header */}
        <header className="flex items-center justify-between mb-6 border-b border-neutral-300 pb-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="relative w-16 h-10 block hover:opacity-80 transition-opacity">
              <Image src="/logo.svg" alt="BirdFinds" fill className="object-contain" priority />
            </Link>
            <span className="text-[10px] uppercase tracking-widest text-neutral-500">
              Bird API Test
            </span>
          </div>
          <Link
            href="/"
            className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:border-neutral-500"
          >
            Feed
          </Link>
        </header>

        <main className="flex-grow space-y-6">

          {/* API key override */}
          <div className="border border-neutral-200 p-3">
            <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
              eBird API Key{" "}
              <span className="text-neutral-400 normal-case tracking-normal">
                — paste to call eBird directly (bypasses server proxy)
              </span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => saveKey(e.target.value)}
              placeholder="Leave blank to use server proxy"
              className="w-full border border-neutral-300 px-3 py-2 text-xs focus:outline-none focus:border-neutral-600 placeholder-neutral-400"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-[10px] text-neutral-400">
              {usingDirectKey
                ? "Calling eBird directly · key saved in localStorage"
                : "Using /api/birds/search proxy · get a key at ebird.org/api/keygen"}
            </p>
          </div>

          {/* Search box */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
              Search Species
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="e.g. Robin, Warbler, Hawk…"
                className="w-full border border-neutral-300 px-3 py-2 text-xs focus:outline-none focus:border-neutral-600 placeholder-neutral-400"
                autoComplete="off"
                spellCheck={false}
              />

              {/* Dropdown */}
              {open && query.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full z-20 border border-neutral-300 border-t-0 bg-white shadow-sm max-h-72 overflow-y-auto">
                  {isSearching ? (
                    <div className="px-3 py-3 text-[10px] uppercase tracking-widest text-neutral-400">
                      Searching eBird…
                    </div>
                  ) : error ? (
                    <div className="px-3 py-3 text-[10px] uppercase tracking-widest text-red-500">
                      {error}
                    </div>
                  ) : results.length === 0 ? (
                    <div className="px-3 py-3 text-[10px] uppercase tracking-widest text-neutral-400">
                      No results
                    </div>
                  ) : (
                    results.map((bird) => (
                      <button
                        key={bird.id}
                        type="button"
                        onMouseDown={() => pick(bird)}
                        className="w-full text-left px-3 py-2 hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0"
                      >
                        <span className="text-xs">{bird.comName}</span>
                        <span className="ml-2 text-[10px] text-neutral-400 italic">{bird.sciName}</span>
                        {bird.familyComName ? (
                          <span className="block text-[10px] uppercase tracking-widest text-neutral-400 mt-0.5">
                            {bird.familyComName}
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <p className="mt-1 text-[10px] text-neutral-400">
              Type 2+ characters · click a result to add to list
            </p>
          </div>

          {/* Spotted list */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">
              Spotted ({spotted.length})
            </p>
            {spotted.length === 0 ? (
              <div className="border border-neutral-200 px-3 py-4 text-[10px] uppercase tracking-widest text-neutral-300 text-center">
                No birds yet — search above
              </div>
            ) : (
              <ul className="space-y-1">
                {spotted.map((bird, i) => (
                  <li
                    key={bird.id}
                    className="flex items-center justify-between border border-neutral-200 px-3 py-2"
                  >
                    <div>
                      <span className="text-[10px] uppercase tracking-widest text-neutral-400 mr-2">
                        {i + 1}.
                      </span>
                      <span className="text-xs">{bird.comName}</span>
                      <span className="ml-2 text-[10px] italic text-neutral-400">{bird.sciName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(bird.id)}
                      className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-700 ml-3 shrink-0"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Raw API info */}
          <div className="border border-neutral-200 p-3">
            <p className="text-[10px] uppercase tracking-widest text-neutral-400 mb-1">route</p>
            <code className="text-[10px] text-neutral-600 break-all">
              {usingDirectKey
                ? "GET api.ebird.org/v2/ref/taxon/find?q={query}&maxResults=12 (direct)"
                : "GET /api/birds/search?q={query} (proxy)"}
            </code>
            <p className="mt-2 text-[10px] uppercase tracking-widest text-neutral-400 mb-1">last response</p>
            <code className="text-[10px] text-neutral-600 break-all">
              {results.length > 0
                ? `${results.length} result${results.length !== 1 ? "s" : ""} — ${results.map((r) => r.id).join(", ")}`
                : "—"}
            </code>
          </div>

        </main>
      </div>
    </div>
  );
}
