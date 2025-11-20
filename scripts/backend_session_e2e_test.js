const fetch = globalThis.fetch;
const base = 'http://localhost:4005';
const alice = 'e80afb25-e287-4e7e-aa48-2eab33cda4e9';
const bob = 'b50ce33e-50c1-4dbc-af5a-919c8da26a55';
const headers = (u) => ({ Authorization: `Bearer dev-token:${u}`, 'Content-Type': 'application/json' });

(async () => {
  try {
    const createRes = await fetch(base + '/activities/session', {
      method: 'POST',
      headers: headers(alice),
      body: JSON.stringify({ activityKey: 'speed_typing', creatorUserId: alice, participants: [alice, bob], userId: alice }),
    });
    const createTxt = await createRes.text();
    console.log('CREATE', createRes.status, createTxt);
    if (!createRes.ok) process.exit(2);
    const { sessionId } = JSON.parse(createTxt);

    const joinAlice = await fetch(`${base}/activities/session/${sessionId}/join`, {
      method: 'POST',
      headers: headers(alice),
      body: JSON.stringify({ userId: alice }),
    });
    console.log('JOIN alice', joinAlice.status, await joinAlice.text());

    const joinBob = await fetch(`${base}/activities/session/${sessionId}/join`, {
      method: 'POST',
      headers: headers(bob),
      body: JSON.stringify({ userId: bob }),
    });
    console.log('JOIN bob', joinBob.status, await joinBob.text());

    const readyAlice = await fetch(`${base}/activities/session/${sessionId}/ready`, {
      method: 'POST',
      headers: headers(alice),
      body: JSON.stringify({ userId: alice, ready: true }),
    });
    console.log('READY alice', readyAlice.status, await readyAlice.text());

    const readyBob = await fetch(`${base}/activities/session/${sessionId}/ready`, {
      method: 'POST',
      headers: headers(bob),
      body: JSON.stringify({ userId: bob, ready: true }),
    });
    console.log('READY bob', readyBob.status, await readyBob.text());

    const start = await fetch(`${base}/activities/session/${sessionId}/start`, {
      method: 'POST',
      headers: headers(alice),
      body: JSON.stringify({ userId: alice }),
    });
    console.log('START', start.status, await start.text());

    const snapshot = await fetch(`${base}/activities/session/${sessionId}`, { method: 'GET' });
    console.log('SNAPSHOT', snapshot.status, await snapshot.text());
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
