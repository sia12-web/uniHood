import { io } from 'socket.io-client';

// In production, this should be an env var. For now, hardcode localhost:3000
const URL = 'http://localhost:3000/game';

export const socket = io(URL, {
    autoConnect: false
});
