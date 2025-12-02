import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

export const prisma = new PrismaClient();

export const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379/0'
});

redis.on('error', (err) => console.error('Redis Client Error', err));

export async function connectDb() {
    try {
        await redis.connect();
        console.log('Connected to Redis');
    } catch (e) {
        console.error('Failed to connect to Redis', e);
    }
    
    try {
        await prisma.$connect();
        console.log('Connected to Postgres');
    } catch (e) {
        console.error('Failed to connect to Postgres', e);
    }
}
