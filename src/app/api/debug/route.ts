
import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/election/storage-adapter";
import { kv } from "@vercel/kv";

export const dynamic = 'force-dynamic';

export async function GET() {
    const adapter = getAdapter();
    const adapterName = adapter.constructor.name;

    let storageMode = 'File (Local)';
    if (adapterName === 'VercelKvAdapter') storageMode = 'Redis (Vercel KV HTTP)';
    if (adapterName === 'RedisUrlAdapter') storageMode = 'Redis (TCP Standard)';

    const envStatus = {
        hasUrl: !!process.env.KV_REST_API_URL,
        hasToken: !!process.env.KV_REST_API_TOKEN,
        hasRedisUrl: !!process.env.REDIS_URL,
        urlPrefix: process.env.KV_REST_API_URL ? process.env.KV_REST_API_URL.substring(0, 8) + '...' : null,
        // List all keys that might be relevant (starts with KV, REDIS, VERCEL, or just all non-secret keys)
        allKeys: Object.keys(process.env).sort()
    };

    let redisPing = 'Skipped';
    if (adapterName.includes('Redis') || adapterName.includes('VercelKv')) {
        try {
            // Test Save
            await adapter.save([{ id: 'ping', name: 'pong' } as any]);
            // Test Load
            const res = await adapter.load();
            const pong = res.find(e => e.id === 'ping');
            redisPing = pong ? 'Success' : 'Failed Roundtrip';
        } catch (e: any) {
            redisPing = `Error: ${e.message}`;
        }
    }

    return NextResponse.json({
        storageMode,
        envVars: envStatus,
        connectionTest: redisPing,
        timestamp: new Date().toISOString()
    });
}
