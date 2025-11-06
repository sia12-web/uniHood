import { io, Socket } from "socket.io-client";

import { getBackendUrl } from "./env";

const ENDPOINT = getBackendUrl();

let presenceSocket: Socket | null = null;
let socialSocket: Socket | null = null;
let socialIdentity: { userId: string; campusId: string | null } | null = null;

export function getPresenceSocket(userId: string, campusId: string): Socket {
	if (presenceSocket && presenceSocket.connected) {
		return presenceSocket;
	}
	presenceSocket = io(`${ENDPOINT}/presence`, {
		autoConnect: true,
		// Allow fallback to HTTP long-polling if direct websocket is unavailable
		transports: ["websocket", "polling"],
		auth: {
			userId,
			campusId,
		},
	});
	return presenceSocket;
}

export function disconnectPresenceSocket(): void {
	if (presenceSocket) {
		presenceSocket.disconnect();
		presenceSocket = null;
	}
}

export function getSocialSocket(userId: string, campusId: string | null): Socket {
	const identityChanged =
		socialIdentity?.userId !== userId || socialIdentity?.campusId !== campusId;
	if (socialSocket && socialSocket.connected && !identityChanged) {
		return socialSocket;
	}
	if (socialSocket) {
		socialSocket.disconnect();
		socialSocket = null;
	}
	socialSocket = io(`${ENDPOINT}/social`, {
		autoConnect: true,
		transports: ["websocket"],
		auth: {
			userId,
			campusId,
		},
	});
	socialIdentity = { userId, campusId };
	return socialSocket;
}

export function disconnectSocialSocket(): void {
	if (socialSocket) {
		socialSocket.disconnect();
		socialSocket = null;
	}
	socialIdentity = null;
}
