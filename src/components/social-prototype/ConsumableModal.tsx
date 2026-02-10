"use client";

import React, { useState, useEffect } from 'react';
import { Category, ConsumableItem, CATEGORY_CONFIGS } from '@/lib/social-prototype/store';

interface ConsumableModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave?: (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => void;
    onDelete?: () => void;
    initialCategory?: Category;
    existingItem?: ConsumableItem;
    readOnly?: boolean;
}

export function ConsumableModal({ isOpen, onClose, onSave, onDelete, initialCategory = 'movie', existingItem, readOnly = false }: ConsumableModalProps) {
    const [category, setCategory] = useState<Category>(initialCategory);
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [rating, setRating] = useState<number | undefined>(undefined);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (existingItem) {
                setCategory(existingItem.category);
                setTitle(existingItem.title);
                setSubtitle(existingItem.subtitle || '');
                setRating(existingItem.rating);
                setNotes(existingItem.notes || '');
            } else {
                setCategory(initialCategory);
                setTitle('');
                setSubtitle('');
                setRating(undefined);
                setNotes('');
            }
        }
    }, [isOpen, existingItem, initialCategory]);

    const handleSave = () => {
        if (!title.trim()) return;
        onSave?.({
            category,
            title,
            subtitle,
            rating,
            notes,
        });
        onClose();
    };

    const handleDelete = () => {
        if (onDelete && confirm('Delete this entry?')) {
            onDelete();
            onClose();
        }
    };

    const config = CATEGORY_CONFIGS[category];

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isOpen) handleSave();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, handleSave]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-white/95 z-50 flex items-start sm:items-center justify-center pt-4 sm:pt-0"
            onClick={onClose}
        >
            <div
                className="bg-white border border-neutral-300 w-full sm:max-w-md font-mono max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-300 bg-neutral-100">
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-600">
                        {readOnly ? 'VIEW ENTRY' : (existingItem ? 'EDIT ENTRY' : 'NEW ENTRY')} — {config.label.toUpperCase()}
                    </span>
                    <button
                        onClick={onClose}
                        className="text-neutral-400 hover:text-neutral-600 text-2xl font-bold leading-none w-8 h-8 flex items-center justify-center -mr-2"
                    >
                        ×
                    </button>
                </div>

                {/* Form */}
                <div className="p-4 space-y-4">
                    {/* Title */}
                    <div>
                        <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                            {config.titleLabel}
                        </label>
                        <input
                            autoFocus={!readOnly}
                            disabled={readOnly}
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full text-base font-mono outline-none border-b border-neutral-200 focus:border-neutral-400 py-1 bg-transparent disabled:text-neutral-600 disabled:border-transparent"
                        />
                    </div>

                    {/* Subtitle */}
                    <div>
                        <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                            {config.subtitleLabel}
                        </label>
                        <input
                            type="text"
                            value={subtitle}
                            onChange={(e) => setSubtitle(e.target.value)}
                            disabled={readOnly}
                            placeholder={config.subtitlePlaceholder}
                            className="w-full text-sm font-mono outline-none border-b border-neutral-200 focus:border-neutral-400 py-1 bg-transparent placeholder:text-neutral-300 disabled:text-neutral-600 disabled:border-transparent"
                        />
                    </div>

                    {/* Rating & Type */}
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex-1 min-w-[80px]">
                            <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                {config.ratingLabel}
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="10"
                                step="0.1"
                                inputMode="decimal"
                                value={rating || ''}
                                onChange={(e) => setRating(parseFloat(e.target.value) || undefined)}
                                placeholder="—"
                                disabled={readOnly}
                                className="w-16 text-center text-sm font-mono border border-neutral-300 focus:border-neutral-400 outline-none py-1 bg-transparent disabled:text-neutral-700 disabled:border-transparent disabled:bg-neutral-100"
                            />
                        </div>

                        <div className="flex-1 min-w-[80px]">
                            <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                                Type
                            </label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value as Category)}
                                disabled={readOnly}
                                className="w-full text-sm font-mono border border-neutral-300 focus:border-neutral-400 outline-none py-1 px-2 bg-transparent cursor-pointer disabled:cursor-default disabled:border-transparent disabled:bg-neutral-100 disabled:appearance-none disabled:pl-0"
                            >
                                {Object.values(CATEGORY_CONFIGS).map(c => (
                                    <option key={c.id} value={c.id}>{c.shortLabel}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-1">
                            {config.notesLabel || 'Notes'}
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={config.notesPlaceholder ? 5 : 3}
                            placeholder={config.notesPlaceholder || ''}
                            disabled={readOnly}
                            className="w-full text-sm font-mono outline-none bg-neutral-50 p-3 border border-neutral-200 focus:border-neutral-400 resize-y placeholder:text-neutral-300 disabled:text-neutral-600 disabled:border-transparent"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-300 bg-neutral-50">
                    <div>
                        {existingItem && onDelete && !readOnly && (
                            <button
                                onClick={handleDelete}
                                className="text-xs uppercase tracking-widest text-neutral-400 hover:text-red-600"
                            >
                                Delete
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-700 px-3 py-1"
                        >
                            Cancel
                        </button>
                        {!readOnly && (
                            <button
                                onClick={handleSave}
                                disabled={!title.trim()}
                                className="text-xs uppercase tracking-widest bg-neutral-800 text-white px-4 py-1 hover:bg-neutral-700 disabled:opacity-30"
                            >
                                Save
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
