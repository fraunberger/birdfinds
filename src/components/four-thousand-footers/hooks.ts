"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
    getLog,
    getSaveFailed,
    getServerLog,
    getSyncState,
    subscribeLog,
    todayISO,
    type PeakLog,
    type SyncState,
} from "./log";
import type { View } from "./scene";

const subscribeNothing = () => () => {};

export function useLog(): PeakLog {
    return useSyncExternalStore(subscribeLog, getLog, getServerLog);
}

/** True when this browser refused the last save (private mode, storage full). */
export function useSaveFailed(): boolean {
    return useSyncExternalStore(subscribeLog, getSaveFailed, () => false);
}

/** Whose log is showing, and whether it's in step with the account. */
export function useSyncState(): SyncState {
    return useSyncExternalStore(subscribeLog, getSyncState, () => "loading" as const);
}

/** False while server rendering and hydrating, true after. */
export function useHydrated(): boolean {
    return useSyncExternalStore(
        subscribeNothing,
        () => true,
        () => false
    );
}

/** Today's date, YYYY-MM-DD in local time; empty while server rendering. */
export function useToday(): string {
    return useSyncExternalStore(subscribeNothing, todayISO, () => "");
}

/** Width of an element, tracked as it resizes; null until first measured. */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => (() => void) | void, number | null] {
    const [width, setWidth] = useState<number | null>(null);
    const ref = useCallback((node: T | null) => {
        if (!node) return;
        const observer = new ResizeObserver((entries) => {
            const next = entries[0]?.contentRect.width;
            if (next) setWidth(Math.floor(next));
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}

function ease(k: number): number {
    return k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
}

/**
 * The camera, with tweened moves. `setView` jumps (for dragging and sliders);
 * `animateTo` glides, taking the short way round. `viewRef` always holds the
 * latest view for event handlers.
 */
export function useAnimatedView(initial: View) {
    const [view, setViewState] = useState(initial);
    const viewRef = useRef(initial);
    const frame = useRef(0);

    const setView = useCallback((next: View) => {
        cancelAnimationFrame(frame.current);
        viewRef.current = next;
        setViewState(next);
    }, []);

    const animateTo = useCallback((target: View, ms = 650) => {
        cancelAnimationFrame(frame.current);
        const from = viewRef.current;
        const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (still) {
            viewRef.current = target;
            setViewState(target);
            return;
        }
        const turn = ((((target.azimuth - from.azimuth) % 360) + 540) % 360) - 180;
        const start = performance.now();
        const tick = (now: number) => {
            const k = Math.min(1, (now - start) / ms);
            const e = ease(k);
            const next: View = {
                azimuth: from.azimuth + turn * e,
                tilt: from.tilt + (target.tilt - from.tilt) * e,
                cx: from.cx + (target.cx - from.cx) * e,
                cy: from.cy + (target.cy - from.cy) * e,
                radius: from.radius + (target.radius - from.radius) * e,
            };
            viewRef.current = next;
            setViewState(next);
            if (k < 1) frame.current = requestAnimationFrame(tick);
        };
        frame.current = requestAnimationFrame(tick);
    }, []);

    useEffect(() => {
        const pending = frame;
        return () => cancelAnimationFrame(pending.current);
    }, []);

    return { view, viewRef, setView, animateTo };
}
