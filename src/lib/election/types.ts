export type ElectionStatus = 'nomination' | 'voting' | 'completed';

export interface Nomination {
    id: string;
    nominatorName: string;
    restaurantName: string;
    isWriteIn?: boolean;
    createdAt: number;
    // Rich Data (Simulated for Coot)
    metadata?: {
        address?: string;
        rating?: number;
        reviewCount?: number;
        photo?: string;
        priceLevel?: string; // $, $$, $$$
    };
}

export interface Vote {
    voterName: string;
    rankings: string[]; // array of nomination IDs in order of preference
    createdAt: number;
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
