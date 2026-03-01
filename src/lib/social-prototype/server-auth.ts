import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

interface ClerkLinkRow {
  clerk_user_id: string;
  supabase_user_id: string;
}

interface UserProfileRow {
  id: string;
  username: string;
}

const SOCIAL_AUTH_DEBUG = process.env.SOCIAL_AUTH_DEBUG === "1";
const logAuthDebug = (message: string, meta?: Record<string, unknown>) => {
  if (!SOCIAL_AUTH_DEBUG) return;
  console.info("[server-auth]", { message, ...(meta || {}) });
};

const usernameFromEmail = (email?: string | null) => {
  if (!email) return null;
  const local = email.split("@")[0]?.trim();
  return local || null;
};

const normalizeHandle = (value?: string | null) =>
  (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function getClerkUserIdentity(clerkUserId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const primaryEmail =
    user.primaryEmailAddress?.emailAddress
    ?? user.emailAddresses?.[0]?.emailAddress
    ?? null;
  return {
    username: user.username || null,
    email: primaryEmail,
  };
}

async function createSupabaseAuthUser(email: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user?.id) {
    throw error || new Error("Failed to create Supabase auth user");
  }
  return data.user.id;
}

async function buildUniqueUsername(base: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const cleanBase = (base || "user").trim().toLowerCase().replace(/\s+/g, "_");
  let candidate = cleanBase;
  let suffix = 1;
  while (true) {
    const { data } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("username", candidate)
      .limit(1)
      .maybeSingle();
    if (!data) return candidate;
    candidate = `${cleanBase}_${suffix}`;
    suffix += 1;
  }
}

async function findProfileByNormalizedUsername(candidates: string[]) {
  const normalizedCandidates = Array.from(
    new Set(candidates.map((c) => normalizeHandle(c)).filter(Boolean))
  );
  if (normalizedCandidates.length === 0) return null;

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc(
    "find_profile_by_normalized_username",
    { candidates: normalizedCandidates }
  );
  if (error || !data || (data as UserProfileRow[]).length === 0) return null;
  return (data as UserProfileRow[])[0];
}

async function ensureProfileForUser(userId: string, username: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: existing } = await supabaseAdmin
    .from("user_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existing?.id) return;

  const uniqueUsername = await buildUniqueUsername(username);
  const { error } = await supabaseAdmin
    .from("user_profiles")
    .upsert(
      { id: userId, username: uniqueUsername, categories: [], category_configs: {} },
      { onConflict: "id", ignoreDuplicates: true }
    );
  // If a concurrent request already created the profile, ignore the conflict
  if (error && error.code !== "23505") throw error;
}

async function findSupabaseAuthUserIdByEmail(email: string): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc(
    "find_auth_user_by_email",
    { target_email: email }
  );
  if (error) {
    console.warn("[server-auth] find_auth_user_by_email RPC failed:", error.message);
    return null;
  }
  return (data as string) || null;
}

const isSupabaseLinkUniqueConflict = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return (
    code === "23505"
    && (message.includes("clerk_user_links_supabase_user_id_key") || message.includes("duplicate key value"))
  );
};

export async function getOrCreateLinkedSupabaseUser() {
  const startedAt = Date.now();
  const supabaseAdmin = getSupabaseAdmin();
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const { data: existingLink } = await supabaseAdmin
    .from("clerk_user_links")
    .select("clerk_user_id, supabase_user_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle<ClerkLinkRow>();

  if (existingLink?.supabase_user_id) {
    logAuthDebug("existing link found", {
      clerkUserId,
      supabaseUserId: existingLink.supabase_user_id,
      durationMs: Date.now() - startedAt,
    });
    return existingLink.supabase_user_id;
  }

  const { username: clerkUsername, email } = await getClerkUserIdentity(clerkUserId);
  const candidates = [clerkUsername, usernameFromEmail(email)].filter(Boolean) as string[];
  logAuthDebug("no existing link; resolving identity", {
    clerkUserId,
    clerkUsername: clerkUsername || null,
    hasEmail: Boolean(email),
    candidates,
  });

  let matchedProfile: UserProfileRow | null = null;
  if (candidates.length > 0) {
    const { data } = await supabaseAdmin
      .from("user_profiles")
      .select("id, username")
      .in("username", candidates)
      .limit(1)
      .maybeSingle<UserProfileRow>();
    matchedProfile = data || null;
  }

  if (!matchedProfile) {
    matchedProfile = await findProfileByNormalizedUsername(candidates);
  }

  let supabaseUserId = matchedProfile?.id || null;
  const resolvedUsername = matchedProfile?.username || clerkUsername || usernameFromEmail(email) || `user-${clerkUserId.slice(0, 8)}`;
  const targetEmail = email || null;

  if (!supabaseUserId) {
    try {
      supabaseUserId = await createSupabaseAuthUser(
        targetEmail || `clerk_${clerkUserId}@users.birdfinds.local`
      );
      logAuthDebug("created supabase auth user", {
        clerkUserId,
        supabaseUserId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("already been registered")) {
        supabaseUserId = await findSupabaseAuthUserIdByEmail(
          targetEmail || `clerk_${clerkUserId}@users.birdfinds.local`
        );
        logAuthDebug("resolved supabase auth user by email fallback", {
          clerkUserId,
          supabaseUserId: supabaseUserId || null,
        });
      }
      if (!supabaseUserId) throw error;
    }
  } else {
    logAuthDebug("matched existing profile for linking", {
      clerkUserId,
      supabaseUserId,
      matchedUsername: matchedProfile?.username || null,
    });
  }

  await ensureProfileForUser(supabaseUserId, resolvedUsername);

  const { error: linkError } = await supabaseAdmin
    .from("clerk_user_links")
    .upsert(
      { clerk_user_id: clerkUserId, supabase_user_id: supabaseUserId },
      { onConflict: "clerk_user_id" }
    );
  if (linkError) {
    if (!isSupabaseLinkUniqueConflict(linkError)) throw linkError;

    // supabase_user_id unique constraint violated: another Clerk user already
    // claims this Supabase user. Check if it is actually our own link.
    const { data: existingBySupabase } = await supabaseAdmin
      .from("clerk_user_links")
      .select("clerk_user_id")
      .eq("supabase_user_id", supabaseUserId)
      .maybeSingle();

    if (existingBySupabase?.clerk_user_id === clerkUserId) {
      // Already correctly linked, nothing to do.
      logAuthDebug("link already present on supabase unique key check", {
        clerkUserId,
        supabaseUserId,
        durationMs: Date.now() - startedAt,
      });
      return supabaseUserId;
    }

    console.error(
      `[server-auth] clerk_user_links conflict: Clerk user ${clerkUserId} ` +
      `tried to claim Supabase user ${supabaseUserId}, but it belongs to ` +
      `Clerk user ${existingBySupabase?.clerk_user_id}`
    );
    throw new Error("User linking conflict: Supabase user already linked to another account");
  }

  logAuthDebug("created clerk->supabase link", {
    clerkUserId,
    supabaseUserId,
    durationMs: Date.now() - startedAt,
  });
  return supabaseUserId;
}
