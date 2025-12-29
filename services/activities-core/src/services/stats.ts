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

    console.log(`[Stats] Recording game result for user=${userId}, activity=${activityKey}, result=${result}, points=${points}`);

    let sqlSuccess = false;
    let redisSuccess = false;

    // 1. Update SQL Stats
    try {
        const stats = await prisma.userGameStats.findUnique({
            where: { userId_activityKey: { userId, activityKey } }
        });

        let currentStreak = stats?.currentStreak || 0;
        let maxStreak = stats?.maxStreak || 0;

        if (result === 'win') {
            currentStreak += 1;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
            // Reset streak on loss or draw (strict streak)
            currentStreak = 0;
        }

        await prisma.userGameStats.upsert({
            where: { userId_activityKey: { userId, activityKey } },
            create: {
                userId,
                activityKey,
                gamesPlayed: 1,
                wins: result === 'win' ? 1 : 0,
                losses: result === 'loss' ? 1 : 0,
                draws: result === 'draw' ? 1 : 0,
                points: points,
                currentStreak: result === 'win' ? 1 : 0,
                maxStreak: result === 'win' ? 1 : 0,
                lastPlayedAt: new Date()
            },
            update: {
                gamesPlayed: { increment: 1 },
                wins: { increment: result === 'win' ? 1 : 0 },
                losses: { increment: result === 'loss' ? 1 : 0 },
                draws: { increment: result === 'draw' ? 1 : 0 },
                points: { increment: points },
                currentStreak,
                maxStreak,
                lastPlayedAt: new Date()
            }
        });
        sqlSuccess = true;
        console.log(`[Stats] SQL stats updated successfully for user=${userId}`);
    } catch (e) {
        console.error(`[Stats] Failed to update SQL stats for ${userId}`, e);
    }

    // 2. Update Redis Leaderboards (Daily Counters)
    try {
        // Check if Redis is connected
        if (!redis.isOpen) {
            console.error(`[Stats] Redis is not connected, attempting to reconnect...`);
            try {
                await redis.connect();
                console.log(`[Stats] Redis reconnected successfully`);
            } catch (reconnectError) {
                console.error(`[Stats] Redis reconnection failed`, reconnectError);
                return sqlSuccess; // Return partial success
            }
        }

        const now = new Date();
        const ymd = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
        const key = `lb:day:${ymd}:user:${userId}`;

        console.log(`[Stats] Writing to Redis key: ${key}`);

        await redis.hIncrBy(key, 'acts_played', 1);
        if (result === 'win') {
            await redis.hIncrBy(key, 'acts_won', 1);
        }
        await redis.hSet(key, 'touched', '1');
        await redis.expire(key, 48 * 60 * 60); // 48h TTL

        // Verify the write by reading back
        const verifyData = await redis.hGetAll(key);
        console.log(`[Stats] Redis write verified for key=${key}: acts_played=${verifyData.acts_played}, acts_won=${verifyData.acts_won}, touched=${verifyData.touched}`);

        redisSuccess = true;
    } catch (e) {
        console.error(`[Stats] Failed to update Redis stats for ${userId}`, e);
    }

    // 3. Award XP via Backend
    // Fire and forget to not block stats return
    awardXP(userId, 'game_played', { activity: activityKey, result }).catch(e => console.error(e));
    if (result === 'win') {
        awardXP(userId, 'game_won', { activity: activityKey }).catch(e => console.error(e));
    }

    return sqlSuccess || redisSuccess;
}

// Internal helper to award XP via backend API
async function awardXP(userId: string, action: string, metadata: any = {}) {
    const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8001';
    // Ideally this comes from env, but for dev fix we use the known dev secret matching backend/.env
    const INTERNAL_SECRET = process.env.SERVICE_SIGNING_KEY || 'pTv2KiIj';

    try {
        const response = await fetch(`${BACKEND_URL}/internal/xp/award`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': INTERNAL_SECRET
            },
            body: JSON.stringify({
                user_id: userId,
                action: action,
                metadata: metadata
            })
        });

        if (!response.ok) {
            console.error(`[Stats] Failed to award XP: ${response.status} ${await response.text()}`);
        } else {
            console.log(`[Stats] Awarded XP to ${userId} for ${action}`);
        }
    } catch (err) {
        console.error(`[Stats] Error calling XP API`, err);
    }
}
