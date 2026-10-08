import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";
import { PEAK_BY_ID } from "@/components/four-thousand-footers/peaks";
import { isValidDate, parseLog, type Ascent } from "@/components/four-thousand-footers/log";

/**
 * The signed-in hiker's NH 4000-footer log (table `nh48_ascents`, see
 * data/sql/create_nh48_ascents.sql).
 *
 * GET              -> { ascents: Ascent[] }
 * POST   { ascents }               adds ascents; ids already saved are left alone
 * PATCH  { id, date, notes }       changes one ascent
 * DELETE ?id=... | ?peakId=...     removes one ascent, or every ascent of a peak
 */

const TABLE = "nh48_ascents";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_BATCH = 2_000;
const MAX_NOTES = 2_000;
const MAX_ID = 100;

type Row = { id: string; peak_id: string; climbed_on: string; notes: string };

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** The Supabase user id behind the signed-in Clerk user, or an error response. */
async function currentUser(): Promise<string | NextResponse> {
  const { userId } = await auth();
  if (!userId) return json({ error: "Sign in to save your log." }, 401);
  try {
    const linked = await getOrCreateLinkedSupabaseUser();
    return linked ?? json({ error: "No account found for this sign-in." }, 403);
  } catch (error) {
    console.error("[nh48/ascents] linking user failed", error);
    return json({ error: "Couldn't look up your account." }, 500);
  }
}

async function readBody(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("too large");
  return JSON.parse(text);
}

const toRow = (userId: string, a: Ascent) => ({
  user_id: userId,
  id: a.id,
  peak_id: a.peakId,
  climbed_on: a.date,
  notes: a.notes.slice(0, MAX_NOTES),
});

export async function GET() {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id, peak_id, climbed_on, notes")
    .eq("user_id", userId)
    .order("climbed_on", { ascending: true });
  if (error) {
    console.error("[nh48/ascents] read failed", error);
    return json({ error: "Couldn't load your log." }, 500);
  }
  const rows = (data ?? []) as Row[];
  const log = parseLog(rows.map((r) => ({ id: r.id, peakId: r.peak_id, date: r.climbed_on, notes: r.notes })));
  return json({ ascents: log.ascents });
}

export async function POST(req: NextRequest) {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return json({ error: "Expected JSON." }, 400);
  }
  // parseLog drops anything that isn't a real peak on a real date.
  const ascents = parseLog(body).ascents.filter((a) => a.id.length <= MAX_ID);
  if (ascents.length > MAX_BATCH) return json({ error: "Too many ascents at once." }, 413);
  if (ascents.length === 0) return json({ added: 0 });
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      ascents.map((a) => toRow(userId, a)),
      { onConflict: "user_id,id", ignoreDuplicates: true }
    );
  if (error) {
    console.error("[nh48/ascents] add failed", error);
    return json({ error: "Couldn't save those ascents." }, 500);
  }
  return json({ added: ascents.length });
}

export async function PATCH(req: NextRequest) {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  let body: Record<string, unknown>;
  try {
    const parsed = await readBody(req);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Expected JSON." }, 400);
  }
  const { id, date, notes } = body;
  if (typeof id !== "string" || !id) return json({ error: "Missing id." }, 400);
  const change: { climbed_on?: string; notes?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (date !== undefined) {
    if (typeof date !== "string" || !isValidDate(date)) return json({ error: "Not a date." }, 400);
    change.climbed_on = date;
  }
  if (notes !== undefined) {
    if (typeof notes !== "string") return json({ error: "Notes must be text." }, 400);
    change.notes = notes.slice(0, MAX_NOTES);
  }
  const { error } = await getSupabaseAdmin().from(TABLE).update(change).eq("user_id", userId).eq("id", id);
  if (error) {
    console.error("[nh48/ascents] update failed", error);
    return json({ error: "Couldn't save that change." }, 500);
  }
  return json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const id = req.nextUrl.searchParams.get("id");
  const peakId = req.nextUrl.searchParams.get("peakId");
  let query = getSupabaseAdmin().from(TABLE).delete().eq("user_id", userId);
  if (id) query = query.eq("id", id);
  else if (peakId && PEAK_BY_ID.has(peakId)) query = query.eq("peak_id", peakId);
  else return json({ error: "Say which ascent or peak to remove." }, 400);
  const { error } = await query;
  if (error) {
    console.error("[nh48/ascents] delete failed", error);
    return json({ error: "Couldn't remove that." }, 500);
  }
  return json({ ok: true });
}
