"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export type AnimeState = "idle" | "countdown" | "rock" | "paper" | "scissors" | "win" | "lose";

interface AnimeCharacterProps {
    state: AnimeState;
    isOpponent?: boolean;
    className?: string;
}

const ASSETS = {
    idle: "/activities/rps/idle.png",
    countdown: "/activities/rps/countdown.png",
    rock: "/activities/rps/rock.png",
    paper: "/activities/rps/paper.png",
    scissors: "/activities/rps/scissors.png",
    win: "/activities/rps/win.png",
    lose: "/activities/rps/lose.png",
};

export const AnimeCharacter: React.FC<AnimeCharacterProps> = ({ state, isOpponent = false, className = "" }) => {
    const src = ASSETS[state] || ASSETS.idle;

    // Animation variants
    const variants = {
        idle: {
            y: [0, -5, 0],
            scale: 1,
            transition: {
                y: {
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                },
            },
        },
        countdown: {
            x: [-1, 1, -1],
            scale: 1,
            transition: {
                x: {
                    duration: 0.1,
                    repeat: Infinity,
                },
            },
        },
        action: {
            x: isOpponent ? [50, 0] : [-50, 0],
            scale: [0.8, 1.2, 1],
            transition: {
                type: "spring",
                stiffness: 300,
                damping: 15,
            },
        },
        win: {
            y: [0, -20, 0],
            scale: [1, 1.1, 1],
            transition: {
                duration: 0.5,
                repeat: Infinity,
                repeatType: "reverse" as const,
            },
        },
        lose: {
            y: 0,
            scale: 0.95,
            rotate: isOpponent ? -5 : 5,
            opacity: 0.8,
            transition: { duration: 0.5 },
        },
    };

    // Determine which variant to use
    let currentVariant = "idle";
    if (state === "countdown") currentVariant = "countdown";
    else if (["rock", "paper", "scissors"].includes(state)) currentVariant = "action";
    else if (state === "win") currentVariant = "win";
    else if (state === "lose") currentVariant = "lose";

    return (
        <div className={`relative h-64 w-64 ${className}`}>
            <AnimatePresence mode="wait">
                <motion.div
                    key={state}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                        opacity: 1,
                        scale: 1,
                        scaleX: isOpponent ? -1 : 1, // Mirror opponent
                        ...variants[currentVariant as keyof typeof variants],
                    }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className="relative h-full w-full"
                >
                    {/* Using next/image for optimization, but standard img works nicely with motion too.
              We'll use standard img inside motion.div for simpler framer integration,
              or wrap next/image. Let's use a standard img tag for motion compatibility
              without complex wrappers, as these are game sprites. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={src}
                        alt={`Character ${state}`}
                        className="h-full w-full object-contain"
                        draggable={false}
                    />
                </motion.div>
            </AnimatePresence>

            {/* Shadow Effect */}
            <div className="absolute bottom-0 left-1/2 -z-10 h-4 w-32 -translate-x-1/2 rounded-[100%] bg-black/20 blur-sm" />
        </div>
    );
};
