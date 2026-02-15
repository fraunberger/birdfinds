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
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const fileExt = file.name.split(".").pop() || "jpg";
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `${linkedUserId}/${fileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin.storage
    .from("avatars")
    .upload(filePath, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = supabaseAdmin.storage.from("avatars").getPublicUrl(filePath);
  return NextResponse.json({ url: data.publicUrl });
}
