
import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/election/storage-adapter";
import { kv } from "@vercel/kv";

export const dynamic = 'force-dynamic';

export async function GET() {
    const adapter = getAdapter();
    const isRedis = adapter.constructor.name === 'RedisAdapter';

    const envStatus = {
        hasUrl: !!process.env.KV_REST_API_URL,
        hasToken: !!process.env.KV_REST_API_TOKEN,
        urlPrefix: process.env.KV_REST_API_URL ? process.env.KV_REST_API_URL.substring(0, 8) + '...' : null,
        // List all keys that might be relevant (starts with KV, REDIS, VERCEL, or just all non-secret keys)
        allKeys: Object.keys(process.env).sort()
    };

    let redisPing = 'Skipped';
    if (isRedis) {
        try {
            // Simple ping to check connection
            await kv.set('ping', 'pong');
            const res = await kv.get('ping');
            redisPing = res === 'pong' ? 'Success' : 'Failed Value Match';
        } catch (e: any) {
            redisPing = `Error: ${e.message}`;
        }
    }

    return NextResponse.json({
        storageMode: isRedis ? 'Redis (Cloud)' : 'File (Local)',
        envVars: envStatus,
        connectionTest: redisPing,
        timestamp: new Date().toISOString()
    });
}
