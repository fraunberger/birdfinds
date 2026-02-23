import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getOrCreateLinkedSupabaseUser } from '@/lib/social-prototype/server-auth';
import { parseItemMeta } from '@/lib/social-prototype/item-meta';

interface StatusRow {
  id: string;
  created_at: string;
}

interface ItemRow {
  id: string;
  status_id: string;
  category: string;
  title: string;
  subtitle?: string | null;
  rating?: number | null;
  notes?: string | null;
  image?: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const linkedUserId = await getOrCreateLinkedSupabaseUser();
    if (!linkedUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reviewMatchKey = request.nextUrl.searchParams.get('reviewMatchKey')?.trim();
    if (!reviewMatchKey) {
      return NextResponse.json({ count: 0, lastReview: null });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: statuses, error: statusError } = await supabaseAdmin
      .from('social_statuses')
      .select('id,created_at')
      .eq('user_id', linkedUserId)
      .is('deleted_at', null)
      .limit(2000);

    if (statusError) throw statusError;

    const statusRows = (statuses || []) as StatusRow[];
    const statusIds = statusRows.map((row) => row.id);
    if (statusIds.length === 0) {
      return NextResponse.json({ count: 0, lastReview: null });
    }

    const { data: items, error: itemError } = await supabaseAdmin
      .from('social_items')
      .select('id,status_id,category,title,subtitle,rating,notes,image,created_at')
      .in('status_id', statusIds)
      .limit(5000);

    if (itemError) throw itemError;

    const statusCreatedAtById = new Map(statusRows.map((row) => [row.id, row.created_at]));
    const normalizedMatchKey = reviewMatchKey.toLowerCase();

    const matches = ((items || []) as ItemRow[])
      .filter((item) => {
        const itemKey = parseItemMeta(item.image || undefined).reviewMatchKey;
        return !!itemKey && itemKey.toLowerCase() === normalizedMatchKey;
      })
      .map((item) => ({
        id: item.id,
        category: item.category,
        title: item.title,
        subtitle: item.subtitle || '',
        rating: item.rating ?? undefined,
        notes: item.notes || '',
        image: item.image || undefined,
        createdAt: statusCreatedAtById.get(item.status_id) || item.created_at,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      count: matches.length,
      lastReview: matches[0] || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
