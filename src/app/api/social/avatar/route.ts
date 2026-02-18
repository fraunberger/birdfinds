import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";

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

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (!linkedUserId) return NextResponse.json({ error: "No linked user" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const contentType = typeof body?.contentType === "string" ? body.contentType.trim().toLowerCase() : "";
    if (!contentType.startsWith("image/") || !mimeExtMap[contentType]) {
      return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
    }
    const fileExt = mimeExtMap[contentType] || "jpg";
    const filePath = `${linkedUserId}/avatar-${Date.now()}.${fileExt}`;
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUploadUrl(filePath);

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
