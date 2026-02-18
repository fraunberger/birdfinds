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
  reportCount?: number;
}

export function AccountMenu({ pileHref, username, avatarUrl, isAdmin = false, reportCount = 0 }: AccountMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Open account menu"
        title="Menu"
        className="w-8 h-8 border border-neutral-300 rounded-full flex items-center justify-center text-neutral-700 hover:bg-neutral-100 transition-colors"
      >
        <div className="flex flex-col items-center gap-0.5">
          <span className="w-3 h-[1px] bg-current" />
          <span className="w-3 h-[1px] bg-current" />
          <span className="w-3 h-[1px] bg-current" />
        </div>
      </button>
      {isAdmin && reportCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-red-600 text-white text-[9px] leading-[14px] text-center font-bold">
          {reportCount > 9 ? "9+" : reportCount}
        </span>
      )}

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
