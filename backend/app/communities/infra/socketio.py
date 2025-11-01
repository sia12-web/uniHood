"""Factory helpers for communities Socket.IO namespaces."""

from __future__ import annotations

import socketio

from app.communities.sockets.namespaces.events import EventNamespace
from app.communities.sockets.namespaces.groups import GroupNamespace
from app.communities.sockets.namespaces.posts import PostNamespace
from app.communities.sockets.namespaces.user import UserNamespace
from app.communities.sockets import server as communities_server


def register(server: socketio.AsyncServer) -> None:
	"""Register communities namespaces on the global Socket.IO server."""
	group_ns = GroupNamespace()
	post_ns = PostNamespace()
	event_ns = EventNamespace()
	user_ns = UserNamespace()
	server.register_namespace(group_ns)
	server.register_namespace(post_ns)
	server.register_namespace(event_ns)
	server.register_namespace(user_ns)
	communities_server.set_namespaces(
		groups=group_ns,
		posts=post_ns,
		events=event_ns,
		user=user_ns,
	)
