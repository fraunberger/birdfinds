import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (!linkedUserId) return NextResponse.json({ error: "No linked user" }, { status: 400 });

    const form = await req.formData();
    const fileLike = form.get("file") as Blob | (Blob & { name?: string }) | null;
    if (!fileLike || typeof fileLike.arrayBuffer !== "function") {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const originalName = typeof (fileLike as { name?: string }).name === "string" ? (fileLike as { name?: string }).name! : "";
    const contentTypeRaw = typeof fileLike.type === "string" ? fileLike.type.trim() : "";
    const extFromName = originalName.includes(".") ? (originalName.split(".").pop() || "").toLowerCase() : "";
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
    const extMimeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      avif: "image/avif",
      heic: "image/heic",
      heif: "image/heif",
    };
    const inferredContentType = extMimeMap[extFromName] || "";
    const contentType = contentTypeRaw.startsWith("image/") ? contentTypeRaw : inferredContentType;
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
    }

    const maxUploadBytes = 6 * 1024 * 1024;
    const bytes = new Uint8Array(await fileLike.arrayBuffer());
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "Uploaded image was empty" }, { status: 400 });
    }
    if (bytes.byteLength > maxUploadBytes) {
      return NextResponse.json(
        { error: "Image is too large. Please upload an image under 6MB." },
        { status: 413 }
      );
    }

    const inferredExt = mimeExtMap[contentType] || "jpg";
    const fileExt = extFromName || inferredExt;
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${linkedUserId}/${fileName}`;
    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin.storage
      .from("avatars")
      .upload(filePath, bytes, {
        contentType,
        upsert: true,
      });
    if (error) {
      return NextResponse.json(
        { error: `Supabase storage upload failed: ${error.message}` },
        { status: 500 }
      );
    }

    const { data } = supabaseAdmin.storage.from("avatars").getPublicUrl(filePath);
    return NextResponse.json({ url: data.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown upload error";
    return NextResponse.json({ error: `Avatar route error: ${message}` }, { status: 500 });
  }
}
