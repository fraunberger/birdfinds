import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateLinkedSupabaseUser } from "@/lib/social-prototype/server-auth";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const linkedUserId = await getOrCreateLinkedSupabaseUser();
  if (!linkedUserId) return NextResponse.json({ error: "No linked user" }, { status: 400 });

  const form = await req.formData();
  const fileLike = form.get("file") as Blob | (Blob & { name?: string }) | null;
  if (!fileLike || typeof fileLike.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const contentType = typeof fileLike.type === "string" && fileLike.type ? fileLike.type : "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
  }

  const originalName = typeof (fileLike as { name?: string }).name === "string" ? (fileLike as { name?: string }).name! : "";
  const mimeExtMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  };
  const inferredExt = mimeExtMap[contentType] || "jpg";
  const fileExt = originalName.includes(".") ? (originalName.split(".").pop() || inferredExt) : inferredExt;
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `${linkedUserId}/${fileName}`;
  const buffer = Buffer.from(await fileLike.arrayBuffer());
  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin.storage
    .from("avatars")
    .upload(filePath, buffer, {
      contentType,
      upsert: true,
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabaseAdmin.storage.from("avatars").getPublicUrl(filePath);
  return NextResponse.json({ url: data.publicUrl });
}
