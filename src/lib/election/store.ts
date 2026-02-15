import { determineCondorcetWinner } from "./condorcet";
import { calculateIRV } from "./irv";
import { Election, Nomination, Vote } from "./types";
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

    private normalizeElection(election: Election): Election {
        if (!election.ballotVisibility) {
            election.ballotVisibility = "secret";
        }
        return election;
    }

    async createElection(election: Election) {
        this.normalizeElection(election);
        await this.getAdapter().saveElection(election);
        return election;
    }

    private async checkRetention(election: Election): Promise<Election | undefined> {
        if (election.name.toLowerCase() === 'shots') return election;

        const twoHours = 2 * 60 * 60 * 1000;
        if (Date.now() - election.createdAt > twoHours) {
            await this.getAdapter().deleteElection(election.id);
            return undefined;
        }
        return election;
    }

    async getElection(id: string): Promise<Election | undefined> {
        const election = await this.getAdapter().getElection(id);
        if (!election) return undefined;
        return this.checkRetention(this.normalizeElection(election));
    }

    async getAllElections(): Promise<Election[]> {
        const elections = await this.getAdapter().getAllElections();
        const results: Election[] = [];
        for (const e of elections) {
            const valid = await this.checkRetention(this.normalizeElection(e));
            if (valid) results.push(valid);
        }
        return results;
    }

    async startVoting(electionId: string) {
        const adapter = this.getAdapter();
        const election = await adapter.getElection(electionId);
        if (!election) return null;

        election.voteStartTime = Date.now();
        await adapter.saveElection(election);
        return election;
    }

    async addParticipant(electionId: string, name: string) {
        const adapter = this.getAdapter();
        const election = await adapter.getElection(electionId); // Fetch fresh
        if (!election) return null;
        if (!election.participants) election.participants = [];

        // Case-insensitive check
        if (election.participants.some(p => p.toLowerCase() === name.toLowerCase())) return true;
        election.participants.push(name);

        await adapter.saveElection(election); // Atomic save
        return true;
    }

    async addNomination(electionId: string, nomination: Nomination) {
        const adapter = this.getAdapter();
        const election = await adapter.getElection(electionId);
        if (!election) return null;

        if (nomination.isWriteIn) {
            election.nominations.push(nomination);
        } else {
            const existingIdx = election.nominations.findIndex(n => n.nominatorName.toLowerCase() === nomination.nominatorName.toLowerCase() && !n.isWriteIn);
            if (existingIdx >= 0) {
                election.nominations[existingIdx] = nomination;
            } else {
                election.nominations.push(nomination);
            }
        }

        await adapter.saveElection(election);
        return election;
    }

    async removeNomination(electionId: string, nominationId: string) {
        const adapter = this.getAdapter();
        const election = await adapter.getElection(electionId);
        if (!election) return null;

        election.nominations = election.nominations.filter(n => n.id !== nominationId);
        await adapter.saveElection(election);
        return election;
    }

    async addVote(electionId: string, vote: Omit<Vote, "createdAt">) {
        const adapter = this.getAdapter();
        const election = await adapter.getElection(electionId);
        if (!election) return null;

        const voteWithTimestamp: Vote = { ...vote, createdAt: Date.now() };
        const existingIndex = election.votes.findIndex(v => v.voterName === voteWithTimestamp.voterName);
        if (existingIndex >= 0) {
            election.votes[existingIndex] = voteWithTimestamp;
        } else {
            election.votes.push(voteWithTimestamp);
        }

        await adapter.saveElection(election);
        return election;
    }

    async finalizeElection(electionId: string) {
        const adapter = this.getAdapter();
        const election = await adapter.getElection(electionId);
        if (!election) return null;
        this.normalizeElection(election);
        if (election.state === 'cancelled') return election;
        election.state = 'completed';

        try {
            let winner = determineCondorcetWinner(election.nominations, election.votes);
            let method = "Condorcet";
            let tieBroken = false;
            let winnerVoteTime: number | undefined;

            if (!winner) {
                console.log("[Winner] No Condorcet winner, attempting IRV...");
                const irvResult = calculateIRV(election.nominations, election.votes);
                winner = irvResult.winnerId;
                method = "Instant Runoff";
                tieBroken = irvResult.tieBroken;
                winnerVoteTime = irvResult.winnerVoteTime;
            }

            election.winner = winner;
            election.winnerMethod = method as Election["winnerMethod"];
            election.tieBroken = tieBroken;
            election.winnerVoteTime = winnerVoteTime;
        } catch (e) {
            console.error("Failed to calculate winner logic", e);
        }

        await adapter.saveElection(election);
        return election;
    }

    async cancelElection(electionId: string) {
        const adapter = this.getAdapter();
        const election = await adapter.getElection(electionId);
        if (!election) return null;
        this.normalizeElection(election);

        election.state = 'cancelled';
        election.winner = null;
        election.winnerMethod = undefined;
        election.tieBroken = false;
        election.winnerVoteTime = undefined;

        await adapter.saveElection(election);
        return election;
    }
}

// Global instance 
const globalForStore = globalThis as unknown as { electionStoreV4: ElectionStore };
export const store = globalForStore.electionStoreV4 || new ElectionStore();
if (process.env.NODE_ENV !== 'production') globalForStore.electionStoreV4 = store;
