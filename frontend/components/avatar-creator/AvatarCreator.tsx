import React, { useState, useRef } from "react";
import { Check, Shuffle, X } from "lucide-react";
import { AvatarCreatorProps, AvatarState, AvatarCategory } from "./types";
import { ASSETS, BACKGROUNDS } from "./assets";
import { getRandomAvatar, exportAvatarToBlob } from "./utils";
import AvatarCanvas from "./AvatarCanvas";
import { cn } from "@/lib/utils";

const CATEGORIES: { id: AvatarCategory | "background"; label: string }[] = [
    { id: "body", label: "Skin" },
    { id: "eyes", label: "Eyes" },
    { id: "mouth", label: "Mouth" },
    { id: "top", label: "Tops" },
    { id: "bottom", label: "Bottoms" },
    { id: "accessories", label: "Extras" },
    { id: "background", label: "Bg" },
];

export default function AvatarCreator({
    onSave,
    onCancel,
    initialState,
    className,
}: AvatarCreatorProps) {
    const [state, setState] = useState<AvatarState>(() => initialState as AvatarState || getRandomAvatar());
    const [activeCategory, setActiveCategory] = useState<AvatarCategory | "background">("body");
    const svgRef = useRef<SVGSVGElement>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleRandomize = () => {
        setState(getRandomAvatar());
    };

    const handleSave = async () => {
        if (!svgRef.current) return;
        setIsSaving(true);
        try {
            const blob = await exportAvatarToBlob(svgRef.current);
            onSave(blob, state);
        } catch (error) {
            console.error("Failed to save avatar", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSelectItem = (id: string) => {
        if (activeCategory === "background") {
            setState((prev) => ({ ...prev, background: id }));
            return;
        }

        setState((prev) => {
            // Toggle logic for optional items
            if (["top", "bottom", "accessories", "shoes"].includes(activeCategory)) {
                if (prev[activeCategory as keyof AvatarState] === id) {
                    return { ...prev, [activeCategory]: undefined };
                }
            }
            return { ...prev, [activeCategory]: id };
        });
    };

    const currentItems = activeCategory === "background"
        ? BACKGROUNDS
        : ASSETS.filter(a => a.category === activeCategory);

    return (
        <div className={cn("flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl", className)}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="font-bold text-slate-900">Create Avatar</h3>
                <button
                    onClick={onCancel}
                    className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            <div className="flex flex-1 flex-col md:flex-row">
                {/* Preview Area */}
                <div className="flex flex-col items-center justify-center bg-slate-50 p-6 md:w-1/3 md:border-r md:border-slate-100">
                    <div className="relative aspect-square w-48 overflow-hidden rounded-full border-4 border-white shadow-lg ring-1 ring-slate-100">
                        <AvatarCanvas ref={svgRef} state={state} className="h-full w-full" />
                    </div>

                    <div className="mt-6 flex gap-3">
                        <button
                            onClick={handleRandomize}
                            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                            <Shuffle className="h-3 w-3" />
                            Random
                        </button>
                    </div>
                </div>

                {/* Controls Area */}
                <div className="flex flex-1 flex-col bg-white">
                    {/* Category Tabs */}
                    <div className="flex overflow-x-auto border-b border-slate-100 px-2 scrollbar-hide">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={cn(
                                    "whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors",
                                    activeCategory === cat.id
                                        ? "border-b-2 border-[#d64045] text-[#d64045]"
                                        : "text-slate-500 hover:text-slate-800"
                                )}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Items Grid */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                            {currentItems.map((item) => {
                                const isSelected = activeCategory === "background"
                                    ? state.background === item.id
                                    : state[activeCategory as keyof AvatarState] === item.id;

                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => handleSelectItem(item.id)}
                                        className={cn(
                                            "group relative aspect-square overflow-hidden rounded-xl border-2 transition-all",
                                            isSelected
                                                ? "border-[#d64045] bg-[#fff0f1]"
                                                : "border-slate-100 bg-slate-50 hover:border-slate-300"
                                        )}
                                    >
                                        {activeCategory === "background" ? (
                                            <div
                                                className="h-full w-full"
                                                style={{ backgroundColor: (item as { color: string }).color }}
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center p-2">
                                                <svg viewBox="0 0 200 200" className="h-full w-full">
                                                    <g dangerouslySetInnerHTML={{ __html: (item as { svg: string }).svg }} />
                                                </svg>
                                            </div>
                                        )}

                                        {isSelected && (
                                            <div className="absolute right-1 top-1 rounded-full bg-[#d64045] p-0.5 text-white">
                                                <Check className="h-3 w-3" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50 px-4 py-3">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 rounded-xl bg-[#d64045] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#c7343a] disabled:opacity-70"
                >
                    {isSaving ? "Saving..." : "Save Avatar"}
                </button>
            </div>
        </div>
    );
}
