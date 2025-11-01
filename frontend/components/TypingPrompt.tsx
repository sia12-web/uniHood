type TypingPromptProps = {
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  timeRemaining?: number | null;
  isSubmitting?: boolean;
};

export default function TypingPrompt({
  prompt,
  value,
  onChange,
  onSubmit,
  disabled = false,
  timeRemaining,
  isSubmitting = false,
}: TypingPromptProps) {
  const seconds = timeRemaining !== undefined && timeRemaining !== null ? Math.max(timeRemaining, 0) : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <h2 className="mb-2 font-semibold text-slate-900">Prompt</h2>
        <p className="whitespace-pre-line leading-relaxed">{prompt}</p>
        {seconds !== null ? (
          <p className="mt-3 text-xs text-slate-500">Time remaining: {seconds}s</p>
        ) : null}
      </div>
      <textarea
        className="h-48 w-full rounded border border-slate-300 p-3 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        placeholder="Type your response here..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{value.length} characters</span>
        {onSubmit ? (
          <button
            type="button"
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
            onClick={() => onSubmit()}
            disabled={disabled || isSubmitting || value.trim().length === 0}
          >
            {isSubmitting ? "Submitting..." : "Submit Entry"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
