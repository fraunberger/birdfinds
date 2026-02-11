"use client";

import React, { useState } from 'react';
import { useHabits, Habit } from '@/lib/social-prototype/store';

interface HabitCalendarProps {
    userId: string;
    onClose: () => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HABIT_COLORS = [
    '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#0ea5e9', '#84cc16'
];

export function HabitCalendar({ userId, onClose }: HabitCalendarProps) {
    const { habits, logs, loading } = useHabits(userId);

    const today = new Date();
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [selectedNote, setSelectedNote] = useState<{ text: string; habitName: string; date: string } | null>(null);

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

    const getDateStr = (day: number) =>
        `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const getCompletedHabits = (day: number): { habit: Habit; note: string }[] => {
        const dateStr = getDateStr(day);
        return habits
            .filter(h => logs.some(l => l.habitId === h.id && l.date === dateStr && l.completed))
            .map(h => ({
                habit: h,
                note: logs.find(l => l.habitId === h.id && l.date === dateStr)?.notes || ''
            }));
    };

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    if (loading) {
        return (
            <div className="fixed inset-0 bg-white z-50 flex items-center justify-center font-mono">
                <div className="text-neutral-400 text-xs uppercase tracking-widest">Loading...</div>
            </div>
        );
    }

    // Build calendar grid cells
    const cells: (number | null)[] = [];
    // Empty cells before the first day
    for (let i = 0; i < firstDayOfWeek; i++) {
        cells.push(null);
    }
    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push(d);
    }
    // Pad remaining cells to complete the last row
    while (cells.length % 7 !== 0) {
        cells.push(null);
    }

    return (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto font-mono">
            <div className="max-w-lg mx-auto p-6 relative min-h-screen">
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
                    <>
                        {/* Legend */}
                        <div className="flex flex-wrap gap-2 mb-4 pb-3 border-b border-neutral-200">
                            {habits.map((habit, idx) => (
                                <div key={habit.id} className="flex items-center gap-1">
                                    <span
                                        className="inline-block w-2.5 h-2.5 rounded-full"
                                        style={{ backgroundColor: HABIT_COLORS[idx % HABIT_COLORS.length] }}
                                    />
                                    <span className="text-[10px] text-neutral-600">{habit.name}</span>
                                </div>
                            ))}
                        </div>

                        {/* Calendar Grid */}
                        <div className="border border-neutral-200">
                            {/* Day of week headers */}
                            <div className="grid grid-cols-7 bg-neutral-50 border-b border-neutral-200">
                                {DAY_LABELS.map(label => (
                                    <div key={label} className="text-center text-[10px] uppercase tracking-wider text-neutral-500 py-2 font-bold">
                                        {label}
                                    </div>
                                ))}
                            </div>

                            {/* Weeks */}
                            {Array.from({ length: cells.length / 7 }, (_, weekIdx) => (
                                <div key={weekIdx} className="grid grid-cols-7 border-b border-neutral-100 last:border-b-0">
                                    {cells.slice(weekIdx * 7, weekIdx * 7 + 7).map((day, cellIdx) => {
                                        const isToday = day ? getDateStr(day) === todayStr : false;
                                        const completed = day ? getCompletedHabits(day) : [];
                                        return (
                                            <div
                                                key={cellIdx}
                                                className={`min-h-[60px] p-1 border-r border-neutral-100 last:border-r-0 ${isToday ? 'bg-yellow-50' : ''
                                                    } ${!day ? 'bg-neutral-50/50' : ''}`}
                                            >
                                                {day && (
                                                    <>
                                                        <div className={`text-[10px] mb-1 ${isToday ? 'font-bold text-neutral-900' : 'text-neutral-400'
                                                            }`}>
                                                            {day}
                                                        </div>
                                                        {completed.length > 0 && (
                                                            <div className="space-y-1">
                                                                {completed.map(({ habit: h, note }) => {
                                                                    const idx = habits.findIndex(hb => hb.id === h.id);
                                                                    return (
                                                                        <div key={h.id} className="flex items-center gap-1 h-3">
                                                                            <span
                                                                                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                                                style={{ backgroundColor: HABIT_COLORS[idx % HABIT_COLORS.length] }}
                                                                                title={h.name}
                                                                            />
                                                                            {note && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setSelectedNote({ text: note, habitName: h.name, date: getDateStr(day) });
                                                                                    }}
                                                                                    className="text-[8px] leading-none text-neutral-400 hover:text-black border border-neutral-200 hover:border-neutral-400 px-0.5 rounded flex items-center justify-center bg-white h-3 w-3"
                                                                                    title="View Note"
                                                                                >
                                                                                    +
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Simple Note Modal */}
                {selectedNote && (
                    <div
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-white/80 p-6"
                        onClick={() => setSelectedNote(null)}
                    >
                        <div
                            className="bg-white border border-neutral-300 w-full max-w-sm shadow-xl p-6 relative"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">
                                NOTE — {selectedNote.date}
                            </div>
                            <div className="text-xs font-bold mb-4">
                                {selectedNote.habitName}
                            </div>
                            <div className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed font-mono bg-neutral-50 p-3 border border-neutral-100">
                                {selectedNote.text}
                            </div>
                            <button
                                onClick={() => setSelectedNote(null)}
                                className="absolute top-4 right-4 text-neutral-400 hover:text-black font-bold"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
