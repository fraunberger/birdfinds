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

    if (loading || habits.length === 0) return null;

    const getHabitNote = (habitId: string): string => {
        const log = logs.find(l => l.habitId === habitId && l.date === date);
        return log?.notes || '';
    };

    const handleToggle = async (habitId: string, completed: boolean) => {
        if (readOnly) return;
        if (completed) {
            // Toggling on — show note input
            setEditingNote(habitId);
            setNoteText('');
        } else {
            // Toggling off
            await toggleHabitLog(habitId, date, false);
            if (editingNote === habitId) {
                setEditingNote(null);
                setNoteText('');
            }
        }
    };

    const saveNote = async (habitId: string) => {
        await toggleHabitLog(habitId, date, true, noteText);
        setEditingNote(null);
        setNoteText('');
    };

    return (
        <div className={vertical ? 'flex flex-col gap-0.5' : 'space-y-1'}>
            <div className={vertical ? 'flex flex-col gap-0.5' : 'flex flex-wrap gap-2 py-1'}>
                {habits.map(habit => {
                    const completed = isHabitCompleted(habit.id, date);
                    const note = getHabitNote(habit.id);
                    return (
                        <div key={habit.id}>
                            <button
                                onClick={() => handleToggle(habit.id, !completed)}
                                disabled={readOnly}
                                className={`inline-flex items-center font-mono transition-all ${vertical
                                    ? `gap-1 px-1 py-0.5 text-[9px] border-none ${completed ? 'text-neutral-700' : 'text-neutral-300'}`
                                    : `gap-1.5 px-2.5 py-1 text-xs border ${completed ? 'bg-neutral-800 text-white border-neutral-800' : 'bg-white text-neutral-400 border-neutral-300 hover:border-neutral-500'}`
                                    } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                            >
                                {vertical ? (
                                    <span className={`text-[8px] ${completed ? 'text-neutral-800' : 'text-neutral-300'}`}>
                                        {completed ? '●' : '○'}
                                    </span>
                                ) : (
                                    <span className={`inline-block w-2.5 h-2.5 border ${completed ? 'border-white bg-white/20' : 'border-neutral-300'
                                        } flex items-center justify-center text-[7px] leading-none`}>
                                        {completed && '✓'}
                                    </span>
                                )}
                                {habit.name}
                            </button>
                            {/* Show note inline when completed */}
                            {completed && note && !vertical && (
                                <div className="text-[9px] text-neutral-400 font-mono ml-4 mt-0.5 truncate">
                                    {note}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Note input when toggling on */}
            {editingNote && !readOnly && (
                <div className="flex gap-1 items-center mt-1">
                    <input
                        type="text"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveNote(editingNote); }}
                        placeholder="Quick note (optional)..."
                        autoFocus
                        className="flex-1 text-[10px] font-mono px-2 py-1 border border-neutral-300 outline-none focus:border-neutral-500 bg-transparent"
                    />
                    <button
                        onClick={() => saveNote(editingNote)}
                        className="text-[10px] font-mono px-2 py-1 bg-neutral-800 text-white uppercase tracking-wider"
                    >
                        ✓
                    </button>
                    <button
                        onClick={() => { setEditingNote(null); setNoteText(''); }}
                        className="text-[10px] font-mono px-1.5 py-1 text-neutral-400 hover:text-neutral-600"
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
}
