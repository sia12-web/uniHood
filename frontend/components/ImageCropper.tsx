"use client";

import { useState, useRef, useEffect } from "react";
import { motion, useMotionValue } from "framer-motion";
import { X, Check, ZoomIn, ZoomOut } from "lucide-react";
// cn removed if unused

type ImageCropperProps = {
    file: File;
    onCrop: (blob: Blob) => void;
    onCancel: () => void;
    aspectRatio?: number; // width / height, default 3/4
};

export default function ImageCropper({ file, onCrop, onCancel, aspectRatio = 3 / 4 }: ImageCropperProps) {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    // containerRef removed
    const constraintsRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    // Framer motion values for position
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const CROP_WIDTH = 300;
    const CROP_HEIGHT = CROP_WIDTH / aspectRatio;

    useEffect(() => {
        const reader = new FileReader();
        reader.onload = () => setImageSrc(reader.result as string);
        reader.readAsDataURL(file);
    }, [file]);

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const { naturalWidth, naturalHeight } = e.currentTarget;
        // Determine initial fill scale
        const scaleToCheck = Math.max(CROP_WIDTH / naturalWidth, CROP_HEIGHT / naturalHeight);
        // Set internal logic size, but we render with style scale so keep actual dims or scaled dims?
        // Easiest is to fit image into a reasonable working area but keep track of scale.
        setImageSize({ width: naturalWidth, height: naturalHeight });
        // Initial zoom to cover
        setZoom(scaleToCheck);
    };

    const handleSave = async () => {
        if (!imageRef.current || !imageSrc) return;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // We want high res output, so maybe 2x crop size or just crop size?
        // Let's do 2x for better quality
        const OUTPUT_SCALE = 2;
        canvas.width = CROP_WIDTH * OUTPUT_SCALE;
        canvas.height = CROP_HEIGHT * OUTPUT_SCALE;

        // Draw image transformed
        // Current visual state:
        // Container center is crop center.
        // Image is translated by x, y (from center) and scaled by zoom.

        // We need to map the visual coordinates to canvas coordinates.
        // visual_offset_x = x.get()
        // visual_offset_y = y.get()
        // visual_scale = zoom

        // The image center is at (visual_offset_x, visual_offset_y) relative to crop center.

        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Translate to center of canvas
        ctx.translate(canvas.width / 2, canvas.height / 2);

        // Apply visual transforms (scaled for output)
        ctx.translate(x.get() * OUTPUT_SCALE, y.get() * OUTPUT_SCALE);
        ctx.scale(zoom * OUTPUT_SCALE, zoom * OUTPUT_SCALE);

        // Draw image centered
        ctx.drawImage(
            imageRef.current,
            -imageSize.width / 2,
            -imageSize.height / 2,
            imageSize.width,
            imageSize.height
        );

        canvas.toBlob((blob) => {
            if (blob) onCrop(blob);
        }, "image/jpeg", 0.9);
    };

    if (!imageSrc) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <header className="px-4 py-3 border-b flex items-center justify-between bg-white z-10">
                    <h3 className="font-semibold text-slate-900">Crop Photo</h3>
                    <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded-full">
                        <X size={20} className="text-slate-500" />
                    </button>
                </header>

                <div className="relative flex-1 bg-slate-100 overflow-hidden flex items-center justify-center py-8 min-h-[400px]">
                    {/* The Crop Window / Viewport */}
                    <div
                        ref={constraintsRef}
                        className="relative overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] rounded-lg pointer-events-none z-20"
                        style={{ width: CROP_WIDTH, height: CROP_HEIGHT }}
                    />

                    {/* Interactive Layer - needs to be behind the shadow but handle events */}
                    {/* Actually, drag constraints for framer-motion are tricky with zoom. 
                         Usually easiest to leave unmatched constraints or implement custom bounds logic.
                         For simplicity in this task, we'll allow free drag but maybe snap back?
                         Framer motion 'dragConstraints' usually apply to the bounding box.
                     */}

                    <div className="absolute inset-0 flex items-center justify-center z-10 w-full h-full">
                        <motion.img
                            ref={imageRef}
                            src={imageSrc}
                            alt="Crop target"
                            onLoad={handleImageLoad}
                            drag
                            dragElastic={0.1}
                            dragMomentum={false}
                            style={{
                                x,
                                y,
                                scale: zoom,
                                touchAction: "none",
                                cursor: "grab"
                            }}
                            whileTap={{ cursor: "grabbing" }}
                            className="max-w-none"
                        />
                    </div>

                    {/* Grid overlay inside the crop area (optional visual aid) */}
                    <div
                        className="absolute pointer-events-none z-30 border border-white/30"
                        style={{ width: CROP_WIDTH, height: CROP_HEIGHT }}
                    >
                        <div className="absolute top-1/3 w-full h-px bg-white/30" />
                        <div className="absolute top-2/3 w-full h-px bg-white/30" />
                        <div className="absolute left-1/3 h-full w-px bg-white/30" />
                        <div className="absolute left-2/3 h-full w-px bg-white/30" />
                    </div>
                </div>

                <div className="p-4 bg-white border-t space-y-4 z-10">
                    <div className="flex items-center gap-4">
                        <ZoomOut size={16} className="text-slate-400" />
                        <input
                            type="range"
                            min={0.1} // Allow some negative zoom relative to fit if needed, but usually min is fit
                            max={3}
                            step={0.01}
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="flex-1 accent-indigo-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <ZoomIn size={16} className="text-slate-400" />
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 shadow-md shadow-indigo-200 transition flex items-center justify-center gap-2"
                        >
                            <Check size={16} /> Save Photo
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
