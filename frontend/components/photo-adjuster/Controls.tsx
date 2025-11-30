import React from "react";
import { ZoomIn, ZoomOut, RotateCcw, Crop } from "lucide-react";
import { AspectRatio } from "./types";

interface ControlsProps {
    zoom: number;
    onZoomChange: (zoom: number) => void;
    aspectRatio: AspectRatio;
    onAspectRatioChange: (ratio: AspectRatio) => void;
    onReset: () => void;
}

export default function Controls({
    zoom,
    onZoomChange,
    aspectRatio,
    onAspectRatioChange,
    onReset,
}: ControlsProps) {
    return (
        <div className="flex flex-col gap-4 p-4">
            {/* Zoom Slider */}
            <div className="flex items-center gap-3">
                <ZoomOut className="h-4 w-4 text-slate-500" />
                <input
                    type="range"
                    min={0.8}
                    max={3.0}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => onZoomChange(parseFloat(e.target.value))}
                    className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-[#d64045]"
                    aria-label="Zoom"
                />
                <ZoomIn className="h-4 w-4 text-slate-500" />
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                {/* Aspect Ratio Toggles */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onAspectRatioChange("square")}
                        className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${aspectRatio === "square"
                                ? "bg-[#d64045] text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                    >
                        <Crop className="h-3 w-3" />
                        1:1
                    </button>
                    <button
                        type="button"
                        onClick={() => onAspectRatioChange("portrait")}
                        className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${aspectRatio === "portrait"
                                ? "bg-[#d64045] text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                    >
                        <Crop className="h-3 w-3" />
                        4:5
                    </button>
                </div>

                {/* Reset Button */}
                <button
                    type="button"
                    onClick={onReset}
                    className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                </button>
            </div>
        </div>
    );
}
