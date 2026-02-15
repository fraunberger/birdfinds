'use client';

import { useState, useEffect } from 'react';

interface ElectionSummary {
    id: string;
    name: string;
    adminName: string;
    voteStartTime: number;
    status: string;
    ballotVisibility?: 'secret' | 'open';
    nominationCount: number;
    winnerName?: string;
}

export function CreateElection({ onJoined }: { onJoined: (id: string) => void }) {
    const [elections, setElections] = useState<ElectionSummary[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // Form State
    const [name, setName] = useState('');
    const [adminName, setAdminName] = useState('');
    const [date, setDate] = useState(''); // YYYY-MM-DD
    const [time, setTime] = useState('18:10'); // HH:MM
    const [codeword, setCodeword] = useState('');
    const [ballotVisibility, setBallotVisibility] = useState<'secret' | 'open'>('secret');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch('/api/elections')
            .then(res => res.json())
            .then(data => setElections(data))
            .catch(err => console.error(err));
    }, [refreshKey]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Combine date and time
        const startDateTime = new Date(`${date}T${time}`);
        const timestamp = startDateTime.getTime();

        const safeCodeword = codeword.trim().toLowerCase();

        const res = await fetch('/api/elections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                adminName,
                voteStartTime: timestamp,
                groupCodeword: safeCodeword,
                ballotVisibility
            })
        });

        if (res.ok) {
            const election = await res.json();
            localStorage.setItem(`bird_election_${election.id}`, JSON.stringify({ username: adminName, codeword }));
            setIsCreating(false);
            onJoined(election.id);
        } else {
            alert("Failed to create");
        }
        setLoading(false);
    };

    if (isCreating) {
        return (
            <div className="bg-white p-8 border border-gray-900 max-w-lg mx-auto text-gray-900">
                <h2 className="text-2xl font-bold mb-6 uppercase tracking-tight">Create Election</h2>
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1 tracking-wider">Event Name</label>
                        <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Friday Dinner" className="w-full bg-white border border-gray-300 p-3 focus:ring-1 focus:ring-black focus:border-black outline-none transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1 tracking-wider">Your Name</label>
                        <input required value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Head Guy" className="w-full bg-white border border-gray-300 p-3 focus:ring-1 focus:ring-black focus:border-black outline-none transition-colors" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1 tracking-wider">Date</label>
                            <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-white border border-gray-300 p-3 focus:ring-1 focus:ring-black focus:border-black outline-none transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1 tracking-wider">Time</label>
                            <input required type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full bg-white border border-gray-300 p-3 focus:ring-1 focus:ring-black focus:border-black outline-none transition-colors" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1 tracking-wider">Group Codeword</label>
                        <input required type="password" autoComplete="new-password" value={codeword} onChange={e => setCodeword(e.target.value)} placeholder="Secret123" className="w-full bg-white border border-gray-300 p-3 focus:ring-1 focus:ring-black focus:border-black outline-none transition-colors" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-2 tracking-wider">Ballots</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setBallotVisibility('secret')}
                                className={`border p-3 text-xs font-bold uppercase tracking-wider transition-colors ${ballotVisibility === 'secret' ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'}`}
                            >
                                Secret
                            </button>
                            <button
                                type="button"
                                onClick={() => setBallotVisibility('open')}
                                className={`border p-3 text-xs font-bold uppercase tracking-wider transition-colors ${ballotVisibility === 'open' ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'}`}
                            >
                                Open
                            </button>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setIsCreating(false)} className="flex-1 py-3 font-bold bg-white border border-gray-300 hover:bg-gray-50 transition-colors text-gray-700 uppercase text-sm tracking-wide">Cancel</button>
                        <button type="submit" disabled={loading} className="flex-1 py-3 font-bold bg-black text-white hover:bg-gray-900 transition-colors disabled:opacity-50 uppercase text-sm tracking-wide">Create</button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-center">
                <button
                    onClick={() => setIsCreating(true)}
                    className="px-8 py-4 bg-black text-white font-bold text-lg hover:bg-gray-900 transition-all uppercase tracking-wide border-2 border-black hover:shadow-[4px_4px_0px_rgba(0,0,0,0.2)]"
                >
                    Create New Election
                </button>
            </div>

            <div className="space-y-12">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {elections.filter(e => e.status !== 'completed' && e.status !== 'cancelled').map(election => (
                        <div
                            key={election.id}
                            onClick={() => onJoined(election.id)}
                            className="group cursor-pointer bg-white hover:bg-gray-50 border border-gray-200 hover:border-black p-6 transition-all"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="font-bold text-xl truncate pr-2 text-gray-900">{election.name}</h3>
                                <span className={`text-xs font-bold px-2 py-1 uppercase tracking-wider ${election.status === 'voting' ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-blue-50 text-blue-600'}`}>
                                    {election.status}
                                </span>
                            </div>

                            <div className="space-y-2 text-sm text-gray-500">
                                <p className="flex items-center gap-2">
                                    <span>📅</span>
                                    {new Date(election.voteStartTime).toLocaleDateString()}
                                </p>
                                <p className="flex items-center gap-2">
                                    <span>⏰</span>
                                    {new Date(election.voteStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                <p>Host: <span className="text-gray-900 font-medium">{election.adminName}</span></p>
                                <p className="uppercase text-[11px] tracking-wider">Ballots: {election.ballotVisibility || 'secret'}</p>
                                <p>{election.nominationCount} Nominations</p>
                            </div>
                        </div>
                    ))}
                </div>

                {elections.some(e => e.status === 'completed' || e.status === 'cancelled') && (
                    <details className="group pt-8 border-t border-gray-200">
                        <summary className="cursor-pointer list-none flex items-center gap-2 font-bold uppercase text-gray-400 hover:text-gray-600 transition-colors w-max">
                            <span className="text-xl">📁</span>
                            <span>Archived Elections ({elections.filter(e => e.status === 'completed' || e.status === 'cancelled').length})</span>
                            <span className="group-open:rotate-180 transition-transform">▼</span>
                        </summary>

                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-6 animate-in slide-in-from-top-2 fade-in">
                            {elections.filter(e => e.status === 'completed' || e.status === 'cancelled').map(election => (
                                <div
                                    key={election.id}
                                    onClick={() => onJoined(election.id)}
                                    className="cursor-pointer bg-gray-50 border border-gray-200 p-4 hover:bg-white transition-colors opacity-70 hover:opacity-100"
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-bold text-gray-700">{election.name}</h3>
                                        <span className={`text-[10px] px-2 py-1 uppercase font-bold tracking-wider ${election.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-600'}`}>
                                            {election.status === 'cancelled' ? 'Cancelled' : 'Ended'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 flex justify-between">
                                        <span>{new Date(election.voteStartTime).toLocaleDateString()}</span>
                                        <span>{election.status === 'cancelled' ? 'No winner' : `Winner: ${election.winnerName || '?'}`}</span>
                                    </p>
                                </div>
                            ))}
                        </div>
                    </details>
                )}
            </div>
        </div>
    );
}
