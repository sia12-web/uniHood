import React from "react";
import { Check, Ghost } from "lucide-react";
import { cn } from "@/lib/utils";

// Placeholder anime characters (using DiceBear for reliable avatars if no local assets)
// In a real app, these would be local assets or hosted images.
const CHARACTERS = [
    { id: "ghost-1", name: "Mystic", url: "https://api.dicebear.com/9.x/notionists/svg?seed=Mystic" },
    { id: "ghost-2", name: "Shadow", url: "https://api.dicebear.com/9.x/notionists/svg?seed=Shadow" },
    { id: "ghost-3", name: "Spirit", url: "https://api.dicebear.com/9.x/notionists/svg?seed=Spirit" },
    { id: "ghost-4", name: "Echo", url: "https://api.dicebear.com/9.x/notionists/svg?seed=Echo" },
    { id: "ghost-5", name: "Wisp", url: "https://api.dicebear.com/9.x/notionists/svg?seed=Wisp" },
    { id: "ghost-6", name: "Phantom", url: "https://api.dicebear.com/9.x/notionists/svg?seed=Phantom" },
];

interface GhostModeSelectorProps {
    selectedId: string | null;
    onSelect: (url: string, id: string) => void;
    className?: string;
}

export default function GhostModeSelector({
    selectedId,
    onSelect,
    className,
}: GhostModeSelectorProps) {
    return (
        <div className={cn("flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm", className)}>
            <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                    <Ghost className="h-6 w-6" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Ghost Mode</h3>
                    <p className="text-sm text-slate-500">Stay anonymous with an avatar.</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 sm:grid-cols-3">
                {CHARACTERS.map((char) => {
                    const isSelected = selectedId === char.id;
                    return (
                        <button
                            key={char.id}
                            onClick={() => onSelect(char.url, char.id)}
                            className={cn(
                                "group relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-xl border-2 transition-all",
                                isSelected
                                    ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-200 ring-offset-2"
                                    : "border-slate-100 bg-slate-50 hover:border-indigo-200 hover:bg-white"
                            )}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={char.url}
                                alt={char.name}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                            />

                            {isSelected && (
                                <div className="absolute inset-0 flex items-center justify-center bg-indigo-900/10">
                                    <div className="rounded-full bg-indigo-600 p-1.5 text-white shadow-sm">
                                        <Check className="h-4 w-4" />
                                    </div>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            <p className="mt-6 text-center text-xs text-slate-400">
                You can change this to a real photo anytime.
            </p>
        </div>
    );
}
