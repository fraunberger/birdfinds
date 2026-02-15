
'use client';

import { useState, useEffect, useRef } from 'react';
import { Election, Nomination } from '@/lib/election/types';
import { Reorder } from "framer-motion";
import { RestaurantSearch } from './RestaurantSearch';

interface ExtendedElection extends Election {
    status: 'nomination' | 'voting' | 'completed' | 'cancelled';
    ballotVisibility: 'secret' | 'open';
    votingEndsAt?: number;
    winner?: string; // ID of winner
    matrix?: Record<string, Record<string, number>>;
    participantCount?: number;
    ballots?: Array<{
        voterName: string;
        rankings: Array<{
            nominationId: string;
            restaurantName: string;
        }>;
    }> | null;
}

interface RestaurantSelection {
    name: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
    priceLevel?: string;
    photo?: string;
    id?: string;
}

export function RestaurantElectionRoom({ electionId, onExit }: { electionId: string, onExit: () => void }) {
    // Auth State
    const [username, setUsername] = useState('');
    const [codeword, setCodeword] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Data State
    const [election, setElection] = useState<ExtendedElection | null>(null);
    const [loading, setLoading] = useState(true);
    const pollRef = useRef<NodeJS.Timeout>(null);

    // Local User State
    // const [restaurant, setRestaurant] = useState(''); // REPLACED BY RICH DATA HANDLING
    const [rankings, setRankings] = useState<string[]>([]); // list of nomination IDs in order
    const [hasVoted, setHasVoted] = useState(false);

    // Fetch Loop
    const [errorCount, setErrorCount] = useState(0);
    const [now, setNow] = useState(Date.now());

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

    // Live countdown tick every second
    useEffect(() => {
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(tick);
    }, []);

    // Restore session
    useEffect(() => {
        const stored = localStorage.getItem(`bird_election_${electionId}`);
        if (stored) {
            try {
                const { username: u, codeword: c } = JSON.parse(stored);
                if (u && c) {
                    setUsername(u);
                    setCodeword(c.toLowerCase());
                    setIsAuthenticated(true);
                }
            } catch (e) { }
        }
    }, [electionId]);

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

        // Normalize username to lowercase for case-insensitive matching
        const safeName = username.trim().toLowerCase();
        const safeCodeword = codeword.trim().toLowerCase();
        const res = await fetch(`/api/elections/${electionId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: safeName, groupCodeword: safeCodeword })
        });

        if (res.ok) {
            setUsername(safeName);
            localStorage.setItem(`bird_election_${electionId}`, JSON.stringify({ username: safeName, codeword: safeCodeword }));
            setIsAuthenticated(true);
            fetchElection();
        } else {
            const err = await res.json();
            alert(err.error || "Failed to join");
        }
    };

    const cancelNomination = async (nominationId: string) => {
        if (!confirm("Remove this nomination?")) return;
        const safeCodeword = codeword.trim().toLowerCase();
        const res = await fetch(`/api/elections/${electionId}/nominate`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nominationId, requesterName: username, groupCodeword: safeCodeword })
        });
        if (res.ok) {
            fetchElection();
        } else {
            alert("Failed to cancel nomination");
        }
    };

    const submitNomination = async (restaurantData: RestaurantSelection) => {
        const safeCodeword = codeword.trim().toLowerCase();

        // Optimistic UI could go here but let's stick to simple
        const res = await fetch(`/api/elections/${electionId}/nominate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nominatorName: username,
                restaurantName: restaurantData.name, // Still use name for ID generation compat
                groupCodeword: safeCodeword,
                isWriteIn: false,
                metadata: restaurantData // Save the rich object
            })
        });

        if (res.ok) {
            fetchElection();
        } else {
            alert("Failed to nominate");
        }
    };


    const submitVote = async () => {
        if (rankings.length === 0) return;

        const safeCodeword = codeword.trim().toLowerCase();
        const res = await fetch(`/api/elections/${electionId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                voterName: username,
                rankings: rankings,
                groupCodeword: safeCodeword
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
        const safeCodeword = codeword.trim().toLowerCase();
        const res = await fetch(`/api/elections/${electionId}/finalize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupCodeword: safeCodeword })
        });
        if (res.ok) fetchElection();
    };

    const cancelElection = async () => {
        if (!confirm("Cancel this election for everyone? This cannot be undone.")) return;
        const safeCodeword = codeword.trim().toLowerCase();
        const res = await fetch(`/api/elections/${electionId}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupCodeword: safeCodeword, requesterName: username })
        });

        if (res.ok) {
            fetchElection();
            return;
        }

        const err = await res.json().catch(() => ({ error: "Failed to cancel election" }));
        alert(err.error || "Failed to cancel election");
    };

    const toggleRank = (id: string) => {
        if (rankings.includes(id)) {
            setRankings(rankings.filter(r => r !== id));
        } else {
            setRankings([...rankings, id]);
        }
    };

    // Calculate time remaining using live tick
    const timeUntilStart = election ? election.voteStartTime - now : 0;
    const timeUntilEnd = election ? (election.votingEndsAt || 0) - now : 0;

    const formatCountdown = (ms: number) => {
        if (ms <= 0) return "0s";
        const d = Math.floor(ms / 86400000);
        const h = Math.floor((ms % 86400000) / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        parts.push(`${s}s`);
        return parts.join(' ');
    };

    const renderCandidateCard = (nom: Nomination, minimal = false) => {
        const meta = nom.metadata || {};
        const hasPhoto = !!meta.photo && meta.photo !== "📍"; // Ensure we don't show the old pin if it somehow got saved

        return (
            <div className="flex items-start gap-3">
                {hasPhoto && (
                    <div className="flex-none bg-gray-100 w-12 h-12 rounded flex items-center justify-center text-2xl border border-gray-200 shadow-sm">
                        {meta.photo}
                    </div>
                )}
                <div className="flex-grow min-w-0 py-1">
                    <div className="font-bold text-gray-900 truncate leading-tight">{nom.restaurantName}</div>
                    {!minimal && (
                        <>
                            {meta.address && <div className="text-xs text-gray-500 truncate">{meta.address}</div>}
                            <div className="flex gap-2 text-[10px] font-mono mt-1 text-gray-400">
                                {meta.rating && <span className="text-yellow-600 bg-yellow-50 px-1 rounded">★ {meta.rating}</span>}
                                {meta.priceLevel && <span className="text-green-600 bg-green-50 px-1 rounded">{meta.priceLevel}</span>}
                                <span className="text-gray-300">Nominated by {nom.nominatorName}</span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )
    }


    // ... Design Updates
    if (loading) return <div className="text-center p-8 font-mono animate-pulse">Establishing Connection...</div>;
    if (!election) return (
        <div className="max-w-md mx-auto mt-20 p-8 bg-white border border-gray-900 text-center">
            <h2 className="text-xl font-bold mb-4 uppercase">Connection Lost</h2>
            <p className="text-gray-500 mb-8 text-sm">We couldn&apos;t find this election. It may have ended or your connection was interrupted.</p>
            <button onClick={onExit} className="w-full py-3 bg-black text-white font-bold uppercase tracking-wide hover:bg-gray-800">
                Back to Menu
            </button>
        </div>
    );

    if (!isAuthenticated) return (
        <div className="max-w-md mx-auto mt-20 p-8 bg-white border border-gray-900 text-gray-900 shadow-[8px_8px_0px_#000]">
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
                <button type="submit" className="w-full py-3 bg-black text-white hover:bg-gray-900 font-bold transition-colors uppercase tracking-wide border-2 border-transparent hover:border-black">Enter Room</button>
            </form>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 text-gray-900 font-sans">
            <header className="flex flex-wrap gap-4 justify-between items-end mb-12 pb-4 border-b-2 border-gray-900">
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-tighter leading-none mb-1">{election.name}</h1>
                    <p className="text-gray-500 text-sm">Voter: <span className="text-black font-bold uppercase">{username}</span></p>
                </div>
                <div className="text-right">
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Status</div>
                    <div className={`text-xl font-mono font-bold ${election.status === 'voting' ? 'text-red-600 animate-pulse' : 'text-gray-900'}`}>
                        {election.status === 'nomination' && `STARTS IN ${formatCountdown(timeUntilStart)}`}
                        {election.status === 'voting' && `ENDS IN ${formatCountdown(timeUntilEnd)}`}
                        {election.status === 'completed' && 'CLOSED'}
                        {election.status === 'cancelled' && 'CANCELLED'}
                    </div>
                </div>
            </header>

            {/* NOMINATION PHASE */}
            {election.status === 'nomination' && (
                <div className="grid md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                        <div className="p-0">
                            <h3 className="text-lg font-bold uppercase mb-4 border-b border-gray-200 pb-2">Your Nomination</h3>

                            {election.nominations.some(n => n.nominatorName === username) ? (
                                <div className="bg-gray-50 border border-gray-200 p-4 relative group">
                                    <button
                                        onClick={() => cancelNomination(election.nominations.find(n => n.nominatorName === username)!.id)}
                                        className="absolute top-2 right-2 text-gray-300 hover:text-red-600 font-bold"
                                        title="Cancel Nomination"
                                    >
                                        ✕
                                    </button>
                                    <div className="text-xs font-bold text-gray-400 uppercase mb-2">You nominated:</div>
                                    {renderCandidateCard(election.nominations.find(n => n.nominatorName === username)!)}
                                    <p className="text-xs text-gray-400 mt-4 italic">To change, cancel this nomination first.</p>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 mb-6">Search for a restaurant to nominate for dinner.</p>
                            )}

                            <div className="mt-4">
                                <RestaurantSearch onSelect={submitNomination} />
                                {username === election.adminName && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (confirm("Start voting now?")) {
                                                const safeCodeword = codeword.trim().toLowerCase();
                                                await fetch(`/api/elections/${electionId}/start`, {
                                                    method: 'POST',
                                                    body: JSON.stringify({ groupCodeword: safeCodeword })
                                                });
                                                fetchElection();
                                            }
                                        }}
                                        className="w-full mt-8 py-3 bg-black text-white font-bold uppercase text-xs tracking-widest hover:bg-gray-800 transition-all"
                                    >
                                        ⚡ Start Voting (Admin)
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-bold uppercase mb-4 border-b border-gray-200 pb-2">Current Nominations</h3>
                        <ul className="space-y-4">
                            {election.nominations.length === 0 ? (
                                <li className="text-gray-400 italic py-4">Waiting for nominations...</li>
                            ) : (
                                election.nominations.map(nom => {
                                    const canCancel = nom.nominatorName.toLowerCase() === username.toLowerCase() || username.toLowerCase() === election.adminName.toLowerCase();
                                    return (
                                        <li key={nom.id} className="bg-white border border-gray-100 p-3 shadow-sm hover:shadow-md transition-shadow relative group">
                                            {renderCandidateCard(nom)}
                                            {canCancel && (
                                                <button
                                                    onClick={() => cancelNomination(nom.id)}
                                                    className="absolute top-2 right-2 text-gray-300 hover:text-red-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity px-2"
                                                    title="Cancel nomination"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </li>
                                    );
                                })
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
                            <h3 className="text-sm font-bold uppercase text-gray-400 tracking-wider mb-4 border-b border-gray-200 pb-2">Available Options</h3>
                            <div className="space-y-2">
                                {election.nominations
                                    .filter(n => !rankings.includes(n.id))
                                    .map(n => (
                                        <button
                                            key={n.id}
                                            onClick={() => toggleRank(n.id)}
                                            className="w-full text-left bg-white hover:bg-gray-50 p-3 border border-gray-200 transition-all flex items-center justify-between group"
                                        >
                                            <div className="flex-grow pr-4">
                                                {renderCandidateCard(n, true)}
                                            </div>
                                            <span className="text-gray-300 group-hover:text-black text-xl leading-none">+</span>
                                        </button>
                                    ))}
                            </div>
                        </div>

                        {/* Ranking */}
                        <div>
                            <h3 className="text-sm font-bold uppercase text-red-600 mb-4 tracking-wider border-b border-red-100 pb-2">Your Ranking</h3>

                            <Reorder.Group axis="y" values={rankings} onReorder={setRankings} className="space-y-2 min-h-[200px] border-2 border-dashed border-gray-200 p-4 bg-gray-50/30">
                                {rankings.map((id, idx) => {
                                    const details = election.nominations.find(n => n.id === id);
                                    if (!details) return null;
                                    return (
                                        <Reorder.Item key={id} value={id} className="bg-white border border-gray-300 p-3 shadow-[4px_4px_0px_rgba(0,0,0,0.1)] flex items-center gap-3 touch-none cursor-move active:shadow-lg active:scale-[1.02] transition-all">
                                            <span className="flex-none w-6 h-6 bg-black text-white flex items-center justify-center text-xs font-bold font-mono select-none">
                                                {idx + 1}
                                            </span>
                                            <div className="flex-grow min-w-0">
                                                {renderCandidateCard(details, true)}
                                            </div>

                                            {/* Drag Handle Icon */}
                                            <div className="text-gray-300 px-2 cursor-grab active:cursor-grabbing">
                                                ⋮⋮
                                            </div>

                                            <button onClick={() => toggleRank(id)} className="hover:bg-red-50 text-gray-300 hover:text-red-600 px-2 ml-2">×</button>
                                        </Reorder.Item>
                                    );
                                })}
                            </Reorder.Group>

                            {rankings.length === 0 && (
                                <div className="text-gray-400 text-sm italic text-center mt-4">
                                    Select candidates to start ranking
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Submit Vote */}
            {!hasVoted && election.status === 'voting' && (
                <div className="fixed bottom-0 left-0 right-0 p-4 border-t border-black bg-white/95 backdrop-blur-sm shadow-md">
                    <button
                        onClick={submitVote}
                        disabled={rankings.length === 0}
                        className="w-full max-w-sm mx-auto block py-4 bg-black text-white font-black uppercase text-xl tracking-widest hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                    >
                        Submit Vote ({rankings.length})
                    </button>
                    <p className="text-center text-xs mt-2 text-gray-500">Tap candidates above to rank them</p>
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

                    {username.toLowerCase() === election.adminName.toLowerCase() && (
                        <button
                            onClick={finishElection}
                            className="text-sm font-bold text-gray-400 hover:text-red-600 uppercase tracking-widest underline decoration-gray-300 hover:decoration-red-600 transition-colors"
                        >
                            Force End Voting
                        </button>
                    )}
                </div>
            )}

            {/* RESULTS PHASE */}
            {election.status === 'completed' && (
                <div className="text-center py-12">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-6">Voting Complete</h2>

                    {election.winner ? (
                        <div className="inline-block relative">
                            <div className="bg-white p-12 border-4 border-black shadow-[8px_8px_0px_#000] max-w-md mx-auto">
                                <div className="text-6xl mb-6">🏆</div>
                                <h3 className="text-4xl font-black uppercase tracking-tighter leading-none mb-4">
                                    {election.nominations.find(n => n.id === election.winner)?.restaurantName || "Unknown"}
                                </h3>

                                {/* Winner Rich Data */}
                                {(() => {
                                    const winnerNom = election.nominations.find(n => n.id === election.winner);
                                    const meta = winnerNom?.metadata;
                                    if (meta) {
                                        return (
                                            <div className="bg-gray-50 p-4 border border-gray-100 rounded mb-6 text-left flex gap-4 items-center">
                                                <div className="text-4xl">{meta.photo}</div>
                                                <div>
                                                    <div className="font-bold">{meta.address}</div>
                                                    <div className="text-sm font-mono text-gray-500">
                                                        ★ {meta.rating} • {meta.priceLevel}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    }
                                    return null;
                                })()}

                                <div className="h-1 w-20 bg-red-600 mx-auto my-6"></div>
                                <p className="text-gray-500 font-mono text-sm uppercase mb-4">
                                    Winner by {election.winnerMethod || "Consensus"}
                                </p>

                                {election.tieBroken && (
                                    <div className="mt-4 p-4 border-2 border-dashed border-red-500 bg-red-50 max-w-sm mx-auto animate-in zoom-in duration-500">
                                        <p className="text-red-600 font-extrabold uppercase text-[10px] mb-1 tracking-tighter flex items-center justify-center gap-1">
                                            <span>⚡</span> Tie-Broken by Speed <span>⚡</span>
                                        </p>
                                        <p className="text-[11px] text-red-800 leading-tight">
                                            This was a perfect tie! This candidate won because they received a #1 ranking first — just
                                            <strong> {Math.max(0, Math.floor(((election.winnerVoteTime ?? election.voteStartTime) - election.voteStartTime) / 1000))} seconds </strong>
                                            after voting opened.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 bg-white border border-gray-200 max-w-md mx-auto">
                            <h3 className="text-xl font-bold">No Clear Winner</h3>
                            <p className="text-gray-500 mt-2">The math says it&apos;s a tie or a cycle.</p>
                        </div>
                    )}

                    {election.ballotVisibility === 'open' && (
                        <div className="max-w-3xl mx-auto mt-12 text-left">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">All Ballots (Open)</h3>
                            <div className="space-y-3">
                                {(election.ballots || []).map((ballot) => (
                                    <div key={ballot.voterName} className="bg-white border border-gray-200 p-4">
                                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{ballot.voterName}</p>
                                        {ballot.rankings.length > 0 ? (
                                            <ol className="space-y-1">
                                                {ballot.rankings.map((ranked, index) => (
                                                    <li key={`${ballot.voterName}-${ranked.nominationId}`} className="text-sm text-gray-800">
                                                        <span className="font-mono text-gray-500 mr-2">{index + 1}.</span>
                                                        {ranked.restaurantName}
                                                    </li>
                                                ))}
                                            </ol>
                                        ) : (
                                            <p className="text-sm text-gray-400 italic">No ranked choices submitted.</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button onClick={onExit} className="block mx-auto mt-16 text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-black">
                        ← Back to Menu
                    </button>
                </div>
            )}

            {election.status === 'cancelled' && (
                <div className="max-w-xl mx-auto text-center py-12">
                    <div className="bg-red-50 border border-red-200 p-8">
                        <h2 className="text-2xl font-bold uppercase tracking-tight text-red-700 mb-2">Election Cancelled</h2>
                        <p className="text-red-700/80 text-sm">The admin cancelled this election before final results were published.</p>
                    </div>
                    <button onClick={onExit} className="block mx-auto mt-10 text-sm font-bold uppercase tracking-widest text-gray-400 hover:text-black">
                        ← Back to Menu
                    </button>
                </div>
            )}

            {username.toLowerCase() === election.adminName.toLowerCase() && (election.status === 'nomination' || election.status === 'voting') && (
                <div className="fixed top-4 right-4">
                    <button
                        onClick={cancelElection}
                        className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-red-700 border border-red-300 bg-white hover:bg-red-50"
                    >
                        Cancel Election
                    </button>
                </div>
            )}
        </div>
    );
}
