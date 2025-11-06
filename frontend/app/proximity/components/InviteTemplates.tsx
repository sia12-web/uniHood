"use client";

type InviteTemplatesProps = {
	templates: string[];
	selected: string | null;
	onSelect: (template: string | null) => void;
};

export function InviteTemplates({ templates, selected, onSelect }: InviteTemplatesProps) {
	if (templates.length === 0) {
		return null;
	}

	return (
		<section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
			<header className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-slate-900">Quick invite templates</h3>
				<button
					type="button"
					onClick={() => onSelect(null)}
					className="text-xs font-medium text-slate-500 underline decoration-dotted"
				>
					Clear
				</button>
			</header>
			<ul className="flex flex-wrap gap-2">
				{templates.map((template) => {
					const active = template === selected;
					return (
						<li key={template}>
							<button
								type="button"
								onClick={() => onSelect(active ? null : template)}
								className={`rounded-full px-4 py-2 text-xs font-medium transition ${
									active
										? "bg-indigo-600 text-white shadow"
										: "bg-white text-slate-700 shadow-sm hover:bg-slate-100"
								}`}
							>
								{template}
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
