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
  const { data } = await supabaseAdmin
    .from("user_profiles")
    .select("id,username")
    .limit(2000);

  const profiles = (data || []) as UserProfileRow[];
  for (const profile of profiles) {
    const normalizedProfile = normalizeHandle(profile.username);
    if (normalizedCandidates.includes(normalizedProfile)) {
      return profile;
    }
  }
  return null;
}

async function ensureProfileForUser(userId: string, username: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: existing } = await supabaseAdmin
    .from("user_profiles")
    .select("id,username")
    .eq("id", userId)
    .maybeSingle();
  if (existing?.id) return;

  const uniqueUsername = await buildUniqueUsername(username);
  const { error } = await supabaseAdmin
    .from("user_profiles")
    .upsert({
      id: userId,
      username: uniqueUsername,
      categories: [],
      category_configs: {},
    });
  if (error) throw error;
}

async function findSupabaseAuthUserIdByEmail(email: string) {
  const supabaseAdmin = getSupabaseAdmin();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match?.id) return match.id;
    if (users.length < perPage) break;
    page += 1;
  }

  return null;
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
  const supabaseAdmin = getSupabaseAdmin();
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const { data: existingLink } = await supabaseAdmin
    .from("clerk_user_links")
    .select("clerk_user_id, supabase_user_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle<ClerkLinkRow>();

  if (existingLink?.supabase_user_id) {
    return existingLink.supabase_user_id;
  }

  const { username: clerkUsername, email } = await getClerkUserIdentity(clerkUserId);
  const candidates = [clerkUsername, usernameFromEmail(email)].filter(Boolean) as string[];

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
    // In migration mode, avoid silently creating shadow accounts.
    if (!targetEmail && process.env.NODE_ENV === "production") {
      throw new Error(
        `No linked profile for Clerk user ${clerkUserId}. Add row to clerk_user_links in Supabase.`
      );
    }
    try {
      supabaseUserId = await createSupabaseAuthUser(
        targetEmail || `clerk_${clerkUserId}@users.birdfinds.local`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("already been registered")) {
        supabaseUserId = await findSupabaseAuthUserIdByEmail(
          targetEmail || `clerk_${clerkUserId}@users.birdfinds.local`
        );
      }
      if (!supabaseUserId) throw error;
    }
  }

  await ensureProfileForUser(supabaseUserId, resolvedUsername);

  const { error: linkError } = await supabaseAdmin
    .from("clerk_user_links")
    .upsert({
      clerk_user_id: clerkUserId,
      supabase_user_id: supabaseUserId,
    });
  if (linkError) {
    if (!isSupabaseLinkUniqueConflict(linkError)) throw linkError;
    const { error: relinkError } = await supabaseAdmin
      .from("clerk_user_links")
      .update({ clerk_user_id: clerkUserId })
      .eq("supabase_user_id", supabaseUserId);
    if (relinkError) throw relinkError;
  }

  return supabaseUserId;
}
