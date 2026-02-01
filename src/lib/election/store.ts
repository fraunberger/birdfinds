import { Election } from "./types";

// In-memory store logic
class ElectionStore {
    private elections: Map<string, Election>;

    constructor() {
        this.elections = new Map();
    }

    createElection(election: Election) {
        this.elections.set(election.id, election);
        return election;
    }

    getElection(id: string): Election | undefined {
        return this.elections.get(id);
    }

    addParticipant(electionId: string, name: string) {
        const election = this.elections.get(electionId);
        if (!election) return null;
        if (!election.participants) election.participants = [];

        if (election.participants.includes(name)) return false; // Name taken
        election.participants.push(name);
        return true;
    }

    addNomination(electionId: string, nomination: any) {
        const election = this.elections.get(electionId);
        if (!election) return null;

        // If write-in, always append
        if (nomination.isWriteIn) {
            election.nominations.push(nomination);
            return election;
        }

        // Upsert nomination for primary nom
        const existingIdx = election.nominations.findIndex(n => n.nominatorName === nomination.nominatorName && !n.isWriteIn);
        if (existingIdx >= 0) {
            election.nominations[existingIdx] = nomination;
        } else {
            election.nominations.push(nomination);
        }
        return election;
    }

    addVote(electionId: string, vote: any) {
        const election = this.elections.get(electionId);
        if (!election) return null;

        // Replace existing vote if same voter
        const existingIndex = election.votes.findIndex(v => v.voterName === vote.voterName);
        if (existingIndex >= 0) {
            election.votes[existingIndex] = vote;
        } else {
            election.votes.push(vote);
        }
        return election;
    }

    finalizeElection(electionId: string) {
        const election = this.elections.get(electionId);
        if (!election) return null;
        election.state = 'completed';

        // Calculate Winner
        const { determineCondorcetWinner } = require("./condorcet");
        const winner = determineCondorcetWinner(election.nominations, election.votes);
        (election as any).winner = winner;

        return election;
    }
}

// Global instance to survive HMR in dev
const globalForStore = globalThis as unknown as { electionStoreV2: ElectionStore };

export const store = globalForStore.electionStoreV2 || new ElectionStore();

if (process.env.NODE_ENV !== 'production') globalForStore.electionStoreV2 = store;
