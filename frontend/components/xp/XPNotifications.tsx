"use client";

import { useEffect, useRef, useState } from "react";
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
    const [currentReward, setCurrentReward] = useState<XPGainedPayload | null>(null);

    useEffect(() => {
        const authUser = readAuthUser();
        if (!authUser?.userId) return;

        console.log("Connecting to XP Socket...");
        const socket = getXPSocket(authUser.userId, authUser.campusId);
        socketRef.current = socket;

        const handleXPGained = (payload: XPGainedPayload) => {
            console.log("XP Gained:", payload);
            setCurrentReward(payload);
            // Optional: Keep the toast as well, or remove it if redundant. Keeping for now as a fallback log.
            // push({
            //     title: `+${payload.amount} XP`,
            //     description: `You earned XP for ${payload.action.replace(/_/g, " ").toLowerCase()}.`,
            //     variant: "default",
            //     duration: 3000,
            // });
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
        };
    }, [push, queryClient]);

    return (
        <>
            {currentReward && (
                <XPRewardModal
                    amount={currentReward.amount}
                    action={currentReward.action}
                    onClose={() => setCurrentReward(null)}
                />
            )}
        </>
    );
}

import { XPRewardModal } from "./XPRewardModal";
