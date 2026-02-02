
import { Election } from "./types";
import { getAdapter, StorageAdapter } from "./storage-adapter";

class ElectionStore {
    private adapter: StorageAdapter | null = null;

    constructor() {
        // No local cache anymore to prevent race conditions across serverless instances
    }

    private getAdapter() {
        if (!this.adapter) {
            this.adapter = getAdapter();
        }
        return this.adapter;
    }

    async createElection(election: Election) {
        await this.getAdapter().saveElection(election);
        return election;
    }

    async getElection(id: string): Promise<Election | undefined> {
        return this.getAdapter().getElection(id);
    }

    async getAllElections(): Promise<Election[]> {
        return this.getAdapter().getAllElections();
    }

    async addParticipant(electionId: string, name: string) {
        const adapter = this.getAdapter();
        const election = await adapter.getElection(electionId); // Fetch fresh
        if (!election) return null;
        if (!election.participants) election.participants = [];

        if (election.participants.includes(name)) return true; // Idempotent: already joined is fine
        election.participants.push(name);

        await adapter.saveElection(election); // Atomic save
        return true;
    }

    async addNomination(electionId: string, nomination: any) {
        const adapter = this.getAdapter();
        const election = await adapter.getElection(electionId);
        if (!election) return null;

        if (nomination.isWriteIn) {
            election.nominations.push(nomination);
        } else {
            const existingIdx = election.nominations.findIndex(n => n.nominatorName === nomination.nominatorName && !n.isWriteIn);
            if (existingIdx >= 0) {
                election.nominations[existingIdx] = nomination;
            } else {
                election.nominations.push(nomination);
            }
        }

        await adapter.saveElection(election);
        return election;
    }

    async addVote(electionId: string, vote: any) {
        const adapter = this.getAdapter();
        const election = await adapter.getElection(electionId);
        if (!election) return null;

        const existingIndex = election.votes.findIndex(v => v.voterName === vote.voterName);
        if (existingIndex >= 0) {
            election.votes[existingIndex] = vote;
        } else {
            election.votes.push(vote);
        }

        await adapter.saveElection(election);
        return election;
    }

    async finalizeElection(electionId: string) {
        const adapter = this.getAdapter();
        const election = await adapter.getElection(electionId);
        if (!election) return null;
        election.state = 'completed';

        try {
            const { determineCondorcetWinner } = require("./condorcet");
            const { calculateIRV } = require("./irv");

            let winner = determineCondorcetWinner(election.nominations, election.votes);
            let method = "Condorcet";

            if (!winner) {
                console.log("[Winner] No Condorcet winner, attempting IRV...");
                winner = calculateIRV(election.nominations, election.votes);
                method = "Instant Runoff";
            }

            (election as any).winner = winner;
            (election as any).winnerMethod = method; // Store method for UI
        } catch (e) {
            console.error("Failed to calculate winner logic", e);
        }

        await adapter.saveElection(election);
        return election;
    }
}

// Global instance 
const globalForStore = globalThis as unknown as { electionStoreV4: ElectionStore };
export const store = globalForStore.electionStoreV4 || new ElectionStore();
if (process.env.NODE_ENV !== 'production') globalForStore.electionStoreV4 = store;
