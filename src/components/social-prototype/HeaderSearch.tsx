"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { buildItemPath, getCanonicalItemSlug, hasItemAggregatePage } from "@/lib/social-prototype/items";

interface UserHit {
  id: string;
  username: string;
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
}

interface RawPostHit {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface PostHit {
  id: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}

export function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"all" | "users" | "items" | "posts">("all");
  const [users, setUsers] = useState<UserHit[]>([]);
  const [items, setItems] = useState<ItemHit[]>([]);
  const [posts, setPosts] = useState<PostHit[]>([]);
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
      setPosts([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const [userRes, itemRes, postRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("id,username")
          .ilike("username", `%${q}%`)
          .limit(5),
        supabase
          .from("social_items")
          .select("category,title,subtitle")
          .ilike("title", `%${q}%`)
          .limit(60),
        supabase
          .from("social_statuses")
          .select("id,user_id,content,created_at")
          .eq("published", true)
          .ilike("content", `%${q}%`)
          .limit(12),
      ]);

      if (cancelled) return;

      const userHits = (userRes.data || []) as UserHit[];
      const rawItems = (itemRes.data || []) as RawItemHit[];
      const rawPosts = (postRes.data || []) as RawPostHit[];

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
          });
        });

      const uniqueUserIds = Array.from(new Set(rawPosts.map((post) => post.user_id).filter(Boolean)));
      let userLookup = new Map<string, string>();
      if (uniqueUserIds.length > 0) {
        const profileRes = await supabase
          .from("user_profiles")
          .select("id,username")
          .in("id", uniqueUserIds);
        userLookup = new Map(
          ((profileRes.data || []) as UserHit[]).map((profile) => [profile.id, profile.username])
        );
      }

      const postHits: PostHit[] = rawPosts
        .filter((post) => post.content?.trim())
        .map((post) => ({
          id: post.id,
          userId: post.user_id,
          username: userLookup.get(post.user_id) || "Unknown",
          content: post.content.trim(),
          createdAt: post.created_at,
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6);

      setUsers(userHits);
      setItems(Array.from(deduped.values()).sort((a, b) => b.count - a.count).slice(0, 8));
      setPosts(postHits);
      setLoading(false);
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const hasResults = useMemo(() => users.length > 0 || items.length > 0 || posts.length > 0, [users, items, posts]);
  const showUsers = tab === "all" || tab === "users";
  const showItems = tab === "all" || tab === "items";
  const showPosts = tab === "all" || tab === "posts";

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
              {(["all", "users", "items", "posts"] as const).map((candidate) => (
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

          {!loading && showPosts && posts.length > 0 && (
            <div className="border-t border-neutral-200">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-neutral-400">Posts</div>
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/pile/${encodeURIComponent(post.username)}`}
                  onClick={() => { setOpen(false); setQuery(""); }}
                  className="block px-3 py-2 hover:bg-neutral-100"
                >
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">{post.username}</div>
                  <div className="text-xs text-neutral-700 max-h-10 overflow-hidden">{post.content}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
