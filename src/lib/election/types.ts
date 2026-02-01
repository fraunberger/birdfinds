export type ElectionStatus = 'nomination' | 'voting' | 'completed';

export interface Nomination {
    id: string;
    nominatorName: string;
    restaurantName: string;
    isWriteIn?: boolean;
    createdAt: number;
}

export interface Vote {
    voterName: string;
    rankings: string[]; // array of nomination IDs in order of preference
}

export interface Election {
    id: string;
    name: string; // "Dinner" or custom
    groupCodeword: string;
    adminName: string;

    // Scheduling
    voteStartTime: number; // Unix timestamp

    // State
    state?: ElectionStatus; // Manual override status
    participants: string[];
    nominations: Nomination[];
    votes: Vote[];

    // Computed or explicitly set
    createdAt: number;
}
