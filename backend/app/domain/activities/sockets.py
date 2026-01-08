"""Socket.IO namespace for mini-activities."""

from __future__ import annotations

from typing import Dict, Optional

import socketio

from app.infra.auth import AuthenticatedUser
from app.obs import metrics as obs_metrics

_namespace: "ActivitiesNamespace" | None = None


def _header(scope: dict, name: str) -> Optional[str]:
	target = name.encode().lower()
	for key, value in scope.get("headers", []):
		if key.lower() == target:
			return value.decode()
	return None


class ActivitiesNamespace(socketio.AsyncNamespace):
	def __init__(self) -> None:
		super().__init__("/activities")
		self._sessions: Dict[str, AuthenticatedUser] = {}

	async def on_connect(self, sid: str, environ: dict) -> None:
		obs_metrics.socket_connected(self.namespace)
		scope = environ.get("asgi.scope", environ)
		auth_payload = environ.get("auth") or scope.get("auth") or {}
		user_id = auth_payload.get("userId") or _header(scope, "x-user-id")
		campus_id = auth_payload.get("campusId") or _header(scope, "x-campus-id") or ""
		if not user_id:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("missing user id")
		user = AuthenticatedUser(id=user_id, campus_id=campus_id)
		self._sessions[sid] = user
		await self.enter_room(sid, self.user_room(user_id))
		await self.emit("activities:ack", {"ok": True}, room=sid)

	async def on_disconnect(self, sid: str) -> None:
		obs_metrics.socket_disconnected(self.namespace)
		user = self._sessions.pop(sid, None)
		if user:
			await self.leave_room(sid, self.user_room(user.id))

	async def on_hb(self, sid: str) -> None:
		"""Handle application-level heartbeat from client."""
		pass

	async def on_activity_join(self, sid: str, payload: dict) -> None:
		obs_metrics.socket_event(self.namespace, "activity_join")
		user = self._sessions.get(sid)
		if not user:
			raise ConnectionRefusedError("unauthenticated")
		activity_id = str(payload.get("activity_id"))
		if not activity_id:
			return
		await self.enter_room(sid, self.activity_room(activity_id))
		
		# Trigger join logic to send initial state
		# Dynamic dispatch based on activity kind
		from app.domain.activities.service import ActivitiesService
		service = ActivitiesService()
		activity = await service._repo.get_activity(activity_id)
		
		if not activity:
			return

		if activity.kind == "tictactoe":
			from app.domain.activities.tictactoe import manager as ttt_manager
			await ttt_manager.handle_socketio_action(activity_id, user.id, "join", {})
		elif activity.kind == "story_builder":
			from app.domain.activities.story_builder import manager as story_builder_manager
			await story_builder_manager.handle_socketio_action(activity_id, user.id, "join", {})

	async def on_activity_leave(self, sid: str, payload: dict) -> None:
		obs_metrics.socket_event(self.namespace, "activity_leave")
		user = self._sessions.get(sid)
		if not user:
			raise ConnectionRefusedError("unauthenticated")
		activity_id = str(payload.get("activity_id"))
		if not activity_id:
			return
		await self.leave_room(sid, self.activity_room(activity_id))

	async def on_activity_action(self, sid: str, payload: dict) -> None:
		obs_metrics.socket_event(self.namespace, "activity_action")
		user = self._sessions.get(sid)
		if not user:
			raise ConnectionRefusedError("unauthenticated")
		
		activity_id = str(payload.get("activity_id"))
		action_type = payload.get("type")
		action_payload = payload.get("payload", {})
		
		if not activity_id or not action_type:
			return

		# Dynamic dispatch based on activity kind
		from app.domain.activities.service import ActivitiesService
		service = ActivitiesService()
		activity = await service._repo.get_activity(activity_id)
		
		if not activity:
			return

		if activity.kind == "tictactoe":
			from app.domain.activities.tictactoe import manager as ttt_manager
			await ttt_manager.handle_socketio_action(activity_id, user.id, action_type, action_payload)
		elif activity.kind == "story_builder":
			from app.domain.activities.story_builder import manager as story_builder_manager
			await story_builder_manager.handle_socketio_action(activity_id, user.id, action_type, action_payload)

	@staticmethod
	def user_room(user_id: str) -> str:
		return f"user:{user_id}"

	@staticmethod
	def activity_room(activity_id: str) -> str:
		return f"activity:{activity_id}"


def set_namespace(namespace: ActivitiesNamespace) -> None:
	global _namespace
	_namespace = namespace


async def emit_activity_created(user_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "activity:created")
	await _namespace.emit("activity:created", payload, room=ActivitiesNamespace.user_room(user_id))


async def emit_activity_state(activity_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "activity:state")
	await _namespace.emit("activity:state", payload, room=ActivitiesNamespace.activity_room(activity_id))


async def emit_round_open(activity_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "round:open")
	await _namespace.emit("round:open", payload, room=ActivitiesNamespace.activity_room(activity_id))


async def emit_round_close(activity_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "round:close")
	await _namespace.emit("round:close", payload, room=ActivitiesNamespace.activity_room(activity_id))


async def emit_score_update(activity_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "score:update")
	await _namespace.emit("score:update", payload, room=ActivitiesNamespace.activity_room(activity_id))


async def emit_story_append(activity_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "story:append")
	await _namespace.emit("story:append", payload, room=ActivitiesNamespace.activity_room(activity_id))


async def emit_trivia_question(activity_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "trivia:question")
	await _namespace.emit("trivia:question", payload, room=ActivitiesNamespace.activity_room(activity_id))


async def emit_rps_phase(activity_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "rps:phase")
	await _namespace.emit("rps:phase", payload, room=ActivitiesNamespace.activity_room(activity_id))


async def emit_activity_ended(activity_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "activity:ended")
	await _namespace.emit("activity:ended", payload, room=ActivitiesNamespace.activity_room(activity_id))
