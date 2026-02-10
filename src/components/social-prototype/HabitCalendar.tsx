"use client";

import React, { useState } from 'react';
import { useHabits } from '@/lib/social-prototype/store';

interface HabitCalendarProps {
    userId: string;
    onClose: () => void;
}

export function HabitCalendar({ userId, onClose }: HabitCalendarProps) {
    const { habits, logs, loading } = useHabits(userId);

    const today = new Date();
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [viewYear, setViewYear] = useState(today.getFullYear());

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

    const monthName = new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long' });

    const prevMonth = () => {
        if (viewMonth === 0) {
            setViewMonth(11);
            setViewYear(viewYear - 1);
        } else {
            setViewMonth(viewMonth - 1);
        }
    };

    const nextMonth = () => {
        if (viewMonth === 11) {
            setViewMonth(0);
            setViewYear(viewYear + 1);
        } else {
            setViewMonth(viewMonth + 1);
        }
    };

    const isCompleted = (habitId: string, day: number) => {
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return logs.some(l => l.habitId === habitId && l.date === dateStr && l.completed);
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-white z-50 flex items-center justify-center font-mono">
                <div className="text-neutral-400 text-xs uppercase tracking-widest">Loading...</div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto font-mono">
            <div className="max-w-3xl mx-auto p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 border-b border-neutral-300 pb-4">
                    <h2 className="text-lg font-bold uppercase tracking-widest">Habit Calendar</h2>
                    <button
                        onClick={onClose}
                        className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-800 border border-neutral-300 px-3 py-1.5 hover:border-neutral-500"
                    >
                        Close
                    </button>
                </div>

                {/* Month navigation */}
                <div className="flex items-center justify-between mb-4">
                    <button onClick={prevMonth} className="text-neutral-500 hover:text-black px-2 py-1 text-sm">
                        ← Prev
                    </button>
                    <span className="text-sm font-bold uppercase tracking-widest">
                        {monthName} {viewYear}
                    </span>
                    <button onClick={nextMonth} className="text-neutral-500 hover:text-black px-2 py-1 text-sm">
                        Next →
                    </button>
                </div>

                {habits.length === 0 ? (
                    <div className="text-center py-8 text-neutral-400 text-xs uppercase tracking-widest">
                        No habits defined.
                    </div>
                ) : (
                    <div className="border border-neutral-200 overflow-x-auto">
                        <table className="w-full text-xs border-collapse min-w-[600px]">
                            <thead className="bg-neutral-50">
                                <tr>
                                    <th className="px-3 py-2 text-left border-b border-r border-neutral-200 sticky left-0 bg-neutral-50 text-neutral-500 uppercase tracking-wider w-28">
                                        Habit
                                    </th>
                                    {Array.from({ length: daysInMonth }, (_, i) => (
                                        <th key={i} className="px-1 py-2 text-center border-b border-r border-neutral-200 text-neutral-400 w-7">
                                            {i + 1}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {habits.map(habit => (
                                    <tr key={habit.id}>
                                        <td className="px-3 py-2 border-b border-r border-neutral-200 sticky left-0 bg-white font-medium text-neutral-700 truncate max-w-[120px]">
                                            {habit.name}
                                        </td>
                                        {Array.from({ length: daysInMonth }, (_, i) => {
                                            const day = i + 1;
                                            const done = isCompleted(habit.id, day);
                                            return (
                                                <td key={i} className="px-1 py-2 border-b border-r border-neutral-200 text-center">
                                                    {done ? (
                                                        <span className="inline-block w-4 h-4 bg-neutral-800 text-white text-[9px] leading-4 rounded-sm">✓</span>
                                                    ) : (
                                                        <span className="inline-block w-4 h-4 bg-neutral-100 rounded-sm" />
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
