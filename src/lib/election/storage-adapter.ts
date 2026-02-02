
import { Election } from "./types";
import { kv } from "@vercel/kv";
import Redis from "ioredis";
import fs from "fs";
import path from "path";

export interface StorageAdapter {
    load(): Promise<Election[]>;
    save(elections: Election[]): Promise<void>;
}

// 1. Vercel KV via HTTP (Preferred for Serverless)
export class VercelKvAdapter implements StorageAdapter {
    async load(): Promise<Election[]> {
        try {
            const data = await kv.get<Election[]>("elections");
            return data || [];
        } catch (e) {
            console.error("Vercel KV Load Error:", e);
            return [];
        }
    }

    async save(elections: Election[]): Promise<void> {
        try {
            await kv.set("elections", elections);
        } catch (e) {
            console.error("Vercel KV Save Error:", e);
        }
    }
}

// 2. Standard Redis via TCP (ioredis) - Supports REDIS_URL
export class RedisUrlAdapter implements StorageAdapter {
    private client: Redis;

    constructor(url: string) {
        // Use tls option for secure Vercel/Upstash connections usually required
        this.client = new Redis(url, {
            // Most cloud redis requires TLS. If REDIS_URL starts with reddish:// (secure), ioredis handles it.
            // If manual control needed, check url. usually just passing url works for ioredis.
            family: 0, // IPv4/IPv6
        });

        this.client.on('error', (err) => console.error('Redis Client Error', err));
    }

    async load(): Promise<Election[]> {
        try {
            const data = await this.client.get("elections");
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Redis URL Load Error:", e);
            return [];
        }
    }

    async save(elections: Election[]): Promise<void> {
        try {
            await this.client.set("elections", JSON.stringify(elections));
        } catch (e) {
            console.error("Redis URL Save Error:", e);
        }
    }
}

// 3. Local File System Fallback
export class FileAdapter implements StorageAdapter {
    private filePath: string;

    constructor() {
        this.filePath = path.join(process.cwd(), "data", "elections.json");
    }

    async load(): Promise<Election[]> {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, "utf-8");
                return JSON.parse(data);
            }
        } catch (e) {
            console.error("File Load Error:", e);
        }
        return [];
    }

    async save(elections: Election[]): Promise<void> {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.filePath, JSON.stringify(elections, null, 2), "utf-8");
        } catch (e) {
            console.error("File Save Error:", e);
        }
    }
}

// Factory to choose the right adapter
export function getAdapter(): StorageAdapter {
    // 1. Try Vercel KV Specific (HTTP)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        console.log("[Storage] Using Vercel KV (HTTP).");
        return new VercelKvAdapter();
    }

    // 2. Try Generic REDIS_URL (TCP)
    if (process.env.REDIS_URL) {
        console.log("[Storage] Using Standard Redis (TCP).");
        return new RedisUrlAdapter(process.env.REDIS_URL);
    }

    // 3. Fallback to File
    console.log("[Storage] Using Local File persistence.");
    return new FileAdapter();
}
