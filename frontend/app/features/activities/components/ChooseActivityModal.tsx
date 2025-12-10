'use client';

import React, { useState } from 'react';
import { X, Loader2, Gamepad2, Keyboard, Brain, Hand, BookOpen } from 'lucide-react';
import {
  createTicTacToeSession,
  createSpeedTypingSession,
  createQuickTriviaSession,
  createRockPaperScissorsSession,
  createStoryBuilderSession,
} from '../api/client';
import { track } from '../../../../lib/analytics';
import { formatGameInviteMessage, type GameKey } from '../../../../components/GameInviteCard';

interface Props {
  peerUserId: string;
  onSendMessage: (message: string) => Promise<void>;
  onClose?: () => void;
}

interface GameOption {
  key: GameKey;
  name: string;
  description: string;
  duration: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const GAMES: GameOption[] = [
  {
    key: 'tictactoe',
    name: 'Tic-Tac-Toe',
    description: 'Classic 3×3 grid battle',
    duration: '~2 min',
    icon: <Gamepad2 className="h-6 w-6" />,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 hover:bg-indigo-100',
  },
  {
    key: 'speed_typing',
    name: 'Speed Typing',
    description: 'Race to type the fastest',
    duration: '~1 min',
    icon: <Keyboard className="h-6 w-6" />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 hover:bg-amber-100',
  },
  {
    key: 'quick_trivia',
    name: 'Quick Trivia',
    description: 'Test your knowledge',
    duration: '~3 min',
    icon: <Brain className="h-6 w-6" />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 hover:bg-emerald-100',
  },
  {
    key: 'rock_paper_scissors',
    name: 'Rock Paper Scissors',
    description: 'Best of 5 showdown',
    duration: '~1 min',
    icon: <Hand className="h-6 w-6" />,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50 hover:bg-rose-100',
  },
  {
    key: 'story_builder',
    name: 'Story Builder',
    description: 'Create a story together',
    duration: '~5 min',
    icon: <BookOpen className="h-6 w-6" />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 hover:bg-purple-100',
  },
];

async function createSessionForGame(gameKey: GameKey, peerUserId: string): Promise<string> {
  switch (gameKey) {
    case 'tictactoe':
      return createTicTacToeSession(peerUserId);
    case 'speed_typing': {
      const result = await createSpeedTypingSession(peerUserId);
      return result.sessionId;
    }
    case 'quick_trivia': {
      const result = await createQuickTriviaSession(peerUserId);
      return result.sessionId;
    }
    case 'rock_paper_scissors': {
      const result = await createRockPaperScissorsSession(peerUserId);
      return result.sessionId;
    }
    case 'story_builder': {
      const result = await createStoryBuilderSession(peerUserId);
      return result.sessionId;
    }
    default:
      throw new Error(`Unknown game: ${gameKey}`);
  }
}

export const ChooseActivityModal: React.FC<Props> = ({ peerUserId, onSendMessage, onClose }) => {
  const [loading, setLoading] = useState<GameKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelectGame(game: GameOption) {
    setLoading(game.key);
    setError(null);
    try {
      track('activity.start_click', { kind: game.key, peerId: peerUserId });

      // Create the game session
      const sessionId = await createSessionForGame(game.key, peerUserId);
      track('activity.session_started', { sessionId, kind: game.key });

      // Send the game invite as a chat message
      const inviteMessage = formatGameInviteMessage(game.key, sessionId, game.name);
      await onSendMessage(inviteMessage);

      // Close the modal
      onClose?.();
    } catch (e) {
      let message = e instanceof Error ? e.message : 'Failed to start game';
      // Handle rate limit error
      if (message.includes('rate_limit') || message.includes('too many pending')) {
        message = 'You have too many pending game invites. Wait for them to expire (30 min) or be accepted.';
      }
      setError(message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Choose a Game</h2>
          <p className="text-sm text-slate-500">Send a game invite to your friend</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      )}

      {/* Game Grid */}
      <div className="grid grid-cols-1 gap-3">
        {GAMES.map((game) => {
          const isLoading = loading === game.key;
          const isDisabled = loading !== null;

          return (
            <button
              key={game.key}
              onClick={() => handleSelectGame(game)}
              disabled={isDisabled}
              className={`flex items-center gap-4 rounded-2xl p-4 text-left transition-all ${game.bgColor} ${isDisabled && !isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm ${game.color}`}>
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : game.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900">{game.name}</div>
                <div className="text-sm text-slate-500 truncate">{game.description}</div>
              </div>
              <div className="text-xs font-medium text-slate-400">{game.duration}</div>
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <p className="mt-4 text-center text-xs text-slate-400">
        A game invite will be sent in the chat
      </p>
    </div>
  );
};
