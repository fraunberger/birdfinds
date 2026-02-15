"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

interface AccountMenuProps {
  pileHref: string;
  username: string;
  avatarUrl?: string;
}

export function AccountMenu({ pileHref, username, avatarUrl }: AccountMenuProps) {
  const router = useRouter();
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
            href="/settings"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
          >
            Settings
          </Link>
          <Link
            href="/#about-birdfinds"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
          >
            About Birdfinds
          </Link>
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
