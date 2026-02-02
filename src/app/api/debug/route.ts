
import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/election/storage-adapter";
import { kv } from "@vercel/kv";
import { createClient } from "redis";

export const dynamic = 'force-dynamic';

export async function GET() {
    const adapter = getAdapter();
    const adapterType = adapter.type;

    let storageMode = 'File (Local) - Default';
    if (adapterType === 'vercel-kv') storageMode = 'Redis (Vercel KV HTTP)';
    if (adapterType === 'redis-url') storageMode = 'Redis (TCP Standard)';
    if (adapterType === 'file') storageMode = 'File (Local)';

    const envStatus = {
        hasUrl: !!process.env.KV_REST_API_URL,
        hasToken: !!process.env.KV_REST_API_TOKEN,
        hasRedisUrl: !!process.env.REDIS_URL,
        allKeys: Object.keys(process.env).sort()
    };

    let redisPing = 'Skipped';

    try {
        if (adapterType === 'vercel-kv') {
            await kv.set('debug_ping', 'pong');
            const res = await kv.get('debug_ping');
            redisPing = res === 'pong' ? 'Success' : 'Failed Value Match';
        }
        else if (adapterType === 'redis-url' && process.env.REDIS_URL) {
            // Need to create a new client here just for debug, independent of adapter internals if possible,
            // or we could expose the client. But simpler to just connect fresh for debug purity.
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
