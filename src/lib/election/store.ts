
import { Election } from "./types";
import { getAdapter, StorageAdapter } from "./storage-adapter";

class ElectionStore {
    private elections: Map<string, Election>;
    private adapter: StorageAdapter | null = null;
    private readyPromise: Promise<void> | null = null;

    constructor() {
        this.elections = new Map();
        // Lazy init to allow environment to be ready, though usually fine immediately.
    }

    private async makeReady() {
        if (!this.adapter) {
            this.adapter = getAdapter();
            this.readyPromise = this.adapter.load().then(data => {
                data.forEach(e => this.elections.set(e.id, e));
                console.log(`[Store] Loaded ${this.elections.size} elections.`);
            });
        }
        if (this.readyPromise) {
            await this.readyPromise;
        }
    }

    private async save() {
        if (!this.adapter) return;
        await this.adapter.save(Array.from(this.elections.values()));
    }

    async createElection(election: Election) {
        await this.makeReady();
        this.elections.set(election.id, election);
        await this.save();
        return election;
    }

    async getElection(id: string): Promise<Election | undefined> {
        await this.makeReady();
        return this.elections.get(id);
    }

    async getAllElections(): Promise<Election[]> {
        await this.makeReady();
        return Array.from(this.elections.values());
    }

    async addParticipant(electionId: string, name: string) {
        await this.makeReady();
        const election = this.elections.get(electionId);
        if (!election) return null;
        if (!election.participants) election.participants = [];

        if (election.participants.includes(name)) return false; // Name taken
        election.participants.push(name);
        await this.save();
        return true;
    }

    async addNomination(electionId: string, nomination: any) {
        await this.makeReady();
        const election = this.elections.get(electionId);
        if (!election) return null;

        if (nomination.isWriteIn) {
            election.nominations.push(nomination);
            await this.save();
            return election;
        }

        const existingIdx = election.nominations.findIndex(n => n.nominatorName === nomination.nominatorName && !n.isWriteIn);
        if (existingIdx >= 0) {
            election.nominations[existingIdx] = nomination;
        } else {
            election.nominations.push(nomination);
        }
        await this.save();
        return election;
    }

    async addVote(electionId: string, vote: any) {
        await this.makeReady();
        const election = this.elections.get(electionId);
        if (!election) return null;

        const existingIndex = election.votes.findIndex(v => v.voterName === vote.voterName);
        if (existingIndex >= 0) {
            election.votes[existingIndex] = vote;
        } else {
            election.votes.push(vote);
        }
        await this.save();
        return election;
    }

    async finalizeElection(electionId: string) {
        await this.makeReady();
        const election = this.elections.get(electionId);
        if (!election) return null;
        election.state = 'completed';

        try {
            const { determineCondorcetWinner } = require("./condorcet");
            const winner = determineCondorcetWinner(election.nominations, election.votes);
            (election as any).winner = winner;
        } catch (e) {
            console.error("Failed to calculate winner logic", e);
        }

        await this.save();
        return election;
    }
}

// Global instance to survive HMR in dev
// Bump version to V3 to force reload of the new Async structure
const globalForStore = globalThis as unknown as { electionStoreV3: ElectionStore };

export const store = globalForStore.electionStoreV3 || new ElectionStore();

if (process.env.NODE_ENV !== 'production') globalForStore.electionStoreV3 = store;
