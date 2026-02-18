"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useUserProfile } from "@/lib/social-prototype/store";
import { HeaderSearch } from "@/components/social-prototype/HeaderSearch";
import { AccountMenu } from "@/components/social-prototype/AccountMenu";
import { pushToast } from "@/lib/social-prototype/toast";

interface ModerationReport {
  id: string;
  createdAt: string;
  reason: string | null;
  reporter: string;
  targetType: "status" | "comment";
  targetId: string;
  target: {
    content: string;
    username: string;
    createdAt: string;
    isHidden: boolean;
    statusId?: string;
    commentId?: string;
  } | null;
}

export default function ModerationPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { profile, isAdmin } = useUserProfile();
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [fetching, setFetching] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setFetching(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("/api/social/reports", { cache: "no-store", signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load reports");
      }
      setReports(payload.reports || []);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        pushToast({ message: error instanceof Error ? error.message : "Failed to load reports", tone: "error" });
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (!options?.silent) setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !isAdmin) return;
    void reload();
  }, [user?.id, isAdmin, reload]);

  useEffect(() => {
    if (!user?.id || !isAdmin) return;
    const intervalId = window.setInterval(() => {
      void reload({ silent: true });
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [user?.id, isAdmin, reload]);

  const resolveReport = async (reportId: string) => {
    setActingId(reportId);
    try {
      const response = await fetch(`/api/social/reports?id=${encodeURIComponent(reportId)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Failed to resolve report");
      setReports((prev) => prev.filter((report) => report.id !== reportId));
      pushToast({ message: "Report resolved.", tone: "success" });
    } catch (error) {
      pushToast({ message: error instanceof Error ? error.message : "Failed to resolve report", tone: "error" });
    } finally {
      setActingId(null);
    }
  };

  const hideTarget = async (report: ModerationReport) => {
    if (!report.target) return;
    setActingId(report.id);
    try {
      const action =
        report.targetType === "status" ? "social.status.soft_delete" : "social.comment.soft_delete";
      const payload =
        report.targetType === "status"
          ? { statusId: report.target.statusId || report.targetId, reason: "Hidden by admin from moderation" }
          : { commentId: report.target.commentId || report.targetId, reason: "Hidden by admin from moderation" };

      const response = await fetch("/api/social/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Failed to hide target");
      pushToast({ message: "Hidden from feed.", tone: "success" });
      await reload();
    } catch (error) {
      pushToast({ message: error instanceof Error ? error.message : "Failed to hide target", tone: "error" });
    } finally {
      setActingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white font-mono text-neutral-900 flex items-center justify-center">
        <div className="text-neutral-400 text-xs uppercase tracking-widest">Loading...</div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-white font-mono text-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-neutral-400 mb-3">Admin only</p>
          <Link href="/" className="text-xs uppercase tracking-widest text-neutral-600 hover:text-neutral-900">
            Return to feed
          </Link>
        </div>
      </div>
    );
  }

  const username = profile?.username || user.username || user.email?.split("@")[0] || "Account";
  const pileHref = profile?.username
    ? `/pile/${encodeURIComponent(profile.username)}`
    : profile?.id
      ? `/pile/${encodeURIComponent(profile.id)}`
      : "/settings";

  return (
    <div className="min-h-screen bg-white font-mono text-neutral-900">
      <div className="max-w-2xl mx-auto p-3 sm:p-6 pb-24 sm:pb-8">
        <header className="mb-4 sm:mb-8 border-b border-neutral-300 pb-3 sm:pb-4 flex items-center justify-between">
          <Link href="/" className="relative w-14 h-9 block hover:opacity-80 transition-opacity">
            <Image src="/logo.svg" alt="BirdFinds" fill className="object-contain" priority />
          </Link>
          <div className="flex items-center gap-3">
            <HeaderSearch />
            <AccountMenu
              pileHref={pileHref}
              username={username}
              avatarUrl={profile?.avatarUrl}
              isAdmin
            />
          </div>
        </header>

        <main>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xs uppercase tracking-widest text-neutral-600">Moderation Queue</h1>
            <button
              onClick={() => void reload()}
              className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
            >
              Refresh
            </button>
          </div>

          {fetching && (
            <div className="border border-neutral-200 bg-neutral-50 px-3 py-4 text-[10px] uppercase tracking-widest text-neutral-400">
              Loading reports...
            </div>
          )}

          {!fetching && reports.length === 0 && (
            <div className="border border-dashed border-neutral-300 px-3 py-6 text-[10px] uppercase tracking-widest text-neutral-400 text-center">
              No open reports
            </div>
          )}

          <div className="space-y-3">
            {reports.map((report) => (
              <div key={report.id} className="border border-neutral-300 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-neutral-500">
                      {report.targetType} reported by {report.reporter}
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-1">
                      {new Date(report.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-widest px-2 py-1 border border-neutral-200 text-neutral-500">
                    {report.target?.isHidden ? "Hidden" : "Visible"}
                  </div>
                </div>

                {report.reason && (
                  <div className="mt-2 text-xs border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-neutral-700">
                    Reason: {report.reason}
                  </div>
                )}

                <div className="mt-2 border border-neutral-200 p-2">
                  {report.target ? (
                    <>
                      <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">
                        Author: {report.target.username}
                      </div>
                      <p className="text-xs whitespace-pre-wrap text-neutral-800">{report.target.content}</p>
                    </>
                  ) : (
                    <div className="text-[10px] uppercase tracking-widest text-neutral-400">
                      Target no longer exists.
                    </div>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  {!report.target?.isHidden && report.target && (
                    <button
                      onClick={() => void hideTarget(report)}
                      disabled={actingId === report.id}
                      className="text-[10px] uppercase tracking-widest border border-red-200 text-red-600 px-2 py-1 hover:bg-red-50 disabled:opacity-50"
                    >
                      Hide {report.targetType}
                    </button>
                  )}
                  <button
                    onClick={() => void resolveReport(report.id)}
                    disabled={actingId === report.id}
                    className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 hover:bg-neutral-100 disabled:opacity-50"
                  >
                    Resolve
                  </button>
                  {report.target?.statusId && (
                    <button
                      onClick={() => router.push(`/pile/${encodeURIComponent(report.target?.username || "")}`)}
                      className="text-[10px] uppercase tracking-widest border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
                    >
                      View Pile
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
