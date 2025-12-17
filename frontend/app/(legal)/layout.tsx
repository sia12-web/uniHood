import BackButton from "@/components/BackButton";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
			<div className="mb-6">
				<BackButton />
			</div>
			{children}
		</div>
	);
}

