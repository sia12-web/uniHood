import { prisma, redis } from '../lib/db';

export async function recordGameResult(
    userId: string,
    activityKey: string,
    result: 'win' | 'loss' | 'draw',
    points: number
) {
    if (!userId || userId === 'anonymous' || userId.startsWith('anon-')) return;

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
    } catch (e) {
        console.error(`Failed to update SQL stats for ${userId}`, e);
    }

    // 2. Update Redis Leaderboards (Daily Counters)
    try {
        const now = new Date();
        const ymd = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        const key = `lb:day:${ymd}:user:${userId}`;

        await redis.hIncrBy(key, 'acts_played', 1);
        if (result === 'win') {
            await redis.hIncrBy(key, 'acts_won', 1);
        }
        await redis.hSet(key, 'touched', '1');
        await redis.expire(key, 48 * 60 * 60); // 48h TTL
    } catch (e) {
        console.error(`Failed to update Redis stats for ${userId}`, e);
    }
}
