
import { Election } from "./types";
import { kv } from "@vercel/kv";
import { createClient } from "redis";
import { supabase } from "@/lib/supabase";
import fs from "fs";
import path from "path";

export interface StorageAdapter {
    type: string;
    getElection(id: string): Promise<Election | undefined>;
    saveElection(election: Election): Promise<void>;
    getAllElections(): Promise<Election[]>;
    deleteElection(id: string): Promise<void>;
}

// 0. Supabase Migration (New Priority)
export class SupabaseAdapter implements StorageAdapter {
    type = "supabase";

    async getElection(id: string): Promise<Election | undefined> {
        try {
            const { data, error } = await supabase
                .from("elections")
                .select("data")
                .eq("id", id)
                .single();

            if (error) {
                if (error.code === 'PGRST116') return undefined; // Not found
                console.error("Supabase Load Error:", error);
                return undefined;
            }
            return data?.data as Election || undefined;
        } catch (e) {
            console.error("Supabase Adapter Error:", e);
            return undefined;
        }
    }

    async saveElection(election: Election): Promise<void> {
        try {
            const { error } = await supabase
                .from("elections")
                .upsert({ id: election.id, data: election, updated_at: new Date().toISOString() });

            if (error) {
                console.error("Supabase Save Error:", error);
            }
        } catch (e) {
            console.error("Supabase Adapter Save Error:", e);
        }
    }

    async getAllElections(): Promise<Election[]> {
        try {
            const { data, error } = await supabase
                .from("elections")
                .select("data");

            if (error) {
                console.error("Supabase List Error:", error);
                return [];
            }
            return (data || []).map(row => row.data as Election);
        } catch (e) {
            console.error("Supabase Adapter List Error:", e);
            return [];
        }
    }

    async deleteElection(id: string): Promise<void> {
        try {
            await supabase.from("elections").delete().eq("id", id);
        } catch (e) {
            console.error("Supabase Delete Error:", e);
        }
    }
}

// 1. Vercel KV via HTTP
export class VercelKvAdapter implements StorageAdapter {
    type = "vercel-kv";

    async getElection(id: string): Promise<Election | undefined> {
        try {
            const data = await kv.get<Election>(`election:${id}`);
            return data || undefined;
        } catch (e) {
            console.error("Vercel KV Load Error:", e);
            return undefined;
        }
    }

    async saveElection(election: Election): Promise<void> {
        try {
            await kv.set(`election:${election.id}`, election);
            await kv.sadd("elections:ids", election.id);
        } catch (e) {
            console.error("Vercel KV Save Error:", e);
        }
    }

    async getAllElections(): Promise<Election[]> {
        try {
            const ids = await kv.smembers("elections:ids");
            if (!ids || ids.length === 0) return [];

            const pipelines = ids.map(id => kv.get<Election>(`election:${id}`));
            const results = await Promise.all(pipelines);
            return results.filter(e => e !== null) as Election[];
        } catch (e) {
            console.error("Vercel KV List Error:", e);
            return [];
        }
    }

    async deleteElection(id: string): Promise<void> {
        try {
            await kv.del(`election:${id}`);
            await kv.srem("elections:ids", id);
        } catch (e) {
            console.error("Vercel KV Delete Error:", e);
        }
    }
}

// 2. Standard Redis via TCP
export class RedisUrlAdapter implements StorageAdapter {
    type = "redis-url";
    private client: ReturnType<typeof createClient>;
    private isConnected = false;

    constructor(url: string) {
        this.client = createClient({ url });
        this.client.on('error', (err: unknown) => console.error('Redis Client Error', err));
    }

    private async ensureConnection() {
        if (!this.isConnected) {
            await this.client.connect();
            this.isConnected = true;
        }
    }

    async getElection(id: string): Promise<Election | undefined> {
        try {
            await this.ensureConnection();
            const data = await this.client.get(`election:${id}`);
            return data ? JSON.parse(data) : undefined;
        } catch (e) {
            console.error("Redis URL Load Error:", e);
            return undefined;
        }
    }

    async saveElection(election: Election): Promise<void> {
        try {
            await this.ensureConnection();
            await this.client.set(`election:${election.id}`, JSON.stringify(election));
            await this.client.sAdd("elections:ids", election.id);
        } catch (e) {
            console.error("Redis URL Save Error:", e);
        }
    }

    async getAllElections(): Promise<Election[]> {
        try {
            await this.ensureConnection();
            const ids = await this.client.sMembers("elections:ids");
            if (!ids || ids.length === 0) return [];

            const elections = [];
            for (const id of ids) {
                const data = await this.client.get(`election:${id}`);
                if (data) elections.push(JSON.parse(data));
            }
            return elections;
        } catch (e) {
            console.error("Redis URL List Error:", e);
            return [];
        }
    }

    async deleteElection(id: string): Promise<void> {
        try {
            await this.ensureConnection();
            await this.client.del(`election:${id}`);
            await this.client.sRem("elections:ids", id);
        } catch (e) {
            console.error("Redis URL Delete Error:", e);
        }
    }
}

// 3. Local File System Fallback
export class FileAdapter implements StorageAdapter {
    type = "file";
    private filePath: string;

    constructor() {
        this.filePath = path.join(process.cwd(), "data", "elections.json");
    }

    private loadAll(): Election[] {
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

    private saveAll(elections: Election[]) {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.filePath, JSON.stringify(elections, null, 2), "utf-8");
        } catch (e) {
            console.error("File Save Error:", e);
        }
    }

    async getElection(id: string): Promise<Election | undefined> {
        const all = this.loadAll();
        return all.find(e => e.id === id);
    }

    async saveElection(election: Election): Promise<void> {
        const all = this.loadAll();
        const idx = all.findIndex(e => e.id === election.id);
        if (idx >= 0) {
            all[idx] = election;
        } else {
            all.push(election);
        }
        this.saveAll(all);
    }

    async getAllElections(): Promise<Election[]> {
        return this.loadAll();
    }

    async deleteElection(id: string): Promise<void> {
        const all = this.loadAll();
        const filtered = all.filter(e => e.id !== id);
        this.saveAll(filtered);
    }
}


// Factory to choose the right adapter
export function getAdapter(): StorageAdapter {
    // 0. Supabase (Top Priority)
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        return new SupabaseAdapter();
    }

    // 1. Vercel KV Specific (HTTP)
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        return new VercelKvAdapter();
    }

    // 2. Generic REDIS_URL (TCP)
    if (process.env.REDIS_URL) {
        return new RedisUrlAdapter(process.env.REDIS_URL);
    }

    // 3. Fallback to File
    return new FileAdapter();
}
