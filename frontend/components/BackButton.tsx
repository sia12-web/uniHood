"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type BackButtonProps = {
	fallbackHref?: string;
	label?: string;
	className?: string;
};

export default function BackButton({ fallbackHref = "/", label = "Back", className }: BackButtonProps) {
	const router = useRouter();

	const handleClick = useCallback(() => {
		if (typeof window !== "undefined" && window.history.length > 1) {
			router.back();
			return;
		}
		router.push(fallbackHref);
	}, [fallbackHref, router]);

	return (
		<button
			type="button"
			onClick={handleClick}
			aria-label={label}
			className={[
				"inline-flex items-center gap-2 rounded-full border border-warm-sand px-4 py-2 text-sm font-medium text-navy transition hover:bg-warm-sand/50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700",
				className ?? "",
			].join(" ")}
		>
			<ArrowLeft className="h-4 w-4" />
			<span>{label}</span>
		</button>
	);
}

