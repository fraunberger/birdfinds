"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { Category, CATEGORY_CONFIGS, ConsumableItem } from '@/lib/social-prototype/store';

// Michael's Supabase user ID — the founder account whose data populates the bird pages
const MICHAEL_USER_ID = ''; // Will be set after first sign-up; fetch dynamically for now

interface BirdLogProps {
    category: Category;
    birdSlug: string;
    birdImage: string;
}

export function BirdLog({ category, birdSlug, birdImage }: BirdLogProps) {
    const config = CATEGORY_CONFIGS[category];
    const [items, setItems] = useState<ConsumableItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState<'date' | 'rating'>('date');

    useEffect(() => {
        async function fetchItems() {
            // Find the founder's user ID dynamically — first user with the founder profile
            // For now, fetch all items in this category (RLS allows public reads)
            // and filter to the earliest user (the founder)
            const { data } = await supabase
                .from('social_items')
                .select('*')
                .eq('category', category)
                .order('created_at', { ascending: false });

            if (data && data.length > 0) {
                // Group by user_id via status, find the founder (most items = likely the founder)
                // Simple approach: get statuses for these items to find user
                const statusIds = [...new Set(data.map(d => d.status_id))];
                const { data: statuses } = await supabase
                    .from('social_statuses')
                    .select('id, user_id')
                    .in('id', statusIds);

                // Find Michael's user ID (user with the most items, or first user)
                const userCounts: Record<string, number> = {};
                const statusUserMap: Record<string, string> = {};
                statuses?.forEach(s => {
                    statusUserMap[s.id] = s.user_id;
                    userCounts[s.user_id] = (userCounts[s.user_id] || 0) + 1;
                });

                const founderId = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

                if (founderId) {
                    const founderStatusIds = new Set(
                        statuses?.filter(s => s.user_id === founderId).map(s => s.id) || []
                    );

                    const founderItems: ConsumableItem[] = data
                        .filter(d => founderStatusIds.has(d.status_id))
                        .map(d => ({
                            id: d.id,
                            category: d.category,
                            title: d.title,
                            subtitle: d.subtitle || '',
                            rating: d.rating,
                            notes: d.notes || '',
                            imageUrl: d.image_url || '',
                            createdAt: new Date(d.created_at).getTime(),
                        }));

                    setItems(founderItems);
                }
            }
            setLoading(false);
        }

        fetchItems();
    }, [category]);

    const sorted = [...items].sort((a, b) => {
        if (sortBy === 'rating') {
            return (b.rating || 0) - (a.rating || 0);
        }
        return b.createdAt - a.createdAt;
    });

    const birdLabel = birdSlug.replace(/_/g, ' ');

    return (
        <div className="min-h-screen bg-white font-mono text-neutral-900">
            <div className="max-w-2xl mx-auto p-6 min-h-screen flex flex-col">
                {/* Header */}
                <header className="flex items-center justify-between mb-8 border-b border-neutral-300 pb-4">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-xs font-bold uppercase tracking-widest text-neutral-600 hover:text-neutral-900">
                            BirdFinds
                        </Link>
                        <span className="text-neutral-300">/</span>
                        <div className="flex items-center gap-2">
                            <span className="text-base">{config?.icon}</span>
                            <span className="text-xs uppercase tracking-widest text-neutral-400 font-bold">
                                {config?.label}
                            </span>
                        </div>
                    </div>
                </header>

                {/* Bird image — compact */}
                <div className="flex items-center gap-4 mb-8">
                    <div className="relative w-16 h-16 flex-shrink-0">
                        <Image
                            src={`/birds/${birdImage}`}
                            alt={birdLabel}
                            fill
                            className="object-contain"
                        />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold uppercase tracking-widest">{birdLabel}</h1>
                        <p className="text-[10px] text-neutral-400 uppercase tracking-wider mt-0.5">
                            Michael&apos;s {config?.label} Log — {items.length} {items.length === 1 ? 'entry' : 'entries'}
                        </p>
                    </div>
                </div>

                {/* Sort controls */}
                <div className="flex items-center gap-3 mb-4">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-widest">Sort</span>
                    <button
                        onClick={() => setSortBy('date')}
                        className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border ${sortBy === 'date'
                                ? 'bg-neutral-800 text-white border-neutral-800'
                                : 'text-neutral-400 border-neutral-300 hover:border-neutral-500'
                            }`}
                    >
                        Latest
                    </button>
                    <button
                        onClick={() => setSortBy('rating')}
                        className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border ${sortBy === 'rating'
                                ? 'bg-neutral-800 text-white border-neutral-800'
                                : 'text-neutral-400 border-neutral-300 hover:border-neutral-500'
                            }`}
                    >
                        Top Rated
                    </button>
                </div>

                {/* Content */}
                <main className="flex-grow">
                    {loading ? (
                        <div className="text-neutral-400 text-xs uppercase tracking-widest py-12 text-center">
                            Loading...
                        </div>
                    ) : sorted.length === 0 ? (
                        <div className="text-neutral-400 text-xs uppercase tracking-widest py-12 text-center">
                            No entries yet.
                        </div>
                    ) : (
                        <div className="border border-neutral-200">
                            <table className="w-full text-xs border-collapse">
                                <thead className="bg-neutral-50 text-neutral-500 uppercase text-[10px]">
                                    <tr>
                                        <th className="px-3 py-2 text-left border-b border-r border-neutral-200">
                                            {config?.titleLabel || 'Title'}
                                        </th>
                                        <th className="px-3 py-2 text-left border-b border-r border-neutral-200 w-32">
                                            {config?.subtitleLabel || 'Details'}
                                        </th>
                                        <th className="px-3 py-2 text-center border-b border-neutral-200 w-12">
                                            ★
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((item) => (
                                        <tr key={item.id} className="hover:bg-neutral-50">
                                            <td className="px-3 py-2 border-b border-r border-neutral-200 font-medium">
                                                {item.title}
                                            </td>
                                            <td className="px-3 py-2 border-b border-r border-neutral-200 text-neutral-500 truncate">
                                                {item.subtitle || '—'}
                                            </td>
                                            <td className="px-3 py-2 border-b border-neutral-200 text-center">
                                                {item.rating || ''}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </main>

                {/* Footer */}
                <footer className="py-8 text-center text-xs text-neutral-300 mt-12 border-t border-neutral-200">
                    — END —
                </footer>
            </div>
        </div>
    );
}
