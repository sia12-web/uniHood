import { io, type Socket } from "socket.io-client";

import {
	connectPresenceSocket,
	disconnectPresenceSocket as teardownPresenceSocket,
	getPresenceSocketInstance,
	onPresenceSocketStatus,
	getPresenceSocketStatus,
	initialiseNearbyAccumulator,
	applyNearbyEvent,
	nearbyAccumulatorToArray,
} from "@/app/lib/socket/presence";
import { getBackendUrl } from "./env";

const ENDPOINT = getBackendUrl();
let socialSocket: Socket | null = null;
let socialIdentity: { userId: string; campusId: string | null } | null = null;

export function getPresenceSocket(userId: string, campusId: string): Socket {
	const instance = connectPresenceSocket({ userId, campusId }) ?? getPresenceSocketInstance();
	if (!instance) {
		throw new Error("Presence socket unavailable");
	}
	return instance;
}

export function disconnectPresenceSocket(): void {
	teardownPresenceSocket();
}

export { onPresenceSocketStatus, getPresenceSocketStatus };
export { initialiseNearbyAccumulator, applyNearbyEvent, nearbyAccumulatorToArray };

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

let xpSocket: Socket | null = null;
let xpIdentity: { userId: string; campusId: string | null } | null = null;

export function getXPSocket(userId: string, campusId: string | null): Socket {
	const identityChanged =
		xpIdentity?.userId !== userId || xpIdentity?.campusId !== campusId;
	if (xpSocket && xpSocket.connected && !identityChanged) {
		return xpSocket;
	}
	if (xpSocket) {
		xpSocket.disconnect();
		xpSocket = null;
	}
	xpSocket = io(`${ENDPOINT}/xp`, {
		autoConnect: true,
		transports: ["websocket"],
		auth: {
			userId,
			campusId,
		},
	});
	xpIdentity = { userId, campusId };
	return xpSocket;
}

export function disconnectXPSocket(): void {
	if (xpSocket) {
		xpSocket.disconnect();
		xpSocket = null;
	}
	xpIdentity = null;
}
