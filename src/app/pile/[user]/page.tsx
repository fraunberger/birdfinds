"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ProfilePage } from "@/components/social-prototype/ProfilePage";
import { AccountMenu } from "@/components/social-prototype/AccountMenu";
import { HeaderSearch } from "@/components/social-prototype/HeaderSearch";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useUserProfile } from "@/lib/social-prototype/store";

export default function PilePage({
  params: _params,
}: {
  params: { user: string };
}) {
  void _params;
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const routeParams = useParams<{ user: string }>();
  const routeUser = decodeURIComponent(routeParams?.user || "");
  const [resolvedUser, setResolvedUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!routeUser) return;
    let mounted = true;
    const run = async () => {
      setLoading(true);
      setNotFound(false);
      setResolvedUser(null);
      const user = routeUser;

      const byId = await supabase
        .from("user_profiles")
        .select("id, username")
        .eq("id", user)
        .limit(1);
      if (mounted && byId.data && byId.data.length > 0) {
        setResolvedUser(byId.data[0].id);
        setLoading(false);
        return;
      }

      const byName = await supabase
        .from("user_profiles")
        .select("id, username")
        .ilike("username", user)
        .limit(1);
      if (mounted && byName.data && byName.data.length > 0) {
        setResolvedUser(byName.data[0].id);
        setLoading(false);
        return;
      }

      if (mounted) {
        setNotFound(true);
        setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [routeUser]);

  const handleClickProfile = async (userId: string) => {
    const { data } = await supabase
      .from("user_profiles")
      .select("username")
      .eq("id", userId)
      .single();
    if (data?.username) {
      router.push(`/pile/${encodeURIComponent(data.username)}`);
      return;
    }
    router.push(`/pile/${encodeURIComponent(userId)}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white font-mono flex items-center justify-center">
        <div className="text-xs uppercase tracking-widest text-neutral-400">Loading pile...</div>
      </div>
    );
  }

  if (notFound || !resolvedUser) {
    return (
      <div className="min-h-screen bg-white font-mono flex items-center justify-center">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-neutral-400 mb-4">Pile not found</p>
          <Link href="/" className="text-xs uppercase tracking-widest text-neutral-600 hover:text-neutral-900">
            Return to feed
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-mono text-neutral-900">
      <div className="max-w-2xl mx-auto p-3 sm:p-6">
        <header className="mb-4 sm:mb-8 border-b border-neutral-300 pb-3 sm:pb-4 flex items-center justify-between">
          <Link href="/" className="relative w-14 h-9 block hover:opacity-80 transition-opacity">
            <Image src="/logo.svg" alt="BirdFinds" fill className="object-contain" priority />
          </Link>
          <div className="flex items-center gap-3">
            <HeaderSearch />
            {user && (
              <AccountMenu
                pileHref={`/pile/${encodeURIComponent(profile?.username || user.id)}`}
                username={profile?.username || user.username || user.email?.split("@")[0] || "Account"}
                avatarUrl={profile?.avatarUrl}
              />
            )}
          </div>
        </header>
        <ProfilePage
          userId={resolvedUser}
          onBack={() => router.push("/")}
          onClickProfile={handleClickProfile}
          onSettings={() => router.push("/settings")}
        />
      </div>
    </div>
  );
}
