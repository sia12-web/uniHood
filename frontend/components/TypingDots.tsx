type Props = {
  active: boolean;
};

export default function TypingDots({ active }: Props) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center space-x-1">
      <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400" />
    </span>
  );
}
