"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Navigation2, RotateCcw } from "lucide-react";
import { PEAK_BY_ID, RANGES, formatFeet, type RangeId } from "./peaks";
import { formatDate } from "./log";
import type { PeakStatus } from "./stats";
import {
    FLAG_HEIGHT,
    OVERVIEW,
    anchorUnder,
    buildScene,
    facingName,
    focusView,
    naturalHeight,
    zoomView,
    type Anchor,
    type Pt,
    type Scene,
    type View,
} from "./scene";
import { useAnimatedView, useElementWidth } from "./hooks";
import * as C from "./palette";

const MIN_TILT = 8;
const MAX_TILT = 80;
/** Degrees of turn per pixel dragged. */
const DRAG_TURN = 0.35;
/** Zoom per pixel of wheel scroll; trackpad pinches arrive as small ctrl+wheel steps. */
const WHEEL_ZOOM = 0.002;
const PINCH_WHEEL_ZOOM = 0.01;

type Props = {
    status: Map<string, PeakStatus>;
    selectedId: string | null;
    onSelect: (id: string) => void;
};

type Pinch = {
    view: View;
    anchor: Anchor;
    distance: number;
    angle: number;
};

function peakAt(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    return target.closest("[data-peak]")?.getAttribute("data-peak") ?? null;
}

/** A pointer's position in the map's own pixels. */
function localPoint(e: { clientX: number; clientY: number }, el: Element): Pt {
    const box = el.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
}

function twoFingers(points: Map<number, Pt>): { mid: Pt; distance: number; angle: number } {
    const [a, b] = [...points.values()];
    return {
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    };
}

export function RangeView({ status, selectedId, onSelect }: Props) {
    const [measureRef, width] = useElementWidth<HTMLDivElement>();
    const mapRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useCallback(
        (node: HTMLDivElement | null) => {
            mapRef.current = node;
            return measureRef(node);
        },
        [measureRef]
    );
    const { view, viewRef, setView, animateTo } = useAnimatedView(OVERVIEW);
    const [focus, setFocus] = useState<RangeId | null>(null);
    const [hoverId, setHoverId] = useState<string | null>(null);
    const pointers = useRef(new Map<number, Pt>());
    const drag = useRef<{ x: number; azimuth: number; moved: boolean } | null>(null);
    const pinch = useRef<Pinch | null>(null);
    // useId output is not guaranteed to be a plain XML id, and url(#...) needs one.
    const clipId = `nh48-ground-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    const bagged = useMemo(
        () => new Set([...status.values()].filter((s) => s.bagged).map((s) => s.peak.id)),
        [status]
    );

    const w = width ?? 0;
    const maxHeight = Math.round(Math.min(620, Math.max(300, w * 0.66)));
    // Sized for the whole range at this tilt, so zooming never resizes the box.
    const height = Math.max(220, naturalHeight({ ...view, radius: OVERVIEW.radius }, w, maxHeight));
    const scene = useMemo(
        () => (w > 0 ? buildScene({ view, width: w, height, bagged, focus, selectedId }) : null),
        [view, w, height, bagged, focus, selectedId]
    );

    // The wheel zooms toward the cursor. React's wheel listener is passive, and
    // this one has to stop the page scrolling, so it's attached by hand.
    useEffect(() => {
        const node = mapRef.current;
        if (!node) return;
        const onWheel = (e: WheelEvent) => {
            const svg = node.querySelector("svg");
            if (!svg || e.deltaY === 0) return;
            e.preventDefault();
            const box = svg.getBoundingClientRect();
            const at = localPoint(e, svg);
            const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.height : 1;
            const factor = Math.exp(-e.deltaY * lines * (e.ctrlKey ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM));
            const v = viewRef.current;
            const anchor = anchorUnder(v, box.width, box.height, at, peakAt(e.target));
            setView(zoomView(v, box.width, box.height, factor, anchor, at));
        };
        node.addEventListener("wheel", onWheel, { passive: false });
        return () => node.removeEventListener("wheel", onWheel);
    }, [setView, viewRef]);

    const focusOn = (range: RangeId | null) => {
        setFocus(range);
        animateTo(focusView(range, viewRef.current));
    };

    const resetView = () => {
        setFocus(null);
        animateTo(OVERVIEW);
    };

    const turnBy = (degrees: number) => {
        const v = viewRef.current;
        animateTo({ ...v, azimuth: v.azimuth + degrees }, 450);
    };

    const zoomBy = (factor: number) => {
        const v = viewRef.current;
        const at = { x: w / 2, y: height / 2 };
        animateTo(zoomView(v, w, height, factor, anchorUnder(v, w, height, at), at), 300);
    };

    const tiltTo = (tilt: number) => {
        setView({ ...viewRef.current, tilt: Math.min(MAX_TILT, Math.max(MIN_TILT, tilt)) });
    };

    const startPinch = (svg: SVGSVGElement) => {
        const { mid, distance, angle } = twoFingers(pointers.current);
        const v = viewRef.current;
        const box = svg.getBoundingClientRect();
        const under = peakAt(document.elementFromPoint(box.left + mid.x, box.top + mid.y));
        pinch.current = { view: v, anchor: anchorUnder(v, w, height, mid, under), distance, angle };
        for (const id of pointers.current.keys()) {
            try {
                svg.setPointerCapture(id);
            } catch {
                // The pointer already ended.
            }
        }
    };

    const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        pointers.current.set(e.pointerId, localPoint(e, e.currentTarget));
        if (pointers.current.size === 1) {
            drag.current = { x: e.clientX, azimuth: viewRef.current.azimuth, moved: false };
        } else if (pointers.current.size === 2) {
            // A second finger turns the drag into a pinch; it's no longer a tap.
            drag.current = null;
            setHoverId(null);
            startPinch(e.currentTarget);
        }
    };

    const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        if (!pointers.current.has(e.pointerId)) {
            if (e.pointerType === "mouse") setHoverId(peakAt(e.target));
            return;
        }
        pointers.current.set(e.pointerId, localPoint(e, e.currentTarget));

        const p = pinch.current;
        if (p && pointers.current.size >= 2) {
            const { mid, distance, angle } = twoFingers(pointers.current);
            // Twisting the fingers clockwise turns the map clockwise.
            const turn = -(((angle - p.angle + 540) % 360) - 180);
            setView(zoomView(p.view, w, height, distance / p.distance, p.anchor, mid, turn));
            return;
        }

        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (!d.moved) {
            if (Math.abs(dx) < 5) return;
            d.moved = true;
            setHoverId(null);
            e.currentTarget.setPointerCapture(e.pointerId);
        }
        // Grab the near side of the range and drag it round.
        setView({ ...viewRef.current, azimuth: d.azimuth + dx * DRAG_TURN });
    };

    const endPointer = (e: React.PointerEvent<SVGSVGElement>, tap: boolean) => {
        if (!pointers.current.delete(e.pointerId)) return;
        if (pinch.current) {
            if (pointers.current.size >= 2) {
                startPinch(e.currentTarget);
                return;
            }
            pinch.current = null;
            // The finger left behind carries on turning, from where the pinch left off.
            const rest = [...pointers.current.values()][0];
            drag.current = rest
                ? {
                      x: rest.x + e.currentTarget.getBoundingClientRect().left,
                      azimuth: viewRef.current.azimuth,
                      moved: true,
                  }
                : null;
            return;
        }
        const d = drag.current;
        drag.current = null;
        if (!tap || !d || d.moved) return;
        const id = peakAt(e.target);
        if (id) onSelect(id);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const v = viewRef.current;
        const moves: Record<string, () => void> = {
            ArrowLeft: () => turnBy(-30),
            ArrowRight: () => turnBy(30),
            ArrowUp: () => tiltTo(v.tilt + 6),
            ArrowDown: () => tiltTo(v.tilt - 6),
            "+": () => zoomBy(1.5),
            "=": () => zoomBy(1.5),
            "-": () => zoomBy(1 / 1.5),
            "0": resetView,
            Home: resetView,
        };
        const move = moves[e.key];
        if (!move || e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        move();
    };

    const total = status.size;
    const hovered = hoverId && scene ? scene.mounds.find((m) => m.id === hoverId) : undefined;
    const facing = facingName(view.azimuth);
    const moved =
        focus !== null ||
        Math.abs(view.radius - OVERVIEW.radius) > 0.01 ||
        Math.abs(view.tilt - OVERVIEW.tilt) > 0.5 ||
        Math.abs(view.cx - OVERVIEW.cx) > 0.01 ||
        Math.abs(view.cy - OVERVIEW.cy) > 0.01 ||
        Math.abs((((view.azimuth % 360) + 540) % 360) - 180) > 0.5;

    return (
        <div>
            <div className="flex gap-1.5 overflow-x-auto pb-2 sm:flex-wrap" role="group" aria-label="Focus on a range">
                <RangeChip active={focus === null} onClick={() => focusOn(null)}>
                    All 48 <Count done={bagged.size} of={total} />
                </RangeChip>
                {RANGES.map((range) => {
                    const ids = [...status.values()].filter((s) => s.peak.range === range.id);
                    return (
                        <RangeChip key={range.id} active={focus === range.id} onClick={() => focusOn(range.id)}>
                            {range.short} <Count done={ids.filter((s) => s.bagged).length} of={ids.length} />
                        </RangeChip>
                    );
                })}
            </div>

            <div
                ref={containerRef}
                tabIndex={0}
                onKeyDown={onKeyDown}
                role="group"
                aria-label="Range map. Drag or use the arrow keys to turn it; scroll, pinch, or press plus and minus to zoom."
                className="relative border border-black outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                style={{ background: C.SKY }}
            >
                {scene ? (
                    <svg
                        width={w}
                        height={height}
                        viewBox={`0 0 ${w} ${height}`}
                        role="img"
                        aria-label={`The 48 four-thousand footers, ${bagged.size} bagged, seen facing ${facing}.`}
                        className="block cursor-grab select-none active:cursor-grabbing"
                        style={{ touchAction: "pan-y", fontFamily: C.MONO_STACK }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={(e) => endPointer(e, true)}
                        onPointerCancel={(e) => endPointer(e, false)}
                        onPointerLeave={(e) => {
                            setHoverId(null);
                            // A press that wandered off before it became a drag is over.
                            if (!e.currentTarget.hasPointerCapture(e.pointerId)) endPointer(e, false);
                        }}
                    >
                        <SceneArt scene={scene} clipId={clipId} />
                        {hovered && !hovered.selected && (
                            <Tooltip
                                x={hovered.summit.x}
                                y={hovered.summit.y - (hovered.bagged ? FLAG_HEIGHT : 4)}
                                width={w}
                                status={status.get(hovered.id)!}
                            />
                        )}
                    </svg>
                ) : (
                    <div style={{ height: 300 }} />
                )}

                <div
                    className="pointer-events-none absolute right-2 top-2 flex items-center gap-0.5 text-[10px] uppercase tracking-widest text-neutral-500"
                    aria-hidden="true"
                >
                    <Navigation2 size={12} style={{ transform: `rotate(${-view.azimuth}deg)` }} />N
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                <label className="flex items-center gap-2">
                    <span className="uppercase tracking-widest text-neutral-500">Stacked</span>
                    <input
                        type="range"
                        min={MIN_TILT}
                        max={MAX_TILT}
                        value={Math.round(view.tilt)}
                        onChange={(e) => tiltTo(Number(e.target.value))}
                        aria-label="Spread the peaks out"
                        className="w-28 accent-black"
                    />
                    <span className="uppercase tracking-widest text-neutral-500">Spread</span>
                </label>

                <button
                    type="button"
                    onClick={resetView}
                    disabled={!moved}
                    className="flex items-center gap-1.5 border border-black px-2 py-1 uppercase tracking-widest hover:bg-black hover:text-white disabled:border-neutral-300 disabled:text-neutral-400 disabled:hover:bg-transparent"
                >
                    <RotateCcw size={12} aria-hidden="true" />
                    Reset view
                </button>

                <Legend />
            </div>

            <p className="mt-2 text-[11px] text-neutral-500">
                Drag to turn the range, scroll or pinch to zoom. Tap a peak to log it.
                {scene && scene.unlabeled > 0 && (
                    <> {scene.unlabeled} names are hidden at this size; zoom in or pick a range to see them.</>
                )}
            </p>
        </div>
    );
}

// --- Pieces ---

function RangeChip({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`shrink-0 whitespace-nowrap border px-2.5 py-1 text-[11px] uppercase tracking-widest transition-colors ${
                active ? "border-black bg-black text-white" : "border-neutral-300 hover:border-black"
            }`}
        >
            {children}
        </button>
    );
}

function Count({ done, of }: { done: number; of: number }) {
    return (
        <span className="ml-1 tabular-nums opacity-60">
            {done}/{of}
        </span>
    );
}

function Legend() {
    return (
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-neutral-500">
            <span className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M1 15 L8 5 L15 15 Z" fill={C.BAGGED_LIT} stroke={C.BAGGED_STROKE} />
                    <line x1="8" y1="5" x2="8" y2="0.5" stroke={C.INK} />
                    <path d="M8 0.5 L13 2 L8 3.5 Z" fill={C.FLAG} />
                </svg>
                Bagged
            </span>
            <span className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M1 15 L8 5 L15 15 Z" fill={C.TOGO_LIT} stroke={C.TOGO_STROKE} />
                </svg>
                To go
            </span>
        </div>
    );
}

/**
 * Solid over the upper slopes, dissolving toward the foot: into the valley
 * floor for fills (so each ridge stands out of a band of low fog, like a
 * layered panorama), or to nothing for lines.
 */
function Fade({ id, color, to }: { id: string; color: string; to: string | null }) {
    return (
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} />
            <stop offset="0.45" stopColor={color} />
            <stop offset="1" stopColor={to ?? color} stopOpacity={to ? 1 : 0} />
        </linearGradient>
    );
}

/** Everything the scene describes, as SVG. */
function SceneArt({ scene, clipId }: { scene: Scene; clipId: string }) {
    const { ground } = scene;
    // A paper-colored outline behind text keeps labels legible over the drawing.
    const halo = {
        stroke: C.SKY,
        strokeWidth: 3,
        strokeLinejoin: "round" as const,
        style: { paintOrder: "stroke" as const },
    };
    return (
        <>
            <defs>
                <clipPath id={clipId}>
                    <ellipse cx={ground.cx} cy={ground.cy} rx={ground.rx} ry={ground.ry} />
                </clipPath>
            </defs>

            <ellipse
                cx={ground.cx}
                cy={ground.cy}
                rx={ground.rx}
                ry={ground.ry}
                fill={C.GROUND}
                stroke={C.GROUND_EDGE}
            />
            <g clipPath={`url(#${clipId})`} stroke={C.GRATICULE} strokeWidth={1}>
                {scene.graticule.map((l, i) => (
                    <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
                ))}
            </g>
            {scene.graticuleLabels.map((l) => (
                <text key={l.text} x={l.x} y={l.y - 3} fontSize={8} fill={C.MUTED}>
                    {l.text}
                </text>
            ))}

            {scene.mounds.map((m) => (
                <g key={m.id} data-peak={m.id} className="cursor-pointer">
                    <defs>
                        <Fade id={`${clipId}-${m.id}-lit`} color={m.fill} to={C.GROUND} />
                        <Fade id={`${clipId}-${m.id}-shade`} color={m.shadeFill} to={C.GROUND} />
                        <Fade id={`${clipId}-${m.id}-ridge`} color={m.stroke} to={null} />
                    </defs>
                    <path d={m.outline} fill={`url(#${clipId}-${m.id}-lit)`} />
                    <path d={m.shade} fill={`url(#${clipId}-${m.id}-shade)`} />
                    <path
                        d={m.ridge}
                        fill="none"
                        stroke={`url(#${clipId}-${m.id}-ridge)`}
                        strokeWidth={m.selected ? 2 : 1}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                    {m.bagged && (
                        <>
                            <line
                                x1={m.summit.x}
                                y1={m.summit.y}
                                x2={m.summit.x}
                                y2={m.summit.y - FLAG_HEIGHT}
                                stroke={C.INK}
                                strokeWidth={1.2}
                            />
                            <path
                                d={`M${m.summit.x} ${m.summit.y - FLAG_HEIGHT}L${m.summit.x + 8} ${
                                    m.summit.y - FLAG_HEIGHT + 2.5
                                }L${m.summit.x} ${m.summit.y - FLAG_HEIGHT + 5}Z`}
                                fill={C.FLAG}
                            />
                        </>
                    )}
                </g>
            ))}

            {scene.landmarks.map((l) => (
                <g key={l.name} pointerEvents="none">
                    <circle cx={l.x} cy={l.y} r={1.6} fill={C.MUTED} />
                    <text
                        x={l.tx}
                        y={l.y + 3}
                        textAnchor={l.anchor}
                        fontSize={8.5}
                        fontStyle="italic"
                        fill={C.MUTED}
                        {...halo}
                        strokeWidth={2.5}
                    >
                        {l.name}
                    </text>
                </g>
            ))}

            {scene.labels.map((l) => {
                const cx = (l.box.x0 + l.box.x1) / 2;
                return (
                    <g key={l.id} data-peak={l.id} className="cursor-pointer">
                        {l.leader && (
                            <line
                                x1={l.leader.x1}
                                y1={l.leader.y1}
                                x2={l.leader.x2}
                                y2={l.leader.y2}
                                stroke={C.MUTED}
                                strokeWidth={0.75}
                            />
                        )}
                        <text
                            x={cx}
                            y={l.box.y0 + 10}
                            textAnchor="middle"
                            fontSize={10}
                            letterSpacing={0.6}
                            fontWeight={l.selected ? 700 : 500}
                            fill={l.dim ? C.MUTED : C.INK}
                            {...halo}
                        >
                            {l.name}
                        </text>
                        <text x={cx} y={l.box.y0 + 20} textAnchor="middle" fontSize={9} fill={C.INK_SOFT} {...halo}>
                            {l.elevation}
                        </text>
                    </g>
                );
            })}
        </>
    );
}

function Tooltip({ x, y, width, status }: { x: number; y: number; width: number; status: PeakStatus }) {
    const peak = PEAK_BY_ID.get(status.peak.id)!;
    const title = `${peak.name.toUpperCase()}  ${formatFeet(peak.elevation)}′`;
    const detail = status.first
        ? `Bagged ${formatDate(status.first.date)}${status.ascents.length > 1 ? ` · ${status.ascents.length}×` : ""}`
        : "Not yet bagged";
    const boxW = Math.max(title.length * 6.6, detail.length * 6) + 16;
    const boxH = 36;
    const left = Math.min(Math.max(4, x - boxW / 2), width - boxW - 4);
    const top = y - boxH - 8 < 4 ? y + 14 : y - boxH - 8;
    return (
        <g pointerEvents="none">
            <rect x={left} y={top} width={boxW} height={boxH} fill="#fff" stroke={C.INK} />
            <text x={left + 8} y={top + 15} fontSize={11} fontWeight={700} fill={C.INK}>
                {title}
            </text>
            <text x={left + 8} y={top + 28} fontSize={10} fill={C.INK_SOFT}>
                {detail}
            </text>
        </g>
    );
}
