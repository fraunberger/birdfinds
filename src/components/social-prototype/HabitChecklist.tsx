"use client";

import React from 'react';
import { useHabits } from '@/lib/social-prototype/store';

interface HabitChecklistProps {
    date: string;
    readOnly?: boolean;
    userId?: string;
    vertical?: boolean;
}

export function HabitChecklist({ date, readOnly = false, userId, vertical = false }: HabitChecklistProps) {
    const { habits, toggleHabitLog, isHabitCompleted, loading } = useHabits(userId);

    if (loading || habits.length === 0) return null;

    return (
        <div className={vertical ? 'flex flex-col gap-0.5' : 'flex flex-wrap gap-2 py-2'}>
            {habits.map(habit => {
                const completed = isHabitCompleted(habit.id, date);
                return (
                    <button
                        key={habit.id}
                        onClick={() => !readOnly && toggleHabitLog(habit.id, date)}
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
                );
            })}
        </div>
    );
}
