import { io, type Socket } from "socket.io-client";

import { getBackendUrl } from "@/lib/env";

let staffSocket: Socket | null = null;

export function getStaffSocket(): Socket {
	if (staffSocket && staffSocket.connected) {
		return staffSocket;
	}
	staffSocket = io(`${getBackendUrl()}/staff`, {
		withCredentials: true,
		transports: ["websocket"],
	});
	return staffSocket;
}

export function disconnectStaffSocket(): void {
	if (staffSocket) {
		staffSocket.disconnect();
		staffSocket = null;
	}
}
