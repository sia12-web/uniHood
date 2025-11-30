import React, { useState, useRef, useEffect, useCallback } from "react";
import { Upload, X, Check } from "lucide-react";
import { PhotoAdjusterProps, CropState, Point, AspectRatio } from "./types";
import { constrainOffset, getCroppedImage, readFileAsDataURL } from "./utils";
import ImageCanvas from "./ImageCanvas";
import Controls from "./Controls";

export default function PhotoAdjuster({
    onConfirm,
    onCancel,
    aspectRatio: initialAspectRatio = "square",
    maxOutputSize = 1080,
    outputType = "image/jpeg",
    quality = 0.92,
    className = "",
}: PhotoAdjusterProps) {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [crop, setCrop] = useState<CropState>({ zoom: 1, offset: { x: 0, y: 0 } });
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialAspectRatio);
    const [isProcessing, setIsProcessing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Load image from source
    useEffect(() => {
        if (!imageSrc) {
            setImage(null);
            return;
        }

        const img = new Image();
        img.src = imageSrc;
        img.onload = () => {
            setImage(img);
            // Reset crop when new image loads
            setCrop({ zoom: 1, offset: { x: 0, y: 0 } });
        };
    }, [imageSrc]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const url = await readFileAsDataURL(file);
                setImageSrc(url);
            } catch (error) {
                console.error("Failed to read file", error);
            }
        }
    };

    const handlePanMove = useCallback(
        (delta: Point) => {
            if (!image || !containerRef.current) return;

            // We need to know the frame size to constrain the offset
            // For now, we'll just update the offset and let the canvas/utils handle the visual constraint
            // But to prevent dragging too far, we should constrain it here.

            // Ideally, we'd get the frame size from the container ref
            const frameRect = containerRef.current.querySelector("canvas")?.getBoundingClientRect();
            if (!frameRect) return;

            setCrop((prev) => {
                const newOffset = {
                    x: prev.offset.x + delta.x,
                    y: prev.offset.y + delta.y,
                };

                // Constrain
                return {
                    ...prev,
                    offset: constrainOffset(
                        { width: image.naturalWidth, height: image.naturalHeight },
                        { width: frameRect.width, height: frameRect.height },
                        prev.zoom,
                        newOffset
                    )
                };
            });
        },
        [image]
    );

    const handleConfirm = async () => {
        if (!image) return;
        setIsProcessing(true);
        try {
            const blob = await getCroppedImage(
                image,
                crop,
                aspectRatio === "square" ? 1 : 0.8, // 4:5 = 0.8
                maxOutputSize,
                outputType,
                quality
            );
            onConfirm(blob);
        } catch (error) {
            console.error("Failed to crop image", error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReset = () => {
        setCrop({ zoom: 1, offset: { x: 0, y: 0 } });
    };

    if (!imageSrc) {
        return (
            <div className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-12 text-center transition-colors hover:bg-slate-100 ${className}`}>
                <div className="mb-4 rounded-full bg-slate-200 p-4">
                    <Upload className="h-8 w-8 text-slate-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Upload a photo</h3>
                <p className="mt-1 text-sm text-slate-500">JPG or PNG. High quality works best.</p>
                <label className="mt-6 cursor-pointer rounded-xl bg-[#d64045] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#c7343a]">
                    Choose File
                    <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </label>
            </div>
        );
    }

    return (
        <div className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`} ref={containerRef}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="font-semibold text-slate-900">Adjust Photo</h3>
                <button
                    onClick={() => {
                        setImageSrc(null);
                        onCancel();
                    }}
                    className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Canvas Area */}
            <div
                className="relative w-full bg-slate-100"
                style={{
                    aspectRatio: aspectRatio === "square" ? "1 / 1" : "4 / 5",
                    maxHeight: "500px" // Prevent it from getting too tall
                }}
            >
                {image && (
                    <ImageCanvas
                        image={image}
                        zoom={crop.zoom}
                        offset={crop.offset}
                        aspectRatio={aspectRatio === "square" ? 1 : 0.8}
                        onPanStart={() => { }}
                        onPanMove={handlePanMove}
                        onPanEnd={() => { }}
                        className="h-full w-full"
                    />
                )}
            </div>

            {/* Controls */}
            <Controls
                zoom={crop.zoom}
                onZoomChange={(z) => setCrop((prev) => ({ ...prev, zoom: z }))}
                aspectRatio={aspectRatio}
                onAspectRatioChange={setAspectRatio}
                onReset={handleReset}
            />

            {/* Footer Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
                <button
                    onClick={() => setImageSrc(null)}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                    Change Photo
                </button>
                <button
                    onClick={handleConfirm}
                    disabled={isProcessing}
                    className="flex items-center gap-2 rounded-xl bg-[#d64045] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#c7343a] disabled:opacity-70"
                >
                    {isProcessing ? (
                        "Processing..."
                    ) : (
                        <>
                            <Check className="h-4 w-4" />
                            Save Photo
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
