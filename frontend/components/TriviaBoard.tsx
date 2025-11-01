type TriviaBoardProps = {
  prompt: string;
  options: string[];
  selected: number | null;
  onSelect: (idx: number) => void;
  disabled?: boolean;
  revealed?: number | null;
  latency?: number | null;
};

export default function TriviaBoard({
  prompt,
  options,
  selected,
  onSelect,
  disabled = false,
  revealed = null,
  latency,
}: TriviaBoardProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 shadow-sm">
        <h2 className="mb-2 font-semibold text-slate-900">Question</h2>
        <p className="leading-relaxed">{prompt}</p>
        {typeof latency === "number" ? (
          <p className="mt-3 text-xs text-slate-500">Your response latency: {latency.toFixed(0)}ms</p>
        ) : null}
      </div>
      <ul className="grid gap-3">
        {options.map((option, idx) => {
          const isSelected = selected === idx;
          const isAnswer = revealed === idx;
          return (
            <li key={idx}>
              <button
                type="button"
                className={`w-full rounded border px-4 py-3 text-left text-sm transition ${
                  disabled && !isSelected ? "cursor-not-allowed opacity-60" : ""
                } ${
                  isAnswer
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : isSelected
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:text-indigo-600"
                }`}
                onClick={() => onSelect(idx)}
                disabled={disabled}
              >
                <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>
                {option}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
