import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import sessionRoutes from './routes/sessions';
import { setupSocketHandlers } from './socketHandler';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/sessions', sessionRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Tic-Tac-Toe Server is running!');
});

httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
