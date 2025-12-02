import { SocketStream } from '@fastify/websocket';
import { FastifyRequest } from 'fastify';
import { recordGameResult } from '../services/stats';

export interface StoryParagraph {
    userId: string;
    text: string;
    votes: Record<string, number>; // userId -> score (0-10)
}

export interface StoryBuilderSession {
    id: string;
    activityKey: 'story_builder';
    status: 'pending' | 'countdown' | 'writing' | 'voting' | 'ended';
    phase: 'lobby' | 'countdown' | 'writing' | 'voting' | 'ended';
    lobbyReady: boolean;
    creatorUserId: string;
    participants: Array<{ userId: string; joined: boolean; ready: boolean; score: number }>;
    createdAt: number;
    roundStartedAt?: number;
    paragraphs: StoryParagraph[];
    maxParagraphsPerUser: number;
    currentTurnUserId?: string; // If we want turn-based, or we can let everyone write at once? 
    // The prompt says "Collaborative romance story. You write one part, they write the next." implying turn-based.
    // But the prompt also says "each user can have a limit for his paragrahs and it is 3".
    // Let's assume turn-based for now to make a coherent story.
    turnOrder: string[];
    turnIndex: number;
    winnerUserId?: string | null;
}

const sessions: Record<string, StoryBuilderSession> = {};
const connections: Record<string, Set<any>> = {};
const countdowns: Record<string, NodeJS.Timeout> = {};

const MAX_PARAGRAPHS_PER_USER = 3;

export function createStoryBuilderSession(creatorUserId: string, participants: string[] = []): string {
    const sessionId = `sb-${Math.random().toString(36).substring(2, 10)}`;
    const uniqueParticipants = Array.from(new Set([creatorUserId, ...participants]));
    
    sessions[sessionId] = {
        id: sessionId,
        activityKey: 'story_builder',
        status: 'pending',
        phase: 'lobby',
        lobbyReady: false,
        creatorUserId,
        participants: uniqueParticipants.map(uid => ({ userId: uid, joined: uid === creatorUserId, ready: false, score: 0 })),
        createdAt: Date.now(),
        paragraphs: [],
        maxParagraphsPerUser: MAX_PARAGRAPHS_PER_USER,
        turnOrder: [],
        turnIndex: 0,
        winnerUserId: null
    };
    connections[sessionId] = new Set();
    return sessionId;
}

export function getStoryBuilderSession(sessionId: string): StoryBuilderSession | undefined {
    return sessions[sessionId];
}

export function listStoryBuilderSessions() {
    return Object.values(sessions);
}

export function joinStoryBuilder(sessionId: string, userId: string) {
    const session = sessions[sessionId];
    if (!session) throw new Error('session_not_found');

    let participant = session.participants.find(p => p.userId === userId);
    if (participant) {
        participant.joined = true;
    } else {
        session.participants.push({ userId, joined: true, ready: false, score: 0 });
    }
    
    session.lobbyReady = session.participants.every(p => p.ready) && session.participants.length >= 2;
    broadcastState(sessionId);
    return session;
}

export function setStoryBuilderReady(sessionId: string, userId: string, ready: boolean) {
    const session = sessions[sessionId];
    if (!session) throw new Error('session_not_found');

    const participant = session.participants.find(p => p.userId === userId);
    if (participant) {
        participant.ready = ready;
    }
    
    session.lobbyReady = session.participants.every(p => p.ready) && session.participants.length >= 2;
    
    if (session.lobbyReady && session.status === 'pending') {
        startCountdown(sessionId);
    } else {
        broadcastState(sessionId);
    }
    return session;
}

function startCountdown(sessionId: string) {
    const session = sessions[sessionId];
    if (!session) return;

    session.status = 'countdown';
    session.phase = 'countdown';
    broadcastState(sessionId);

    setTimeout(() => {
        startStory(sessionId);
    }, 3000);
}

export function startStory(sessionId: string) {
    const session = sessions[sessionId];
    if (!session) return;

    session.status = 'writing';
    session.phase = 'writing';
    session.roundStartedAt = Date.now();
    // Randomize turn order
    session.turnOrder = session.participants.map(p => p.userId).sort(() => Math.random() - 0.5);
    session.turnIndex = 0;
    session.currentTurnUserId = session.turnOrder[0];
    
    broadcastState(sessionId);
}

export function handleStoryBuilderConnection(connection: SocketStream, _req: FastifyRequest, sessionId: string) {
    const socket = connection.socket;
    if (!sessions[sessionId]) return;

    if (!connections[sessionId]) connections[sessionId] = new Set();
    connections[sessionId].add(socket);

    socket.send(JSON.stringify({ type: 'state', payload: sessions[sessionId] }));

    socket.on('message', (message: Buffer) => {
        try {
            const data = JSON.parse(message.toString());
            handleMessage(sessionId, data);
        } catch (e) {
            console.error('Failed to parse message', e);
        }
    });

    socket.on('close', () => {
        connections[sessionId]?.delete(socket);
    });
}

export function handleMessage(sessionId: string, data: any) {
    const session = sessions[sessionId];
    if (!session) return;

    if (data.type === 'ready') {
        const { userId } = data.payload;
        const participant = session.participants.find(p => p.userId === userId);
        if (participant) {
            setStoryBuilderReady(sessionId, userId, !participant.ready);
        }
    } else if (data.type === 'submit_paragraph') {
        const { userId, text } = data.payload;
        
        // Validate turn
        if (session.status !== 'writing') return;
        if (session.currentTurnUserId !== userId) return;

        // Add paragraph
        session.paragraphs.push({
            userId,
            text,
            votes: {}
        });

        // Check if game should end or move to next turn
        const totalParagraphs = session.paragraphs.length;
        const maxTotal = session.participants.length * session.maxParagraphsPerUser;

        if (totalParagraphs >= maxTotal) {
            session.status = 'voting';
            session.phase = 'voting';
            session.currentTurnUserId = undefined;
        } else {
            // Next turn
            session.turnIndex = (session.turnIndex + 1) % session.participants.length;
            session.currentTurnUserId = session.turnOrder[session.turnIndex];
        }
        broadcastState(sessionId);

    } else if (data.type === 'vote_paragraph') {
        const { userId, paragraphIndex, score } = data.payload;
        
        if (session.status !== 'voting') return;
        if (score < 0 || score > 10) return;

        const paragraph = session.paragraphs[paragraphIndex];
        if (!paragraph) return;
        
        // Prevent voting on own paragraph? The prompt says "i canvote on my frien'd paragraph". 
        // Usually you can't vote on your own. Let's enforce that.
        if (paragraph.userId === userId) return;

        paragraph.votes[userId] = score;

        checkVotingComplete(sessionId);
        broadcastState(sessionId);
    }
}

function checkVotingComplete(sessionId: string) {
    const session = sessions[sessionId];
    if (!session) return;

    // Check if every paragraph has votes from all other participants
    const allVoted = session.paragraphs.every(p => {
        const otherParticipants = session.participants.filter(part => part.userId !== p.userId);
        return otherParticipants.every(part => p.votes[part.userId] !== undefined);
    });

    if (allVoted) {
        calculateScores(sessionId);
    }
}

function calculateScores(sessionId: string) {
    const session = sessions[sessionId];
    if (!session) return;

    // Reset scores
    session.participants.forEach(p => p.score = 0);

    // Sum votes
    session.paragraphs.forEach(p => {
        const paragraphScore = Object.values(p.votes).reduce((a, b) => a + b, 0);
        const author = session.participants.find(part => part.userId === p.userId);
        if (author) {
            author.score += paragraphScore;
        }
    });

    // Determine winner
    const sorted = [...session.participants].sort((a, b) => b.score - a.score);
    session.winnerUserId = sorted[0]?.userId || null;
    session.status = 'ended';
    session.phase = 'ended';

    // Record stats
    session.participants.forEach(p => {
        const isWinner = p.userId === session.winnerUserId;
        const result = isWinner ? 'win' : 'loss';
        recordGameResult(p.userId, 'story_builder', result, p.score);
    });
    
    broadcastState(sessionId);
}

function broadcastState(sessionId: string) {
    const session = sessions[sessionId];
    if (!session) return;
    const state = JSON.stringify({ type: 'state', payload: session });
    connections[sessionId]?.forEach(client => {
        if (client.readyState === 1) {
            client.send(state);
        }
    });
}
