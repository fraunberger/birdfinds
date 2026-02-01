
const BASE_URL = 'http://localhost:3000/api/elections';

async function run() {
    // 1. Create
    console.log("Creating Election...");
    const createRes = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: "Simulated Dinner",
            adminName: "SimAdmin",
            voteStartTime: Date.now(),
            groupCodeword: "sim123"
        })
    });

    if (!createRes.ok) {
        console.error("Create failed", createRes.status, await createRes.text());
        return;
    }

    const election = await createRes.json();
    console.log("Election Created:", election.id);

    // 2. Join Admin
    // (Admin auto-joins in UI, but API doesn't do it automatically, client side logic does. 
    // We must simulate admin join)
    console.log("Joining Admin...");
    await fetch(`${BASE_URL}/${election.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: "SimAdmin", groupCodeword: "sim123" })
    });

    // 3. Nominate
    console.log("Nominating...");
    const nomRes = await fetch(`${BASE_URL}/${election.id}/nominate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nominatorName: "SimAdmin", restaurantName: "Admin Choice", groupCodeword: "sim123", isWriteIn: false })
    });
    if (!nomRes.ok) console.error("Nominate failed", await nomRes.text());

    // 4. Write-in
    console.log("Writing in...");
    const writeInRes = await fetch(`${BASE_URL}/${election.id}/nominate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nominatorName: "SimAdmin", restaurantName: "Write In Option", groupCodeword: "sim123", isWriteIn: true })
    });
    if (!writeInRes.ok) console.error("Write-in failed", await writeInRes.text());

    // 4.5. Vote
    console.log("Voting...");
    // Fetch nominations to get IDs
    const currentRes = await fetch(`${BASE_URL}/${election.id}`);
    const currentData = await currentRes.json();
    const nomIds = currentData.nominations.map(n => n.id);

    const voteRes = await fetch(`${BASE_URL}/${election.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            voterName: "SimAdmin",
            rankings: nomIds, // Rank in order of appearance
            groupCodeword: "sim123"
        })
    });
    if (!voteRes.ok) console.error("Vote failed", await voteRes.text());

    // 5. Finalize
    console.log("Finalizing...");
    const finalizeRes = await fetch(`${BASE_URL}/${election.id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupCodeword: "sim123" })
    });

    if (!finalizeRes.ok) console.error("Finalize failed", await finalizeRes.text());

    const finalRes = await fetch(`${BASE_URL}/${election.id}`);
    const finalData = await finalRes.json();
    console.log("Status:", finalData.status);
    console.log("Winner:", finalData.winner);
    console.log("Nominations:", finalData.nominations.length);
}

run().catch(console.error);
