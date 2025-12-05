import asyncio
import json
import logging
import time
from typing import Dict, List, Optional, Set

from fastapi import WebSocket

from app.domain.activities import models, service
from app.infra.auth import AuthenticatedUser

logger = logging.getLogger(__name__)

class StoryBuilderManager:
    def __init__(self):
        self.service = service.ActivitiesService()

    async def handle_socketio_action(self, session_id: str, user_id: str, action_type: str, payload: dict):
        # Ensure payload has userId for compatibility with existing logic methods
        payload["userId"] = user_id
        
        try:
            activity = await self.service._require_activity(session_id)
        except Exception:
            return

        if action_type == "join":
            await self._handle_join(session_id, activity, payload)
        elif action_type == "ready":
            await self._handle_ready(session_id, activity, payload)
        elif action_type == "submit_paragraph":
            await self._handle_submit_paragraph(session_id, activity, payload)
        elif action_type == "vote_paragraph":
            await self._handle_vote_paragraph(session_id, activity, payload)

    async def _handle_join(self, session_id: str, activity: models.Activity, payload: dict):
        user_id = payload.get("userId")
        if not user_id:
            return

        # Update participants list if needed (though activity.user_a/b are fixed)
        # Story Builder might support more than 2 users in future, but for now it's 2.
        
        await self._broadcast_state(session_id, activity)

    async def _handle_ready(self, session_id: str, activity: models.Activity, payload: dict):
        user_id = payload.get("userId")
        if not user_id:
            return
            
        story_meta = activity.meta.get("story", {})
        ready_map = story_meta.get("ready", {})
        ready_map[user_id] = True
        story_meta["ready"] = ready_map
        activity.meta["story"] = story_meta
        
        # Check if all participants are ready
        participants = [activity.user_a, activity.user_b]
        if all(ready_map.get(uid) for uid in participants):
            activity.state = "active" # or 'writing'
            # Initialize writing phase if not already
            if "paragraphs" not in story_meta:
                story_meta["paragraphs"] = []
                story_meta["turnIndex"] = 0
                story_meta["currentTurnUserId"] = activity.user_a # Start with user_a
        
        await self.service._persist(activity)
        await self._broadcast_state(session_id, activity)

    async def _handle_submit_paragraph(self, session_id: str, activity: models.Activity, payload: dict):
        user_id = payload.get("userId")
        text = payload.get("text")
        if not user_id or not text:
            return

        story_meta = activity.meta.get("story", {})
        current_turn_user = story_meta.get("currentTurnUserId")
        
        if user_id != current_turn_user:
            return # Not your turn

        paragraphs = story_meta.get("paragraphs", [])
        paragraphs.append({
            "userId": user_id,
            "text": text,
            "votes": {}
        })
        story_meta["paragraphs"] = paragraphs
        
        # Advance turn
        participants = [activity.user_a, activity.user_b]
        current_idx = participants.index(user_id)
        next_idx = (current_idx + 1) % len(participants)
        story_meta["currentTurnUserId"] = participants[next_idx]
        story_meta["turnIndex"] = story_meta.get("turnIndex", 0) + 1
        
        # Check if max turns reached
        max_turns = story_meta.get("turns", 6)
        if len(paragraphs) >= max_turns:
            activity.state = "voting" # Move to voting phase
            story_meta["phase"] = "voting"
        
        activity.meta["story"] = story_meta
        await self.service._persist(activity)
        await self._broadcast_state(session_id, activity)

    async def _handle_vote_paragraph(self, session_id: str, activity: models.Activity, payload: dict):
        user_id = payload.get("userId")
        paragraph_index = payload.get("paragraphIndex")
        score = payload.get("score")
        
        if user_id is None or paragraph_index is None or score is None:
            return

        story_meta = activity.meta.get("story", {})
        paragraphs = story_meta.get("paragraphs", [])
        
        if 0 <= paragraph_index < len(paragraphs):
            paragraph = paragraphs[paragraph_index]
            # Prevent voting on own paragraph
            if paragraph["userId"] == user_id:
                return
                
            if "votes" not in paragraph:
                paragraph["votes"] = {}
            paragraph["votes"][user_id] = score
            paragraphs[paragraph_index] = paragraph
            story_meta["paragraphs"] = paragraphs
            
            # Check if voting is complete
            # Every paragraph (except own) should be voted on by every other participant
            all_voted = True
            participants = [activity.user_a, activity.user_b]
            for idx, p in enumerate(paragraphs):
                for participant in participants:
                    if participant != p["userId"]:
                        if participant not in p.get("votes", {}):
                            all_voted = False
                            break
                if not all_voted:
                    break
            
            if all_voted:
                activity.state = "completed" # or 'ended'
                story_meta["phase"] = "ended"
                # Calculate winner
                scores = {uid: 0 for uid in participants}
                for p in paragraphs:
                    p_score = sum(p.get("votes", {}).values())
                    scores[p["userId"]] += p_score
                
                winner_id = max(scores, key=scores.get)
                story_meta["winnerUserId"] = winner_id
                story_meta["scores"] = scores

            activity.meta["story"] = story_meta
            await self.service._persist(activity)
            await self._broadcast_state(session_id, activity)

    async def _broadcast_state(self, session_id: str, activity: models.Activity):
        from app.domain.activities.sockets import emit_activity_state
        
        story_meta = activity.meta.get("story", {})
        
        # Map activity state to frontend state
        status = "pending"
        if activity.state == "active":
            status = "writing"
        elif activity.state == "voting":
            status = "voting"
        elif activity.state == "completed":
            status = "ended"
            
        # Frontend expects 'participants' array with ready/joined status
        participants = []
        ready_map = story_meta.get("ready", {})
        scores = story_meta.get("scores", {})
        
        for uid in [activity.user_a, activity.user_b]:
            participants.append({
                "userId": uid,
                "joined": True, # Assume joined if in activity
                "ready": ready_map.get(uid, False),
                "score": scores.get(uid, 0)
            })

        state_payload = {
            "id": activity.id,
            "activityKey": "story_builder",
            "status": status,
            "phase": story_meta.get("phase", "lobby"),
            "lobbyReady": all(p["ready"] for p in participants),
            "creatorUserId": activity.user_a, # Assumption
            "participants": participants,
            "createdAt": int(activity.created_at.timestamp() * 1000),
            "paragraphs": story_meta.get("paragraphs", []),
            "maxParagraphsPerUser": 3, # derived from turns / 2
            "currentTurnUserId": story_meta.get("currentTurnUserId"),
            "turnOrder": [activity.user_a, activity.user_b],
            "turnIndex": story_meta.get("turnIndex", 0),
            "winnerUserId": story_meta.get("winnerUserId"),
            "connected": True
        }
        
        await emit_activity_state(session_id, state_payload)

manager = StoryBuilderManager()
