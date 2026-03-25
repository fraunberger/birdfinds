"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from "next/link";
import { Status, HIGHLIGHT_COLOR, UserProfile, ConsumableItem, useSocialStore, getCategoryConfig } from '@/lib/social-prototype/store';
import { HabitChecklist } from './HabitChecklist';
import { ConsumableModal } from './ConsumableModal';
import { buildItemPath, hasItemAggregatePage } from '@/lib/social-prototype/items';
import { useAuth } from '@/lib/auth';
import { pushToast } from '@/lib/social-prototype/toast';
import { getItemHighlightTerms } from './useTaggingState';
import { parseItemMeta } from '@/lib/social-prototype/item-meta';
import { normalizeTaggedTextForFeed, parseHighlights } from '@/lib/social-prototype/highlighting.mjs';

interface StatusCardProps {
    status: Status;
    profile?: UserProfile | null;
    onClickProfile?: (userId: string) => void;
    isOwn?: boolean;
    isAdmin?: boolean;
    currentUserId?: string | null;
    onEdit?: () => void;
    showPostReportButton?: boolean;
    disableItemEditing?: boolean;
    forceShowComments?: boolean;
}

export function StatusCard({ status, profile, onClickProfile, isOwn = false, isAdmin = false, currentUserId = null, onEdit, showPostReportButton = true, disableItemEditing = false, forceShowComments = false }: StatusCardProps) {
    const [selectedItem, setSelectedItem] = useState<ConsumableItem | null>(null);
    const [showHabits, setShowHabits] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [commentDraft, setCommentDraft] = useState('');
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [showAllItems, setShowAllItems] = useState(false);
    const ITEM_LIMIT = 5;
    const menuRef = useRef<HTMLDivElement | null>(null);
    const { user } = useAuth();
    const { deleteStatus, addComment, deleteComment, reportStatus, reportComment, softDeleteStatus, softDeleteComment, removeItemFromActive, addItemToStatus } = useSocialStore();

    const defer = (fn: () => void | Promise<void>) => {
        window.setTimeout(() => {
            void fn();
        }, 0);
    };

    const handleReportPost = () => {
        setShowMenu(false);
        defer(async () => {
            try {
                const reason = window.prompt('Report reason (optional):') || '';
                await reportStatus(status.id, reason);
                pushToast({ message: 'Report submitted. Thanks.', tone: 'success' });
            } catch (error) {
                pushToast({ message: error instanceof Error ? error.message : 'Failed to report post', tone: 'error' });
            }
        });
    };

    const handleDeletePost = () => {
        setShowMenu(false);
        defer(async () => {
            if (!window.confirm('Delete this post and all its items?')) return;
            try {
                await deleteStatus(status.id);
            } catch (error) {
                pushToast({ message: error instanceof Error ? error.message : 'Failed to delete post', tone: 'error' });
            }
        });
    };

    const handleHidePost = () => {
        setShowMenu(false);
        defer(async () => {
            if (!window.confirm('Hide this post from public feed?')) return;
            try {
                await softDeleteStatus(status.id, 'Hidden by admin');
                pushToast({ message: 'Post hidden.', tone: 'success' });
            } catch (error) {
                pushToast({ message: error instanceof Error ? error.message : 'Failed to hide post', tone: 'error' });
            }
        });
    };

    useEffect(() => {
        if (!showMenu) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        window.addEventListener('mousedown', onPointerDown);
        return () => window.removeEventListener('mousedown', onPointerDown);
    }, [showMenu]);

    useEffect(() => {
        if (!forceShowComments) return;
        setShowComments(true);
    }, [forceShowComments]);

    const renderContent = () => {
        if (!status.content) return null;

        const text = normalizeTaggedTextForFeed(status.content);
        // Baby bird items are for profile piles only — don't highlight them in the feed
        const entities = status.babyBirdUrl ? [] : status.items.map((item) => {
            const config = getCategoryConfig(item.category);
            return {
                id: item.id,
                entityType: item.category,
                entityId: item.id,
                terms: getItemHighlightTerms(item),
                color: config?.color || HIGHLIGHT_COLOR,
            };
        });
        const decorations = parseHighlights(text, entities);
        const parts: React.ReactNode[] = [];
        let cursor = 0;

        decorations.forEach((dec, index) => {
            if (dec.start > cursor) parts.push(text.slice(cursor, dec.start));
            const item = status.items.find((entry) => entry.id === dec.entityId);
            parts.push(
                <button
                    key={`${dec.entityId}:${dec.start}:${index}`}
                    type="button"
                    onClick={() => item && setSelectedItem(item)}
                    className="inline px-[1px] cursor-pointer"
                    style={{ backgroundColor: dec.color || HIGHLIGHT_COLOR }}
                >
                    {dec.displayText}
                </button>
            );
            cursor = dec.end;
        });

        if (cursor < text.length) parts.push(text.slice(cursor));

        return (
            <p className="text-neutral-800 text-xs leading-relaxed whitespace-pre-wrap font-mono cursor-default break-words">
                {parts}
            </p>
        );
    };

    return (
        <div id={`status-${status.id}`} className="border border-neutral-200 bg-white px-3 py-2.5 font-mono">
            {/* Header: Avatar + Username + Date — compact single line */}
            <div className="flex items-center gap-2 mb-2">
                {profile && (
                    <button
                        onClick={() => status.userId && onClickProfile?.(status.userId)}
                        className="flex items-center gap-1.5 hover:opacity-70 transition-opacity min-w-0"
                    >
                        <div className="w-5 h-5 rounded-full bg-neutral-200 overflow-hidden flex-shrink-0">
                            {profile.avatarUrl ? (
                                <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-neutral-400 text-[8px] font-bold">
                                    {profile.username?.[0]?.toUpperCase() || '?'}
                                </div>
                            )}
                        </div>
                        <span className="text-[11px] font-bold text-neutral-700 truncate">
                            {profile.username}
                        </span>
                        {status.babyBirdUrl && (
                            <span className="text-[9px] uppercase tracking-widest text-neutral-400 ml-1">baby bird</span>
                        )}
                    </button>
                )}
                <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                    {(status.userId || onEdit || (!isOwn && user) || isOwn) && (
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setShowMenu((prev) => !prev)}
                                aria-label="Open post menu"
                                title="Post menu"
                                className="w-7 h-7 border border-neutral-300 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
                            >
                                <span className="inline-flex items-center gap-0.5">
                                    <span className="w-1 h-1 rounded-full bg-current" />
                                    <span className="w-1 h-1 rounded-full bg-current" />
                                    <span className="w-1 h-1 rounded-full bg-current" />
                                </span>
                            </button>
                            {showMenu && (
                                <div className="absolute right-0 mt-1 w-36 border border-neutral-300 bg-white shadow-sm z-20">
                                    {status.userId && (
                                        <button
                                            onClick={() => {
                                                setShowHabits((prev) => !prev);
                                                setShowMenu(false);
                                            }}
                                            className="block w-full text-left px-2.5 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100"
                                        >
                                            {showHabits ? 'Hide Habits' : 'Show Habits'}
                                        </button>
                                    )}
                                    {onEdit && (
                                        <button
                                            onClick={() => {
                                                onEdit();
                                                setShowMenu(false);
                                            }}
                                            className="block w-full text-left px-2.5 py-2 text-[10px] uppercase tracking-widest text-neutral-700 hover:bg-neutral-100 border-t border-neutral-200"
                                        >
                                            Edit
                                        </button>
                                    )}
                                    {isOwn && (
                                        <button
                                            onClick={handleDeletePost}
                                            className="block w-full text-left px-2.5 py-2 text-[10px] uppercase tracking-widest text-red-600 hover:bg-red-50 border-t border-neutral-200"
                                        >
                                            Delete
                                        </button>
                                    )}
                                    {isAdmin && !isOwn && (
                                        <button
                                            onClick={handleHidePost}
                                            className="block w-full text-left px-2.5 py-2 text-[10px] uppercase tracking-widest text-red-600 hover:bg-red-50 border-t border-neutral-200"
                                        >
                                            Hide
                                        </button>
                                    )}
                                    {showPostReportButton && !isOwn && user && (
                                        <button
                                            onClick={handleReportPost}
                                            className="block w-full text-left px-2.5 py-1.5 text-[9px] uppercase tracking-widest text-neutral-300 hover:text-red-400 border-t border-dashed border-neutral-100 mt-2"
                                        >
                                            Report
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    <span className="text-[10px] text-neutral-400">
                        {status.bundledDates && status.bundledDates.length > 0
                            ? (() => {
                                const startDate = new Date([...status.bundledDates].sort()[0]);
                                const endDate = new Date(status.date);
                                const startMonth = startDate.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
                                const endMonth = endDate.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
                                const startDay = startDate.toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' });
                                const endDay = endDate.toLocaleDateString(undefined, { day: 'numeric', timeZone: 'UTC' });
                                return startMonth === endMonth
                                    ? `${startMonth} ${startDay}-${endDay}`
                                    : `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
                              })()
                            : new Date(status.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
                        }
                    </span>
                </div>
            </div>

            {/* Body: content + items */}
            <div>
                {status.babyBirdUrl ? (
                    /* ── Baby Bird layout: bird icon overflows left, big bold link + commentary ── */
                    <div className="relative">
                        {/* BirdFinds bird — overflows left outside the card */}
                        <svg viewBox="0 0 576 576" className="absolute -left-12 -top-1 w-12 h-12 pointer-events-none select-none" aria-hidden="true">
                            <path fill="black" d="M49.128700,536.127319 C55.048782,530.235901 60.778938,524.653198 66.367706,518.932373 C71.508720,513.669983 78.050377,510.615601 84.506920,507.615204 C106.085472,497.587433 127.296196,486.652252 150.484985,480.480652 C157.734116,478.551300 164.736145,475.635834 171.289703,472.026215 C191.877579,460.686768 213.670410,451.657349 234.000290,439.922333 C260.716583,424.500977 285.850037,406.627594 309.982513,387.384430 C321.316772,378.346619 332.627747,369.278748 344.027039,360.323547 C361.137177,346.881989 374.297699,329.937805 386.887695,312.454163 C393.312500,303.532074 399.845337,294.685364 406.458099,285.901520 C423.374237,263.431671 435.497162,238.549301 443.983521,211.818726 C444.121826,211.383118 444.096802,210.895645 444.215851,209.818298 C437.826294,214.519882 431.900757,219.004364 425.848663,223.311066 C403.226166,239.409424 378.128052,251.163834 353.875397,264.423645 C326.671967,279.296783 297.425079,288.964966 268.398621,299.268036 C248.314026,306.397064 228.089035,313.186096 209.238708,323.361938 C206.712967,324.725433 204.314011,326.190094 202.512222,328.437317 C200.279129,331.222534 197.703751,333.306702 193.951019,331.850586 C191.257095,330.805298 189.518890,328.515228 189.867142,325.595642 C190.312119,321.865265 191.845016,318.598083 195.667328,316.897034 C231.145508,301.108185 267.989380,288.914520 304.283783,275.256378 C347.461884,259.007812 388.279175,237.768173 425.907196,210.959137 C442.721832,198.979126 457.914825,184.936005 471.611938,169.281128 C486.915192,151.790497 494.268280,131.161667 497.682587,108.695862 C499.297852,98.067902 498.963135,87.496902 497.384857,76.870865 C494.171478,55.235920 481.213318,41.501278 461.842957,33.357578 C422.828308,16.955046 387.046234,22.392876 353.763123,48.823483 C320.176941,75.494736 294.024750,108.268402 273.250854,145.283813 C256.549377,175.042908 242.322403,206.136429 227.616776,236.958801 C208.898087,276.192322 189.017212,314.869446 169.979980,353.953308 C150.042236,394.886017 127.907982,434.586914 103.880669,473.229950 C98.353035,482.119995 91.682968,490.301392 85.497139,498.778656 C84.618378,499.982941 83.584274,501.103699 82.481056,502.108246 C80.055389,504.316895 77.257378,506.480408 74.093948,503.969971 C70.584740,501.185211 73.028076,498.140656 74.822952,495.644226 C96.363396,465.684296 115.364410,434.131897 132.456131,401.495789 C150.772888,366.520538 168.330276,331.142395 185.876068,295.769958 C210.378525,246.372757 232.890762,195.985336 258.516815,147.157166 C280.486267,105.296387 309.261353,68.785461 346.368835,38.850235 C386.905334,6.148772 434.429993,6.430920 471.317841,25.679674 C484.514130,32.565735 494.919342,42.411858 501.272034,56.119217 C504.202209,62.441738 509.797638,65.870537 515.557556,68.842110 C524.232300,73.317482 533.479553,76.172150 543.391968,75.647514 C551.088440,75.240173 558.648132,76.973824 566.325195,76.703568 C569.922180,76.576950 573.416382,77.684135 573.815918,81.714493 C574.231384,85.906212 571.488098,88.489143 567.389404,89.311142 C555.856079,91.624146 545.157288,96.215332 534.640686,101.277046 C525.447021,105.702034 517.758118,111.898674 512.384888,120.739220 C511.705780,121.856544 510.859253,123.409271 509.813904,123.675621 C504.801361,124.952835 503.992157,129.025757 502.943542,133.071472 C496.792908,156.802017 481.749481,174.609741 464.393768,190.870178 C462.462585,192.679474 460.180573,194.140350 458.395752,197.100586 C464.811829,202.160294 461.178436,207.579880 458.304169,212.873169 C452.482056,223.595062 448.921936,235.281921 443.751617,246.297501 C432.481262,270.309570 417.058533,291.548553 401.397980,312.755096 C389.402283,328.998871 377.680115,345.373138 362.556549,358.936554 C344.803131,374.858582 325.693848,389.093567 306.833710,403.638336 C303.860596,405.931213 300.971313,408.332825 298.271393,411.170227 C306.390900,411.286926 314.137207,409.711945 321.892059,408.334076 C331.237000,406.673645 340.617249,405.298584 350.066803,404.455627 C354.473785,404.062500 357.283142,406.453918 357.650818,410.506683 C358.039429,414.790222 355.035919,419.001068 351.207581,419.151825 C333.336609,419.855591 315.938782,423.570679 298.544006,427.306274 C295.617645,427.934723 292.771057,428.930939 289.848907,429.583832 C286.240112,430.390137 285.956238,432.159088 287.352875,435.353638 C292.542358,447.223633 292.460205,447.301941 304.825348,444.416199 C307.891724,443.700592 310.874298,442.630219 313.903992,441.752625 C319.281799,440.194916 324.151489,442.273407 325.424988,446.647034 C326.764771,451.248322 323.597015,455.821320 318.001068,456.939301 C312.871124,457.964172 308.025696,459.418640 303.923462,462.891266 C301.830566,464.662903 301.167145,466.435577 302.527557,468.941711 C309.279480,481.380005 314.534607,494.586456 321.899750,506.711884 C326.026276,513.505432 327.379883,521.325867 329.833374,528.721985 C330.870697,531.848999 329.182831,534.789673 325.977203,535.952148 C322.569458,537.187927 320.657410,534.816711 319.390686,532.099609 C316.365997,525.611511 313.569183,519.016663 310.515961,512.542419 C298.011414,486.027252 285.449066,459.539307 272.887604,433.051056 C272.398773,432.020294 271.701080,431.088593 271.139526,430.173950 C268.401093,429.715576 266.905762,431.632568 265.389984,432.958588 C246.715408,449.295624 224.583527,459.917816 202.572906,470.602386 C190.581863,476.423187 179.441711,483.910004 166.925964,488.641510 C156.962952,492.407928 146.954071,496.056122 136.927399,499.650299 C119.812469,505.785370 103.176720,513.013306 87.074677,521.446899 C73.658028,528.473999 63.790428,539.621887 53.755520,550.544861 C48.347904,556.431091 43.385334,562.752319 37.256512,567.934265 C32.554184,571.910095 26.526665,570.158752 24.417183,564.425842 C23.294493,561.374756 23.858034,558.249756 26.470863,556.844055 C35.711964,551.872437 41.185406,542.936707 49.128700,536.127319 M511.450836,98.926849 C516.449463,95.246834 521.502502,91.643593 527.891724,88.177635 C520.625854,85.340385 514.786011,82.062004 507.207947,80.160667 C508.470306,86.510735 508.164001,92.081734 508.473022,97.636627 C508.548767,98.998016 509.324860,99.772705 511.450836,98.926849z"/>
                            <path fill="black" d="M444.570190,41.089203 C448.726440,42.770779 450.627899,45.746956 450.787048,49.709557 C450.967926,54.212914 447.458588,59.705353 444.439758,60.073292 C440.806091,60.516174 433.947479,55.384567 433.110992,51.597153 C432.256622,47.728779 435.052643,43.541969 439.837280,41.798759 C441.205170,41.300385 442.736359,41.250038 444.570190,41.089203z"/>
                        </svg>
                        <a
                            href={status.babyBirdUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-base font-bold font-mono text-neutral-900 underline underline-offset-2 decoration-neutral-400 hover:decoration-neutral-900 transition-colors break-words"
                        >
                            {status.babyBirdLinkLabel || status.babyBirdUrl.replace(/^https?:\/\//, '')}
                        </a>
                        {status.content && (
                            <div className="mt-1.5">
                                {renderContent()}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {renderContent()}

                        {/* Items as clickable colored boxes */}
                        {status.items.length > 0 && (() => {
                            // Group TV episodes by show name into compressed cards
                            const tvGroups = new Map<string, ConsumableItem[]>();
                            const nonGrouped: ConsumableItem[] = [];
                            for (const item of status.items) {
                                const meta = parseItemMeta(item.image);
                                if (item.category === 'tv' && meta.externalSource === 'tvmaze-episode') {
                                    const group = tvGroups.get(item.title) || [];
                                    group.push(item);
                                    tvGroups.set(item.title, group);
                                } else {
                                    nonGrouped.push(item);
                                }
                            }
                            // Build display list: grouped TV cards + individual items
                            type DisplayEntry = { type: 'item'; item: ConsumableItem } | { type: 'tv-group'; showName: string; episodes: ConsumableItem[] };
                            const displayItems: DisplayEntry[] = [];
                            const tvGroupOrder: string[] = [];
                            for (const item of status.items) {
                                const meta = parseItemMeta(item.image);
                                if (item.category === 'tv' && meta.externalSource === 'tvmaze-episode') {
                                    if (!tvGroupOrder.includes(item.title)) {
                                        tvGroupOrder.push(item.title);
                                        displayItems.push({ type: 'tv-group', showName: item.title, episodes: tvGroups.get(item.title)! });
                                    }
                                } else {
                                    displayItems.push({ type: 'item', item });
                                }
                            }
                            const visibleItems = showAllItems ? displayItems : displayItems.slice(0, ITEM_LIMIT);
                            const totalDisplayCount = displayItems.length;

                            return (
                                <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-neutral-100">
                                    {visibleItems.map(entry => {
                                        if (entry.type === 'tv-group') {
                                            const { showName, episodes } = entry;
                                            const config = getCategoryConfig('tv');
                                            const firstEp = episodes[0];
                                            return (
                                                <div
                                                    key={`tv-group:${showName}`}
                                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] border min-w-0 max-w-full flex-wrap"
                                                    style={{
                                                        backgroundColor: config.color ? `${config.color}33` : '#f5f5f5',
                                                        borderColor: config.color || '#e5e5e5',
                                                    }}
                                                >
                                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: config.color || '#d4d4d4', border: `1.5px solid ${config.color || '#d4d4d4'}` }} />
                                                    <span className="font-medium text-neutral-800">{showName}</span>
                                                    {hasItemAggregatePage('tv') && (
                                                        <Link
                                                            href={buildItemPath(firstEp)}
                                                            className="inline-flex items-center justify-center h-4 w-4 text-[10px] border border-neutral-300 text-neutral-500 hover:text-neutral-800 hover:border-neutral-500"
                                                            title="Open show details"
                                                        >
                                                            ↗
                                                        </Link>
                                                    )}
                                                    <span className="text-neutral-400 mx-0.5">—</span>
                                                    {episodes.map((ep, i) => (
                                                        <button
                                                            key={ep.id}
                                                            onClick={() => setSelectedItem(ep)}
                                                            className="text-neutral-600 hover:text-neutral-900 hover:underline transition-colors"
                                                            title={ep.subtitle}
                                                        >
                                                            {ep.subtitle?.replace(/\s*-\s*.*$/, '') || `Ep ${i + 1}`}{i < episodes.length - 1 ? ',' : ''}
                                                        </button>
                                                    ))}
                                                </div>
                                            );
                                        }
                                        const { item } = entry;
                                        const config = getCategoryConfig(item.category);
                                        const itemMeta = parseItemMeta(item.image);
                                        const linkHref = item.category === 'link' ? itemMeta.linkUrl : null;
                                        const isLinked = config.coupling === 'api'
                                            ? (item.category === 'book' ? !!itemMeta.imageUrl : !!itemMeta.externalSource)
                                            : !!(item.rating || item.notes?.trim() || item.subtitle?.trim() || itemMeta.recipeUrl || itemMeta.linkUrl);
                                        return (
                                            <div
                                                key={item.id}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] border min-w-0 max-w-full"
                                                style={{
                                                    backgroundColor: config.color ? `${config.color}33` : '#f5f5f5',
                                                    borderColor: config.color || '#e5e5e5',
                                                }}
                                            >
                                                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: isLinked ? (config.color || '#d4d4d4') : 'transparent', border: `1.5px solid ${config.color || '#d4d4d4'}` }} />
                                                <button
                                                    onClick={() => setSelectedItem(item)}
                                                    className="font-medium text-neutral-800 hover:opacity-70 transition-opacity min-w-0 truncate"
                                                    title={item.title}
                                                >
                                                    {item.title}
                                                </button>
                                                {isLinked && hasItemAggregatePage(item.category) && (
                                                    <Link href={buildItemPath(item)} className="inline-flex items-center justify-center h-4 w-4 text-[10px] border border-neutral-300 text-neutral-500 hover:text-neutral-800 hover:border-neutral-500" title="Open item details" aria-label="Open item details">↗</Link>
                                                )}
                                                {linkHref && (
                                                    <a href={linkHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center h-4 w-4 text-[10px] border border-neutral-300 text-neutral-500 hover:text-neutral-800 hover:border-neutral-500" title="Open hyperlink" aria-label="Open hyperlink">↗</a>
                                                )}
                                                {item.rating ? (
                                                    <span className="text-neutral-500 font-mono ml-1">{item.rating}<span className="text-[9px]">/10</span></span>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                    {!showAllItems && totalDisplayCount > ITEM_LIMIT && (
                                        <button
                                            type="button"
                                            onClick={() => setShowAllItems(true)}
                                            className="inline-flex items-center px-1.5 py-0.5 text-[11px] border border-dashed border-neutral-300 text-neutral-400 hover:text-neutral-600 hover:border-neutral-400"
                                        >
                                            +{totalDisplayCount - ITEM_LIMIT} more
                                        </button>
                                    )}
                                </div>
                            );
                        })()}
                    </>
                )}
            </div>

            {/* Habits row — renders below content, no horizontal reflow */}
            {status.userId && showHabits && (
                <div className="mt-2 pt-2 border-t border-dashed border-neutral-200 animate-in fade-in duration-150">
                    <HabitChecklist
                        date={status.date}
                        readOnly={!isOwn}
                        userId={isOwn ? undefined : status.userId}
                        bundledDates={status.bundledDates}
                    />
                </div>
            )}

            <div className="mt-2 pt-2 border-t border-neutral-100">
                <button
                    onClick={() => setShowComments((prev) => !prev)}
                    className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
                >
                    {showComments ? 'Hide Comments' : `Comments (${status.comments?.length || 0})`}
                </button>

                {showComments && (
                    <div className="mt-2 space-y-2">
                        {(status.comments || []).map((comment) => (
                            <div key={comment.id} className="border border-neutral-200 p-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] uppercase tracking-widest text-neutral-500">{comment.username}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-neutral-300">
                                            {new Date(comment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                        {user && (currentUserId === comment.userId || isOwn) && (
                                            <button
                                                onClick={async () => {
                                                    await deleteComment(comment.id);
                                                }}
                                                className="text-[10px] uppercase tracking-widest text-neutral-300 hover:text-red-500"
                                            >
                                                Del
                                            </button>
                                        )}
                                        {user && currentUserId !== comment.userId && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const reason = window.prompt('Report reason (optional):') || '';
                                                        await reportComment(comment.id, reason);
                                                        pushToast({ message: 'Comment reported.', tone: 'success' });
                                                    } catch (error) {
                                                        pushToast({ message: error instanceof Error ? error.message : 'Failed to report comment', tone: 'error' });
                                                    }
                                                }}
                                                className="text-[10px] uppercase tracking-widest text-neutral-300 hover:text-neutral-700"
                                            >
                                                Report
                                            </button>
                                        )}
                                        {isAdmin && user && currentUserId !== comment.userId && (
                                            <button
                                                onClick={async () => {
                                                    if (!confirm('Hide this comment?')) return;
                                                    try {
                                                        await softDeleteComment(comment.id, 'Hidden by admin');
                                                        pushToast({ message: 'Comment hidden.', tone: 'success' });
                                                    } catch (error) {
                                                        pushToast({ message: error instanceof Error ? error.message : 'Failed to hide comment', tone: 'error' });
                                                    }
                                                }}
                                                className="text-[10px] uppercase tracking-widest text-red-300 hover:text-red-500"
                                            >
                                                Hide
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-neutral-700 mt-1 whitespace-pre-wrap">{comment.content}</p>
                            </div>
                        ))}

                        {user ? (
                            <form
                                onSubmit={async (event) => {
                                    event.preventDefault();
                                    if (!commentDraft.trim() || commentSubmitting) return;
                                    setCommentSubmitting(true);
                                    try {
                                        await addComment(status.id, commentDraft.trim());
                                        setCommentDraft('');
                                    } catch (error) {
                                        pushToast({ message: error instanceof Error ? error.message : 'Failed to post comment', tone: 'error' });
                                    } finally {
                                        setCommentSubmitting(false);
                                    }
                                }}
                                className="flex items-center gap-2"
                            >
                                <input
                                    value={commentDraft}
                                    onChange={(event) => setCommentDraft(event.target.value)}
                                    placeholder="Add a comment..."
                                    className="flex-1 border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-neutral-500"
                                />
                                <button
                                    type="submit"
                                    disabled={!commentDraft.trim() || commentSubmitting}
                                    className="px-3 py-1.5 text-[10px] uppercase tracking-widest border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
                                >
                                    Send
                                </button>
                            </form>
                        ) : (
                            <div className="text-[10px] uppercase tracking-widest text-neutral-300">
                                Sign in to comment.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Item detail modal */}
            <ConsumableModal
                key={`${selectedItem?.id ?? 'none'}-${selectedItem?.category ?? 'movie'}`}
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                existingItem={selectedItem || undefined}
                initialCategory={selectedItem?.category || 'movie'}
                readOnly={!isOwn || disableItemEditing}
                sourceUserId={!isOwn ? status.userId ?? undefined : undefined}
                onSave={isOwn && !disableItemEditing ? async (item) => {
                    if (selectedItem) {
                        await removeItemFromActive(selectedItem.id);
                    }
                    await addItemToStatus(status.id, item);
                    setSelectedItem(null);
                } : undefined}
                onDelete={isOwn && !disableItemEditing ? async () => {
                    if (selectedItem) {
                        await removeItemFromActive(selectedItem.id);
                    }
                    setSelectedItem(null);
                } : undefined}
            />
        </div>
    );
}
