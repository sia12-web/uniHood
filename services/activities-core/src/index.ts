import fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { handleTicTacToeConnection } from './ws/tictactoe';

const server = fastify({ logger: true });

server.register(cors, {
    origin: '*', // Allow all origins for now
});

server.register(websocket);

server.register(async function (fastify) {
    fastify.get('/activities/session/:sessionId/stream', { websocket: true }, (connection, req) => {
        const { sessionId } = req.params as { sessionId: string };
        // For now, we only support Tic-Tac-Toe, but we could switch based on session type if we had a DB.
        // Since we are implementing Tic-Tac-Toe, we'll route to it.
        // In a real app, we'd look up the session to see what activity it is.
        // For this task, I'll assume if the ID starts with 'ttt-', it's Tic-Tac-Toe.

        // Default to Tic-Tac-Toe for now as it's the only implemented activity in this service
        handleTicTacToeConnection(connection, req, sessionId);
    });

    fastify.post('/activities/tictactoe/create', async (req, _reply) => {
        // Create a session
        const sessionId = `ttt-${Math.random().toString(36).substring(2, 8)}`;
        return { sessionId };
    });
});

const start = async () => {
    try {
        await server.listen({ port: 3001, host: '0.0.0.0' }); // Use 3001 to avoid conflict if 3000 is taken (though we killed it)
        console.log('Server listening on http://localhost:3001');
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
