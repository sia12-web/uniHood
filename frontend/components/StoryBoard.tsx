export type StoryLine = {
  idx: number;
  user_id: string;
  content: string;
};

type StoryBoardProps = {
  seed?: string | null;
  lines: StoryLine[];
  activeUserId?: string | null;
  nextUserId?: string | null;
};

export default function StoryBoard({ seed, lines, activeUserId, nextUserId }: StoryBoardProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 shadow-sm">
        <h2 className="mb-2 font-semibold text-slate-900">Story Seed</h2>
        <p className="leading-relaxed">{seed ?? "No seed provided"}</p>
      </div>
      <div className="rounded border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
          Story Progress
        </header>
        <ul className="divide-y divide-slate-100">
          {lines.length === 0 ? (
            <li className="px-4 py-4 text-sm text-slate-500">No lines yet. Be the first to add one!</li>
          ) : (
            lines.map((line) => (
              <li key={line.idx} className="px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Turn {line.idx}</p>
                <p className="mt-1 whitespace-pre-line text-slate-800">{line.content}</p>
                <p className="mt-2 text-xs text-slate-500">{line.user_id}</p>
              </li>
            ))
          )}
        </ul>
      </div>
      {nextUserId ? (
        <p className="text-xs text-slate-500">
          Next turn: <span className="font-medium text-slate-700">{nextUserId}</span>
          {activeUserId && nextUserId === activeUserId ? " (you)" : null}
        </p>
      ) : null}
    </section>
  );
}
