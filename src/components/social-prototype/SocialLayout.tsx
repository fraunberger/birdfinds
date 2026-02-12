"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useUserProfile, useSocialStore } from '@/lib/social-prototype/store';
import { AuthForm } from '@/components/auth/AuthForm';
import { UserSetup } from './UserSetup';
import { StatusComposer } from './StatusComposer';
import { SocialFeed } from './SocialFeed';
import { ProfilePage } from './ProfilePage';

type View = 'feed' | 'settings' | 'profile';

export function SocialLayout() {
    const { user, loading: authLoading } = useAuth();
    const { profile, loading: profileLoading, refetch } = useUserProfile();
    const { setActiveDate } = useSocialStore();
    const [view, setView] = useState<View>('feed');
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const needsOnboarding = !profile?.username?.trim();

    // Loading state
    if (authLoading || profileLoading) {
        return (
            <div className="min-h-screen bg-white font-mono text-neutral-900 flex items-center justify-center">
                <div className="text-neutral-400 text-xs uppercase tracking-widest">
                    Loading...
                </div>
            </div>
        );
    }

    // Auth form if not signed in
    if (!user) {
        return (
            <div className="min-h-screen bg-white font-mono text-neutral-900">
                <div className="max-w-lg mx-auto p-6 min-h-screen flex flex-col pt-12">
                    <header className="flex items-center justify-center mb-16 border-b border-neutral-300 pb-4">
                        <Link href="/" className="text-xs font-bold uppercase tracking-widest text-neutral-600 hover:text-neutral-900">
                            BirdFinds
                        </Link>
                    </header>
                    <main className="flex-grow flex items-start justify-center pt-8">
                        <AuthForm />
                    </main>
                </div>
            </div>
        );
    }

    // First-time setup: only require onboarding when username is missing.
    if (needsOnboarding) {
        return (
            <div className="min-h-screen bg-white font-mono text-neutral-900">
                <div className="max-w-lg mx-auto p-6 min-h-screen flex flex-col pt-12">
                    <header className="flex items-center justify-center mb-8 border-b border-neutral-300 pb-4">
                        <Link href="/" className="text-xs font-bold uppercase tracking-widest text-neutral-600 hover:text-neutral-900">
                            BirdFinds
                        </Link>
                        <span className="text-neutral-300 mx-3">/</span>
                        <span className="text-xs uppercase tracking-widest text-neutral-400">The BirdPile</span>
                    </header>
                    <main className="flex-grow">
                        <UserSetup onComplete={() => { refetch(); setView('feed'); }} />
                    </main>
                </div>
            </div>
        );
    }

    const handleClickProfile = (userId: string) => {
        setProfileUserId(userId);
        setView('profile');
    };



    const getToday = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const handleReset = () => {
        setActiveDate(getToday());
        setView('feed');
        setProfileUserId(null);
    };

    return (
        <div className="min-h-screen bg-white font-mono text-neutral-900">
            <div className="max-w-2xl mx-auto p-3 sm:p-6 min-h-screen flex flex-col">
                {/* Header */}
                <header className="flex items-center justify-between mb-4 sm:mb-8 border-b border-neutral-300 pb-3 sm:pb-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            onClick={handleReset}
                            className="text-xs font-bold uppercase tracking-widest text-neutral-600 hover:text-neutral-900"
                        >
                            BirdFinds
                        </Link>
                        <span className="text-neutral-300">/</span>
                        <button
                            onClick={handleReset}
                            className="text-xs uppercase tracking-widest text-neutral-400 hover:text-neutral-700"
                        >
                            The BirdPile
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Profile/Settings Nav */}
                        {profile && (
                            <button
                                onClick={() => handleClickProfile(user.id)}
                                className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                            >
                                <div className="w-6 h-6 rounded-full bg-neutral-200 overflow-hidden">
                                    {profile.avatarUrl ? (
                                        <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-neutral-400 text-[10px] font-bold">
                                            {profile.username?.[0]?.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <span className="text-xs uppercase tracking-widest text-neutral-500">
                                    {profile.username}
                                </span>
                            </button>
                        )}
                        <button
                            onClick={() => setView('settings')}
                            className="text-neutral-400 hover:text-neutral-600 text-sm"
                            title="Settings"
                        >
                            settings
                        </button>

                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-grow">
                    {view === 'settings' && (
                        <UserSetup onComplete={() => { refetch(); setView('feed'); }} />
                    )}

                    {view === 'feed' && (
                        <>
                            <StatusComposer userCategories={profile?.categories} />
                            <SocialFeed onClickProfile={handleClickProfile} />
                        </>
                    )}

                    {view === 'profile' && profileUserId && (
                        <ProfilePage
                            userId={profileUserId}
                            onBack={() => { setView('feed'); setProfileUserId(null); }}
                            onClickProfile={handleClickProfile}
                            onSettings={() => setView('settings')}
                        />
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
