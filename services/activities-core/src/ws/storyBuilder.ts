import { SocketStream } from '@fastify/websocket';
import { FastifyRequest } from 'fastify';
import { recordGameResult } from '../services/stats';

export interface StoryParagraph {
    userId: string;
    text: string;
    votes: Record<string, number>; // userId -> score (0-10)
}

type Gender = 'boy' | 'girl';

// Story prompts to give players inspiration
const GENERIC_PROMPTS = [
    { title: "The Mystery Box", opening: "The package arrived without a return address. Inside was a single, glowing object..." },
    { title: "The Time Machine", opening: "It looked like a normal watch, but when they turned the dial, the world around them shifted..." },
    { title: "The Haunted House", opening: "Everyone said the old mansion was abandoned. But the lights in the attic window told a different story..." },
];

const ROMANCE_PROMPTS = [
    { title: "Coffee Shop Meet-Cute", opening: "The morning rush at the campus coffee shop was chaos as usual. That's when their eyes met across the crowded counter..." },
    { title: "Rainy Day Encounter", opening: "The sudden downpour caught everyone off guard. Two strangers found themselves sharing the same tiny awning..." },
    { title: "The Wrong Order", opening: "'I think you grabbed my food by mistake,' they said, holding up an identical takeout bag. Their smile was unexpectedly warm..." },
    { title: "Study Group Sparks", opening: "The study group was supposed to be about calculus. But every time their hands brushed reaching for the same textbook..." },
    { title: "Elevator Stuck", opening: "The elevator lurched to a stop between floors. 'Well,' they said to the only other person inside, 'I guess we have time to talk...'" },
    { title: "The Time Capsule", opening: "They dug up a time capsule from 50 years ago. Inside was a photo of two people who looked exactly like them..." },
    { title: "The Last Train", opening: "Missing the last train home seemed like a disaster, until they realized who else was stranded on the platform..." },
];

const GAY_ROMANCE_PROMPTS = [
    { title: "Locker Room Confession", opening: "After practice, the locker room was empty. He thought he was alone until he saw him..." },
    { title: "The Late Night Gamer", opening: "They had been gaming together online for months. When they finally met at the convention, the chemistry was instant..." },
    { title: "Roommates", opening: "They had been roommates for a year, strictly platonic. But one movie night changed everything..." },
    { title: "The Rivalry", opening: "They were academic rivals, always competing for the top spot. But beneath the competition was something else..." },
    { title: "The Fake Date", opening: "He needed a date for his sister's wedding to get his family off his back. His best friend volunteered, but the lines started to blur..." },
    { title: "The Coffee Shop Rivalry", opening: "He owned the artisanal tea shop. The guy across the street owned the espresso bar. It was war, until the power went out on the whole block..." },
];

const LESBIAN_ROMANCE_PROMPTS = [
    { title: "The Bookstore Corner", opening: "She reached for the same book on the top shelf. Their fingers touched, and time seemed to stop..." },
    { title: "Art Class Model", opening: "She was trying to focus on her sketch, but the model's gaze was distracting her in the best way possible..." },
    { title: "The Coffee Date", opening: "It was supposed to be just a friendly coffee. Three hours later, neither of them wanted to leave..." },
    { title: "Softball Season", opening: "The game was intense, but she couldn't take her eyes off the pitcher..." },
    { title: "The Road Trip", opening: "Her car broke down in the middle of nowhere. The mechanic who pulled up in the tow truck was the most beautiful woman she'd ever seen..." },
    { title: "The Masquerade", opening: "She didn't know who she was dancing with behind the mask, but she knew she never wanted the music to stop..." },
];

function getPromptForGenders(genders: Gender[]) {
    if (genders.length !== 2) return GENERIC_PROMPTS[Math.floor(Math.random() * GENERIC_PROMPTS.length)];

    const [g1, g2] = genders;

    if (g1 === 'boy' && g2 === 'boy') {
        return GAY_ROMANCE_PROMPTS[Math.floor(Math.random() * GAY_ROMANCE_PROMPTS.length)];
    } else if (g1 === 'girl' && g2 === 'girl') {
        return LESBIAN_ROMANCE_PROMPTS[Math.floor(Math.random() * LESBIAN_ROMANCE_PROMPTS.length)];
    } else {
        // Boy + Girl or Girl + Boy
        return ROMANCE_PROMPTS[Math.floor(Math.random() * ROMANCE_PROMPTS.length)];
    }
}

export interface StoryBuilderSession {
    id: string;
    activityKey: 'story_builder';
    status: 'pending' | 'countdown' | 'writing' | 'voting' | 'ended';
    phase: 'lobby' | 'countdown' | 'writing' | 'voting' | 'ended';
    lobbyReady: boolean;
    creatorUserId: string;
    participants: Array<{ userId: string; joined: boolean; ready: boolean; score: number; gender?: Gender }>;
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
    statsRecorded?: boolean;  // Guard against duplicate stat recording
}

const sessions: Record<string, StoryBuilderSession> = {};
const connections: Record<string, Set<any>> = {};
const userSockets: Record<string, Map<string, any>> = {}; // sessionId -> userId -> socket

// Session cleanup configuration (prevents memory leaks)
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_ENDED_TTL_MS = 60 * 60 * 1000; // 1 hour after ending
const SESSION_PENDING_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours if never started

/**
 * Cleanup stale sessions to prevent memory leaks.
 */
function cleanupStaleSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const sessionId of Object.keys(sessions)) {
        const session = sessions[sessionId];
        if (!session) continue;

        const age = now - session.createdAt;
        const shouldClean =
            (session.status === 'ended' && age > SESSION_ENDED_TTL_MS) ||
            (session.status === 'pending' && age > SESSION_PENDING_TTL_MS);

        if (shouldClean) {
            delete sessions[sessionId];
            delete connections[sessionId];
            delete userSockets[sessionId];
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`[StoryBuilder] Cleaned up ${cleanedCount} stale sessions. Active: ${Object.keys(sessions).length}`);
    }
}

// Start cleanup interval
setInterval(cleanupStaleSessions, SESSION_CLEANUP_INTERVAL_MS);

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
        storyPrompt: undefined // Will be set when game starts based on genders
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

export function setStoryBuilderReady(sessionId: string, userId: string, ready: boolean, gender?: Gender) {
    const session = sessions[sessionId];
    if (!session) throw new Error('session_not_found');

    const participant = session.participants.find(p => p.userId === userId);
    if (participant) {
        participant.ready = ready;
        if (gender) {
            participant.gender = gender;
        }
    }

    session.lobbyReady = session.participants.every(p => p.ready) && session.participants.length >= 2;

    if (session.lobbyReady && session.status === 'pending') {
        // Generate prompt based on genders
        const genders = session.participants.map(p => p.gender).filter((g): g is Gender => !!g);
        session.storyPrompt = getPromptForGenders(genders);

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
    }, 5000);
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

            // Record stats using fixed points (only if not already recorded)
            if (!session.statsRecorded) {
                session.statsRecorded = true;
                (async () => {
                    try {
                        await recordGameResult(winner.userId, 'story_builder', 'win', 200);  // Fixed: 50 + 150
                        await recordGameResult(userId, 'story_builder', 'loss', 50);  // Fixed: 50
                    } catch (err) {
                        console.error('[StoryBuilder] Failed to record game stats (forfeit):', err);
                    }
                })();
            }

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

    // If we're in lobby phase and not enough players remain, end the session
    if (session.status === 'pending' && session.participants.length < 2) {
        session.status = 'ended';
        session.phase = 'ended';
        session.leaveReason = 'opponent_left';
        broadcastState(sessionId);
        return { sessionEnded: true };
    }

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
        const { userId, gender } = data.payload;
        const participant = session.participants.find(p => p.userId === userId);
        if (participant) {
            setStoryBuilderReady(sessionId, userId, !participant.ready, gender);
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

    // Determine winner(s)
    const sorted = [...session.participants].sort((a, b) => b.score - a.score);
    const maxScore = sorted[0]?.score ?? 0;
    session.winnerUserId = sorted[0]?.userId || null; // Kept for legacy compatibility
    session.status = 'ended';
    session.phase = 'ended';

    // Record stats using fixed points (only if not already recorded)
    if (!session.statsRecorded) {
        session.statsRecorded = true;
        (async () => {
            try {
                for (const p of session.participants) {
                    const isWinner = p.score === maxScore && maxScore > 0;
                    const result = isWinner ? 'win' : 'loss';
                    const fixedPoints = isWinner ? 200 : 50;
                    await recordGameResult(p.userId, 'story_builder', result, fixedPoints);
                }
            } catch (err) {
                console.error('[StoryBuilder] Failed to record game stats:', err);
            }
        })();
    }

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
