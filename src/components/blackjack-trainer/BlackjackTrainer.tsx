"use client";

import React, { useState, useCallback } from "react";
import { RefreshCcw, ThumbsUp, ThumbsDown, X, Grid as GridIcon } from "lucide-react";

// --- Types ---

type Suit = "hearts" | "diamonds" | "clubs" | "spades";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

interface Card {
    suit: Suit;
    rank: Rank;
    value: number;
}

type Move = "hit" | "stand" | "double" | "split";

interface GameStats {
    correctMoves: number;
    totalMoves: number;
    handsPlayed: number;
}

// --- Constants & Helpers ---

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const getCardValue = (rank: Rank): number => {
    if (["J", "Q", "K"].includes(rank)) return 10;
    if (rank === "A") return 11;
    return parseInt(rank);
};

const createDeck = (): Card[] => {
    const deck: Card[] = [];
    // Use 6 decks
    for (let i = 0; i < 6; i++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({ suit, rank, value: getCardValue(rank) });
            }
        }
    }
    return shuffle(deck);
};

const shuffle = (deck: Card[]): Card[] => {
    const newDeck = [...deck];
    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
};

const calculateHand = (hand: Card[]) => {
    let value = 0;
    let aces = 0;
    let soft = false;

    for (const card of hand) {
        value += card.value;
        if (card.rank === "A") aces += 1;
    }

    while (value > 21 && aces > 0) {
        value -= 10;
        aces -= 1;
    }

    soft = aces > 0;
    return { value, soft };
};

// --- Strategy Logic ---
// Matches standard strategy card
const getOptimalMove = (playerHand: Card[], dealerUpCard: Card): { move: Move, rowKey: string } => {
    const { value, soft } = calculateHand(playerHand);
    const dealerVal = dealerUpCard.value; // 2-11 (A=11)

    // 1. Pairs
    if (playerHand.length === 2 && playerHand[0].rank === playerHand[1].rank) {
        const rank = playerHand[0].rank;
        const rowKey = `PAIR_${rank}`; // Matches grid keys

        if (rank === "A" || rank === "8") return { move: "split", rowKey };
        if (rank === "9") {
            if (dealerVal === 7 || dealerVal === 10 || dealerVal === 11) return { move: "stand", rowKey };
            return { move: "split", rowKey };
        }
        if (rank === "7") {
            if (dealerVal >= 2 && dealerVal <= 7) return { move: "split", rowKey };
            return { move: "hit", rowKey };
        }
        if (rank === "6") {
            if (dealerVal >= 2 && dealerVal <= 6) return { move: "split", rowKey };
            return { move: "hit", rowKey };
        }
        if (rank === "5") {
            if (dealerVal >= 2 && dealerVal <= 9) return { move: "double", rowKey };
            return { move: "hit", rowKey };
        }
        if (rank === "4") {
            if (dealerVal === 5 || dealerVal === 6) return { move: "split", rowKey };
            return { move: "hit", rowKey };
        }
        if (rank === "3" || rank === "2") {
            if (dealerVal >= 2 && dealerVal <= 7) return { move: "split", rowKey };
            return { move: "hit", rowKey };
        }
        if (["10", "J", "Q", "K"].includes(rank)) return { move: "stand", rowKey: "PAIR_10" };
    }

    // 2. Soft Totals
    if (soft) {
        const rowKey = `SOFT_${value}`;
        if (value >= 19) return { move: "stand", rowKey: "SOFT_19+" };
        if (value === 18) { // A,7
            if (dealerVal >= 2 && dealerVal <= 6) return { move: "double", rowKey };
            if (dealerVal >= 9) return { move: "hit", rowKey };
            return { move: "stand", rowKey };
        }
        if (value === 17) { // A,6
            if (dealerVal >= 3 && dealerVal <= 6) return { move: "double", rowKey };
            return { move: "hit", rowKey };
        }
        if (value === 16 || value === 15) {
            if (dealerVal >= 4 && dealerVal <= 6) return { move: "double", rowKey: "SOFT_15_16" };
            return { move: "hit", rowKey: "SOFT_15_16" };
        }
        if (value === 14 || value === 13) {
            if (dealerVal === 5 || dealerVal === 6) return { move: "double", rowKey: "SOFT_13_14" };
            return { move: "hit", rowKey: "SOFT_13_14" };
        }
    }

    // 3. Hard Totals
    if (value >= 17) return { move: "stand", rowKey: "HARD_17+" };
    if (value >= 13 && value <= 16) {
        if (dealerVal >= 2 && dealerVal <= 6) return { move: "stand", rowKey: value.toString() }; // Using number keys for 13-16 to match specific rows if needed, or grouping.
        // Let's use individual keys for 12-16
        return { move: "hit", rowKey: `HARD_${value}` };
    }
    if (value === 12) {
        if (dealerVal >= 4 && dealerVal <= 6) return { move: "stand", rowKey: "HARD_12" };
        return { move: "hit", rowKey: "HARD_12" };
    }
    if (value === 11) return { move: "double", rowKey: "HARD_11" };
    if (value === 10) {
        if (dealerVal >= 2 && dealerVal <= 9) return { move: "double", rowKey: "HARD_10" };
        return { move: "hit", rowKey: "HARD_10" };
    }
    if (value === 9) {
        if (dealerVal >= 3 && dealerVal <= 6) return { move: "double", rowKey: "HARD_9" };
        return { move: "hit", rowKey: "HARD_9" };
    }
    // 8 or less
    return { move: "hit", rowKey: "HARD_5_8" };
};

// --- Trainer Component ---

export function BlackjackTrainer() {
    const [deck, setDeck] = useState<Card[]>(() => createDeck());

    const [playerHands, setPlayerHands] = useState<Card[][]>([[]]);
    const [currentHandIndex, setCurrentHandIndex] = useState(0);
    const [dealerHand, setDealerHand] = useState<Card[]>([]);
    const [gameState, setGameState] = useState<"playing" | "dealerTurn" | "gameOver">("gameOver");

    const [msg, setMsg] = useState("");
    const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
    const [showChart, setShowChart] = useState(false);
    const [aceMode, setAceMode] = useState(false); // New Mode Toggle

    const [stats, setStats] = useState<GameStats>({
        correctMoves: 0,
        totalMoves: 0,
        handsPlayed: 0
    });

    const [highlightRowKey, setHighlightRowKey] = useState<string | null>(null);
    const [highlightDealerCol, setHighlightDealerCol] = useState<string | null>(null);

    const dealHand = useCallback(() => {
        let currentDeck = [...deck];
        // Reshuffle if low
        if (currentDeck.length < 20) {
            currentDeck = createDeck();
        }

        // -- Logic for Ace Mode --
        if (aceMode) {
            // Find an Ace in the remaining deck and swap to position 0 (Player card 1)
            const aceIndex = currentDeck.findIndex(c => c.rank === "A");
            if (aceIndex !== -1) {
                // Swap
                [currentDeck[0], currentDeck[aceIndex]] = [currentDeck[aceIndex], currentDeck[0]];
            }
        }

        // Deal: P, D, P, D
        const p1 = currentDeck.shift()!;
        const d1 = currentDeck.shift()!;
        const p2 = currentDeck.shift()!;
        const d2 = currentDeck.shift()!;

        const newPlayerHand = [p1, p2];
        const newDealerHand = [d1, d2];

        setPlayerHands([newPlayerHand]);
        setCurrentHandIndex(0);
        setDealerHand(newDealerHand);
        setDeck(currentDeck);

        setFeedback(null);
        setShowChart(false);
        setHighlightRowKey(null);
        setHighlightDealerCol(null);

        // Check for Player Blackjack
        const { value: pVal } = calculateHand(newPlayerHand);
        if (pVal === 21) {
            const { value: dVal } = calculateHand(newDealerHand);
            if (dVal === 21) {
                setMsg("Push! Both have Blackjack.");
                setGameState("gameOver");
            } else {
                setMsg("BLACKJACK! You Win!");
                setFeedback("correct");
                setGameState("gameOver");
            }
            setStats(prev => ({ ...prev, handsPlayed: prev.handsPlayed + 1 }));
        } else {
            setGameState("playing");
            setMsg("Your move!");
        }

    }, [deck, aceMode]);

    const toggleAceMode = () => {
        setAceMode(!aceMode);
        setStats({ correctMoves: 0, totalMoves: 0, handsPlayed: 0 }); // Reset stats regarding mode change
        setGameState("gameOver");
        setMsg("Mode Changed. Deal a new hand.");
        setPlayerHands([[]]);
        setDealerHand([]);
    };

    const handlePlayerMove = (move: Move) => {
        if (gameState !== "playing") return;

        const currentHand = playerHands[currentHandIndex];
        const dealerUp = dealerHand[0];
        const { move: optimal, rowKey } = getOptimalMove(currentHand, dealerUp);

        setHighlightRowKey(rowKey);
        setHighlightDealerCol(dealerUp.rank);

        let adjustedOptimal = optimal;
        // Basic rules limitations
        if (optimal === "split") {
            if (currentHand.length !== 2 || currentHand[0].rank !== currentHand[1].rank) {
                adjustedOptimal = "hit";
            }
        }
        if (optimal === "double") {
            if (currentHand.length > 2) adjustedOptimal = "hit";
        }

        const correct = move === adjustedOptimal;

        setStats(prev => ({
            ...prev,
            totalMoves: prev.totalMoves + 1,
            correctMoves: correct ? prev.correctMoves + 1 : prev.correctMoves
        }));

        if (!correct) {
            setMsg(`Incorrect! Should ${adjustedOptimal.toUpperCase()}`);
            setFeedback("incorrect");
            setShowChart(true);
        } else {
            setMsg("Correct!");
            setFeedback("correct");
            setShowChart(false);
        }

        // -- Execute Move --
        const nextDeck = [...deck];
        const nextHands = [...playerHands];
        let nextHandIndex = currentHandIndex;
        let turnOver = false;

        if (move === "split") {
            const c1 = currentHand[0];
            const c2 = currentHand[1];
            const nc1 = nextDeck.shift()!;
            const nc2 = nextDeck.shift()!;

            nextHands.splice(currentHandIndex, 1, [c1, nc1], [c2, nc2]);
            setPlayerHands(nextHands);
            setDeck(nextDeck);
            // Stays on current index
        } else if (move === "hit" || move === "double") {
            const newCard = nextDeck.shift()!;
            nextHands[currentHandIndex] = [...currentHand, newCard];
            setPlayerHands(nextHands);
            setDeck(nextDeck);

            const { value } = calculateHand(nextHands[currentHandIndex]);

            if (value > 21 || move === "double") {
                if (currentHandIndex < nextHands.length - 1) nextHandIndex++;
                else turnOver = true;
            }
        } else if (move === "stand") {
            if (currentHandIndex < nextHands.length - 1) nextHandIndex++;
            else turnOver = true;
        }

        setCurrentHandIndex(nextHandIndex);

        if (turnOver) {
            setGameState("dealerTurn");
            runDealer(nextHands, nextDeck);
        }
    };

    const runDealer = (_finalPlayerHands: Card[][], currentDeck: Card[]) => {
        const dHand = [...dealerHand];
        let dDeck = [...currentDeck];
        let dVal = calculateHand(dHand).value;

        while (dVal < 17) {
            dHand.push(dDeck[0]);
            dDeck = dDeck.slice(1);
            dVal = calculateHand(dHand).value;
        }

        setDealerHand(dHand);
        setDeck(dDeck);
        setGameState("gameOver");

        if (dVal > 21) setMsg(m => m + " Dealer Busted.");
        else setMsg(m => m + " Hand Complete.");

        setStats(prev => ({ ...prev, handsPlayed: prev.handsPlayed + 1 }));
    };

    const accuracy = stats.totalMoves > 0 ? Math.round((stats.correctMoves / stats.totalMoves) * 100) : 100;

    return (
        <div className="w-full max-w-md md:max-w-xl mx-auto p-4 text-black font-sans relative flex flex-col min-h-[600px]">

            {/* Header */}
            <div className="flex justify-between items-start mb-6 border-b pb-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Blackjack Trainer</h2>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-neutral-500 uppercase tracking-wider">S17 Strategy</span>
                        <button
                            onClick={toggleAceMode}
                            className={`px-2 py-0.5 text-xs font-bold rounded-sm border ${aceMode ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-gray-100 border-gray-200 text-gray-500'}`}
                        >
                            {aceMode ? "Soft Hands Only" : "Standard Mode"}
                        </button>
                    </div>
                </div>

                <div className="flex flex-col items-end">
                    <div className={`text-3xl font-black ${accuracy >= 90 ? 'text-green-600' : accuracy >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {accuracy}%
                    </div>
                    <button
                        onClick={() => setShowChart(!showChart)}
                        className="mt-1 flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-black transition-colors"
                    >
                        <GridIcon size={14} />
                        {showChart ? "Hide Chart" : "Show Chart"}
                    </button>
                </div>
            </div>

            {/* Game Area */}
            <div className="flex-1 flex flex-col items-center justify-center py-4 space-y-8 relative">

                {/* Dealer */}
                <div className="flex flex-col items-center">
                    <div className="flex gap-2">
                        {dealerHand.map((card, i) => (
                            <CardView
                                key={i}
                                card={card}
                                hidden={gameState === "playing" && i === 1}
                            />
                        ))}
                    </div>
                    <div className="h-6 mt-1">
                        {gameState !== "playing" && dealerHand.length > 0 && (
                            <span className="text-sm font-bold bg-gray-100 px-2 py-0.5 rounded-sm text-gray-600">
                                {calculateHand(dealerHand).value}
                            </span>
                        )}
                    </div>
                </div>

                {/* Feedback Message */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-full flex justify-center pointer-events-none">
                    {msg && (
                        <div className={`
                    px-4 py-2 rounded-sm font-bold flex items-center gap-2 text-sm border-2
                    animate-in fade-in zoom-in duration-200 bg-white
                    ${feedback === 'correct' ? 'border-green-500 text-green-700' :
                                feedback === 'incorrect' ? 'border-red-500 text-red-700' :
                                    'border-gray-500 text-gray-700'}
                `}>
                            {feedback === 'correct' && <ThumbsUp size={14} />}
                            {feedback === 'incorrect' && <ThumbsDown size={14} />}
                            {msg}
                        </div>
                    )}
                </div>

                {/* Player Hands */}
                <div className="flex gap-8 justify-center w-full">
                    {playerHands.map((hand, idx) => {
                        const isCurrent = idx === currentHandIndex && gameState === "playing";
                        return (
                            <div key={idx} className={`flex flex-col items-center transition-all ${gameState === "playing" && !isCurrent ? "opacity-30 scale-90" : "opacity-100"}`}>
                                <div className="flex gap-[-2rem]">
                                    <div className="flex gap-2 relative">
                                        {hand.map((card, cIdx) => (
                                            <div key={cIdx} className={cIdx > 0 ? "-ml-8" : ""}>
                                                <CardView card={card} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="mt-2 h-6">
                                    <div className={`text-sm font-bold bg-gray-100 px-2 py-0.5 rounded-sm border ${isCurrent ? 'border-blue-400 text-blue-900 bg-blue-50' : 'border-gray-200 text-gray-600'}`}>
                                        {calculateHand(hand).value}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Controls */}
            <div className="mt-auto pt-8">
                {gameState === "playing" ? (
                    <div className="grid grid-cols-4 gap-2">
                        <ActionButton onClick={() => handlePlayerMove("hit")}>Hit</ActionButton>
                        <ActionButton onClick={() => handlePlayerMove("stand")}>Stand</ActionButton>
                        <ActionButton onClick={() => handlePlayerMove("double")}>Double</ActionButton>
                        <ActionButton onClick={() => handlePlayerMove("split")}>Split</ActionButton>
                    </div>
                ) : (
                    <button
                        onClick={dealHand}
                        className="w-full bg-black hover:bg-gray-800 text-white font-bold text-lg py-4 rounded-sm transition-all flex items-center justify-center gap-2"
                    >
                        <RefreshCcw size={20} />
                        {stats.handsPlayed === 0 ? "Deal First Hand" : "Deal Next Hand"}
                    </button>
                )}
            </div>

            {/* Strategy Chart Modal (Mobile Friendly / Compact) */}
            {showChart && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px] p-2 animate-in fade-in duration-200">
                    <div className="bg-white rounded-sm border-2 border-black overflow-hidden w-full max-w-[600px] max-h-[90vh] flex flex-col shadow-none">
                        <div className="p-3 bg-gray-50 flex justify-between items-center border-b border-black">
                            <h3 className="font-bold text-sm uppercase tracking-wide">Strategy Card</h3>
                            <button onClick={() => setShowChart(false)} className="p-1 hover:bg-gray-200 rounded-sm"><X size={18} /></button>
                        </div>
                        <div className="overflow-auto flex-1 p-0.5">
                            <StrategyGrid
                                highlightRow={highlightRowKey}
                                highlightCol={highlightDealerCol}
                            />
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

function CardView({ card, hidden }: { card: Card, hidden?: boolean }) {
    if (hidden) {
        return (
            <div className="w-16 h-24 sm:w-20 sm:h-28 bg-gray-100 rounded-sm border border-gray-300 flex items-center justify-center">
                <div className="w-full h-full opacity-10 bg-[url('/patterns/texture.png')]"></div>
            </div>
        );
    }

    const isRed = card.suit === "hearts" || card.suit === "diamonds";
    const suitSymbol = {
        hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠"
    }[card.suit];

    return (
        <div className="w-16 h-24 sm:w-20 sm:h-28 bg-white rounded-sm border border-gray-300 relative select-none flex flex-col justify-between p-1">
            <div className="flex flex-col items-center leading-none self-start">
                <span className={`text-sm font-bold ${isRed ? 'text-red-600' : 'text-black'}`}>{card.rank}</span>
                <span className={`text-xs ${isRed ? 'text-red-600' : 'text-black'}`}>{suitSymbol}</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className={`text-3xl opacity-10 ${isRed ? 'text-red-600' : 'text-black'}`}>{suitSymbol}</span>
            </div>
            <div className="flex flex-col items-center leading-none self-end rotate-180">
                <span className={`text-sm font-bold ${isRed ? 'text-red-600' : 'text-black'}`}>{card.rank}</span>
                <span className={`text-xs ${isRed ? 'text-red-600' : 'text-black'}`}>{suitSymbol}</span>
            </div>
        </div>
    );
}

function ActionButton({ children, onClick }: { children: React.ReactNode, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="bg-white hover:bg-gray-50 text-black py-3 rounded-sm font-bold text-sm sm:text-base border border-gray-300 transition-colors uppercase tracking-wide"
        >
            {children}
        </button>
    );
}

// Compact Strategy Grid

const DEALER_UPCARDS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

// Data map - simplified for compact view properties
const GRID_DATA: Record<string, Record<string, string>> = {
    // Hard
    "HARD_5_8": { "2": "H", "3": "H", "4": "H", "5": "H", "6": "H", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    "HARD_9": { "2": "H", "3": "D", "4": "D", "5": "D", "6": "D", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    "HARD_10": { "2": "D", "3": "D", "4": "D", "5": "D", "6": "D", "7": "D", "8": "D", "9": "D", "10": "H", "A": "H" },
    "HARD_11": { "2": "D", "3": "D", "4": "D", "5": "D", "6": "D", "7": "D", "8": "D", "9": "D", "10": "D", "A": "D" }, // Check H17/S17 for A. Usually D.
    "HARD_12": { "2": "H", "3": "H", "4": "S", "5": "S", "6": "S", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    // Grouped 13-16
    "HARD_13": { "2": "S", "3": "S", "4": "S", "5": "S", "6": "S", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    "HARD_14": { "2": "S", "3": "S", "4": "S", "5": "S", "6": "S", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    "HARD_15": { "2": "S", "3": "S", "4": "S", "5": "S", "6": "S", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    "HARD_16": { "2": "S", "3": "S", "4": "S", "5": "S", "6": "S", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    "HARD_17+": { "2": "S", "3": "S", "4": "S", "5": "S", "6": "S", "7": "S", "8": "S", "9": "S", "10": "S", "A": "S" },

    // Soft
    "SOFT_13_14": { "2": "H", "3": "H", "4": "H", "5": "D", "6": "D", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    "SOFT_15_16": { "2": "H", "3": "H", "4": "D", "5": "D", "6": "D", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    "SOFT_17": { "2": "H", "3": "D", "4": "D", "5": "D", "6": "D", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    "SOFT_18": { "2": "D", "3": "D", "4": "D", "5": "D", "6": "D", "7": "S", "8": "S", "9": "H", "10": "H", "A": "H" },
    "SOFT_19+": { "2": "S", "3": "S", "4": "S", "5": "S", "6": "S", "7": "S", "8": "S", "9": "S", "10": "S", "A": "S" },

    // Pairs
    "PAIR_2": { "2": "SP", "3": "SP", "4": "SP", "5": "SP", "6": "SP", "7": "SP", "8": "H", "9": "H", "10": "H", "A": "H" },
    "PAIR_3": { "2": "SP", "3": "SP", "4": "SP", "5": "SP", "6": "SP", "7": "SP", "8": "H", "9": "H", "10": "H", "A": "H" },
    "PAIR_4": { "2": "H", "3": "H", "4": "H", "5": "SP", "6": "SP", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    "PAIR_5": { "2": "D", "3": "D", "4": "D", "5": "D", "6": "D", "7": "D", "8": "D", "9": "D", "10": "H", "A": "H" },
    "PAIR_6": { "2": "SP", "3": "SP", "4": "SP", "5": "SP", "6": "SP", "7": "H", "8": "H", "9": "H", "10": "H", "A": "H" },
    "PAIR_7": { "2": "SP", "3": "SP", "4": "SP", "5": "SP", "6": "SP", "7": "SP", "8": "H", "9": "H", "10": "H", "A": "H" },
    "PAIR_8": { "2": "SP", "3": "SP", "4": "SP", "5": "SP", "6": "SP", "7": "SP", "8": "SP", "9": "SP", "10": "SP", "A": "SP" },
    "PAIR_9": { "2": "SP", "3": "SP", "4": "SP", "5": "SP", "6": "SP", "7": "S", "8": "SP", "9": "SP", "10": "S", "A": "S" },
    "PAIR_10": { "2": "S", "3": "S", "4": "S", "5": "S", "6": "S", "7": "S", "8": "S", "9": "S", "10": "S", "A": "S" },
    "PAIR_A": { "2": "SP", "3": "SP", "4": "SP", "5": "SP", "6": "SP", "7": "SP", "8": "SP", "9": "SP", "10": "SP", "A": "SP" },
};

// Compact Rows Configuration
const COMPACT_ROWS = [
    { label: "5-8", key: "HARD_5_8" },
    { label: "9", key: "HARD_9" },
    { label: "10", key: "HARD_10" },
    { label: "11", key: "HARD_11" },
    { label: "12", key: "HARD_12" },
    { label: "13", key: "HARD_13" },
    { label: "14", key: "HARD_14" },
    { label: "15", key: "HARD_15" },
    { label: "16", key: "HARD_16" },
    { label: "17+", key: "HARD_17+" },

    { label: "A,2", key: "SOFT_13_14" }, // reuse
    { label: "A,3", key: "SOFT_13_14" },
    { label: "A,4", key: "SOFT_15_16" },
    { label: "A,5", key: "SOFT_15_16" },
    { label: "A,6", key: "SOFT_17" },
    { label: "A,7", key: "SOFT_18" },
    { label: "A,8+", key: "SOFT_19+" },

    { label: "2,2", key: "PAIR_2" },
    { label: "3,3", key: "PAIR_3" },
    { label: "4,4", key: "PAIR_4" },
    { label: "5,5", key: "PAIR_5" },
    { label: "6,6", key: "PAIR_6" },
    { label: "7,7", key: "PAIR_7" },
    { label: "8,8", key: "PAIR_8" },
    { label: "9,9", key: "PAIR_9" },
    { label: "10s", key: "PAIR_10" },
    { label: "A,A", key: "PAIR_A" },
];

function StrategyGrid({ highlightRow, highlightCol }: { highlightRow: string | null, highlightCol: string | null }) {

    // Map dealer JQK->10
    const colKey = (highlightCol && ["J", "Q", "K"].includes(highlightCol)) ? "10" : highlightCol;

    const getCellStyle = (move: string) => {
        // Colors matching typical chart (Green H, Red S, Blue D, Yellow SP)
        switch (move) {
            case "H": return "bg-green-300 text-green-900";
            case "S": return "bg-red-300 text-red-900";
            case "D": return "bg-blue-300 text-blue-900";
            case "SP": return "bg-yellow-200 text-yellow-900";
            default: return "bg-gray-100";
        }
    }

    return (
        <div className="text-[10px] sm:text-xs w-full select-none">
            <div className="grid grid-cols-[3rem_repeat(10,1fr)] bg-black text-white font-bold text-center">
                <div className="p-1 border-[0.5px] border-gray-600">Your Hand</div>
                {DEALER_UPCARDS.map(dc => (
                    <div key={dc} className={`p-1 border-[0.5px] border-gray-600 ${colKey === dc ? 'bg-orange-500 text-white' : ''} `}>
                        {dc}
                    </div>
                ))}
            </div>
            {COMPACT_ROWS.map((row, i) => {
                const isHighlight = highlightRow === row.key;

                return (
                    <div key={i} className={`grid grid-cols-[3rem_repeat(10,1fr)] text-center relative ${isHighlight ? 'z-10' : ''}`}>
                        {/* Label */}
                        <div className={`
                            font-bold border-[0.5px] border-gray-400 flex items-center justify-center
                            ${i < 10 ? 'bg-orange-100' : i < 17 ? 'bg-blue-100' : 'bg-yellow-100'}
                        `}>
                            {row.label}
                        </div>

                        {/* Cells */}
                        {DEALER_UPCARDS.map(dc => {
                            const move = GRID_DATA[row.key]?.[dc] || "-";
                            const isCellHighlight = isHighlight && colKey === dc;
                            return (
                                <div
                                    key={dc}
                                    className={`
                                        border-[0.5px] border-gray-400 font-bold p-0.5 sm:p-1
                                        ${getCellStyle(move)}
                                        ${isCellHighlight ? 'ring-2 ring-black scale-110 z-20 shadow-xl' : ''}
                                    `}
                                >
                                    {move}
                                </div>
                            )
                        })}
                    </div>
                )
            })}
        </div>
    )
}
