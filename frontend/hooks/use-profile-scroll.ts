"use client";

import { useScroll, useTransform, useSpring, useMotionTemplate, MotionValue, Variants } from "framer-motion";
import { useRef } from "react";

export function useProfileScroll() {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollY } = useScroll({ container: containerRef });

    // 1. Extreme Parallax Header
    const headerY = useTransform(scrollY, [0, 500], [0, 250]);

    // 2. Dynamic Avatar Morph
    // Scales down, moves up slightly, and fades
    const avatarScale = useTransform(scrollY, [0, 150], [1, 0.6]);
    const avatarY = useTransform(scrollY, [0, 150], [0, -20]);
    const avatarOpacity = useTransform(scrollY, [100, 200], [1, 0]); // Fades out completely to hide under sticky nav potentially

    // 3. Name Scroll Effect (Sticky Title)
    // When user scrolls past avatar, name fades in sticky header (logic handled in active component, values provided here)
    const nameHeaderOpacity = useTransform(scrollY, [180, 220], [0, 1]);

    // 4. Content Reveal Stagger
    // We don't need transform here, standard variants handle staggering.

    // 5. Background Blur / Darkening
    const backdropBlur = useMotionTemplate`blur(${useTransform(scrollY, [0, 300], [0, 20])}px)`;
    const backdropBrightness = useMotionTemplate`brightness(${useTransform(scrollY, [0, 300], [1, 0.5])})`;

    // 6. Section Parallax (Foreground moves faster)
    // Can be used for "floating" cards
    const floatingCardY = useTransform(scrollY, [0, 1000], [0, -50]);

    return {
        containerRef,
        scrollY,
        headerY,
        avatarScale,
        avatarY,
        avatarOpacity,
        nameHeaderOpacity,
        backdropBlur,
        backdropBrightness,
        floatingCardY
    };
}

export const cardVariants: Variants = {
    hidden: {
        opacity: 0,
        y: 50,
        rotateX: -10, // Slight 3D tilt
        scale: 0.95
    },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        rotateX: 0,
        scale: 1,
        transition: {
            delay: i * 0.08,
            type: "spring",
            stiffness: 100,
            damping: 15,
            mass: 0.8
        },
    }),
    hover: {
        y: -5,
        boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
        transition: { type: "spring", stiffness: 300 }
    }
};

export const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.2
        }
    }
};
