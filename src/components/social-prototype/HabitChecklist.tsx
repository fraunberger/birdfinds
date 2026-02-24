"use client";

import React, { useState } from 'react';
import { useHabits } from '@/lib/social-prototype/store';

interface HabitChecklistProps {
    date: string;
    readOnly?: boolean;
    userId?: string;
    vertical?: boolean;
}

export function HabitChecklist({ date, readOnly = false, userId, vertical = false }: HabitChecklistProps) {
    const { habits, logs, toggleHabitLog, isHabitCompleted, loading } = useHabits(userId);
    const [editingNote, setEditingNote] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');

    if (loading) {
        return (
            <div className={vertical ? 'flex flex-col gap-1 min-h-[30px]' : 'min-h-[34px] flex items-center'}>
                <div className="text-[10px] uppercase tracking-widest text-neutral-300">
                    Loading habits...
                </div>
            </div>
        );
    }

    if (habits.length === 0) return null;

    const getHabitNote = (habitId: string): string => {
        const log = logs.find(l => l.habitId === habitId && l.date === date);
        return log?.notes || '';
    };

    const saveNote = async (habitId: string) => {
        await toggleHabitLog(habitId, date, true, noteText);
        setEditingNote(null);
        setNoteText('');
    };

    return (
        <div className={vertical ? 'flex flex-col gap-1' : 'space-y-1'}>
            <div className={vertical ? 'flex flex-col gap-1' : 'flex flex-wrap gap-2 py-1'}>
                {habits.map(habit => {
                    const completed = isHabitCompleted(habit.id, date);
                    const note = getHabitNote(habit.id);
                    return (
                        <div key={habit.id} className="flex items-center gap-1">
                            <button
                                onClick={() => !readOnly && toggleHabitLog(habit.id, date, !completed)}
                                disabled={readOnly}
                                className={`inline-flex items-center font-mono transition-all rounded-sm ${vertical
                                    ? `gap-2 px-2 py-1.5 text-[10px] min-h-[30px] border-none ${completed ? 'text-neutral-900 font-bold' : 'text-neutral-400'}`
                                    : `gap-1.5 px-2.5 py-1.5 text-[10px] border rounded-full min-h-[28px] ${completed ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm' : 'bg-neutral-50 text-neutral-500 border-neutral-300 hover:border-neutral-500'}`
                                    } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                            >
                                {vertical ? (
                                    <span className={`text-[10px] w-4 text-center ${completed ? 'text-neutral-900' : 'text-neutral-300'}`}>
                                        {completed ? '●' : '○'}
                                    </span>
                                ) : (
                                    <span className={`inline-block w-2.5 h-2.5 border rounded-full ${completed ? 'border-white bg-white/30' : 'border-neutral-300'
                                        } flex items-center justify-center text-[8px] leading-none`}>
                                        {completed && '+'}
                                    </span>
                                )}
                                {habit.name}
                            </button>
                            {/* + button to add a note (only when completed & not read-only & not vertical) */}
                            {completed && !readOnly && !vertical && (
                                <button
                                    onClick={() => { setEditingNote(habit.id); setNoteText(note); }}
                                    className="text-[10px] text-neutral-400 hover:text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-full px-2 py-1 min-w-[24px] flex items-center justify-center transition-colors"
                                    title="Add note"
                                >
                                    +
                                </button>
                            )}
                            {/* Inline note removed as requested (handled by calendar hover/click now) */}
                        </div>
                    );
                })}
            </div>

            {/* Note input — only when + is clicked */}
            {editingNote && !readOnly && (
                <div className="flex gap-2 items-center mt-2 p-1 bg-neutral-50 border border-neutral-200 rounded">
                    <input
                        type="text"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveNote(editingNote); if (e.key === 'Escape') { setEditingNote(null); setNoteText(''); } }}
                        placeholder="Quick note..."
                        autoFocus
                        className="flex-1 text-xs font-mono px-3 py-2 border border-neutral-300 outline-none focus:border-neutral-500 bg-white"
                    />
                    <button
                        onClick={() => saveNote(editingNote)}
                        className="text-xs font-mono px-4 py-2 bg-neutral-800 text-white uppercase tracking-wider rounded"
                    >
                        ok
                    </button>
                    <button
                        onClick={() => { setEditingNote(null); setNoteText(''); }}
                        className="text-xs font-mono px-3 py-2 text-neutral-400 hover:text-neutral-600 border border-transparent hover:border-neutral-300 rounded"
                    >
                        x
                    </button>
                </div>
            )}
        </div>
    );
}
