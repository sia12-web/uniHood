import { prisma, redis } from '../lib/db';

export async function recordGameResult(
    userId: string,
    activityKey: string,
    result: 'win' | 'loss' | 'draw',
    points: number
): Promise<boolean> {
    if (!userId || userId === 'anonymous' || userId.startsWith('anon-')) {
        console.log(`[Stats] Skipping anonymous user: ${userId}`);
        return false;
    }

    console.log(`[Stats] Delegating game result to Backend API for user=${userId}, activity=${activityKey}`);

    const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8001';
    const INTERNAL_SECRET = process.env.SERVICE_SIGNING_KEY || 'pTv2KiIj';

    try {
        // We structure the call as a "game outcome" where this user is the only one we're reporting for now,
        // or we imply a winner. This function is called PER USER in the current loop.
        // To map correctly to the backend's "record-outcome" which expects a list of users and a winner,
        // we might be slightly misusing it if we call it one by one.
        // HOWEVER, the backend updates stats per user in the list.

        // Construct payload
        const payload = {
            user_ids: [userId],
            winner_id: result === 'win' ? userId : null,
            game_kind: activityKey,
            duration_seconds: 60, // approximate, or pass in
            move_count: 5 // approximate
        };

        const response = await fetch(`${BACKEND_URL}/internal/leaderboards/record-outcome`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': INTERNAL_SECRET
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`[Stats] Backend API failed: ${response.status} ${await response.text()}`);
            return false;
        }

        console.log(`[Stats] Backend API success for ${userId}`);
        return true;

    } catch (e) {
        console.error(`[Stats] Error calling Backend API`, e);
        return false;
    }
}

