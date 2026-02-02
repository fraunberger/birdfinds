
import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/election/storage-adapter";
import { kv } from "@vercel/kv";
import { createClient } from "redis";

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
        allKeys: Object.keys(process.env).sort()
    };

    let redisPing = 'Skipped';

    try {
        if (adapterName === 'VercelKvAdapter') {
            await kv.set('debug_ping', 'pong');
            const res = await kv.get('debug_ping');
            redisPing = res === 'pong' ? 'Success' : 'Failed Value Match';
        }
        else if (adapterName === 'RedisUrlAdapter' && process.env.REDIS_URL) {
            const client = createClient({ url: process.env.REDIS_URL });
            client.on('error', (e) => console.log('Debug Redis Error', e));
            await client.connect();
            await client.set('debug_ping', 'pong');
            const res = await client.get('debug_ping');
            await client.disconnect();
            redisPing = res === 'pong' ? 'Success' : 'Failed Value Match';
        }
    } catch (e: any) {
        redisPing = `Error: ${e.message}`;
    }

    return NextResponse.json({
        storageMode,
        envVars: envStatus,
        connectionTest: redisPing,
        timestamp: new Date().toISOString()
    });
}
