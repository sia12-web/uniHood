import React, { useEffect, useRef } from "react";
import { Point } from "./types";
import { getCoverTransform } from "./utils";

interface ImageCanvasProps {
    image: HTMLImageElement;
    zoom: number;
    offset: Point;
    aspectRatio: number; // width / height
    onPanStart: (startPoint: Point) => void;
    onPanMove: (delta: Point) => void;
    onPanEnd: () => void;
    className?: string;
}

export default function ImageCanvas({
    image,
    zoom,
    offset,
    aspectRatio,
    onPanStart,
    onPanMove,
    onPanEnd,
    className,
}: ImageCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const lastPoint = useRef<Point>({ x: 0, y: 0 });

    // Draw the image onto the canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !image) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Set canvas size to match container (responsive)
        // We use the container's width and calculate height based on aspect ratio
        const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();

        // We want the canvas to fill the container but maintain the aspect ratio
        // Actually, the container should probably enforce the aspect ratio, and the canvas just fills it.
        // Let's assume the container is sized correctly by the parent or CSS.

        // For high DPI displays
        const dpr = window.devicePixelRatio || 1;
        canvas.width = containerWidth * dpr;
        canvas.height = containerHeight * dpr;

        ctx.scale(dpr, dpr);

        // Clear canvas
        ctx.clearRect(0, 0, containerWidth, containerHeight);

        // Calculate transform
        // We need to pass the "CSS" size of the canvas/frame, not the physical pixel size
        const { scale, x, y } = getCoverTransform(
            { width: image.naturalWidth, height: image.naturalHeight },
            { width: containerWidth, height: containerHeight },
            zoom,
            offset
        );

        // Draw image
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.drawImage(image, 0, 0);
        ctx.restore();

    }, [image, zoom, offset, aspectRatio]); // Re-draw when these change

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        isDragging.current = true;
        lastPoint.current = { x: e.clientX, y: e.clientY };
        onPanStart({ x: e.clientX, y: e.clientY });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        e.preventDefault();

        const deltaX = e.clientX - lastPoint.current.x;
        const deltaY = e.clientY - lastPoint.current.y;

        lastPoint.current = { x: e.clientX, y: e.clientY };
        onPanMove({ x: deltaX, y: deltaY });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        onPanEnd();
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    return (
        <div
            ref={containerRef}
            className={`relative overflow-hidden bg-slate-100 ${className}`}
            style={{ touchAction: "none" }} // Prevent scrolling while dragging
        >
            <canvas
                ref={canvasRef}
                className="block h-full w-full cursor-move"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            />

            {/* Grid Overlay (Rule of Thirds) */}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-50">
                <div className="border-b border-r border-white/30" />
                <div className="border-b border-r border-white/30" />
                <div className="border-b border-white/30" />
                <div className="border-b border-r border-white/30" />
                <div className="border-b border-r border-white/30" />
                <div className="border-b border-white/30" />
                <div className="border-r border-white/30" />
                <div className="border-r border-white/30" />
                <div />
            </div>
        </div>
    );
}
