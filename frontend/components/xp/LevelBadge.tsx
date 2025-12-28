import { cn } from "@/lib/utils";
import { Award, Crown, Sparkles, Star, User, Zap, type LucideIcon } from "lucide-react";
import { LEVEL_LABELS } from "@/lib/xp";

interface LevelBadgeProps {
    level: number;
    showLabel?: boolean;
    className?: string;
    size?: "sm" | "md" | "lg";
}

export function LevelBadge({ level, showLabel = true, className, size = "md" }: LevelBadgeProps) {
    const styles: Record<number, { icon: LucideIcon; variantClasses: string }> = {
        1: { icon: User, variantClasses: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700" },
        2: { icon: Sparkles, variantClasses: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800" },
        3: { icon: Zap, variantClasses: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800" },
        4: { icon: Star, variantClasses: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800" },
        5: { icon: Award, variantClasses: "bg-gradient-to-br from-slate-50 to-slate-200 text-slate-800 border-slate-300 shadow-sm dark:from-slate-800 dark:to-slate-700 dark:text-white dark:border-slate-600" },
        6: { icon: Crown, variantClasses: "bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-100 text-amber-800 border-amber-300 shadow-sm ring-1 ring-amber-400/30 dark:from-yellow-900/40 dark:via-amber-900/40 dark:to-yellow-900/40 dark:text-yellow-200 dark:border-yellow-700" },
    };

    const config = styles[level] || styles[1];
    const Icon = config.icon;
    const label = LEVEL_LABELS[level] || "Newcomer";

    const sizeClasses = {
        sm: "px-1.5 py-0.5 text-[10px] gap-1",
        md: "px-2.5 py-1 text-xs gap-1.5",
        lg: "px-3 py-1.5 text-sm gap-2",
    };

    const iconSizes = {
        sm: "w-3 h-3",
        md: "w-3.5 h-3.5",
        lg: "w-4 h-4",
    };

    return (
        <div className={cn(
            "inline-flex items-center rounded-full border font-medium transition-all select-none",
            config.variantClasses,
            sizeClasses[size],
            className
        )}>
            <Icon className={iconSizes[size]} strokeWidth={2.5} />
            {showLabel && <span>{label}</span>}
        </div>
    );
}
