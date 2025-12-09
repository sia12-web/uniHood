import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Legal - Radius",
	description: "Legal documents and policies",
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-gray-50 dark:bg-gray-900">
			<div className="mx-auto max-w-4xl px-4 py-12">
				{children}
			</div>
		</div>
	);
}
