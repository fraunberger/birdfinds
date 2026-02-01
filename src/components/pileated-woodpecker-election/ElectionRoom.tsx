'use client';

import { useState, useEffect, useRef } from 'react';
import { Election, Nomination } from '@/lib/election/types';

interface ExtendedElection extends Election {
    status: 'nomination' | 'voting' | 'completed';
    votingEndsAt?: number;
    winner?: string; // ID of winner
    matrix?: Record<string, Record<string, number>>;
    participantCount?: number;
}

export function ElectionRoom({ electionId, onExit }: { electionId: string, onExit: () => void }) {
    // Auth State
    const [username, setUsername] = useState('');
    const [codeword, setCodeword] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Data State
    const [election, setElection] = useState<ExtendedElection | null>(null);
    const [loading, setLoading] = useState(true);
    const pollRef = useRef<NodeJS.Timeout>(null);

    // Local User State
    const [restaurant, setRestaurant] = useState('');
    const [writeInCandidate, setWriteInCandidate] = useState('');
    const [showWriteIn, setShowWriteIn] = useState(false);
    const [rankings, setRankings] = useState<string[]>([]); // list of nomination IDs in order
    const [hasVoted, setHasVoted] = useState(false);

    // Fetch Loop
    const [errorCount, setErrorCount] = useState(0);

    const fetchElection = async () => {
        try {
            const res = await fetch(`/api/elections/${electionId}`);
            if (!res.ok) {
                if (res.status === 404) {
                    setErrorCount(prev => prev + 1);
                    // Don't exit immediately, wait for a few consecutive failures
                    if (errorCount > 3) onExit();
                }
                return;
            }
            const data = await res.json();
            setElection(data);
            setErrorCount(0); // Reset on success
        } catch (e) {
            console.error(e);
            // Network error, ignore and retry
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchElection();
        pollRef.current = setInterval(fetchElection, 3000); // 3s polling
        return () => clearInterval(pollRef.current!);
    }, [electionId]);

    // Restore session
    useEffect(() => {
        const stored = localStorage.getItem(`bird_election_${electionId}`);
        if (stored) {
            try {
                const { username: u, codeword: c } = JSON.parse(stored);
                if (u && c) {
                    setUsername(u);
                    setCodeword(c);
                    setIsAuthenticated(true);
                }
            } catch (e) { }
        }
    }, [electionId]);

    // Sync existing nomination to input if present
    useEffect(() => {
        if (election && username && !restaurant) {
            const existingNom = election.nominations.find(n => n.nominatorName === username && !n.isWriteIn);
            if (existingNom) {
                setRestaurant(existingNom.restaurantName);
            }
        }
    }, [election, username]);

    // Check if voted
    useEffect(() => {
        if (election && username) {
            // If server says we voted, update local state (if we refreshed)
            const vote = election.votes.find(v => v.voterName === username);
            if (vote) {
                setHasVoted(true);
                setRankings(vote.rankings); // Restore rankings visually if needed
            }
        }
    }, [election, username]);

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !codeword) return;

        // Call join endpoint to reserve name
        const res = await fetch(`/api/elections/${electionId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: username, groupCodeword: codeword })
        });

        if (res.ok) {
            localStorage.setItem(`bird_election_${electionId}`, JSON.stringify({ username, codeword }));
            setIsAuthenticated(true);
            fetchElection();
        } else {
            const err = await res.json();
            alert(err.error || "Failed to join");
        }
    };

    const submitNomination = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!restaurant.trim()) return;

        const res = await fetch(`/api/elections/${electionId}/nominate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nominatorName: username,
                restaurantName: restaurant,
                groupCodeword: codeword,
                isWriteIn: false
            })
        });

        if (res.ok) {
            alert("Nomination Save!");
            fetchElection();
        } else {
            alert("Failed");
        }
    };

    const submitWriteIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!writeInCandidate.trim()) return;

        if (!confirm("This will add a new candidate for everyone. Are you sure?")) return;

        const res = await fetch(`/api/elections/${electionId}/nominate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nominatorName: username,
                restaurantName: writeInCandidate,
                groupCodeword: codeword,
                isWriteIn: true
            })
        });

        if (res.ok) {
            setWriteInCandidate('');
            setShowWriteIn(false);
            fetchElection();
        } else {
            alert("Failed");
        }
    };

    // ... existing submitVote and finalizeElection
    const submitVote = async () => {
        if (rankings.length === 0) return;

        const res = await fetch(`/api/elections/${electionId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                voterName: username,
                rankings: rankings,
                groupCodeword: codeword
            })
        });

        if (res.ok) {
            setHasVoted(true);
            fetchElection();
        } else {
            const err = await res.json();
            alert(err.error || "Failed");
        }
    };

    const finishElection = async () => {
        if (!confirm("Are you sure you want to close voting for everyone?")) return;
        const res = await fetch(`/api/elections/${electionId}/finalize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupCodeword: codeword })
        });
        if (res.ok) fetchElection();
    };

    const toggleRank = (id: string) => {
        if (rankings.includes(id)) {
            setRankings(rankings.filter(r => r !== id));
        } else {
            setRankings([...rankings, id]);
        }
    };

    const moveRank = (index: number, direction: -1 | 1) => {
        const newRankings = [...rankings];
        if (direction === -1 && index > 0) {
            [newRankings[index], newRankings[index - 1]] = [newRankings[index - 1], newRankings[index]];
        } else if (direction === 1 && index < newRankings.length - 1) {
            [newRankings[index], newRankings[index + 1]] = [newRankings[index + 1], newRankings[index]];
        }
        setRankings(newRankings);
    };

    // Calculate time remaining
    const timeUntilStart = election ? election.voteStartTime - Date.now() : 0;
    const timeUntilEnd = election ? (election.votingEndsAt || 0) - Date.now() : 0;

    const getTimer = (ms: number) => {
        if (ms < 0) return "00:00";
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // ... Design Updates
    if (loading) return <div className="text-center p-8 font-mono animate-pulse">Establishing Connection...</div>;
    if (!election) return (
        <div className="max-w-md mx-auto mt-20 p-8 bg-white border border-gray-900 text-center">
            <h2 className="text-xl font-bold mb-4 uppercase">Connection Lost</h2>
            <p className="text-gray-500 mb-8 text-sm">We couldn't find this election. It may have ended or your connection was interrupted.</p>
            <button onClick={onExit} className="w-full py-3 bg-black text-white font-bold uppercase tracking-wide hover:bg-gray-800">
                Back to Menu
            </button>
        </div>
    );

    if (!isAuthenticated) return (
        <div className="max-w-md mx-auto mt-20 p-8 bg-white border border-gray-900 text-gray-900">
            <h2 className="text-2xl font-bold mb-6 text-center uppercase tracking-tight">Join {election.name}</h2>
            <form onSubmit={handleJoin} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1 tracking-wider">Your Name</label>
                    <input required value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-white border border-gray-300 p-3 outline-none focus:ring-1 focus:ring-black" />
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1 tracking-wider">Group Codeword</label>
                    <input required type="password" autoComplete="off" value={codeword} onChange={e => setCodeword(e.target.value)} className="w-full bg-white border border-gray-300 p-3 outline-none focus:ring-1 focus:ring-black" />
                </div>
                <button type="button" onClick={onExit} className="block w-full text-center text-sm text-gray-500 hover:text-black mt-2 mb-2 uppercase tracking-wide">Cancel</button>
                <button type="submit" className="w-full py-3 bg-black text-white hover:bg-gray-900 font-bold transition-colors uppercase tracking-wide">Enter Room</button>
            </form>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 text-gray-900 font-sans">
            <header className="flex justify-between items-end mb-12 pb-4 border-b-2 border-gray-900">
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-tighter leading-none mb-1">{election.name}</h1>
                    <p className="text-gray-500 text-sm">Voter: <span className="text-black font-bold uppercase">{username}</span></p>
                </div>
                <div className="text-right">
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Status</div>
                    <div className={`text-xl font-mono font-bold ${election.status === 'voting' ? 'text-red-600 animate-pulse' : 'text-gray-900'}`}>
                        {election.status === 'nomination' && `STARTS IN ${getTimer(timeUntilStart)}`}
                        {election.status === 'voting' && `ENDS IN ${getTimer(timeUntilEnd)}`}
                        {election.status === 'completed' && 'CLOSED'}
                    </div>
                </div>
            </header>

            {/* NOMINATION PHASE */}
            {election.status === 'nomination' && (
                <div className="grid md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                        <div className="p-0">
                            <h3 className="text-lg font-bold uppercase mb-4 border-b border-gray-200 pb-2">Your Nomination</h3>
                            <p className="text-sm text-gray-500 mb-6">Submit your choice for dinner. You can change this until voting starts.</p>
                            <form onSubmit={submitNomination} className="space-y-4">
                                <input
                                    value={restaurant}
                                    onChange={e => setRestaurant(e.target.value)}
                                    placeholder="e.g. Taco Bell"
                                    className="w-full bg-white border-2 border-gray-200 p-4 text-lg font-bold outline-none focus:border-black transition-colors placeholder:font-normal placeholder:text-gray-300"
                                />
                                <button type="submit" className="w-full py-4 bg-black text-white font-bold uppercase tracking-wide hover:bg-gray-800 transition-colors">
                                    {election.nominations.some(n => n.nominatorName === username && !n.isWriteIn) ? "Update Choice" : "Submit Choice"}
                                </button>
                            </form>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-bold uppercase mb-4 border-b border-gray-200 pb-2">Current List</h3>
                        <ul className="space-y-3">
                            {election.nominations.length === 0 ? (
                                <li className="text-gray-400 italic py-4">Waiting for nominations...</li>
                            ) : (
                                election.nominations.map(nom => (
                                    <li key={nom.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                                        <span className="font-bold text-lg">{nom.restaurantName}</span>
                                        <span className="text-xs text-gray-400 uppercase tracking-wide">{nom.nominatorName}</span>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                </div>
            )}

            {/* VOTING PHASE */}
            {election.status === 'voting' && !hasVoted && (
                <div className="max-w-4xl mx-auto">
                    <div className="mb-8 text-center">
                        <h2 className="text-3xl font-bold uppercase mb-2">Rank Candidates</h2>
                        <p className="text-gray-500">Tap to add to your ranking. Drag or use arrows to reorder.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-12">
                        {/* Candidates */}
                        <div>
                            <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-2">
                                <h3 className="text-sm font-bold uppercase text-gray-400 tracking-wider">Available Options</h3>
                                {!showWriteIn && (
                                    <button onClick={() => setShowWriteIn(true)} className="text-xs font-bold uppercase text-gray-400 hover:text-black underline decoration-gray-300">
                                        + Write-in
                                    </button>
                                )}
                            </div>

                            {showWriteIn && (
                                <div className="mb-6 p-4 bg-gray-50 border border-gray-200">
                                    <h4 className="text-xs font-bold uppercase mb-2">Add New Option</h4>
                                    <form onSubmit={submitWriteIn} className="flex gap-2">
                                        <input
                                            value={writeInCandidate}
                                            onChange={e => setWriteInCandidate(e.target.value)}
                                            className="flex-grow p-2 border border-gray-300 text-sm outline-none focus:border-black"
                                            placeholder="Name..."
                                        />
                                        <button type="submit" className="bg-black text-white px-4 py-2 text-xs font-bold uppercase">Add</button>
                                        <button type="button" onClick={() => setShowWriteIn(false)} className="text-gray-400 hover:text-black px-2 text-lg">×</button>
                                    </form>
                                    <p className="text-[10px] text-gray-400 mt-2">* This adds it for everyone. Please be sure.</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                {election.nominations
                                    .filter(n => !rankings.includes(n.id))
                                    .map(n => (
                                        <button
                                            key={n.id}
                                            onClick={() => toggleRank(n.id)}
                                            className="w-full text-left bg-white hover:bg-gray-50 p-4 border border-gray-200 transition-all flex items-center justify-between group"
                                        >
                                            <span className="font-medium">{n.restaurantName}</span>
                                            <span className="text-gray-300 group-hover:text-black text-xl leading-none">+</span>
                                        </button>
                                    ))}
                            </div>
                        </div>

                        {/* Ranking */}
                        <div>
                            <h3 className="text-sm font-bold uppercase text-red-600 mb-4 tracking-wider border-b border-red-100 pb-2">Your Ranking</h3>
                            <div className="space-y-2 min-h-[200px] border-2 border-dashed border-gray-200 p-4 bg-gray-50/30">
                                {rankings.map((id, idx) => {
                                    const details = election.nominations.find(n => n.id === id);
                                    if (!details) return null;
                                    return (
                                        <div key={id} className="bg-white border border-gray-300 p-3 shadow-[2px_2px_0px_rgba(0,0,0,0.1)] flex items-center gap-3">
                                            <span className="flex-none w-6 h-6 bg-black text-white flex items-center justify-center text-xs font-bold font-mono">
                                                {idx + 1}
                                            </span>
                                            <span className="flex-grow font-bold truncate">{details.restaurantName}</span>
                                            <div className="flex gap-1">
                                                <button onClick={() => moveRank(idx, -1)} disabled={idx === 0} className="hover:bg-gray-100 p-1 px-2 text-gray-400 hover:text-black disabled:opacity-20">▲</button>
                                                <button onClick={() => moveRank(idx, 1)} disabled={idx === rankings.length - 1} className="hover:bg-gray-100 p-1 px-2 text-gray-400 hover:text-black disabled:opacity-20">▼</button>
                                                <button onClick={() => toggleRank(id)} className="hover:bg-red-50 text-gray-300 hover:text-red-600 px-2 ml-2">×</button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {rankings.length === 0 && (
                                    <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">
                                        Select candidates to start ranking
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={submitVote}
                                disabled={rankings.length === 0}
                                className="w-full mt-6 py-4 bg-red-600 text-white font-bold uppercase tracking-widest hover:bg-red-500 transition-all disabled:opacity-50 disabled:bg-gray-300"
                            >
                                Submit Vote
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* WAITING FOR RESULTS */}
            {election.status === 'voting' && hasVoted && (
                <div className="max-w-xl mx-auto text-center pt-8">
                    <div className="bg-white p-8 border border-green-200 mb-8 bg-green-50/50">
                        <h2 className="text-2xl font-bold mb-2 uppercase tracking-tight text-green-900">Vote Submitted</h2>
                        <p className="text-green-700">Waiting for others to finish...</p>
                    </div>

                    <div className="mb-12">
                        <h3 className="text-xs font-bold uppercase text-gray-400 mb-4 tracking-widest">Voter Status</h3>
                        <div className="grid grid-cols-2 gap-4 text-left max-w-sm mx-auto">
                            {election.participants.map(p => {
                                const didVote = election.votes.some(v => v.voterName === p);
                                return (
                                    <div key={p} className={`flex items-center gap-2 ${didVote ? 'text-black font-bold' : 'text-gray-400'}`}>
                                        <div className={`w-2 h-2 rounded-full ${didVote ? 'bg-green-500' : 'bg-gray-300'}`} />
                                        {p}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <button
                        onClick={finishElection}
                        className="text-sm font-bold text-gray-400 hover:text-red-600 uppercase tracking-widest underline decoration-gray-300 hover:decoration-red-600 transition-colors"
                    >
                        Force End Voting
                    </button>
                </div>
            )}

            {/* RESULTS PHASE */}
            {election.status === 'completed' && (
                <div className="text-center py-12">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-6">Voting Complete</h2>

                    {election.winner ? (
                        <div className="inline-block relative">
                            <div className="bg-white p-16 border-4 border-black shadow-[8px_8px_0px_#000]">
                                <div className="text-6xl mb-6">🏆</div>
                                <h3 className="text-5xl font-black uppercase tracking-tighter leading-none mb-2">
                                    {election.nominations.find(n => n.id === election.winner)?.restaurantName || "Unknown"}
                                </h3>
                                <div className="h-1 w-20 bg-red-600 mx-auto my-6"></div>
                                <p className="text-gray-500 font-mono text-sm uppercase">Consensus Winner</p>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 bg-white border border-gray-200 max-w-md mx-auto">
                            <h3 className="text-xl font-bold">No Clear Winner</h3>
                            <p className="text-gray-500 mt-2">The math says it's a tie or a cycle. Rock paper scissors?</p>
                        </div>
                    )}

                    {/* TRANSPARENCY REPORT */}
                    <div className="mt-16 max-w-3xl mx-auto border-t-2 border-dashed border-gray-300 pt-16 text-left">
                        <h3 className="text-xl font-black uppercase tracking-tighter mb-8 text-center text-gray-400">Official Election Audit</h3>

                        <div className="grid md:grid-cols-2 gap-12">
                            {/* 1. BALLOT AUDIT */}
                            <div>
                                <h4 className="text-sm font-bold uppercase mb-4 border-b border-black pb-2">Ballot Record</h4>
                                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                    {election.votes.map((vote, i) => (
                                        <div key={i} className="bg-gray-50 p-3 border border-gray-200 text-xs">
                                            <div className="font-bold uppercase mb-1 text-gray-900">{vote.voterName}</div>
                                            <ol className="list-decimal list-inside text-gray-600 space-y-1">
                                                {vote.rankings.map(id => (
                                                    <li key={id}>
                                                        {election.nominations.find(n => n.id === id)?.restaurantName || "???"}
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 2. PAIRWISE MATRIX */}
                            <div>
                                <h4 className="text-sm font-bold uppercase mb-4 border-b border-black pb-2">Head-to-Head Stats</h4>
                                {election.matrix ? (
                                    <div className="space-y-2">
                                        {Object.keys(election.matrix).map(candidateId => {
                                            const candidateName = election.nominations.find(n => n.id === candidateId)?.restaurantName;
                                            return (Object.keys(election.matrix![candidateId]).map(opponentId => {
                                                const wins = election.matrix![candidateId][opponentId];
                                                const losses = election.matrix![opponentId][candidateId];
                                                const opponentName = election.nominations.find(n => n.id === opponentId)?.restaurantName;

                                                if (wins > losses) {
                                                    return (
                                                        <div key={`${candidateId}-${opponentId}`} className="grid grid-cols-[1fr_auto_1fr] bg-green-50 p-2 border border-green-200 text-xs gap-2 items-center">
                                                            <div className="font-bold text-right truncate text-green-800">{candidateName}</div>
                                                            <div className="font-mono font-bold bg-white px-2 rounded border border-green-200">{wins}-{losses}</div>
                                                            <div className="text-gray-400 truncate">{opponentName}</div>
                                                        </div>
                                                    );
                                                } else if (wins === losses && candidateId < opponentId) { // Show ties only once
                                                    return (
                                                        <div key={`${candidateId}-${opponentId}`} className="grid grid-cols-[1fr_auto_1fr] bg-yellow-50 p-2 border border-yellow-200 text-xs gap-2 items-center">
                                                            <div className="font-bold text-right truncate text-yellow-800">{candidateName}</div>
                                                            <div className="font-mono font-bold bg-white px-2 rounded border border-yellow-200">TIED</div>
                                                            <div className="text-gray-400 truncate">{opponentName}</div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }));
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">Matrix data unavailable.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <button onClick={onExit} className="block mx-auto mt-16 text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-black">
                        ← Back to Menu
                    </button>
                </div>
            )}
        </div>
    );
}
