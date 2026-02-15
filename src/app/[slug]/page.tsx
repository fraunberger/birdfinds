import { redirect } from "next/navigation";

export default async function LegacyBirdSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/apps/${slug}`);
}
