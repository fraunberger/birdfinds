"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

interface AccountMenuProps {
  commentNotifications?: Array<{
    id: string;
    statusId: string;
    fromUsername: string;
    content: string;
    createdAt: string;
    statusDate?: string;
  }>;
  pileHref: string;
  username: string;
  avatarUrl?: string;
  isAdmin?: boolean;
  reportCount?: number;
  commentCount?: number;
}

export function AccountMenu({
  pileHref,
  username,
  avatarUrl,
  isAdmin = false,
  reportCount = 0,
  commentCount = 0,
  commentNotifications = [],
}: AccountMenuProps) {
  void username;
  void avatarUrl;
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);

  useEffect(() => {
    if (!open) {
      setCommentsOpen(false);
      setShowAllComments(false);
    }
  }, [open]);
  const totalBadgeCount = (isAdmin ? reportCount : 0) + commentCount;
  const badgeClass = isAdmin && reportCount > 0 ? "bg-red-600" : "bg-neutral-800";

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
      {totalBadgeCount > 0 && (
        <span className={`absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full text-white text-[9px] leading-[14px] text-center font-bold ${badgeClass}`}>
          {totalBadgeCount > 99 ? "99+" : totalBadgeCount}
        </span>
      )}

      {open && (
        <div className="absolute right-0 mt-2 w-56 border border-neutral-300 bg-white shadow-sm z-50">
          <Link
            href={pileHref}
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("birdfinds:notifications-seen"));
              }
              setOpen(false);
            }}
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
          <div className="border-t border-neutral-200">
            <button
              onClick={() => setCommentsOpen((prev) => !prev)}
              className={`flex w-full items-center justify-between px-3 py-2 text-[10px] uppercase tracking-widest hover:bg-neutral-100 ${
                commentCount > 0
                  ? "bg-green-50 text-green-700"
                  : "text-neutral-700"
              }`}
            >
              <span>Comments {commentCount > 0 ? `(${commentCount})` : ""}</span>
              <span className="text-neutral-400 text-[11px]">{commentsOpen ? "▴" : "▾"}</span>
            </button>
            {commentsOpen && commentNotifications.length > 0 && (
              <>
                {(showAllComments ? commentNotifications : commentNotifications.slice(0, 2)).map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(
                          new CustomEvent("birdfinds:open-comment-notification", {
                            detail: { notificationId: notification.id, statusId: notification.statusId },
                          }),
                        );
                      }
                      setOpen(false);
                      if (pathname !== "/") router.push("/");
                    }}
                    className="block w-full text-left px-3 py-2 border-t border-neutral-100 hover:bg-neutral-100"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-widest text-neutral-700 truncate">
                        {notification.fromUsername}
                      </div>
                      {notification.statusDate && (
                        <div className="text-[9px] text-neutral-400 shrink-0 normal-case tracking-normal">
                          {notification.statusDate}
                        </div>
                      )}
                    </div>
                    {notification.content && (
                      <div className="mt-0.5 text-[10px] text-neutral-500 truncate normal-case tracking-normal">
                        {notification.content.length > 55 ? `${notification.content.slice(0, 55)}…` : notification.content}
                      </div>
                    )}
                  </button>
                ))}
                {!showAllComments && commentNotifications.length > 2 && (
                  <button
                    onClick={() => setShowAllComments(true)}
                    className="block w-full text-left px-3 py-2 border-t border-neutral-100 text-[10px] uppercase tracking-widest text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                  >
                    View {commentNotifications.length - 2} more
                  </button>
                )}
              </>
            )}
            {commentsOpen && commentNotifications.length === 0 && (
              <div className="px-3 py-2 border-t border-neutral-100 text-[10px] text-neutral-400 normal-case tracking-normal">
                No comments yet
              </div>
            )}
          </div>
          <Link
            href="/settings/profile-setup"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
          >
            Profile Setup
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
          <a
            href="https://birdpile.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
          >
            Visit the Birdpile
          </a>
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
