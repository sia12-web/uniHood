export type PlayerRole = 'X' | 'O' | 'Spectator';

export interface Player {
    id: string;
    role: PlayerRole;
    name?: string;
}

export type BoardState = (PlayerRole | null)[];

export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface GameSession {
    id: string;
    code: string;
    players: Player[];
    spectators: Player[];
    board: BoardState;
    turn: PlayerRole; // 'X' or 'O'
    status: GameStatus;
    winner: PlayerRole | 'draw' | null;
    winningLine: number[] | null; // Indices of winning cells
    createdAt: number;
}
