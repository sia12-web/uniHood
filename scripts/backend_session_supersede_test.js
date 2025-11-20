const fetch = globalThis.fetch;
const base = 'http://localhost:4005';
const alice = 'e80afb25-e287-4e7e-aa48-2eab33cda4e9';
const bob = 'b50ce33e-50c1-4dbc-af5a-919c8da26a55';
const headers = (u) => ({ Authorization: `Bearer dev-token:${u}`, 'Content-Type': 'application/json' });

(async () => {
  try {
    // Create first session
    const res1 = await fetch(base + '/activities/session', {
      method: 'POST',
      headers: headers(alice),
      body: JSON.stringify({ activityKey: 'speed_typing', creatorUserId: alice, participants: [alice, bob], userId: alice }),
    });
    const txt1 = await res1.text();
    console.log('CREATE#1', res1.status, txt1);
    if (!res1.ok) process.exit(2);
    const { sessionId: s1 } = JSON.parse(txt1);

    // Create second session with same participants (should end previous)
    const res2 = await fetch(base + '/activities/session', {
      method: 'POST',
      headers: headers(alice),
      body: JSON.stringify({ activityKey: 'speed_typing', creatorUserId: alice, participants: [alice, bob], userId: alice }),
    });
    const txt2 = await res2.text();
    console.log('CREATE#2', res2.status, txt2);
    if (!res2.ok) process.exit(2);
    const { sessionId: s2 } = JSON.parse(txt2);

    // Old session snapshot should be ended
    const snap1 = await fetch(`${base}/activities/session/${s1}`);
    console.log('SNAP#1', snap1.status, await snap1.text());

    // New session snapshot should be pending
    const snap2 = await fetch(`${base}/activities/session/${s2}`);
    console.log('SNAP#2', snap2.status, await snap2.text());
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
