"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ConsumableItem, Status, useSocialStore, useUserProfile, Category, CATEGORY_CONFIGS, HIGHLIGHT_COLOR, getCategoryConfig } from '@/lib/social-prototype/store';
import { ConsumableModal, ConsumableModalHandle } from './ConsumableModal';
import { ComposerItemTable } from './ComposerItemTable';
import { pushToast } from '@/lib/social-prototype/toast';
import { normalizeTaggedTextForFeed, parseHighlights, segmentText, TAG_MARKER } from '@/lib/social-prototype/highlighting.mjs';
import { getItemExternalIdentityKey, parseItemMeta, serializeItemMeta } from '@/lib/social-prototype/item-meta';
import { getCanonicalItemKey } from '@/lib/social-prototype/items';
import { useAuth } from '@/lib/auth';
import { useTaggingState, getItemHighlightTerms } from './useTaggingState';
import { HabitChecklist } from './HabitChecklist';
import { ComposerOnboardingChecklist, hasCompletedComposerOnboarding, getOnboardingHighlight, ONBOARDING_PULSE_CSS, isItemFilled } from './ComposerOnboarding';

interface StatusComposerProps {
    userCategories?: Category[];
    onEntryModeChange?: (isEntryMode: boolean) => void;
}

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');
const stripLeadingAtSymbol = (value: string) => value.replace(/^@+\s*/, '').trim();

export function StatusComposer({ userCategories, onEntryModeChange }: StatusComposerProps) {
    const { user } = useAuth();
    const { activeStatus, activeDate, setActiveDate, setActiveStatusForEdit, updateActiveStatus, ensureActiveStatus, addItemToActive, removeItemFromActive, updateItemInActive, togglePublished, moveStatusToDate, setBundledDates, setBabyBirdUrl, setPhotoUrl, statuses, isLoaded, refresh } = useSocialStore();
    const { hasPublishedPost, uploadPhoto } = useUserProfile();
    const [contentDrafts, setContentDrafts] = useState<Record<string, string>>({});
    const [draftStatus, setDraftStatus] = useState<'saved' | 'error'>('saved');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showHowToPost, setShowHowToPost] = useState(false);
    const [isPosting, setIsPosting] = useState(false);
    const [hasItemDraftChanges, setHasItemDraftChanges] = useState(false);
    const [isPreparingComposer, setIsPreparingComposer] = useState(false);
    const [showComposerMenu, setShowComposerMenu] = useState(false);
    const [babyBirdUrlDraft, setBabyBirdUrlDraft] = useState('');
    const [babyBirdLinkLabelDraft, setBabyBirdLinkLabelDraft] = useState('');
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);

    // Close composer menu on outside click
    const composerMenuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!showComposerMenu) return;
        const handler = (e: MouseEvent) => {
            if (composerMenuRef.current && !composerMenuRef.current.contains(e.target as Node)) {
                setShowComposerMenu(false);
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [showComposerMenu]);

    const [activeCategory, setActiveCategory] = useState<Category>('movie');
    const [existingItem, setExistingItem] = useState<ConsumableItem | undefined>(undefined);
    const [tvGroupShowName, setTvGroupShowName] = useState<string | null>(null);
    const [tvGroupIndex, setTvGroupIndex] = useState(0);

    const [lastCursorPosition, setLastCursorPosition] = useState<number | null>(null);
    const [selectedPlainText, setSelectedPlainText] = useState<string>('');
    const [showComposerOnboarding, setShowComposerOnboarding] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const recentSelectionRef = useRef<{ text: string; at: number } | null>(null);
    const modalRef = useRef<ConsumableModalHandle>(null);

    useEffect(() => { onEntryModeChange?.(isExpanded); }, [isExpanded, onEntryModeChange]);

    // Active categories
    const activeCategories = userCategories && userCategories.length > 0
        ? userCategories
        : Object.keys(CATEGORY_CONFIGS) as Category[];
    // LINK is always first; all remaining categories scroll horizontally.
    const linkConfig = getCategoryConfig('link');
    const nonLinkConfigs = activeCategories.filter(c => c !== 'link').map(c => getCategoryConfig(c));
    const toolbarCategoryConfigs = [linkConfig, ...nonLinkConfigs];
    // The v2 prefix isolates drafts from legacy structures. The user.id used here is
    // provided by Clerk (prefixed 'user_...') not the Supabase database. Its sole purpose 
    // is to prevent drafts from leaking across accounts if multiple users share the same browser.
    const draftsStorageKey = `birdfinds:composer:drafts:v2:${user?.id || 'anon'}`;
    const activeContentKey = `draft:${activeDate}`;
    const content = contentDrafts[activeContentKey] ?? activeStatus?.content ?? '';
    const items = useMemo(() => activeStatus?.items ?? [], [activeStatus?.items]);

    // Derive the active onboarding step for highlight hints
    const onboardingActive = showComposerOnboarding && isExpanded;
    const onboardingActiveStep = onboardingActive
        ? (items.length === 0
            ? 'tag' as const
            : !items.some(isItemFilled)
                ? 'fill' as const
                : !content.includes(TAG_MARKER)
                    ? 'couple' as const
                    : null)
        : null;

    const setContentForActive = useCallback((value: string) => {
        if (draftStatus === 'error') setDraftStatus('saved');
        setContentDrafts((prev) => ({ ...prev, [activeContentKey]: value }));
    }, [activeContentKey, draftStatus]);

    // ── Tagging state (extracted hook) ─────────────────────────────────
    const tagging = useTaggingState({
        content,
        items,
        setContentForActive,
        updateActiveStatus,
        addItemToActive,
    });

    // ── Preview highlights (synchronous — always in sync with content + items) ──
    const previewDecorations = useMemo(() => {
        if (!content) return [] as Array<{
            id: string; entityType: string; entityId: string;
            start: number; end: number; displayText: string; source: string; color?: string;
        }>;
        const entities = items.map((item) => ({
            id: item.id,
            entityType: item.category,
            entityId: item.id,
            terms: getItemHighlightTerms(item),
            source: 'item',
            color: getCategoryConfig(item.category)?.color || HIGHLIGHT_COLOR,
            priority: 1,
        }));
        return parseHighlights(content, entities) as Array<{
            id: string; entityType: string; entityId: string;
            start: number; end: number; displayText: string; source: string; color?: string;
        }>;
    }, [content, items]);

    /** Update composer content (convenience wrapper used by tagging & linking). */
    const setComposerContent = useCallback((nextContent: string) => {
        setContentForActive(nextContent);
    }, [setContentForActive]);

    // ── Draft persistence ──────────────────────────────────────────────
    useEffect(() => { setContentDrafts({}); }, [draftsStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(draftsStorageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Record<string, string>;
            if (parsed && typeof parsed === 'object') setContentDrafts(parsed);
        } catch { /* ignore */ }
    }, [draftsStorageKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const timer = window.setTimeout(() => {
            try { window.localStorage.setItem(draftsStorageKey, JSON.stringify(contentDrafts)); }
            catch { /* ignore */ }
        }, 220);
        return () => window.clearTimeout(timer);
    }, [contentDrafts, draftsStorageKey]);

    // ── Auto-save draft to backend ─────────────────────────────────────
    useEffect(() => {
        if (!isExpanded) return;
        if (activeStatus?.published) return;
        if (content.trim() === (activeStatus?.content || '').trim()) return;
        // Never overwrite existing server content with an empty string —
        // this prevents accidental data loss when the composer loads blank
        // due to stale drafts or timing issues.
        if (!content.trim() && (activeStatus?.content || '').trim()) return;
        const timer = window.setTimeout(async () => {
            try {
                await updateActiveStatus(content);
                setDraftStatus('saved');
            } catch (error) {
                setDraftStatus('error');
                pushToast({ message: error instanceof Error ? error.message : 'Draft sync failed', tone: 'error' });
            }
        }, 1200);
        return () => window.clearTimeout(timer);
    }, [isExpanded, activeStatus?.published, activeStatus?.content, content, updateActiveStatus]);

    // ── Textarea auto-resize ───────────────────────────────────────────
    const adjustTextareaHeight = () => {
        const el = textareaRef.current;
        if (el) { el.style.height = 'auto'; el.style.height = Math.max(100, el.scrollHeight) + 'px'; }
    };

    useEffect(() => { adjustTextareaHeight(); }, [content]);

    // ── Edit entry event ───────────────────────────────────────────────
    useEffect(() => {
        const handleEditEntry = (event: Event) => {
            const customEvent = event as CustomEvent<{ date?: string; status?: Status }>;
            const editDate = customEvent.detail?.date;
            const editStatus = customEvent.detail?.status;
            if (editDate) {
                // Clear any stale local draft so the composer loads the actual
                // server content for this post instead of an old/empty draft.
                const key = `draft:${editDate}`;
                setContentDrafts((prev) => {
                    if (!(key in prev)) return prev;
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });
                // Use the full status when provided (handles posts older than JOURNAL_PAGE_SIZE
                // that won't be found in the local statuses array by setActiveDate alone).
                if (editStatus) {
                    setActiveStatusForEdit(editStatus);
                } else {
                    setActiveDate(editDate);
                }
            }
            setIsExpanded(true);
            // Trigger onboarding checklist for first-time composers (no published posts yet)
            if (user?.id && !hasCompletedComposerOnboarding(user.id) && !hasPublishedPost && !statuses.some(s => s.published)) {
                setShowComposerOnboarding(true);
            }
            window.setTimeout(() => textareaRef.current?.focus(), 220);
        };
        window.addEventListener('birdpile:edit-entry', handleEditEntry as EventListener);
        return () => window.removeEventListener('birdpile:edit-entry', handleEditEntry as EventListener);
    }, [setActiveDate, setActiveStatusForEdit, user?.id]);

    // If a stale local draft lost tag markers, prefer canonical server content for this status.
    useEffect(() => {
        if (!activeStatus?.id || activeStatus.id === 'temp-optimistic') return;
        const serverContent = activeStatus.content || '';
        if (!serverContent.includes(TAG_MARKER)) return;
        setContentDrafts((prev) => {
            const current = prev[activeContentKey];
            if (typeof current !== 'string' || current.includes(TAG_MARKER)) return prev;
            return { ...prev, [activeContentKey]: serverContent };
        });
    }, [activeContentKey, activeStatus?.id, activeStatus?.content]);

    // ── Content change handler ─────────────────────────────────────────
    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setComposerContent(val);
        adjustTextareaHeight();
        // Track @ prefix for inline tagging
        const cursorPos = e.target.selectionStart || 0;
        tagging.trackAtPrefix(val, cursorPos);
    };

    const handleBlur = () => { /* No-op. Content stays local until user explicitly posts. */ };

    const prepareComposerForEntry = useCallback(async () => {
        setIsPreparingComposer(true);
        try {
            // Force fresh account + status hydration before exposing table entry actions.
            await refresh();
        } catch (error) {
            pushToast({ message: `Failed to refresh composer context: ${getErrorMessage(error)}`, tone: 'error' });
        } finally {
            setIsPreparingComposer(false);
        }
    }, [refresh]);

    const hasUnsavedChanges = content !== (activeStatus?.content || '') && !activeStatus?.published;
    const hasDraftChanges = content !== (activeStatus?.content || '') || hasItemDraftChanges;

    // Use the user's local date so the button state matches their clock.
    // The server uses UTC+14/UTC-12 as a permissive safety net, so anything
    // the client allows will always be accepted server-side.
    const localToday = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local tz
    const localCutoff = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toLocaleDateString('en-CA');
    })();
    const isFuturePost = activeDate > localToday;
    const isEditExpired = activeDate < localCutoff;
    const draftBadgeText = activeStatus?.published && !hasDraftChanges ? 'Posted' : (draftStatus === 'error' ? 'Draft Error' : 'Draft Saved');
    const draftBadgeTone = activeStatus?.published && !hasDraftChanges ? 'text-neutral-500' : (draftStatus === 'error' ? 'text-red-600' : 'text-green-700');
    const isBabyBird = !!activeStatus?.babyBirdUrl;
    const isAtPrefixLinking = tagging.atPrefixPos >= 0 && tagging.atPrefixText.trim().length > 0;
    const hasTableItems = items.length > 0;
    const isTableLinkingMode = hasTableItems && (isAtPrefixLinking || selectedPlainText.trim().length > 0);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasUnsavedChanges) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [hasUnsavedChanges]);

    useEffect(() => {
        setHasItemDraftChanges(false);
        setBabyBirdUrlDraft(activeStatus?.babyBirdUrl || '');
        setBabyBirdLinkLabelDraft(activeStatus?.babyBirdLinkLabel || '');
    }, [activeDate, activeStatus?.id, activeStatus?.babyBirdUrl, activeStatus?.babyBirdLinkLabel]);

    // All user items for repeat detection
    const allUserItems = useMemo(() => statuses.flatMap(s => s.items), [statuses]);

    // ── Photo callbacks ────────────────────────────────────────────────
    const compressPhoto = async (file: File): Promise<File> => {
        const MAX_DIM = 1200;
        const QUALITY = 0.7;
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > MAX_DIM || height > MAX_DIM) {
                    const scale = MAX_DIM / Math.max(width, height);
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Canvas not supported'));
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => {
                        if (!blob) return reject(new Error('Compression failed'));
                        resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
                    },
                    'image/jpeg',
                    QUALITY
                );
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = URL.createObjectURL(file);
        });
    };

    const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Reset so the same file can be re-selected
        e.target.value = '';

        setIsUploadingPhoto(true);
        try {
            const statusId = await ensureActiveStatus();
            const compressed = await compressPhoto(file);
            const publicUrl = await uploadPhoto(compressed);
            await setPhotoUrl(statusId, publicUrl);
            pushToast({ message: 'Photo added', tone: 'success' });
        } catch (error) {
            pushToast({ message: getErrorMessage(error), tone: 'error' });
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const handleDeletePhoto = async () => {
        if (!activeStatus || activeStatus.id === 'temp-optimistic') return;
        try {
            await setPhotoUrl(activeStatus.id, null);
            pushToast({ message: 'Photo removed', tone: 'success' });
        } catch (error) {
            pushToast({ message: getErrorMessage(error), tone: 'error' });
        }
    };

    // ── Item callbacks ─────────────────────────────────────────────────
    const handleSaveItem = async (item: Omit<ConsumableItem, 'id' | 'createdAt'>) => {
        try {
            const draftKey = getCanonicalItemKey(item);
            const incomingExternalKey = getItemExternalIdentityKey(item.category, item.image);
            const previousItem = existingItem
                || allUserItems.find((candidate) => {
                    if (incomingExternalKey) {
                        return getItemExternalIdentityKey(candidate.category, candidate.image) === incomingExternalKey;
                    }
                    return getCanonicalItemKey(candidate) === draftKey;
                });
            let nextImage = item.image;
            if (previousItem && (existingItem || incomingExternalKey)) {
                const previousMeta = parseItemMeta(previousItem.image);
                const incomingMeta = parseItemMeta(item.image);
                const meta = {
                    ...previousMeta,
                    ...incomingMeta,
                    aliases: Array.from(new Set([
                        ...(previousMeta.aliases || []).map((v) => v.trim()).filter(Boolean),
                        ...(incomingMeta.aliases || []).map((v) => v.trim()).filter(Boolean),
                    ])),
                };
                const oldTitle = previousItem.title.trim();
                const newTitle = item.title.trim();
                if (existingItem && oldTitle && newTitle && oldTitle.toLowerCase() !== newTitle.toLowerCase()) {
                    const aliases = new Set([...(meta.aliases || []), oldTitle]);
                    meta.aliases = Array.from(aliases);
                }
                nextImage = serializeItemMeta(meta);
            }
            if (existingItem) {
                // Always update when editing an existing item — even if it still has a
                // temp ID (server response hasn't arrived yet). Calling addItemToActive
                // here would create a duplicate server record.
                await updateItemInActive(existingItem.id, { ...item, image: nextImage });
            } else {
                await addItemToActive({ ...item, image: nextImage });
            }
            setHasItemDraftChanges(true);
            if (!tvGroupEpisodes) {
                // TV episode save: enter carousel mode instead of closing
                const meta = parseItemMeta(nextImage);
                if (item.category === 'tv' && meta.externalSource === 'tvmaze-episode' && item.title) {
                    setTvGroupShowName(item.title);
                    // Find the just-saved episode's index in the group
                    const savedKey = getItemExternalIdentityKey('tv', nextImage);
                    const updatedItems = (activeStatus?.items || []).filter(i => {
                        if (i.category !== 'tv' || i.title !== item.title) return false;
                        return parseItemMeta(i.image).externalSource === 'tvmaze-episode';
                    });
                    const idx = updatedItems.findIndex(i => getItemExternalIdentityKey('tv', i.image) === savedKey);
                    setTvGroupIndex(idx >= 0 ? idx : 0);
                    setExistingItem(updatedItems[idx >= 0 ? idx : 0] ?? existingItem);
                    setIsModalOpen(true);
                } else {
                    setExistingItem(undefined);
                    setIsModalOpen(false);
                }
            }
        } catch (error: unknown) {
            pushToast({ message: `Failed to save item: ${getErrorMessage(error)}`, tone: 'error' });
        }
    };

    const handleSaveBatch = async (items: Omit<ConsumableItem, 'id' | 'createdAt'>[]) => {
        try {
            for (const item of items) {
                await addItemToActive(item);
            }
            setHasItemDraftChanges(true);
            setExistingItem(undefined);
        } catch (error: unknown) {
            pushToast({ message: `Failed to save items: ${getErrorMessage(error)}`, tone: 'error' });
        }
    };

    const handleDeleteItem = async () => {
        if (existingItem) {
            await removeItemFromActive(existingItem.id);
            setHasItemDraftChanges(true);
            setExistingItem(undefined);
        }
    };

    // Derive TV group episodes from the live store items (stays in sync after saves)
    const tvGroupEpisodes = useMemo(() => {
        if (!tvGroupShowName || !activeStatus) return null;
        return activeStatus.items.filter(item => {
            if (item.category !== 'tv' || item.title !== tvGroupShowName) return false;
            const meta = parseItemMeta(item.image);
            return meta.externalSource === 'tvmaze-episode';
        });
    }, [tvGroupShowName, activeStatus]);

    const openModal = (item: ConsumableItem) => {
        setActiveCategory(item.category);
        setExistingItem(item);
        setTvGroupShowName(null);
        setIsModalOpen(true);
    };

    const openTvGroup = (episodes: ConsumableItem[]) => {
        setActiveCategory('tv');
        setTvGroupShowName(episodes[0].title);
        setTvGroupIndex(0);
        setExistingItem(episodes[0]);
        setIsModalOpen(true);
    };

    const navigateTvGroup = (direction: 'prev' | 'next') => {
        if (!tvGroupEpisodes) return;
        const nextIndex = direction === 'prev' ? tvGroupIndex - 1 : tvGroupIndex + 1;
        if (nextIndex < 0 || nextIndex >= tvGroupEpisodes.length) return;
        // Save the current episode's edits before navigating away
        modalRef.current?.triggerSave();
        setTvGroupIndex(nextIndex);
        setExistingItem(tvGroupEpisodes[nextIndex]);
    };

    // Keep existingItem in sync with store data when in TV group mode.
    // Only update if the episode at the current index changed identity (e.g. after
    // deletion shifted episodes), NOT on every store recomputation — otherwise the
    // modal's draft resets mid-edit and causes glitchy form behavior.
    const tvGroupCurrentId = tvGroupEpisodes
        ? tvGroupEpisodes[Math.min(tvGroupIndex, tvGroupEpisodes.length - 1)]?.id
        : undefined;
    useEffect(() => {
        if (!tvGroupEpisodes || !isModalOpen || tvGroupCurrentId == null) return;
        setExistingItem(prev => {
            if (prev?.id === tvGroupCurrentId) return prev;
            const idx = Math.min(tvGroupIndex, tvGroupEpisodes.length - 1);
            return tvGroupEpisodes[idx] ?? prev;
        });
    }, [tvGroupCurrentId, tvGroupIndex, tvGroupEpisodes, isModalOpen]);

    const linkExistingItemToPost = async (item: ConsumableItem) => {
        const ensureAliasLinked = async (phrase: string) => {
            const normalizedPhrase = phrase.trim();
            if (!normalizedPhrase) return;
            const alreadyLinked = getItemHighlightTerms(item).some((term) => term.trim().toLowerCase() === normalizedPhrase.toLowerCase());
            if (alreadyLinked) return;

            const meta = parseItemMeta(item.image);
            const aliases = new Set((meta.aliases || []).map((v) => v.trim()).filter(Boolean));
            aliases.add(normalizedPhrase);
            const nextImage = serializeItemMeta({ ...meta, aliases: Array.from(aliases) });
            await updateItemInActive(item.id, { image: nextImage });
            setHasItemDraftChanges(true);
        };

        if (isAtPrefixLinking) {
            const typedText = stripLeadingAtSymbol(tagging.atPrefixText);
            if (!typedText) {
                tagging.clearAtPrefix();
                return;
            }
            await ensureAliasLinked(typedText);
            const currentContent = content || '';
            const before = currentContent.slice(0, tagging.atPrefixPos);
            const after = currentContent.slice(tagging.atPrefixPos + 1 + tagging.atPrefixText.length);
            const nextContent = `${before}${TAG_MARKER}${typedText}${after}`;
            setComposerContent(nextContent);
            await updateActiveStatus(nextContent);
            tagging.clearAtPrefix();
            setIsExpanded(true);
            setTimeout(() => {
                const target = textareaRef.current;
                if (!target) return;
                target.focus();
                const nextCursor = before.length + TAG_MARKER.length + typedText.length;
                target.setSelectionRange(nextCursor, nextCursor);
                setLastCursorPosition(nextCursor);
            }, 30);
            return;
        }

        const recentSelection = recentSelectionRef.current;
        const mobileFallbackPhrase = tagging.isMobileTagging
            && recentSelection
            && (Date.now() - recentSelection.at) < 3000
            ? recentSelection.text.trim()
            : '';
        const rawPhrase = selectedPlainText.trim() || mobileFallbackPhrase;
        const phrase = stripLeadingAtSymbol(rawPhrase);

        if (tagging.isMobileTagging && !phrase) {
            pushToast({ message: 'Select text or type @ to link from mobile.', tone: 'error' });
            return;
        }

        if (phrase) {
            await ensureAliasLinked(phrase);
            const start = tagging.selectionStart;
            const end = tagging.selectionEnd;
            const currentContent = content || '';
            if (
                start >= 0
                && end > start
                && end <= currentContent.length
                && stripLeadingAtSymbol(currentContent.slice(start, end)) === phrase
                && currentContent.slice(Math.max(0, start - TAG_MARKER.length), start) !== TAG_MARKER
            ) {
                const hasLeadingAt = currentContent[start] === '@';
                const insertionStart = hasLeadingAt ? start + 1 : start;
                const nextContent = `${currentContent.slice(0, start)}${TAG_MARKER}${currentContent.slice(insertionStart)}`;
                setComposerContent(nextContent);
                await updateActiveStatus(nextContent);
                setHasItemDraftChanges(true);
            }
            setSelectedPlainText('');
            recentSelectionRef.current = null;
            return;
        }

        const currentContent = content || '';
        const rawInsertPos = lastCursorPosition ?? currentContent.length;
        const insertPos = Math.max(0, Math.min(rawInsertPos, currentContent.length));
        const before = currentContent.slice(0, insertPos);
        const after = currentContent.slice(insertPos);
        const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
        const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
        const insertion = `${needsLeadingSpace ? ' ' : ''}${TAG_MARKER}${item.title}${needsTrailingSpace ? ' ' : ''}`;
        const nextContent = `${before}${insertion}${after}`;

        setComposerContent(nextContent);
        setIsExpanded(true);
        setTimeout(() => {
            const target = textareaRef.current;
            if (!target) return;
            target.focus();
            const nextCursor = before.length + insertion.length;
            target.setSelectionRange(nextCursor, nextCursor);
            setLastCursorPosition(nextCursor);
        }, 30);
    };

    const handleTextSelection = useCallback((target: HTMLTextAreaElement) => {
        const start = target.selectionStart;
        const end = target.selectionEnd;
        if (start !== end) {
            const selectedText = target.value.substring(start, end);
            if (!selectedText.trim()) return;
            setSelectedPlainText(selectedText.trim());
            recentSelectionRef.current = { text: selectedText.trim(), at: Date.now() };
            tagging.updateSelection(start, end, selectedText.trim());
            // Auto-matching via selection removed as requested — user must tap item in table or category button
            return;
        }
        setSelectedPlainText('');
        tagging.clearSelection();
    }, [tagging]);

    useEffect(() => {
        const syncTextareaSelection = () => {
            const target = textareaRef.current;
            if (!target || document.activeElement !== target) return;
            setLastCursorPosition(target.selectionStart);
            handleTextSelection(target);
        };

        document.addEventListener('selectionchange', syncTextareaSelection);
        return () => document.removeEventListener('selectionchange', syncTextareaSelection);
    }, [handleTextSelection]);

    if (!isLoaded) return <div className="h-32 bg-neutral-100 mb-4 border border-neutral-300" />;

    return (
        <div className="mb-6 font-mono">
            <style>{`
                .composer-text, .highlight-layer { font-size: 14px; }
                @media (min-width: 640px) { .composer-text, .highlight-layer { font-size: 12px; } }
                ${onboardingActive ? ONBOARDING_PULSE_CSS : ''}
            `}</style>

            {/* Header */}
            <header className="flex items-center justify-between mb-2 pb-2 border-b border-neutral-300 gap-4">
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={async () => {
                            const next = !isExpanded;
                            if (next) {
                                await prepareComposerForEntry();
                                if (user?.id && !hasCompletedComposerOnboarding(user.id) && !hasPublishedPost && !statuses.some(s => s.published)) {
                                    setShowComposerOnboarding(true);
                                }
                            }
                            setIsExpanded(next);
                        }}
                        disabled={isPreparingComposer}
                        className="flex items-center gap-2 shrink-0 hover:opacity-70 transition-opacity touch-manipulation"
                    >
                        <span className={`text-xs transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 whitespace-nowrap">
                            {isPreparingComposer ? 'LOADING…' : (isExpanded ? (isBabyBird ? 'BABY BIRD' : 'LOG ENTRY') : (activeStatus?.content ? 'ENTRY' : 'NEW ENTRY'))}
                        </h2>
                    </button>
                    {/* Three-dot menu — entry options */}
                    <div className="relative" ref={composerMenuRef}>
                        <button type="button"
                            onClick={() => setShowComposerMenu(p => !p)}
                            className="text-neutral-400 hover:text-neutral-600 transition-colors touch-manipulation w-6 h-6 flex items-center justify-center"
                            title="Entry options"
                            aria-label="Entry options">
                            <span className="inline-flex items-center gap-0.5">
                                <span className="w-1 h-1 rounded-full bg-current" />
                                <span className="w-1 h-1 rounded-full bg-current" />
                                <span className="w-1 h-1 rounded-full bg-current" />
                            </span>
                        </button>
                        {showComposerMenu && (() => {
                            const currentBundle = activeStatus?.bundledDates || [];
                            const hasRealStatus = activeStatus && activeStatus.id !== 'temp-optimistic';
                            const multiDayOptions = [2, 3].map(n => {
                                const dates: string[] = [];
                                for (let i = n - 1; i >= 1; i--) {
                                    const d = new Date(activeDate + 'T12:00:00');
                                    d.setDate(d.getDate() - i);
                                    dates.push(d.toISOString().slice(0, 10));
                                }
                                const hasConflict = dates.some(dt => statuses.some(s => s.date === dt && s.id !== activeStatus?.id));
                                return { n, dates, hasConflict };
                            });
                            // Build move-to date options: last 7 days, excluding current date and dates with published posts
                            const moveDateOptions: { date: string; label: string; hasUnposted: boolean }[] = [];
                            if (hasRealStatus) {
                                for (let i = 1; i <= 7; i++) {
                                    const d = new Date(activeDate + 'T12:00:00');
                                    d.setDate(d.getDate() - i);
                                    const dateStr = d.toISOString().slice(0, 10);
                                    const existing = statuses.find(s => s.date === dateStr && s.id !== activeStatus?.id);
                                    if (existing?.published) continue; // skip dates with published posts
                                    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                                    const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                    moveDateOptions.push({ date: dateStr, label: `${dayName} ${monthDay}`, hasUnposted: !!existing });
                                }
                            }
                            return (
                                <div className="absolute left-0 top-full mt-1 bg-white border border-neutral-300 shadow-md z-50 p-1 min-w-[160px]">
                                    {/* Baby Bird toggle — hidden once published */}
                                    {isBabyBird ? (
                                        <button type="button"
                                            onClick={async () => {
                                                setShowComposerMenu(false);
                                                if (!hasRealStatus) return;
                                                try {
                                                    const url = activeStatus.babyBirdUrl?.trim();
                                                    await setBabyBirdUrl(activeStatus.id, null);
                                                    if (url) {
                                                        const linkMeta = serializeItemMeta({ linkUrl: url });
                                                        await addItemToActive({ category: 'link', title: url, image: linkMeta });
                                                    }
                                                    pushToast({ message: 'Converted back to log entry', tone: 'success' });
                                                } catch (err) {
                                                    pushToast({ message: err instanceof Error ? err.message : 'Failed', tone: 'error' });
                                                }
                                            }}
                                            className="block w-full text-left px-3 py-2 text-[10px] font-mono text-neutral-600 hover:bg-neutral-50">
                                            Convert to log entry
                                        </button>
                                    ) : !activeStatus?.published ? (
                                        <button type="button"
                                            onClick={async () => {
                                                setShowComposerMenu(false);
                                                try {
                                                    const statusId = hasRealStatus
                                                        ? activeStatus.id
                                                        : await ensureActiveStatus();
                                                    if (!statusId) return;
                                                    await setBabyBirdUrl(statusId, ' ');
                                                    setBabyBirdUrlDraft('');
                                                    setIsExpanded(true);
                                                } catch (err) {
                                                    pushToast({ message: err instanceof Error ? err.message : 'Failed', tone: 'error' });
                                                }
                                            }}
                                            className="block w-full text-left px-3 py-2 text-[10px] font-mono text-neutral-600 hover:bg-neutral-50">
                                            Baby bird
                                        </button>
                                    ) : null}
                                    {!isBabyBird && (
                                        <>
                                            {/* Move post date picker */}
                                            {hasRealStatus && moveDateOptions.length > 0 && (
                                                <>
                                                    <div className="border-t border-neutral-100 my-1" />
                                                    <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-neutral-400">Move to</div>
                                                    {moveDateOptions.map(({ date, label, hasUnposted }) => (
                                                        <button key={date} type="button"
                                                            className="block w-full text-left px-3 py-1.5 text-[10px] font-mono text-neutral-600 hover:bg-neutral-50"
                                                            onClick={async () => {
                                                                setShowComposerMenu(false);
                                                                const warning = hasUnposted
                                                                    ? `Move this post to ${label}? The existing draft on that date will be replaced.`
                                                                    : `Move this post to ${label}?`;
                                                                if (!confirm(warning)) return;
                                                                try {
                                                                    await moveStatusToDate(activeStatus.id, date);
                                                                    pushToast({ message: `Post moved to ${label}`, tone: 'success' });
                                                                } catch (err) {
                                                                    pushToast({ message: err instanceof Error ? err.message : 'Failed to move post', tone: 'error' });
                                                                }
                                                            }}>
                                                            {label}{hasUnposted && <span className="text-neutral-400 ml-1">(has draft)</span>}
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                            {/* Multi-day */}
                                            <div className="border-t border-neutral-100 my-1" />
                                            <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-neutral-400">Multi-day</div>
                                            <button type="button"
                                                className={`block w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-neutral-50 ${!currentBundle.length ? 'font-bold text-neutral-900' : 'text-neutral-600'}`}
                                                onClick={async () => {
                                                    setShowComposerMenu(false);
                                                    if (!hasRealStatus) return;
                                                    try {
                                                        await setBundledDates(activeStatus.id, null);
                                                        pushToast({ message: 'Multi-day removed', tone: 'success' });
                                                    } catch (err) {
                                                        pushToast({ message: err instanceof Error ? err.message : 'Failed', tone: 'error' });
                                                    }
                                                }}>
                                                1 day{!currentBundle.length && ' *'}
                                            </button>
                                            {multiDayOptions.map(({ n, dates, hasConflict }) => {
                                                const isSelected = currentBundle.length === n - 1;
                                                if (hasConflict && !isSelected) return null;
                                                return (
                                                    <button key={n} type="button"
                                                        className={`block w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-neutral-50 ${isSelected ? 'font-bold text-neutral-900' : 'text-neutral-600'}`}
                                                        onClick={async () => {
                                                            setShowComposerMenu(false);
                                                            try {
                                                                const statusId = activeStatus?.id === 'temp-optimistic'
                                                                    ? await ensureActiveStatus()
                                                                    : activeStatus?.id;
                                                                if (!statusId) return;
                                                                await setBundledDates(statusId, dates);
                                                                pushToast({ message: `${n}-day entry`, tone: 'success' });
                                                            } catch (err) {
                                                                pushToast({ message: err instanceof Error ? err.message : 'Failed', tone: 'error' });
                                                            }
                                                        }}>
                                                        {n} days{isSelected && ' *'}
                                                    </button>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 text-xs uppercase tracking-widest">
                    <button type="button" onClick={() => setShowHowToPost(true)}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors touch-manipulation w-6 h-6 flex items-center justify-center"
                        aria-label="How to post?">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    </button>
                    <span className={`whitespace-nowrap text-[10px] ${draftBadgeTone}`}>{draftBadgeText}</span>
                    <div className="relative inline-flex items-center gap-1 cursor-pointer hover:opacity-70 transition-opacity">
                        <span className="font-mono text-neutral-500 whitespace-nowrap select-none">
                            {activeStatus?.bundledDates?.length
                                ? `${[...activeStatus.bundledDates].sort()[0].slice(5).replace('-', '/')} - ${activeDate.slice(5).replace('-', '/')}`
                                : activeDate.slice(5).replace('-', '/')}
                        </span>
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-neutral-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 9h18" />
                        </svg>
                        <input ref={dateInputRef} type="date" value={activeDate} onChange={(e) => setActiveDate(e.target.value)}
                            onClick={(e) => { try { const t = e.target as HTMLInputElement; if (typeof t.showPicker === 'function') t.showPicker(); } catch { /* fallback */ } }}
                            aria-label="Select date" className="absolute inset-0 opacity-0 cursor-pointer" />
                    </div>
                </div>
            </header>

            {showHowToPost && (
                <div
                    className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
                    onClick={() => setShowHowToPost(false)}
                >
                    <div
                        className="bg-white border border-neutral-300 w-full max-w-sm font-mono max-h-[85vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                            <span className="text-xs font-bold uppercase tracking-widest text-neutral-800">How to Post</span>
                            <button
                                type="button"
                                onClick={() => setShowHowToPost(false)}
                                className="text-neutral-400 hover:text-neutral-700 text-xl leading-none w-7 h-7 flex items-center justify-center"
                            >×</button>
                        </div>
                        <div className="px-4 py-4 space-y-4 text-[11px] text-neutral-600 leading-relaxed">
                            <p className="font-semibold text-neutral-800 text-xs uppercase tracking-widest">One Post, One Pile, Every Day!</p>
                            <p className="-mt-2">Each day gets one entry. Check the calendar to make sure you're on the right date before starting.</p>

                            <div className="space-y-1">
                                <p><span className="font-bold text-neutral-900 tracking-wide">TAG</span> your finds</p>
                                <p>Add items to your daily pile using the table below. Type the title and select a category. Do this before writing your status (recommended) or inline using @title while writing (advanced)*</p>
                            </div>

                            <div className="space-y-1">
                                <p><span className="font-bold text-neutral-900 tracking-wide">FILL OUT</span> your finds</p>
                                <p>Tap any item in the table to open its card. Search to link it to a shared database record, then rate and review it. Linked items unlock community ratings and repeat tracking.</p>
                            </div>

                            <div className="space-y-1">
                                <p><span className="font-bold text-neutral-900 tracking-wide">COUPLE</span> finds to your status</p>
                                <p>In your status text, highlight a word and tap the matching item's row in the table. The word will be colored by category — this connects your words directly to the tagged item.</p>
                            </div>

                            <div className="border-t border-neutral-200 pt-3 space-y-2">
                                <p>* Two ways to tag inline while writing:</p>
                                <p className="pl-2">1. Type <span className="font-semibold">@title</span> then tap a category in the top bar to confirm</p>
                                <p className="pl-2">2. Highlight words in your status and tap a category in the top bar</p>
                                <p className="pt-1">** Items tagged inline still need to be filled out — tap the row to open the card.</p>
                            </div>

                            <div className="border-t border-neutral-200 pt-3 space-y-2">
                                <p className="font-semibold text-neutral-800 text-xs uppercase tracking-widest">Baby Birds</p>
                                <p>A baby bird is a quick share — a single link with your commentary. Use it when you want to share an article, video, or anything with a URL without building a full log entry.</p>
                                <p>Baby birds require a URL and a description. You can still tag items (movies, books, etc.) on a baby bird — they won&apos;t appear in the feed post, but they&apos;ll be added to your profile piles for tracking.</p>
                                <p>Baby birds are always single-day entries and cannot be date bundled.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden photo file input (shared by both modes) */}
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />

            {/* Collapsible Content */}
            {isExpanded && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                    {isBabyBird ? (
                        /* ── Baby Bird Mode ── */
                        <>
                            <div className="border border-neutral-300">
                                {/* URL display */}
                                <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 flex items-center gap-2">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 shrink-0">URL</span>
                                    <input
                                        type="url"
                                        value={babyBirdUrlDraft}
                                        onChange={async (e) => {
                                            const val = e.target.value;
                                            setBabyBirdUrlDraft(val);
                                        }}
                                        onBlur={async () => {
                                            if (!activeStatus || activeStatus.id === 'temp-optimistic') return;
                                            if (babyBirdUrlDraft.trim() && babyBirdUrlDraft.trim() !== activeStatus.babyBirdUrl) {
                                                try {
                                                    await setBabyBirdUrl(activeStatus.id, babyBirdUrlDraft.trim());
                                                } catch { /* ignore */ }
                                            }
                                        }}
                                        placeholder="https://..."
                                        className="flex-1 min-w-0 bg-transparent text-xs font-mono text-neutral-700 outline-none placeholder:text-neutral-300 truncate"
                                    />
                                    {babyBirdUrlDraft && (
                                        <a
                                            href={babyBirdUrlDraft}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-[10px] text-neutral-400 hover:text-neutral-700 shrink-0"
                                            title="Open link"
                                        >
                                            ↗
                                        </a>
                                    )}
                                </div>
                                {/* Link label input */}
                                <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 flex items-center gap-2">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 shrink-0">LABEL</span>
                                    <input
                                        type="text"
                                        value={babyBirdLinkLabelDraft}
                                        onChange={(e) => setBabyBirdLinkLabelDraft(e.target.value)}
                                        onBlur={async () => {
                                            if (!activeStatus || activeStatus.id === 'temp-optimistic') return;
                                            if (babyBirdLinkLabelDraft.trim() !== (activeStatus.babyBirdLinkLabel || '')) {
                                                try {
                                                    await setBabyBirdUrl(activeStatus.id, babyBirdUrlDraft.trim() || activeStatus.babyBirdUrl || ' ', babyBirdLinkLabelDraft.trim() || null);
                                                } catch { /* ignore */ }
                                            }
                                        }}
                                        placeholder="Display text for the link (required)"
                                        className="flex-1 min-w-0 bg-transparent text-xs font-mono text-neutral-700 outline-none placeholder:text-neutral-300 truncate"
                                    />
                                </div>
                                {/* Commentary textarea */}
                                <div className="relative min-h-[100px] bg-white">
                                    <textarea
                                        ref={textareaRef}
                                        value={content}
                                        onChange={handleContentChange}
                                        onFocus={() => { adjustTextareaHeight(); if (textareaRef.current) textareaRef.current.style.minHeight = '100px'; }}
                                        onBlur={() => { handleBlur(); }}
                                        placeholder="What's this about? (required)"
                                        className="composer-text relative z-10 w-full bg-transparent text-neutral-900 caret-black outline-none placeholder:text-neutral-300 min-h-[100px] p-3 font-mono resize-none leading-relaxed align-top overflow-hidden transition-all duration-200"
                                        spellCheck={false}
                                    />
                                </div>
                            </div>

                            {/* Post Action Row */}
                            <div className="mt-2 mb-1 flex items-center gap-3">
                                <div className="min-w-0 flex-1">
                                    <HabitChecklist date={activeDate} bundledDates={activeStatus?.bundledDates} />
                                </div>
                                {items.length > 0 && (
                                    <span className="text-[9px] uppercase tracking-widest text-neutral-400 whitespace-nowrap">
                                        {items.length} tag{items.length !== 1 ? 's' : ''} (pile only)
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (isPosting) return;
                                        setIsPosting(true);
                                        try {
                                            let statusId = activeStatus?.id !== 'temp-optimistic' ? activeStatus?.id : undefined;
                                            const normalizedContent = normalizeTaggedTextForFeed(content);
                                            const hasContentChanges = normalizedContent !== (activeStatus?.content || '');

                                            if (hasContentChanges) {
                                                statusId = await updateActiveStatus(normalizedContent) || statusId;
                                            }

                                            if (!babyBirdUrlDraft.trim()) {
                                                pushToast({ message: 'Add a URL before posting.', tone: 'error' });
                                            } else if (!babyBirdLinkLabelDraft.trim()) {
                                                pushToast({ message: 'Add a link label before posting.', tone: 'error' });
                                            } else if (!normalizedContent.trim()) {
                                                pushToast({ message: 'Add a description before posting.', tone: 'error' });
                                            } else if (statusId) {
                                                // Persist the URL and label if changed
                                                if (babyBirdUrlDraft.trim() !== activeStatus?.babyBirdUrl || babyBirdLinkLabelDraft.trim() !== (activeStatus?.babyBirdLinkLabel || '')) {
                                                    await setBabyBirdUrl(statusId, babyBirdUrlDraft.trim(), babyBirdLinkLabelDraft.trim() || null);
                                                }
                                                await togglePublished(statusId, true);
                                                setContentDrafts((prev) => { const next = { ...prev }; delete next[activeContentKey]; return next; });
                                                setIsExpanded(false);
                                            } else {
                                                pushToast({ message: 'Something went wrong.', tone: 'error' });
                                            }
                                        } catch (error) {
                                            pushToast({ message: error instanceof Error ? error.message : 'Failed to post', tone: 'error' });
                                        } finally {
                                            setIsPosting(false);
                                        }
                                    }}
                                    disabled={isPosting || (!!activeStatus?.published && !hasDraftChanges && babyBirdUrlDraft === (activeStatus?.babyBirdUrl || '') && babyBirdLinkLabelDraft === (activeStatus?.babyBirdLinkLabel || '')) || isFuturePost || isEditExpired}
                                    title={isFuturePost ? "You can't post until this date arrives" : isEditExpired ? "Posts can't be edited after 30 days" : undefined}
                                    className={`ml-auto shrink-0 px-4 py-2.5 sm:py-2 text-[10px] font-bold uppercase tracking-widest transition-colors border whitespace-nowrap touch-manipulation select-none active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${isFuturePost || isEditExpired ? 'bg-neutral-400 text-white border-neutral-400' : activeStatus?.published ? 'bg-green-700 text-white border-green-700 hover:bg-green-800' : 'bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-700'}`}
                                >
                                    {isPosting ? 'POSTING…' : (activeStatus?.published ? (hasDraftChanges || babyBirdUrlDraft !== (activeStatus?.babyBirdUrl || '') || babyBirdLinkLabelDraft !== (activeStatus?.babyBirdLinkLabel || '') ? 'UPDATE POST' : 'POSTED') : 'POST')}
                                </button>
                            </div>

                            {/* Data Table for baby bird tags (pile only) */}
                            <ComposerItemTable
                                items={items}
                                content={content}
                                isMobileTagging={tagging.isMobileTagging}
                                selectedPlainText={selectedPlainText}
                                activeCategoryConfigs={toolbarCategoryConfigs}
                                onOpenItem={openModal}
                                onOpenTvGroup={openTvGroup}
                                onLinkItem={linkExistingItemToPost}
                                isLinkingMode={isTableLinkingMode}
                                onRemoveItem={async (id) => {
                                    if (isPreparingComposer) return;
                                    await removeItemFromActive(id);
                                    setHasItemDraftChanges(true);
                                }}
                                onAddItem={async (item) => {
                                    if (isPreparingComposer) return;
                                    await addItemToActive(item);
                                    setHasItemDraftChanges(true);
                                }}
                            />
                        </>
                    ) : (
                        /* ── Normal Log Entry Mode ── */
                        <>
                    {/* Editor Container */}
                    <div className="border border-neutral-300">
                        {/* ── Inline Category Toolbar — horizontally scrollable ── */}
                        <div className="border-b border-neutral-200 bg-neutral-50 flex items-stretch overflow-x-auto">
                            <div className="flex items-stretch min-w-max shrink-0">
                                {toolbarCategoryConfigs.map(cat => {
                                    const hasContext = !!(tagging.selectedText || tagging.atPrefixText);
                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => {
                                                setSelectedPlainText('');
                                                const hasRecentFallback = !!recentSelectionRef.current
                                                    && (Date.now() - recentSelectionRef.current.at) < 2500
                                                    && recentSelectionRef.current.text.trim().length > 0;
                                                recentSelectionRef.current = null;
                                                if (hasContext || hasRecentFallback) {
                                                    tagging.handleCategoryTap(cat.id);
                                                } else {
                                                    setActiveCategory(cat.id);
                                                    setExistingItem(undefined);
                                                    setIsModalOpen(true);
                                                }
                                            }}
                                            onPointerDown={(e) => e.preventDefault()}
                                            disabled={tagging.busy}
                                            title={cat.label}
                                            className={`shrink-0 px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest whitespace-nowrap border-r border-neutral-200 transition-colors disabled:opacity-40 ${hasContext
                                                ? 'text-neutral-900 hover:brightness-90'
                                                : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'
                                                }`}
                                            style={hasContext ? { backgroundColor: cat.color || '#d4d4d4' } : undefined}
                                        >
                                            {cat.shortLabel}
                                        </button>
                                    );
                                })}
                            </div>
                            {tagging.selectedText && (
                                <div className="ml-auto flex items-center px-2 text-[9px] uppercase tracking-widest text-neutral-600 whitespace-nowrap shrink-0">
                                    TEXT SELECTED → TAP A CATEGORY
                                </div>
                            )}
                            {!tagging.selectedText && tagging.atPrefixText && (
                                <div className="ml-auto flex items-center px-2 text-[9px] uppercase tracking-widest text-neutral-500 whitespace-nowrap shrink-0">
                                    @: {tagging.atPrefixText.length > 20 ? tagging.atPrefixText.slice(0, 20) + '...' : tagging.atPrefixText}
                                </div>
                            )}
                        </div>

                        {/* ── Textarea + Highlight (own relative container for perfect alignment) ── */}
                        <div className={`relative min-h-[100px] bg-white ${getOnboardingHighlight('textarea', onboardingActiveStep)}`}>
                            {content && (
                                <div className="highlight-layer absolute inset-0 p-3 pointer-events-none whitespace-pre-wrap break-words font-mono text-transparent leading-relaxed z-0 align-top overflow-hidden" aria-hidden="true">
                                    {(segmentText(content, previewDecorations) as Array<{ type: 'text' | 'highlight'; text: string; start: number; end: number; decoration?: { color?: string; entityId?: string } }>).map((segment, index) =>
                                        segment.type === 'text' ? (
                                            <React.Fragment key={`t:${segment.start}:${index}`}>{segment.text}</React.Fragment>
                                        ) : (
                                            <mark key={`h:${segment.start}:${segment.end}:${segment.decoration?.entityId || index}`}
                                                style={{ backgroundColor: segment.decoration?.color || HIGHLIGHT_COLOR, padding: 0, color: 'transparent' }}>
                                                {segment.text}
                                            </mark>
                                        )
                                    )}
                                </div>
                            )}
                            <textarea
                                ref={textareaRef}
                                value={content}
                                onChange={handleContentChange}
                                onFocus={() => { adjustTextareaHeight(); if (textareaRef.current) textareaRef.current.style.minHeight = tagging.isMobileTagging ? '220px' : '150px'; }}
                                onBlur={() => { handleBlur(); if (textareaRef.current && !content) textareaRef.current.style.minHeight = tagging.isMobileTagging ? '170px' : '100px'; }}
                                onSelect={(e) => { const t = e.target as HTMLTextAreaElement; setLastCursorPosition(t.selectionStart); handleTextSelection(t); }}
                                onTouchEnd={(e) => { const t = e.target as HTMLTextAreaElement; setLastCursorPosition(t.selectionStart); window.setTimeout(() => handleTextSelection(t), 0); }}
                                onPointerUp={(e) => { const t = e.target as HTMLTextAreaElement; setLastCursorPosition(t.selectionStart); window.setTimeout(() => handleTextSelection(t), 0); }}
                                placeholder="What did you do today? Type @item then tap a category, or select text..."
                                className="composer-text relative z-10 w-full bg-transparent text-neutral-900 caret-black outline-none placeholder:text-neutral-300 min-h-[170px] sm:min-h-[100px] p-3 font-mono resize-none leading-relaxed align-top overflow-hidden transition-all duration-200"
                                spellCheck={false}
                            />
                        </div>
                    </div>

                    {/* Photo Section */}
                    <div className="mt-2">
                        {activeStatus?.photoUrl ? (
                            <div className="relative inline-block">
                                <img src={activeStatus.photoUrl} alt="Daily photo" className="max-h-32 rounded border border-neutral-200 object-cover" />
                                <button
                                    type="button"
                                    onClick={handleDeletePhoto}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-neutral-900 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600 transition-colors"
                                    title="Remove photo"
                                >
                                    &times;
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => photoInputRef.current?.click()}
                                disabled={isUploadingPhoto || isFuturePost || isEditExpired}
                                className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isUploadingPhoto ? 'UPLOADING...' : '+ PHOTO'}
                            </button>
                        )}
                    </div>

                    {/* Post Action Row + Habits */}
                    <div className="mt-2 mb-1 flex flex-col gap-2">
                        {onboardingActive && user?.id && (
                            <ComposerOnboardingChecklist
                                userId={user.id}
                                items={items}
                                content={content}
                                onComplete={() => setShowComposerOnboarding(false)}
                            />
                        )}
                        <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <HabitChecklist date={activeDate} bundledDates={activeStatus?.bundledDates} />
                        </div>
                        {items.length > 0 && items.some(i => !isItemFilled(i)) && (
                            <span className="text-[9px] uppercase tracking-widest text-amber-700 whitespace-nowrap">
                                {items.filter(i => !isItemFilled(i)).length} unfilled
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={async () => {
                                if (isPosting) return;
                                setIsPosting(true);
                                try {
                                    let statusId = activeStatus?.id !== 'temp-optimistic' ? activeStatus?.id : undefined;
                                    const normalizedContent = normalizeTaggedTextForFeed(content);
                                    const hasAnyText = normalizedContent.trim().length > 0;
                                    const hasContentChanges = normalizedContent !== (activeStatus?.content || '');
                                    const hasTaggedItems = items.length > 0;
                                    const hasExistingStatus = !!statusId;

                                    if (hasContentChanges) {
                                        statusId = await updateActiveStatus(normalizedContent) || statusId;
                                    } else if (hasTaggedItems) {
                                        statusId = statusId || await ensureActiveStatus();
                                    }

                                    if (statusId && (hasAnyText || hasTaggedItems || hasExistingStatus)) {
                                        await togglePublished(statusId, true);
                                        setContentDrafts((prev) => { const next = { ...prev }; delete next[activeContentKey]; return next; });
                                        setHasItemDraftChanges(false);
                                        setIsExpanded(false);
                                    } else {
                                        pushToast({ message: 'Add some text or tagged items before posting.', tone: 'error' });
                                    }
                                } catch (error) {
                                    pushToast({ message: error instanceof Error ? error.message : 'Failed to post update', tone: 'error' });
                                } finally {
                                    setIsPosting(false);
                                }
                            }}
                            disabled={isPosting || (!!activeStatus?.published && !hasDraftChanges) || isFuturePost || isEditExpired}
                            title={isFuturePost ? "You can't post until this date arrives" : isEditExpired ? "Posts can't be edited after 30 days" : undefined}
                            className={`ml-auto shrink-0 px-4 py-2.5 sm:py-2 text-[10px] font-bold uppercase tracking-widest transition-colors border whitespace-nowrap touch-manipulation select-none active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${isFuturePost || isEditExpired ? 'bg-neutral-400 text-white border-neutral-400' : activeStatus?.published ? 'bg-green-700 text-white border-green-700 hover:bg-green-800' : 'bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-700'}`}
                        >
                            {isPosting ? 'POSTING…' : (activeStatus?.published ? (hasDraftChanges ? 'UPDATE POST' : 'POSTED') : 'POST')}
                        </button>
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className={getOnboardingHighlight('table', onboardingActiveStep) || getOnboardingHighlight('card', onboardingActiveStep)}>
                    <ComposerItemTable
                        items={items}
                        content={content}
                        isMobileTagging={tagging.isMobileTagging}
                        selectedPlainText={selectedPlainText}
                        activeCategoryConfigs={toolbarCategoryConfigs}
                        onOpenItem={openModal}
                        onOpenTvGroup={openTvGroup}
                        onLinkItem={linkExistingItemToPost}
                        isLinkingMode={isTableLinkingMode}
                        onRemoveItem={async (id) => {
                            if (isPreparingComposer) return;
                            await removeItemFromActive(id);
                            setHasItemDraftChanges(true);
                        }}
                        onAddItem={async (item) => {
                            if (isPreparingComposer) return;
                            await addItemToActive(item);
                            setHasItemDraftChanges(true);
                        }}
                    />
                    </div>
                        </>
                    )}
                </div>
            )}

            <ConsumableModal
                key={`${existingItem?.id ?? 'new'}-${activeCategory}-${isModalOpen ? 'open' : 'closed'}`}
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setTvGroupShowName(null); }}
                onSave={handleSaveItem}
                onSaveBatch={handleSaveBatch}
                onDelete={handleDeleteItem}
                initialCategory={activeCategory}
                existingItem={existingItem}
                allUserItems={allUserItems}
                stayOpenAfterSave={!!tvGroupEpisodes || activeCategory === 'tv'}
                modalRef={modalRef}
                tvGroup={tvGroupEpisodes ? {
                    index: tvGroupIndex,
                    total: tvGroupEpisodes.length,
                    episodeLabel: existingItem?.subtitle?.replace(/\s*-\s*.*$/, '') || `Episode ${tvGroupIndex + 1}`,
                    onPrev: () => navigateTvGroup('prev'),
                    onNext: () => navigateTvGroup('next'),
                } : undefined}
            />
        </div>
    );
}
