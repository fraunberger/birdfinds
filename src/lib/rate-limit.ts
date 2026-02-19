/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Works per-process, so on serverless (Vercel) it limits bursts within a
 * single isolate.  For stronger guarantees swap to Redis using the existing
 * redis dependency.
 */

interface RateLimitEntry {
    timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Prune stale keys every 60 s to prevent memory leaks
const PRUNE_INTERVAL_MS = 60_000;
let lastPrune = Date.now();

function pruneStale(windowMs: number) {
    const now = Date.now();
    if (now - lastPrune < PRUNE_INTERVAL_MS) return;
    lastPrune = now;

    const cutoff = now - windowMs;
    for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
        if (entry.timestamps.length === 0) store.delete(key);
    }
}

export interface RateLimitResult {
    /** Whether the request is allowed */
    success: boolean;
    /** Remaining requests in the current window */
    remaining: number;
    /** Milliseconds until the oldest request in the window expires */
    resetMs: number;
}

/**
 * Check and consume one request for the given key.
 *
 * @param key      Unique identifier (e.g. IP address, user ID)
 * @param limit    Maximum number of requests allowed in the window
 * @param windowMs Window duration in milliseconds (default 60 000 = 1 minute)
 */
export function rateLimit(
    key: string,
    limit: number,
    windowMs: number = 60_000,
): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;

    pruneStale(windowMs);

    let entry = store.get(key);
    if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
    }

    // Drop timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= limit) {
        const oldest = entry.timestamps[0] ?? now;
        return {
            success: false,
            remaining: 0,
            resetMs: oldest + windowMs - now,
        };
    }

    entry.timestamps.push(now);

    return {
        success: true,
        remaining: limit - entry.timestamps.length,
        resetMs: windowMs,
    };
}

/**
 * Helper to extract a best-effort client IP from a Request.
 * Prefers standard forwarding headers, falls back to "unknown".
 */
export function getClientIp(req: Request): string {
    const forwarded =
        req.headers.get("x-forwarded-for") ??
        req.headers.get("x-real-ip") ??
        "unknown";
    // x-forwarded-for may be comma-separated; take the first
    return forwarded.split(",")[0].trim();
}
