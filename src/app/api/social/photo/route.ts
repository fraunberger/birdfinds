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
  "image/heic": "heic",
  "image/heif": "heif",
};

async function resolveOwnerId(): Promise<string> {
  try {
    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (linkedUserId) return linkedUserId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[photo] link resolution failed:", message);
  }
  throw new Error("Account link is still initializing. Please try again.");
}

async function ensurePhotosBucket() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: bucket } = await supabaseAdmin.storage.getBucket("photos");
  if (bucket) return;
  const { error: createError } = await supabaseAdmin.storage.createBucket("photos", {
    public: true,
    fileSizeLimit: 4 * 1024 * 1024, // 4 MB (photos are compressed client-side)
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

    const rl = rateLimit(`photo:${userId}`, 5);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many uploads, please slow down" }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const rawContentType = typeof body?.contentType === "string" ? body.contentType.trim().toLowerCase() : "";
    const contentType = rawContentType.split(";")[0].trim();
    if (!contentType || !mimeExtMap[contentType]) {
      return NextResponse.json(
        { error: `Unsupported image type. Allowed: ${Object.keys(mimeExtMap).join(", ")}` },
        { status: 400 }
      );
    }

    const ownerId = await resolveOwnerId();
    await ensurePhotosBucket();

    const fileExt = mimeExtMap[contentType] || "jpg";
    const filePath = `${ownerId}/photo-${Date.now()}.${fileExt}`;
    const supabaseAdmin = getSupabaseAdmin();

    let { data, error } = await supabaseAdmin.storage
      .from("photos")
      .createSignedUploadUrl(filePath);

    if (error) {
      await ensurePhotosBucket();
      const retry = await supabaseAdmin.storage.from("photos").createSignedUploadUrl(filePath);
      data = retry.data;
      error = retry.error;
    }

    if (error || !data?.token) {
      return NextResponse.json(
        { error: `Failed to create signed upload: ${error?.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from("photos").getPublicUrl(filePath);
    return NextResponse.json({
      path: filePath,
      token: data.token,
      publicUrl: publicUrlData.publicUrl,
      contentType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upload error";
    const lower = message.toLowerCase();
    const retryable = lower.includes("initializing") || lower.includes("link");
    return NextResponse.json({ error: `Photo route error: ${message}` }, { status: retryable ? 503 : 500 });
  }
}
