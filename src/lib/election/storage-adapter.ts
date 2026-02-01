
import { Election } from "./types";
import { kv } from "@vercel/kv";
import fs from "fs";
import path from "path";

export interface StorageAdapter {
    load(): Promise<Election[]>;
    save(elections: Election[]): Promise<void>;
}

export class RedisAdapter implements StorageAdapter {
    async load(): Promise<Election[]> {
        try {
            const data = await kv.get<Election[]>("elections");
            return data || [];
        } catch (e) {
            console.error("Redis Load Error:", e);
            return [];
        }
    }

    async save(elections: Election[]): Promise<void> {
        try {
            await kv.set("elections", elections);
        } catch (e) {
            console.error("Redis Save Error:", e);
        }
    }
}

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
    // Check for Vercel KV environment variables
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        console.log("[Storage] Using Redis persistence.");
        return new RedisAdapter();
    }
    console.log("[Storage] Using Local File persistence.");
    return new FileAdapter();
}
