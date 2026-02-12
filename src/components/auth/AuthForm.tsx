"use client";

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function AuthForm() {
    const { signIn, signUp, loading } = useAuth();
    const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            if (mode === 'forgot') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/reset-password`,
                });
                if (error) {
                    setError(error.message);
                } else {
                    setError('Check your email for a password reset link.');
                }
            } else {
                const result = mode === 'signin'
                    ? await signIn(email, password)
                    : await signUp(email, password);

                if (result.error) {
                    setError(result.error.message);
                } else if (mode === 'signup') {
                    setError('Check your email to confirm your account.');
                }
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[300px] font-mono">
                <div className="text-neutral-400 text-xs uppercase tracking-widest">
                    Loading...
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-sm font-mono">
            <div className="bg-white border border-neutral-300 p-6">
                <h2 className="text-lg font-bold uppercase tracking-widest text-center mb-6 border-b border-neutral-200 pb-3">
                    {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : 'Reset Password'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent"
                            placeholder="you@example.com"
                        />
                    </div>

                    {mode !== 'forgot' && (
                        <div>
                            <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                className="w-full px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-500 bg-transparent"
                                placeholder="••••••••"
                            />
                        </div>
                    )}

                    {error && (
                        <div className={`text-xs p-2 border ${error.includes('Check your email')
                            ? 'bg-neutral-50 text-neutral-600 border-neutral-300'
                            : 'bg-neutral-100 text-neutral-700 border-neutral-400'
                            }`}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-neutral-800 text-white py-2 px-4 text-xs font-bold uppercase tracking-widest hover:bg-neutral-700 disabled:opacity-50"
                    >
                        {submitting ? 'Loading...' :
                            mode === 'signin' ? 'Sign In' :
                                mode === 'signup' ? 'Create Account' :
                                    'Send Reset Link'}
                    </button>
                </form>

                <div className="mt-4 text-center space-y-2 border-t border-neutral-200 pt-4">
                    {mode === 'signin' && (
                        <button
                            onClick={() => { setMode('forgot'); setError(null); }}
                            className="text-xs text-neutral-500 hover:text-neutral-700 underline block w-full"
                        >
                            Forgot password?
                        </button>
                    )}
                    <button
                        onClick={() => {
                            setMode(mode === 'signin' ? 'signup' : 'signin');
                            setError(null);
                        }}
                        className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                    >
                        {mode === 'signin'
                            ? "Don't have an account? Sign up"
                            : "Already have an account? Sign in"}
                    </button>
                </div>
            </div>
        </div>
    );
}
