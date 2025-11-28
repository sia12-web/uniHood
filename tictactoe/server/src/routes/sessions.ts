import { Router, Request, Response } from 'express';
import { createSession, getSessionByCode } from '../sessionStore';
import { CreateSessionResponse, JoinSessionResponse } from '../types';

const router = Router();

// Create a new session
router.post('/', (req: Request, res: Response) => {
    const session = createSession();

    // Add creator as Player X
    const playerId = 'player-' + Math.random().toString(36).substr(2, 9);
    session.players.push({ id: playerId, role: 'X' });

    const response: CreateSessionResponse = {
        sessionId: session.id,
        code: session.code,
        playerId,
        role: 'X'
    };

    res.json(response);
});

// Join an existing session
router.post('/join', (req: Request, res: Response) => {
    const { code } = req.body;

    if (!code) {
        res.status(400).json({ error: 'Code is required' });
        return;
    }

    const session = getSessionByCode(code.toUpperCase());

    if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    // Check if room is full (2 players)
    if (session.players.length >= 2) {
        // Join as spectator
        const playerId = 'spec-' + Math.random().toString(36).substr(2, 9);
        session.spectators.push({ id: playerId, role: 'Spectator' });

        const response: JoinSessionResponse = {
            sessionId: session.id,
            playerId,
            role: 'Spectator',
            initialState: session
        };
        res.json(response);
        return;
    }

    // Join as Player O
    const playerId = 'player-' + Math.random().toString(36).substr(2, 9);
    session.players.push({ id: playerId, role: 'O' });

    // If we have 2 players, status becomes playing (if it was waiting)
    if (session.players.length === 2 && session.status === 'waiting') {
        session.status = 'playing';
    }

    const response: JoinSessionResponse = {
        sessionId: session.id,
        playerId,
        role: 'O',
        initialState: session
    };

    res.json(response);
});

// Get session status
router.get('/:code', (req: Request, res: Response) => {
    const { code } = req.params;
    const session = getSessionByCode(code.toUpperCase());

    if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
    }

    res.json(session);
});

export default router;
