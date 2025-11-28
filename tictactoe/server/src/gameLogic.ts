import { BoardState, PlayerRole } from './types';

export const WINNING_COMBINATIONS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
    [0, 4, 8], [2, 4, 6]             // Diagonals
];

export function checkWin(board: BoardState): { winner: PlayerRole, line: number[] } | null {
    for (const combo of WINNING_COMBINATIONS) {
        const [a, b, c] = combo;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a] as PlayerRole, line: combo };
        }
    }
    return null;
}

export function checkDraw(board: BoardState): boolean {
    return board.every(cell => cell !== null);
}

export function isValidMove(board: BoardState, index: number): boolean {
    return index >= 0 && index < 9 && board[index] === null;
}

export function getInitialBoard(): BoardState {
    return Array(9).fill(null);
}
