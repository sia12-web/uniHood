import asyncio
import logging
from typing import Dict, List, Optional
import time

from app.domain.activities import models, service, sockets, outbox, utils
from app.domain.identity import audit
from app.domain.xp.service import XPService
from app.domain.xp.models import XPAction

logger = logging.getLogger(__name__)

# Winning combinations indices
WIN_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], # Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], # Cols
    [0, 4, 8], [2, 4, 6]             # Diagonals
]

class TicTacToeManager:
    def __init__(self):
        self.service = service.ActivitiesService()

    async def handle_socketio_action(self, session_id: str, user_id: str, action_type: str, payload: dict):
        try:
            activity = await self.service._require_activity(session_id)
        except Exception:
            return

        if activity.kind != "tictactoe":
            return

        if action_type == "join":
            await self._handle_join(session_id, activity, user_id)
        elif action_type == "ready":
             await self._handle_ready(session_id, activity, user_id)
        elif action_type == "move":
             await self._handle_move(session_id, activity, user_id, payload.get("index"))
        elif action_type == "restart":
             await self._handle_restart(session_id, activity, user_id)
        elif action_type == "leave":
             await self._handle_leave(session_id, activity, user_id)

    async def _handle_join(self, session_id: str, activity: models.Activity, user_id: str):
        meta = activity.meta.get("tictactoe", {})
        players = meta.get("players", {})
        
        # Assign roles if available
        if not players.get("X"):
            players["X"] = user_id
        elif not players.get("O") and players.get("X") != user_id:
            players["O"] = user_id
            
        meta["players"] = players
        activity.meta["tictactoe"] = meta
        await self.service._persist(activity)
        await self._broadcast_state(session_id, activity)

    async def _handle_ready(self, session_id: str, activity: models.Activity, user_id: str):
        meta = activity.meta.get("tictactoe", {})
        ready = meta.get("ready", {})
        ready[user_id] = not ready.get(user_id, False) # Toggle ready
        meta["ready"] = ready
        activity.meta["tictactoe"] = meta
        
        players = meta.get("players", {})
        x_id = players.get("X")
        o_id = players.get("O")
        
        # If both present and ready, start countdown
        if x_id and o_id and ready.get(x_id) and ready.get(o_id):
            # Reset game state if in lobby
            if activity.state == "lobby" or activity.state == "completed":
                # Initialize new match
                meta["board"] = [None] * 9
                meta["turn"] = "X"
                meta["roundWins"] = {x_id: 0, o_id: 0}
                meta["roundIndex"] = 0
                meta["matchWinner"] = None
                meta["winner"] = None
                meta["history"] = []
                
                # Start countdown sequence
                # We can't really block here easily without holding up the worker, 
                # but we can set a state "countdown" and emit it.
                activity.state = "active" # Mark active so it shows in lists

                # Award XP for starting a game
                try:
                    xp_svc = XPService()
                    await xp_svc.award_xp(x_id, XPAction.GAME_PLAYED, {"activity_id": activity.id, "target_id": o_id, "game": activity.kind})
                    await xp_svc.award_xp(o_id, XPAction.GAME_PLAYED, {"activity_id": activity.id, "target_id": x_id, "game": activity.kind})
                except Exception:
                    logger.exception("Failed to award GAME_PLAYED XP for TicTacToe")

                meta["status"] = "countdown"
                meta["countdown"] = 3 # 3 seconds as requested
                activity.meta["tictactoe"] = meta
                await self.service._persist(activity)
                await self._broadcast_state(session_id, activity)
                
                # Launch background task for countdown
                asyncio.create_task(self._run_countdown(session_id, activity.id))
                return

        await self.service._persist(activity)
        await self._broadcast_state(session_id, activity)

    async def _run_countdown(self, session_id: str, activity_id: str):
        for i in range(3, 0, -1):
            await sockets.emit_activity_state(session_id, {"countdown": i, "status": "countdown"})
            await asyncio.sleep(1)
        
        # Start game
        # Re-fetch activity to be safe? Or just update memory state if we trust it won't conflict.
        # Ideally we fetch fresh.
        try:
            activity = await self.service._require_activity(activity_id)
            meta = activity.meta.get("tictactoe", {})
            meta["status"] = "playing"
            meta["countdown"] = None
            activity.meta["tictactoe"] = meta
            await self.service._persist(activity)
            await self._broadcast_state(session_id, activity)
        except Exception:
            logger.exception(f"Failed to start tictactoe after countdown: {activity_id}")

    async def _handle_move(self, session_id: str, activity: models.Activity, user_id: str, index: int):
        meta = activity.meta.get("tictactoe", {})
        if meta.get("status") != "playing":
            return
            
        players = meta.get("players", {})
        turn = meta.get("turn", "X")
        board = meta.get("board", [None]*9)
        
        # Validate turn
        expected_user = players.get(turn)
        if user_id != expected_user:
            return
            
        # Validate move
        if index < 0 or index >= 9 or board[index] is not None:
            return
            
        # Execute move
        board[index] = turn
        meta["board"] = board
        
        # Check win
        round_winner_role = self._check_win(board)
        is_draw = all(c is not None for c in board) and not round_winner_role
        
        if round_winner_role or is_draw:
            await self._handle_round_end(session_id, activity, meta, round_winner_role)
        else:
            # Switch turn
            meta["turn"] = "O" if turn == "X" else "X"
            activity.meta["tictactoe"] = meta
            await self.service._persist(activity)
            await self._broadcast_state(session_id, activity)

    async def _handle_round_end(self, session_id: str, activity: models.Activity, meta: dict, winner_role: str | None):
        players = meta.get("players", {})
        round_wins = meta.get("roundWins") or {}
        # Ensure keys exist
        for pid in players.values():
             if pid and pid not in round_wins: round_wins[pid] = 0

        winner_id = players.get(winner_role) if winner_role else None
        
        if winner_id:
            round_wins[winner_id] = round_wins.get(winner_id, 0) + 1
            meta["lastRoundWinner"] = winner_id
            meta["winner"] = winner_role
        else:
            meta["lastRoundWinner"] = None
            meta["winner"] = "draw"
            
        meta["roundWins"] = round_wins
        meta["roundIndex"] = meta.get("roundIndex", 0) + 1
        
        # Check match win (First to 3)
        match_winner_id = None
        for pid, wins in round_wins.items():
            if wins >= 3:
                match_winner_id = pid
                break
        
        if match_winner_id:
            activity.state = "completed"
            meta["status"] = "finished"
            meta["matchWinner"] = match_winner_id
            
            # Create ScoreBoard for recording
            scoreboard = models.ScoreBoard(activity.id)
            scoreboard.totals = {uid: float(w) for uid, w in round_wins.items()} # Total wins as score
            
            # Populate participants
            for uid in players.values():
                if uid: scoreboard.upsert_participant(uid)
                
            utils = self.service
            await utils._populate_scoreboard_participants(activity, scoreboard)
            service._store_scoreboard(activity, scoreboard)
            
            await utils._persist(activity)
            # Record outcome (including XP awarded by service)
            await utils._record_leaderboard_outcome(activity, scoreboard)

            # Log activity completion for feed
            try:
                # Log for the winner if exists, otherwise first participant
                actor_id = match_winner_id or activity.user_a
                await audit.log_event(
                    "activity_completed",
                    user_id=actor_id,
                    meta={
                        "activity_id": activity.id,
                        "kind": activity.kind,
                        "match_winner_id": match_winner_id
                    }
                )
            except Exception:
                logger.exception("Failed to log activity_completed for TicTacToe")
        else:
            # Next round
            # We can have a small delay before next round starts, or just reset immediately?
            # Let's clean board but keep score
            meta["board"] = [None] * 9
            meta["turn"] = "X" # X starts? or loser starts? Let's just alternate or keep X starts. Simplest X starts. 
            # Or better: alternate starting player based on round index? 
            # meta["turn"] = "X" if meta["roundIndex"] % 2 == 0 else "O"
            meta["turn"] = "X" if (meta.get("roundIndex", 0) % 2 == 0) else "O"
            
            meta["winner"] = None
            # We might want a "round_over" state to show results briefly?
            # For simplicity, we just clear and continue, but frontend might flash results.
            # Frontend has `hasRoundResult` logic to show overlay if status is lobby? No.
            # Let's set a timer to clear the result?
            # Or reliance on frontend animation.
            
        activity.meta["tictactoe"] = meta
        await self.service._persist(activity)
        await self._broadcast_state(session_id, activity)

    def _check_win(self, board):
        for combo in WIN_COMBOS:
            a, b, c = combo
            if board[a] and board[a] == board[b] and board[a] == board[c]:
                return board[a]
        return None

    async def _handle_restart(self, session_id: str, activity: models.Activity, user_id: str):
        # Allow restart if finished
        if activity.state == "completed" or activity.state == "cancelled":
            activity.state = "lobby" # Go back to lobby
            meta = activity.meta.get("tictactoe", {})
            meta["status"] = "lobby"
            meta["matchWinner"] = None
            meta["roundWins"] = {uid: 0 for uid in meta.get("players", {}).values()}
            meta["roundIndex"] = 0
            meta["ready"] = {} # Unready everyone
            meta["board"] = [None]*9
            activity.meta["tictactoe"] = meta
            await self.service._persist(activity)
            await self._broadcast_state(session_id, activity)

    async def _handle_leave(self, session_id: str, activity: models.Activity, user_id: str):
        # If active, forfeit?
        if activity.state == "active":
            activity.state = "completed"
            meta = activity.meta.get("tictactoe", {})
            meta["status"] = "finished"
            meta["leaveReason"] = "opponent_left"
            
            players = meta.get("players", {})
            winner_id = players.get("X") if players.get("O") == user_id else players.get("O")
            if winner_id:
                meta["matchWinner"] = winner_id
                # Record win for remaining player?
                # ...
                
            activity.meta["tictactoe"] = meta
            await self.service._persist(activity)
            await self._broadcast_state(session_id, activity)
        # Handle lobby leave...

    async def _broadcast_state(self, session_id: str, activity: models.Activity):
        meta = activity.meta.get("tictactoe", {})
        payload = {
            "board": meta.get("board", [None]*9),
            "turn": meta.get("turn", "X"),
            "winner": meta.get("winner"),
            "players": meta.get("players", {}),
            "status": meta.get("status", "lobby"),
            "ready": meta.get("ready", {}),
            "scores": meta.get("scores", {}), # not really used, roundWins used
            "roundWins": meta.get("roundWins", {}),
            "countdown": meta.get("countdown"),
            "roundIndex": meta.get("roundIndex", 0),
            "lastRoundWinner": meta.get("lastRoundWinner"),
            "matchWinner": meta.get("matchWinner"),
            "leaveReason": meta.get("leaveReason"),
            "connected": True
        }
        await sockets.emit_activity_state(session_id, payload)

manager = TicTacToeManager()
