"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ userId, children }: { userId: string; children: ReactNode }) {
	const [socket, setSocket] = useState<Socket | null>(null);

	useEffect(() => {
		if (!userId) {
			return;
		}
		let active = true;
		const socketInstance = io("/communities", {
			withCredentials: true,
			transports: ["websocket"],
			autoConnect: false,
		});
		socketInstance.connect();
		socketInstance.on("connect", () => {
			if (active) {
				socketInstance.emit("user:join", { userId });
			}
		});
		setSocket(socketInstance);
		return () => {
			active = false;
			socketInstance.disconnect();
		};
	}, [userId]);

	const contextValue = useMemo(() => socket, [socket]);

	return <SocketContext.Provider value={contextValue}>{children}</SocketContext.Provider>;
}

export function useCommunitiesSocket(): Socket | null {
	return useContext(SocketContext);
}
