import { SocketStream } from '@fastify/websocket';
import { FastifyRequest } from 'fastify';
import { recordGameResult } from '../services/stats';

type Participant = { userId: string; joined: boolean; ready: boolean };
type ScoreEntry = { userId: string; score: number };

type TriviaQuestion = { question: string; options: string[]; correctIndex: number };

type TriviaSession = {
    id: string;
    activityKey: 'quick_trivia';
    participants: Participant[];
    scores: Record<string, number>;
    currentRound: number;
    status: 'pending' | 'running' | 'ended';
    lobbyReady: boolean;
    startedAt?: number;
    roundStartedAt?: number;
    leaveReason?: 'opponent_left' | 'forfeit' | null;
    createdAt: number;
    statsRecorded?: boolean;  // Guard against duplicate stat recording
};

const QUESTION_TIME_MS = 7_000;
const CORRECT_POINTS = 10;
const WRONG_POINTS = -5;
const ROUND_COUNT = 5;

const sockets: Record<string, Set<WebSocket>> = {};
const sessions: Record<string, TriviaSession> = {};
const roundTimers: Record<string, NodeJS.Timeout | null> = {};
const userSockets: Record<string, Map<string, WebSocket>> = {}; // sessionId -> userId -> socket

// Session cleanup configuration (prevents memory leaks)
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_ENDED_TTL_MS = 60 * 60 * 1000; // 1 hour after ending
const SESSION_PENDING_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours if never started

/**
 * Cleanup stale sessions to prevent memory leaks.
 * Removes sessions that have ended >1hr ago or been pending >24hr.
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
            // Clean up all related state
            delete sessions[sessionId];
            delete sockets[sessionId];
            delete questionDeck[sessionId];
            delete roundAnswers[sessionId];
            delete userSockets[sessionId];
            if (roundTimers[sessionId]) {
                clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
                delete roundTimers[sessionId];
            }
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`[QuickTrivia] Cleaned up ${cleanedCount} stale sessions. Active: ${Object.keys(sessions).length}`);
    }
}

// Start cleanup interval (runs every 5 minutes)
setInterval(cleanupStaleSessions, SESSION_CLEANUP_INTERVAL_MS);


const questionBank: TriviaQuestion[] = [
    { question: 'What is the largest mammal on Earth?', options: ['Elephant', 'Blue Whale', 'Giraffe', 'Great White Shark'], correctIndex: 1 },
    { question: 'Which animal is known as the "King of the Jungle"?', options: ['Tiger', 'Lion', 'Bear', 'Gorilla'], correctIndex: 1 },
    { question: 'How many legs does a spider have?', options: ['6', '8', '10', '12'], correctIndex: 1 },
    { question: 'Which bird can fly backwards?', options: ['Eagle', 'Hummingbird', 'Owl', 'Sparrow'], correctIndex: 1 },
    { question: 'What is the fastest land animal?', options: ['Lion', 'Gazelle', 'Cheetah', 'Horse'], correctIndex: 2 },
    { question: 'Which animal changes colors to blend in?', options: ['Frog', 'Chameleon', 'Snake', 'Rabbit'], correctIndex: 1 },
    { question: 'What is the only mammal that can truly fly?', options: ['Flying Squirrel', 'Bat', 'Ostrich', 'Penguin'], correctIndex: 1 },
    { question: 'Which animal lays the largest egg?', options: ['Chicken', 'Crocodile', 'Ostrich', 'Eagle'], correctIndex: 2 },
    { question: 'What is a group of porcupines called?', options: ['A herd', 'A prickle', 'A gaggle', 'A troop'], correctIndex: 1 },
    { question: 'How many hearts does an octopus have?', options: ['One', 'Two', 'Three', 'Four'], correctIndex: 2 },
    { question: 'Chemical symbol for water?', options: ['O2', 'H2O', 'CO2', 'NaCl'], correctIndex: 1 },
    { question: 'Which planet is the "Red Planet"?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], correctIndex: 1 },
    { question: 'What do humans breathe to survive?', options: ['Carbon Dioxide', 'Nitrogen', 'Oxygen', 'Hydrogen'], correctIndex: 2 },
    { question: 'Hardest natural substance on Earth?', options: ['Iron', 'Gold', 'Diamond', 'Quartz'], correctIndex: 2 },
    { question: 'How many bones are in the adult human body?', options: ['106', '206', '306', '406'], correctIndex: 1 },
    { question: 'Which gas do plants absorb?', options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Methane'], correctIndex: 2 },
    { question: 'Boiling point of water at sea level?', options: ['0°C', '50°C', '100°C', '212°C'], correctIndex: 2 },
    { question: 'Largest planet in our solar system?', options: ['Earth', 'Saturn', 'Jupiter', 'Neptune'], correctIndex: 2 },
    { question: 'Name of the galaxy we live in?', options: ['Andromeda', 'Triangulum', 'Milky Way', 'Pinwheel'], correctIndex: 2 },
    { question: 'Who discovered the laws of motion?', options: ['Albert Einstein', 'Isaac Newton', 'Galileo Galilei', 'Stephen Hawking'], correctIndex: 1 },
    { question: 'What is the capital of India?', options: ['Mumbai', 'New Delhi', 'Kolkata', 'Chennai'], correctIndex: 1 },
    { question: 'How many continents are there?', options: ['5', '6', '7', '8'], correctIndex: 2 },
    { question: 'Which is the longest river in the world?', options: ['Amazon', 'Yangtze', 'Nile', 'Mississippi'], correctIndex: 2 },
    { question: 'Which is the largest ocean?', options: ['Atlantic', 'Indian', 'Southern', 'Pacific'], correctIndex: 3 },
    { question: 'Tallest mountain in the world?', options: ['Kilimanjaro', 'K2', 'Mount Everest', 'Mount Fuji'], correctIndex: 2 },
    { question: 'Land of the Rising Sun?', options: ['China', 'South Korea', 'Japan', 'Thailand'], correctIndex: 2 },
    { question: 'Where is the Taj Mahal?', options: ['Agra, India', 'Delhi, India', 'Jaipur, India', 'Mumbai, India'], correctIndex: 0 },
    { question: 'Smallest continent by land area?', options: ['Europe', 'Australia', 'Antarctica', 'South America'], correctIndex: 1 },
    { question: 'Capital of the USA?', options: ['New York', 'Los Angeles', 'Washington, D.C.', 'Chicago'], correctIndex: 2 },
    { question: 'Largest US state by area?', options: ['Texas', 'California', 'Alaska', 'Montana'], correctIndex: 2 },
    { question: 'First Prime Minister of India?', options: ['Mahatma Gandhi', 'Jawaharlal Nehru', 'Sardar Patel', 'Indira Gandhi'], correctIndex: 1 },
    { question: 'Year India gained independence?', options: ['1942', '1947', '1950', '1965'], correctIndex: 1 },
    { question: 'The "Father of the Nation" in India?', options: ['Bose', 'Bhagat Singh', 'Mahatma Gandhi', 'Nehru'], correctIndex: 2 },
    { question: 'Discovered India by sea route?', options: ['Columbus', 'Magellan', 'Vasco da Gama', 'James Cook'], correctIndex: 2 },
    { question: 'Year Indian Constitution was adopted?', options: ['1947', '1949', '1950', '1952'], correctIndex: 2 },
    { question: 'First President of India?', options: ['Radhakrishnan', 'Zakir Husain', 'Dr. Rajendra Prasad', 'V. V. Giri'], correctIndex: 2 },
    { question: 'In what year did the Berlin Wall fall?', options: ['1985', '1989', '1991', '1995'], correctIndex: 1 },
    { question: 'First urban tram line city (1832)?', options: ['London', 'New York', 'Paris', 'Vienna'], correctIndex: 1 },
    { question: 'Who painted the Mona Lisa?', options: ['Van Gogh', 'Picasso', 'Leonardo da Vinci', 'Monet'], correctIndex: 2 },
    { question: 'Year first iPhone was released?', options: ['2005', '2007', '2009', '2011'], correctIndex: 1 },
    { question: 'In which sport is "love" used?', options: ['Badminton', 'Tennis', 'Volleyball', 'Table Tennis'], correctIndex: 1 },
    { question: 'Players on a soccer team on field?', options: ['9', '10', '11', '12'], correctIndex: 2 },
    { question: 'Sport using a pommel horse?', options: ['Athletics', 'Gymnastics', 'Equestrian', 'Weightlifting'], correctIndex: 1 },
    { question: 'Baseball player "The Great Bambino"?', options: ['Jackie Robinson', 'Babe Ruth', 'Ty Cobb', 'Willie Mays'], correctIndex: 1 },
    { question: 'Year of first Winter Olympics?', options: ['1900', '1924', '1936', '1952'], correctIndex: 1 },
    { question: 'Games per team in regular NFL season?', options: ['16', '17', '18', '19'], correctIndex: 1 },
    { question: 'Origin country of Judo?', options: ['China', 'Korea', 'Japan', 'Thailand'], correctIndex: 2 },
    { question: 'Max points with single dart throw?', options: ['50', '60', '100', '180'], correctIndex: 1 },
    { question: 'Won 7 Tour de France titles?', options: ['Eddy Merckx', 'Bernard Hinault', 'Miguel Indurain', 'Lance Armstrong'], correctIndex: 3 },
    { question: 'Billiards object ball to strike?', options: ['Cue ball', 'Pocket ball', 'Eight ball', 'Striker ball'], correctIndex: 0 },
    { question: 'Main ingredient in guacamole?', options: ['Tomato', 'Onion', 'Avocado', 'Lime'], correctIndex: 2 },
    { question: 'Granny Smith is a type of what?', options: ['Pear', 'Orange', 'Apple', 'Grape'], correctIndex: 2 },
    { question: 'Where did sushi originate?', options: ['China', 'Japan', 'Korea', 'Thailand'], correctIndex: 1 },
    { question: 'Meat used in shepherd\'s pie?', options: ['Beef', 'Chicken', 'Lamb', 'Pork'], correctIndex: 2 },
    { question: 'Main ingredient in bread?', options: ['Rice', 'Corn', 'Flour', 'Potatoes'], correctIndex: 2 },
    { question: 'Vegetable that makes you cry?', options: ['Potato', 'Carrot', 'Onion', 'Bell Pepper'], correctIndex: 2 },
    { question: 'Primary ingredient in hummus?', options: ['Lentils', 'Chickpeas', 'Black Beans', 'Kidney Beans'], correctIndex: 1 },
    { question: 'Bean used to make chocolate?', options: ['Coffee', 'Vanilla', 'Cacao', 'Green'], correctIndex: 2 },
    { question: 'Fruit with seeds on the outside?', options: ['Apple', 'Orange', 'Strawberry', 'Banana'], correctIndex: 2 },
    { question: 'Common name for dried grapes?', options: ['Prunes', 'Dates', 'Raisins', 'Figs'], correctIndex: 2 },
    { question: 'Colors in a rainbow?', options: ['5', '6', '7', '8'], correctIndex: 2 },
    { question: 'Cartoon character in a pineapple?', options: ['Mickey Mouse', 'SpongeBob', 'Homer Simpson', 'Bugs Bunny'], correctIndex: 1 },
    { question: 'Who wrote Harry Potter?', options: ['Tolkien', 'Lewis', 'J.K. Rowling', 'Dahl'], correctIndex: 2 },
    { question: 'Who is the "King of Pop"?', options: ['Elvis Presley', 'Michael Jackson', 'Prince', 'Freddie Mercury'], correctIndex: 1 },
    { question: 'Band of "Bohemian Rhapsody"?', options: ['The Beatles', 'Queen', 'Led Zeppelin', 'The Rolling Stones'], correctIndex: 1 },
    { question: 'Most-watched YouTube video?', options: ['Despacito', 'Gangnam Style', 'Baby Shark', 'Shape of You'], correctIndex: 2 },
    { question: 'Ice cream with crushed cookies?', options: ['Vanilla', 'Chip', 'Cookies and Cream', 'Strawberry'], correctIndex: 2 },
    { question: 'Play with character Romeo?', options: ['Hamlet', 'Macbeth', 'Romeo and Juliet', 'Midsummer'], correctIndex: 2 },
    { question: 'First toy advertised on TV?', options: ['Barbie', 'Mr. Potato Head', 'Hula Hoop', 'Slinky'], correctIndex: 1 },
    { question: 'Singer nicknamed "Material Girl"?', options: ['Britney', 'Beyonce', 'Madonna', 'Mariah'], correctIndex: 2 },
    { question: 'Currency of Japan?', options: ['Yuan', 'Won', 'Yen', 'Rupee'], correctIndex: 2 },
    { question: 'Month with 28 or 29 days?', options: ['January', 'February', 'March', 'December'], correctIndex: 1 },
    { question: 'What does HTTP stand for?', options: ['HyperText Transfer Protocol', 'Hyperlink Text', 'High-Level Text', 'Home Text'], correctIndex: 0 },
    { question: 'Safari and Firefox are types of?', options: ['OS', 'Search Engines', 'Web Browsers', 'Languages'], correctIndex: 2 },
    { question: 'Shortcut for "copy"?', options: ['Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+Z'], correctIndex: 1 },
    { question: 'Who launched eBay in 1995?', options: ['Jeff Bezos', 'Pierre Omidyar', 'Elon Musk', 'Zuckerberg'], correctIndex: 1 },
    { question: 'How old is the Sun?', options: ['1B years', '2.5B years', '4.6B years', '10B years'], correctIndex: 2 },
    { question: 'Smallest Indian state by area?', options: ['Sikkim', 'Goa', 'Tripura', 'Manipur'], correctIndex: 1 },
    { question: 'National fruit of India?', options: ['Apple', 'Banana', 'Mango', 'Grapes'], correctIndex: 2 },
    { question: 'Bird as symbol of peace?', options: ['Eagle', 'Dove', 'Swan', 'Peacock'], correctIndex: 1 },
    { question: 'The "Blue Planet"?', options: ['Mars', 'Earth', 'Neptune', 'Uranus'], correctIndex: 1 },
    { question: 'Who invented the telephone?', options: ['Edison', 'Alexander Graham Bell', 'Tesla', 'Marconi'], correctIndex: 1 },
    { question: 'Largest democracy in the world?', options: ['USA', 'India', 'China', 'Indonesia'], correctIndex: 1 },
    { question: 'Author of Indian national anthem?', options: ['Chandra', 'Rabindranath Tagore', 'Iqbal', 'Bose'], correctIndex: 1 },
    { question: 'Largest country by land area?', options: ['China', 'USA', 'Russia', 'Canada'], correctIndex: 2 },
    { question: 'Thin country on SA west coast?', options: ['Peru', 'Argentina', 'Chile', 'Ecuador'], correctIndex: 2 },
    { question: 'Desert in India?', options: ['Gobi', 'Sahara', 'Thar', 'Arabian'], correctIndex: 2 },
    { question: 'Highest female vocal range?', options: ['Alto', 'Mezzo', 'Soprano', 'Contralto'], correctIndex: 2 },
    { question: 'Instrument with 88 keys?', options: ['Guitar', 'Violin', 'Piano', 'Trumpet'], correctIndex: 2 },
    { question: 'Least common blood type in US?', options: ['O positive', 'A negative', 'AB negative', 'B positive'], correctIndex: 2 },
    { question: 'State where Chicago is located?', options: ['Illinois', 'New York', 'California', 'Massachusetts'], correctIndex: 0 },
    { question: 'Obama was a Senator from which state?', options: ['New York', 'California', 'Illinois', 'Hawaii'], correctIndex: 2 },
    { question: 'Chemical symbol for silver?', options: ['Au', 'Fe', 'Ag', 'Cu'], correctIndex: 2 },
    { question: 'Painted "Persistence of Memory"?', options: ['Picasso', 'Salvador Dali', 'Kahlo', 'Van Gogh'], correctIndex: 1 },
    { question: 'Language for Android development?', options: ['Python', 'C++', 'Java', 'Ruby'], correctIndex: 2 },
    { question: 'Email service owned by Microsoft?', options: ['Gmail', 'Yahoo', 'Outlook', 'Proton'], correctIndex: 2 },
    { question: 'The fourth state of matter?', options: ['Plasma', 'Bose-Einstein', 'Fermionic', 'Superfluid'], correctIndex: 0 },
    { question: 'Common name for the patella?', options: ['Shinbone', 'Thighbone', 'Kneecap', 'Collarbone'], correctIndex: 2 },
    { question: 'Which continent is the largest?', options: ['Africa', 'North America', 'Asia', 'Europe'], correctIndex: 2 },
    { question: 'World\'s largest desert?', options: ['Gobi', 'Arctic Polar Desert', 'Sahara', 'Arabian'], correctIndex: 1 },
];

/**
 * Pick `count` random questions using Fisher-Yates partial shuffle.
 * This is O(count) instead of O(N log N) for sorting the entire array.
 */
function pickQuestions(count: number): TriviaQuestion[] {
    const pool = [...questionBank];
    const result: TriviaQuestion[] = [];
    const n = Math.min(count, pool.length);

    for (let i = 0; i < n; i++) {
        const randomIndex = i + Math.floor(Math.random() * (pool.length - i));
        // Swap
        [pool[i], pool[randomIndex]] = [pool[randomIndex], pool[i]];
        result.push(pool[i]);
    }

    return result;
}

const questionDeck: Record<string, TriviaQuestion[]> = {};
const roundAnswers: Record<string, { answeredBy?: string; choiceIndex?: number; correct?: boolean }> = {};

export function createQuickTriviaSession(creatorUserId: string, participants?: string[]): string {
    const sessionId = `qt-${Math.random().toString(36).slice(2, 10)}`;
    const initialParticipants: Participant[] = [];
    const unique = Array.from(new Set([creatorUserId, ...(participants || [])]));
    for (const userId of unique) {
        // Creator is joined but NOT ready - all players must click Ready manually
        const isCreator = userId === creatorUserId;
        initialParticipants.push({
            userId,
            joined: isCreator,
            ready: false  // Everyone must manually ready up
        });
    }
    sessions[sessionId] = {
        id: sessionId,
        activityKey: 'quick_trivia',
        participants: initialParticipants,
        scores: {},
        currentRound: -1,
        status: 'pending',
        lobbyReady: false, // Will be set to true when enough players join and are ready
        createdAt: Date.now(),
    };
    questionDeck[sessionId] = pickQuestions(ROUND_COUNT);
    return sessionId;
}

export function getQuickTriviaSession(sessionId: string): TriviaSession | undefined {
    return sessions[sessionId];
}

export function listQuickTriviaSessions(): Array<{
    sessionId: string;
    activityKey: 'quick_trivia';
    status: 'pending' | 'running' | 'ended';
    phase: 'lobby' | 'countdown' | 'running' | 'ended';
    lobbyReady: boolean;
    creatorUserId: string;
    participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
    createdAt: number;
}> {
    return Object.values(sessions).map((s) => ({
        sessionId: s.id,
        activityKey: 'quick_trivia',
        status: s.status,
        phase: s.status === 'running' ? 'running' : s.status === 'ended' ? 'ended' : 'lobby',
        lobbyReady: s.lobbyReady,
        creatorUserId: s.participants[0]?.userId || 'anonymous',
        participants: s.participants,
        createdAt: s.createdAt,
    }));
}

export function joinQuickTrivia(sessionId: string, userId: string): TriviaSession {
    const session = sessions[sessionId];
    if (!session) {
        throw new Error('session_not_found');
    }
    const existing = session.participants.find((p) => p.userId === userId);
    if (existing) {
        existing.joined = true;
        // Don't auto-ready - user must click Ready button
    } else {
        // New participant - joined but not ready
        session.participants.push({ userId, joined: true, ready: false });
    }
    // Lobby is ready when at least 2 participants are ready
    session.lobbyReady = session.participants.filter((p) => p.ready).length >= 2;
    if (session.status === 'pending' && session.lobbyReady) {
        startTriviaCountdown(sessionId);
    }
    return session;
}

export function setQuickTriviaReady(sessionId: string, userId: string, ready: boolean): TriviaSession {
    const session = sessions[sessionId];
    if (!session) {
        throw new Error('session_not_found');
    }
    const participant = session.participants.find((p) => p.userId === userId);
    if (participant) {
        participant.ready = ready;
        participant.joined = true;
    }
    session.lobbyReady = session.participants.filter((p) => p.ready).length >= 2;
    if (session.status === 'pending' && session.lobbyReady) {
        startTriviaCountdown(sessionId);
    }
    broadcastPresence(sessionId);
    return session;
}

// Leave/forfeit handler
export function leaveQuickTrivia(sessionId: string, userId: string): { sessionEnded: boolean; winnerUserId?: string } {
    const session = sessions[sessionId];
    if (!session) throw new Error('session_not_found');

    // Remove user from socket tracking
    userSockets[sessionId]?.delete(userId);

    // Remove from participants
    const idx = session.participants.findIndex(p => p.userId === userId);
    if (idx !== -1) {
        session.participants.splice(idx, 1);
    }

    // If game was running, forfeit - remaining player wins
    if (session.status === 'running' || session.status === 'pending') {
        const remaining = session.participants.filter(p => p.joined);
        if (remaining.length === 1 && session.status === 'running') {
            // Award win to remaining player
            const winner = remaining[0];
            const winnerScore = session.scores[winner.userId] || 0;
            session.scores[winner.userId] = Math.max(winnerScore, 100); // Ensure minimum score
            session.status = 'ended';
            session.leaveReason = 'opponent_left';

            // Record stats using fixed points (only if not already recorded)
            if (!session.statsRecorded) {
                session.statsRecorded = true;
                (async () => {
                    try {
                        await recordGameResult(winner.userId, 'quick_trivia', 'win', 200);  // Fixed: 50 + 150
                        await recordGameResult(userId, 'quick_trivia', 'loss', 50);  // Fixed: 50
                    } catch (err) {
                        console.error('[QuickTrivia] Failed to record game stats (forfeit):', err);
                    }
                })();
            }

            // Clear round timer
            if (roundTimers[sessionId]) {
                clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
                roundTimers[sessionId] = null;
            }

            // Broadcast ended event
            const scores = Object.entries(session.scores).map(([id, score]) => ({ userId: id, score }));
            sendToSession(sessionId, {
                type: 'activity.session.ended',
                payload: {
                    sessionId,
                    winnerUserId: winner.userId,
                    finalScoreboard: { participants: scores },
                    reason: 'opponent_left'
                },
            });

            return { sessionEnded: true, winnerUserId: winner.userId };
        } else if (remaining.length === 0) {
            session.status = 'ended';
            session.leaveReason = 'opponent_left';
            if (roundTimers[sessionId]) {
                clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
                roundTimers[sessionId] = null;
            }
            return { sessionEnded: true };
        }
    }

    session.lobbyReady = session.participants.filter(p => p.ready).length >= 2;
    broadcastPresence(sessionId);
    return { sessionEnded: false };
}

// Handle disconnect
function handleDisconnect(sessionId: string, socket: WebSocket) {
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
        console.log(`[QuickTrivia] User ${disconnectedUserId} disconnected from session ${sessionId}`);
        leaveQuickTrivia(sessionId, disconnectedUserId);
    }
}

export function handleQuickTriviaConnection(connection: SocketStream, _req: FastifyRequest, sessionId: string) {
    const socket = connection.socket as unknown as WebSocket;
    if (!sessions[sessionId]) {
        socket.close(1008, 'session_not_found');
        return;
    }
    if (!sockets[sessionId]) {
        sockets[sessionId] = new Set();
    }
    sockets[sessionId].add(socket);

    // Track connected user (will be set on join message)
    let connectedUserId: string | null = null;

    // initial snapshot
    sendSnapshot(sessionId, socket);

    socket.addEventListener('message', (evt) => {
        try {
            const msg = JSON.parse(evt.data.toString());
            // Track user from join message
            if (msg?.type === 'join' && msg.payload?.userId) {
                connectedUserId = msg.payload.userId;
                if (!userSockets[sessionId]) userSockets[sessionId] = new Map();
                userSockets[sessionId].set(connectedUserId!, socket);
            }
            if (msg?.type === 'submit') {
                const choice = msg.payload?.choiceIndex;
                const userId = msg.payload?.userId;
                if (typeof choice === 'number' && typeof userId === 'string') {
                    // Track userId from submit if not tracked yet
                    if (!connectedUserId) {
                        connectedUserId = userId;
                        if (!userSockets[sessionId]) userSockets[sessionId] = new Map();
                        userSockets[sessionId].set(connectedUserId!, socket);
                    }
                    handleAnswer(sessionId, userId, choice);
                }
            }
        } catch {
            /* ignore */
        }
    });

    socket.addEventListener('close', () => {
        sockets[sessionId]?.delete(socket);
        // Handle disconnect for forfeit logic
        if (connectedUserId) {
            handleDisconnect(sessionId, socket);
        }
    });
}

function sendToSession(sessionId: string, payload: unknown) {
    const msg = JSON.stringify(payload);
    sockets[sessionId]?.forEach((sock) => {
        try {
            sock.send(msg);
        } catch {
            /* ignore send errors */
        }
    });
}

function sendSnapshot(sessionId: string, target?: WebSocket) {
    const session = sessions[sessionId];
    if (!session) return;
    const snapshot = {
        type: 'session.snapshot',
        payload: {
            id: sessionId,
            status: session.status,
            activityKey: 'quick_trivia',
            presence: session.participants,
            lobbyReady: session.lobbyReady,
            currentRoundIndex: session.currentRound,
            scoreboard: {
                participants: Object.entries(session.scores).map(([userId, score]) => ({ userId, score })),
            },
        },
    };
    if (target) {
        try {
            target.send(JSON.stringify(snapshot));
        } catch {
            /* ignore */
        }
    } else {
        sendToSession(sessionId, snapshot);
    }
}

function broadcastPresence(sessionId: string) {
    const session = sessions[sessionId];
    if (!session) return;
    sendToSession(sessionId, {
        type: 'activity.session.presence',
        payload: { sessionId, participants: session.participants, lobbyReady: session.lobbyReady },
    });
}

function broadcastCountdown(sessionId: string, durationMs: number, reason: 'lobby' | 'intermission' = 'lobby') {
    const startedAt = Date.now();
    sendToSession(sessionId, {
        type: 'activity.session.countdown',
        payload: { sessionId, startedAt, durationMs, endsAt: startedAt + durationMs, reason },
    });
}

function startTriviaCountdown(sessionId: string) {
    const session = sessions[sessionId];
    if (!session || session.status !== 'pending') return;
    broadcastPresence(sessionId);
    broadcastCountdown(sessionId, 3_000, 'lobby');
    setTimeout(() => startSession(sessionId), 3_000);
}

function startSession(sessionId: string) {
    const session = sessions[sessionId];
    if (!session || session.status !== 'pending') return;
    session.status = 'running';
    session.startedAt = Date.now();
    session.currentRound = 0;
    sendToSession(sessionId, { type: 'activity.session.started', payload: { sessionId, currentRound: 0 } });
    startRound(sessionId, 0);
}

function startRound(sessionId: string, roundIndex: number) {
    const session = sessions[sessionId];
    if (!session || session.status !== 'running') return;
    const deck = questionDeck[sessionId] || pickQuestions(ROUND_COUNT);
    questionDeck[sessionId] = deck;
    const question = deck[roundIndex % deck.length];
    if (!question) {
        endSession(sessionId);
        return;
    }
    session.currentRound = roundIndex;
    session.roundStartedAt = Date.now();
    roundAnswers[sessionId] = {};
    const payload = {
        type: 'activity.round.started',
        payload: {
            sessionId,
            index: roundIndex,
            payload: { question: question.question, options: question.options, timeLimitMs: QUESTION_TIME_MS },
        },
    };
    sendToSession(sessionId, payload);
    if (roundTimers[sessionId]) {
        clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
    }
    roundTimers[sessionId] = setTimeout(() => {
        endRound(sessionId, question.correctIndex, false);
    }, QUESTION_TIME_MS);
}

function handleAnswer(sessionId: string, userId: string, choiceIndex: number) {
    const session = sessions[sessionId];
    if (!session || session.status !== 'running') return;
    const deck = questionDeck[sessionId];
    const question = deck?.[session.currentRound];
    if (!question) return;
    const already = roundAnswers[sessionId]?.answeredBy;
    if (already) {
        return;
    }
    const correct = choiceIndex === question.correctIndex;
    roundAnswers[sessionId] = { answeredBy: userId, choiceIndex, correct };
    if (!session.scores[userId]) {
        session.scores[userId] = 0;
    }

    // Scoring: Base + Speed Bonus
    let points = WRONG_POINTS;
    if (correct) {
        const now = Date.now();
        const start = session.roundStartedAt || now;
        const elapsed = now - start;
        const remaining = Math.max(0, QUESTION_TIME_MS - elapsed);
        // Bonus: 1 point per 100ms remaining
        const speedBonus = Math.floor(remaining / 100);
        points = CORRECT_POINTS + speedBonus;
    }

    session.scores[userId] += points;
    if (roundTimers[sessionId]) {
        clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
        roundTimers[sessionId] = null;
    }
    endRound(sessionId, question.correctIndex, true);
}

function endRound(sessionId: string, correctIndex: number, hasAnswer: boolean) {
    const session = sessions[sessionId];
    if (!session || session.status !== 'running') return;
    const scores: ScoreEntry[] = Object.entries(session.scores).map(([userId, score]) => ({ userId, score }));
    sendToSession(sessionId, {
        type: 'activity.round.ended',
        payload: { sessionId, index: session.currentRound, correctIndex, scoreboard: { participants: scores } },
    });
    const nextIndex = session.currentRound + 1;
    if (nextIndex >= ROUND_COUNT) {
        endSession(sessionId);
        return;
    }
    // short intermission before next question
    setTimeout(() => startRound(sessionId, nextIndex), hasAnswer ? 400 : 1000);
}

function endSession(sessionId: string) {
    const session = sessions[sessionId];
    if (!session || session.status === 'ended') return;
    session.status = 'ended';

    // Guard: Record stats only once per session
    const shouldRecordStats = !session.statsRecorded;
    if (shouldRecordStats) {
        session.statsRecorded = true;
    }

    // Build scores for ALL participants, not just those who answered
    const allParticipantIds = session.participants.map(p => p.userId);
    const scores: ScoreEntry[] = allParticipantIds.map(userId => ({
        userId,
        score: session.scores[userId] ?? 0
    }));

    const winner = scores.sort((a, b) => b.score - a.score)[0]?.userId;

    // Record stats for ALL participants using fixed leaderboard points (ONLY ONCE)
    // Winner: 200 (50 played + 150 win), Loser: 50 (played only)
    if (shouldRecordStats) {
        (async () => {
            try {
                for (const userId of allParticipantIds) {
                    const isWinner = userId === winner;
                    const result = isWinner ? 'win' : 'loss';
                    const fixedPoints = isWinner ? 200 : 50;
                    await recordGameResult(userId, 'quick_trivia', result, fixedPoints);
                }
            } catch (err) {
                console.error('[QuickTrivia] Failed to record game stats:', err);
            }
        })();
    }

    sendToSession(sessionId, {
        type: 'activity.session.ended',
        payload: { sessionId, winnerUserId: winner, finalScoreboard: { participants: scores } },
    });
    if (roundTimers[sessionId]) {
        clearTimeout(roundTimers[sessionId] as NodeJS.Timeout);
        roundTimers[sessionId] = null;
    }
}
