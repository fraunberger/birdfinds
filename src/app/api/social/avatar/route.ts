import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const mimeExtMap: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};

async function resolveAvatarOwnerId(clerkUserId: string): Promise<string> {
  try {
    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (linkedUserId) return linkedUserId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[avatar] link resolution failed, using clerk fallback owner:", message);
  }
  return `clerk-${clerkUserId}`;
}

async function ensureAvatarsBucket() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: bucket } = await supabaseAdmin.storage.getBucket("avatars");
  if (bucket) return;
  const { error: createError } = await supabaseAdmin.storage.createBucket("avatars", {
    public: true,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: Object.keys(mimeExtMap),
  });
  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw createError;
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = rateLimit(`avatar:${userId}`, 10);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many uploads, please slow down" }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const contentType = typeof body?.contentType === "string" ? body.contentType.trim().toLowerCase() : "";
    if (!contentType.startsWith("image/") || !mimeExtMap[contentType]) {
      return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
    }

    const ownerId = await resolveAvatarOwnerId(userId);
    await ensureAvatarsBucket();

    const fileExt = mimeExtMap[contentType] || "jpg";
    const filePath = `${ownerId}/avatar-${Date.now()}.${fileExt}`;
    const supabaseAdmin = getSupabaseAdmin();

    let { data, error } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUploadUrl(filePath);

    // One retry after bucket ensure to reduce transient bootstrapping issues.
    if (error) {
      await ensureAvatarsBucket();
      const retry = await supabaseAdmin.storage.from("avatars").createSignedUploadUrl(filePath);
      data = retry.data;
      error = retry.error;
    }

    if (error || !data?.token) {
      return NextResponse.json(
        { error: `Failed to create signed upload: ${error?.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from("avatars").getPublicUrl(filePath);
    return NextResponse.json({
      path: filePath,
      token: data.token,
      publicUrl: publicUrlData.publicUrl,
      contentType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upload error";
    return NextResponse.json({ error: `Avatar route error: ${message}` }, { status: 500 });
  }
}
