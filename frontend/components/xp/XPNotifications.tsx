"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { readAuthUser } from "@/lib/auth-storage";
import { getXPSocket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";

interface XPGainedPayload {
    amount: number;
    action: string;
    total_xp: number;
    level: number;
}

interface LevelUpPayload {
    level: number;
}

export function XPNotifications() {
    const { push } = useToast();
    const queryClient = useQueryClient();
    const socketRef = useRef<unknown>(null);

    useEffect(() => {
        const authUser = readAuthUser();
        if (!authUser?.userId) return;

        console.log("Connecting to XP Socket...");
        const socket = getXPSocket(authUser.userId, authUser.campusId);
        socketRef.current = socket;

        const handleXPGained = (payload: XPGainedPayload) => {
            console.log("XP Gained:", payload);
            push({
                title: `+${payload.amount} XP`,
                description: `You earned XP for ${payload.action.replace(/_/g, " ").toLowerCase()}.`,
                variant: "default",
                duration: 3000,
            });
            // Refresh XP stats if any query exists
            queryClient.invalidateQueries({ queryKey: ["xp-stats"] });
        };

        const handleLevelUp = (payload: LevelUpPayload) => {
            console.log("Level Up:", payload);
            push({
                title: "🎉 Level Up!",
                description: `Congratulations! You reached Level ${payload.level}.`,
                variant: "default", // We could use a custom "success" or "celebratory" variant if available
                duration: 6000,
            });
            // Refresh XP stats to show new level
            queryClient.invalidateQueries({ queryKey: ["xp-stats"] });
        };

        socket.on("xp:gained", handleXPGained);
        socket.on("xp:levelup", handleLevelUp);

        return () => {
            socket.off("xp:gained", handleXPGained);
            socket.off("xp:levelup", handleLevelUp);
            // Optional: disconnect on unmount if we want strict resource management, 
            // but usually we keep it open if navigating around authenticated pages.
        };
    }, [push, queryClient]);

    return null;
}
