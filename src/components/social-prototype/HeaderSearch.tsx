"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { buildItemPath, getCanonicalItemSlug, hasItemAggregatePage } from "@/lib/social-prototype/items";

interface UserHit {
  id: string;
  username: string;
  score?: number;
}

interface RawItemHit {
  category: string;
  title: string;
  subtitle?: string | null;
}

interface ItemHit {
  key: string;
  category: string;
  displayTitle: string;
  title: string;
  subtitle?: string;
  count: number;
  score?: number;
}


const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const levenshtein = (a: string, b: string) => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let r = 0; r < rows; r += 1) matrix[r][0] = r;
  for (let c = 0; c < cols; c += 1) matrix[0][c] = c;
  for (let r = 1; r < rows; r += 1) {
    for (let c = 1; c < cols; c += 1) {
      const cost = a[r - 1] === b[c - 1] ? 0 : 1;
      matrix[r][c] = Math.min(
        matrix[r - 1][c] + 1,
        matrix[r][c - 1] + 1,
        matrix[r - 1][c - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
};

const fuzzyScore = (text: string, query: string) => {
  const haystack = normalize(text);
  const needle = normalize(query);
  if (!haystack || !needle) return 0;
  if (haystack === needle) return 120;
  if (haystack.startsWith(needle)) return 100;
  if (haystack.includes(needle)) return 80;

  const tokens = haystack.split(" ").filter(Boolean);
  if (tokens.some((token) => token.startsWith(needle))) return 70;

  let best = 0;
  for (const token of tokens) {
    const distance = levenshtein(token, needle);
    const maxLen = Math.max(token.length, needle.length) || 1;
    const similarity = 1 - distance / maxLen;
    if (similarity > best) best = similarity;
  }
  return best >= 0.72 ? Math.round(best * 60) : 0;
};

export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"all" | "users" | "items">("all");
  const [users, setUsers] = useState<UserHit[]>([]);
  const [items, setItems] = useState<ItemHit[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setUsers([]);
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const [userRes, itemRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("id,username")
          .limit(120),
        supabase
          .from("social_items")
          .select("category,title,subtitle")
          .limit(300),
      ]);

      if (cancelled) return;

      const userHits = ((userRes.data || []) as UserHit[])
        .map((candidate) => ({ ...candidate, score: fuzzyScore(candidate.username, q) }))
        .filter((candidate) => (candidate.score || 0) >= 45)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 8);
      const rawItems = (itemRes.data || []) as RawItemHit[];

      const deduped = new Map<string, ItemHit>();
      rawItems
        .filter((row) => hasItemAggregatePage(row.category))
        .forEach((row) => {
          const canonicalSlug = getCanonicalItemSlug(row.category, row.title, row.subtitle || undefined);
          const key = `${row.category}:${canonicalSlug}`;
          const existing = deduped.get(key);
          if (existing) {
            existing.count += 1;
            return;
          }
          const score = Math.max(
            fuzzyScore(row.title || "", q),
            fuzzyScore(row.subtitle || "", q),
            fuzzyScore(`${row.title || ""} ${row.subtitle || ""}`.trim(), q)
          );
          if (score < 35) return;

          deduped.set(key, {
            key,
            category: row.category,
            displayTitle:
              row.category === "podcast" || row.category === "beer" || row.category === "brewery"
                ? (row.subtitle || row.title)
                : row.title,
            title: row.title,
            subtitle: row.subtitle || undefined,
            count: 1,
            score,
          });
        });

      setUsers(userHits);
      setItems(
        Array.from(deduped.values())
          .sort((a, b) => (b.score || 0) - (a.score || 0) || b.count - a.count)
          .slice(0, 8)
      );
      setLoading(false);
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const hasResults = useMemo(() => users.length > 0 || items.length > 0, [users, items]);
  const showUsers = tab === "all" || tab === "users";
  const showItems = tab === "all" || tab === "items";

  return (
    <div ref={wrapperRef} className="relative">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="h-7 w-7 inline-flex items-center justify-center border border-neutral-300 text-neutral-500 hover:text-neutral-800 hover:border-neutral-500 transition-colors"
          title="Search users and items"
        >
          <Search size={13} />
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users + items..."
              className="w-52 sm:w-64 pl-7 pr-2 py-1.5 text-xs border border-neutral-300 outline-none focus:border-neutral-600 bg-white"
            />
          </div>
          <button
            onClick={() => { setOpen(false); setQuery(""); }}
            className="text-[10px] uppercase tracking-widest text-neutral-400 hover:text-neutral-700"
          >
            close
          </button>
        </div>
      )}

      {open && query.trim().length >= 2 && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[90vw] border border-neutral-300 bg-white shadow-sm z-30">
          <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 flex items-center justify-between">
            <span>Search</span>
            <div className="flex items-center border border-neutral-200">
              {(["all", "users", "items"] as const).map((candidate) => (
                <button
                  key={candidate}
                  onClick={() => setTab(candidate)}
                  className={`px-2 py-1 text-[9px] uppercase tracking-widest border-l first:border-l-0 ${tab === candidate ? "bg-neutral-800 text-white border-neutral-800" : "text-neutral-500 hover:bg-neutral-100 border-neutral-200"}`}
                >
                  {candidate}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div className="px-3 py-3 text-[10px] uppercase tracking-widest text-neutral-400">
              Searching...
            </div>
          )}

          {!loading && !hasResults && (
            <div className="px-3 py-3 text-[10px] uppercase tracking-widest text-neutral-400">
              No matches
            </div>
          )}

          {!loading && showUsers && users.length > 0 && (
            <div className="border-b border-neutral-200">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-neutral-400">Users</div>
              {users.map((u) => (
                <Link
                  key={u.id}
                  href={`/pile/${encodeURIComponent(u.username)}`}
                  onClick={() => { setOpen(false); setQuery(""); }}
                  className="block px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-100"
                >
                  {u.username}
                </Link>
              ))}
            </div>
          )}

          {!loading && showItems && items.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-neutral-400">Items</div>
              {items.map((item) => (
                <Link
                  key={item.key}
                  href={buildItemPath({
                    category: item.category,
                    title: item.title,
                    subtitle: item.subtitle,
                  })}
                  onClick={() => { setOpen(false); setQuery(""); }}
                  className="block px-3 py-2 hover:bg-neutral-100"
                >
                  <div className="text-xs text-neutral-800">{item.displayTitle}</div>
                  <div className="text-[10px] uppercase tracking-widest text-neutral-400">
                    {item.category} {item.count > 1 ? `• ${item.count} ratings` : ""}
                  </div>
                </Link>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
