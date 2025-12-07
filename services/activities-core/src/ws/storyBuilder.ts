import { SocketStream } from '@fastify/websocket';
import { FastifyRequest } from 'fastify';
import { recordGameResult } from '../services/stats';

export interface StoryParagraph {
    userId: string;
    text: string;
    votes: Record<string, number>; // userId -> score (0-10)
}

// Story prompts to give players inspiration
const STORY_PROMPTS = [
    { title: "Coffee Shop Meet-Cute", opening: "The morning rush at the campus coffee shop was chaos as usual. That's when their eyes met across the crowded counter..." },
    { title: "Library Whispers", opening: "The library was supposed to be quiet, but someone at the next table kept humming. When they finally looked up to complain..." },
    { title: "Rainy Day Encounter", opening: "The sudden downpour caught everyone off guard. Two strangers found themselves sharing the same tiny awning..." },
    { title: "The Wrong Order", opening: "'I think you grabbed my food by mistake,' they said, holding up an identical takeout bag. Their smile was unexpectedly warm..." },
    { title: "Study Group Sparks", opening: "The study group was supposed to be about calculus. But every time their hands brushed reaching for the same textbook..." },
    { title: "Late Night Laundry", opening: "Who does laundry at 2 AM? Apparently, they both did. The laundromat was empty except for the two of them..." },
    { title: "Concert Connection", opening: "They were wearing the same obscure band t-shirt. In a crowd of thousands, somehow they ended up standing next to each other..." },
    { title: "The Shared Playlist", opening: "The notification said someone had added a song to the collaborative playlist. The song choice was... surprisingly perfect..." },
    { title: "Elevator Stuck", opening: "The elevator lurched to a stop between floors. 'Well,' they said to the only other person inside, 'I guess we have time to talk...'" },
    { title: "The Dog Park", opening: "Their dogs had tangled their leashes together. Trying to untangle them meant getting very, very close..." },
];

function getRandomPrompt() {
    return STORY_PROMPTS[Math.floor(Math.random() * STORY_PROMPTS.length)];
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
    currentTurnUserId?: string;
    turnOrder: string[];
    turnIndex: number;
    winnerUserId?: string | null;
    storyPrompt?: { title: string; opening: string };
    leaveReason?: 'opponent_left' | 'forfeit' | null;
}

const sessions: Record<string, StoryBuilderSession> = {};
const connections: Record<string, Set<any>> = {};
const userSockets: Record<string, Map<string, any>> = {}; // sessionId -> userId -> socket

const MAX_PARAGRAPHS_PER_USER = 3;

export function createStoryBuilderSession(creatorUserId: string, participants: string[] = [], id?: string): string {
    const sessionId = id || `sb-${Math.random().toString(36).substring(2, 10)}`;
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
        winnerUserId: null,
        storyPrompt: getRandomPrompt()
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

export function joinStoryBuilder(sessionId: string, userId: string, socket?: any) {
    const session = sessions[sessionId];
    if (!session) throw new Error('session_not_found');

    const participant = session.participants.find(p => p.userId === userId);
    if (participant) {
        participant.joined = true;
    } else {
        session.participants.push({ userId, joined: true, ready: false, score: 0 });
    }

    // Track user's socket for disconnect detection
    if (socket) {
        if (!userSockets[sessionId]) userSockets[sessionId] = new Map();
        userSockets[sessionId].set(userId, socket);
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

// Leave/forfeit handler
export function leaveStoryBuilder(sessionId: string, userId: string): { sessionEnded: boolean; winnerUserId?: string } {
    const session = sessions[sessionId];
    if (!session) throw new Error('session_not_found');

    // Remove user from user-socket tracking
    userSockets[sessionId]?.delete(userId);

    // Remove from participants
    const idx = session.participants.findIndex(p => p.userId === userId);
    if (idx !== -1) {
        session.participants.splice(idx, 1);
    }

    // If game was in progress (writing or voting), forfeit - remaining player wins
    if (session.status === 'writing' || session.status === 'voting' || session.status === 'countdown') {
        const remaining = session.participants.filter(p => p.joined);
        if (remaining.length === 1) {
            // Award win to remaining player
            const winner = remaining[0];
            winner.score = Math.max(winner.score, 100); // Forfeit win bonus
            session.winnerUserId = winner.userId;
            session.status = 'ended';
            session.phase = 'ended';
            session.leaveReason = 'opponent_left';

            // Record stats
            recordGameResult(winner.userId, 'story_builder', 'win', winner.score);
            recordGameResult(userId, 'story_builder', 'loss', 0);

            broadcastState(sessionId);
            return { sessionEnded: true, winnerUserId: winner.userId };
        } else if (remaining.length === 0) {
            // No one left, just end
            session.status = 'ended';
            session.phase = 'ended';
            session.leaveReason = 'opponent_left';
            broadcastState(sessionId);
            return { sessionEnded: true };
        }
    }

    // Lobby phase - just remove and update
    session.lobbyReady = session.participants.every(p => p.ready) && session.participants.length >= 2;
    broadcastState(sessionId);
    return { sessionEnded: false };
}

// Handle disconnect (called when socket closes)
function handleDisconnect(sessionId: string, socket: any) {
    // Find which user this socket belonged to
    const userMap = userSockets[sessionId];
    if (!userMap) return;

    let disconnectedUserId: string | null = null;
    for (const [userId, sock] of userMap.entries()) {
        if (sock === socket) {
            disconnectedUserId = userId;
            break;
        }
    }

    if (disconnectedUserId) {
        console.log(`[StoryBuilder] User ${disconnectedUserId} disconnected from session ${sessionId}`);
        leaveStoryBuilder(sessionId, disconnectedUserId);
    }
}

export function handleStoryBuilderConnection(connection: SocketStream, _req: FastifyRequest, sessionId: string) {
    const socket = connection.socket;
    if (!sessions[sessionId]) return;

    if (!connections[sessionId]) connections[sessionId] = new Set();
    connections[sessionId].add(socket);

    // Track this socket temporarily until we know the userId from join message
    let connectedUserId: string | null = null;

    socket.send(JSON.stringify({ type: 'state', payload: sessions[sessionId] }));

    socket.on('message', (message: Buffer) => {
        try {
            const data = JSON.parse(message.toString());
            // Capture userId from join message
            if (data.type === 'join' && data.payload?.userId) {
                connectedUserId = data.payload.userId;
                if (!userSockets[sessionId]) userSockets[sessionId] = new Map();
                userSockets[sessionId].set(connectedUserId!, socket);
            }
            handleMessage(sessionId, data, socket);
        } catch (e) {
            console.error('Failed to parse message', e);
        }
    });

    socket.on('close', () => {
        connections[sessionId]?.delete(socket);
        // Handle disconnect for forfeit logic
        if (connectedUserId) {
            handleDisconnect(sessionId, socket);
        }
    });
}

export function handleMessage(sessionId: string, data: any, socket?: any) {
    const session = sessions[sessionId];
    if (!session) return;

    if (data.type === 'join') {
        const { userId } = data.payload;
        if (userId) {
            joinStoryBuilder(sessionId, userId, socket);
        }
    } else if (data.type === 'leave') {
        const { userId } = data.payload;
        if (userId) {
            leaveStoryBuilder(sessionId, userId);
        }
    } else if (data.type === 'ready') {
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
