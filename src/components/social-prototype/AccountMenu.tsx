"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

interface AccountMenuProps {
  pileHref: string;
  username: string;
  avatarUrl?: string;
  isAdmin?: boolean;
}

export function AccountMenu({ pileHref, username, avatarUrl, isAdmin = false }: AccountMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 hover:opacity-70 transition-opacity"
      >
        <div className="w-6 h-6 rounded-full bg-neutral-200 overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400 text-[10px] font-bold">
              {username[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <span className="text-xs uppercase tracking-widest text-neutral-500">{username}</span>
        <span className="text-[10px] text-neutral-400">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-40 border border-neutral-300 bg-white shadow-sm z-20">
          <Link
            href={pileHref}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100"
          >
            My Pile
          </Link>
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
          >
            Feed
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
          >
            Settings
          </Link>
          {isAdmin && (
            <Link
              href="/moderation"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
            >
              Moderation
            </Link>
          )}
          <button
            onClick={() => {
              setOpen(false);
              if (typeof window !== "undefined") {
                window.sessionStorage.setItem("birdfinds:open-about", "1");
                window.dispatchEvent(new Event("birdfinds:open-about"));
              }
              if (pathname !== "/") {
                router.push("/");
              }
            }}
            className="block w-full text-left px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
          >
            About Birdfinds
          </button>
          <button
            onClick={async () => {
              await signOut();
              setOpen(false);
              router.push("/");
              router.refresh();
            }}
            className="block w-full text-left px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
