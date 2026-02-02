
const BASE_URL = 'http://localhost:3000/api/elections';

async function run() {
    console.log("Creating Cycle Election (Rock Paper Scissors)...");
    const createRes = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: "RPS Cycle",
            adminName: "SimAdmin",
            voteStartTime: Date.now(),
            groupCodeword: "cycle"
        })
    });
    const election = await createRes.json();
    console.log("ID:", election.id);

    // Nominate
    const nom = async (name) => {
        const res = await fetch(`${BASE_URL}/${election.id}/nominate`, {
            method: 'POST',
            body: JSON.stringify({ nominatorName: "Admin", restaurantName: name, groupCodeword: "cycle" })
        });
        return (await res.json()).id;
    }
    const r = await nom("Rock");
    const p = await nom("Paper");
    const s = await nom("Scissors");

    // Vote to create cycle
    // Voter 1: R > S > P (Rock beats scissors)
    // Voter 2: S > P > R (Scissors beats paper)
    // Voter 3: P > R > S (Paper beats rock)
    const vote = async (voter, ranking) => {
        await fetch(`${BASE_URL}/${election.id}/vote`, {
            method: 'POST',
            body: JSON.stringify({ voterName: voter, rankings: ranking, groupCodeword: "cycle" })
        });
    }

    await vote("V1", [r, s, p]);
    await vote("V2", [s, p, r]);
    await vote("V3", [p, r, s]);

    // Finalize
    console.log("Finalizing...");
    await fetch(`${BASE_URL}/${election.id}/finalize`, {
        method: 'POST',
        body: JSON.stringify({ groupCodeword: "cycle" })
    });

    // Check Result
    const finalRes = await fetch(`${BASE_URL}/${election.id}`);
    const finalData = await finalRes.json();

    console.log("Winner:", finalData.winner);
    console.log("Winner Method:", finalData.winnerMethod); // Should be "Instant Runoff"

    // In this perfect 3-way tie, IRV also ties. My impl breaks ties arbitrarily.
    // If it returns a winner, it works.
}

run().catch(console.error);
