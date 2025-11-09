import React from 'react';
import { useQuickTriviaSession, type TriviaState } from '../hooks/useQuickTriviaSession';

type QuickTriviaController = {
  state: TriviaState;
  selectOption: (idx: number) => void;
  progress: number;
};

type QuickTriviaPanelViewProps = {
  controller: QuickTriviaController;
};

export const QuickTriviaPanelView: React.FC<QuickTriviaPanelViewProps> = ({ controller }) => {
  const { state, selectOption, progress } = controller;

  if (state.phase !== 'running' && state.phase !== 'lobby') {
    return <div className="rounded border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">Waiting for round…</div>;
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">Quick Trivia</h3>
        <meter
          min={0}
          max={1}
          value={progress}
          className="h-2 w-40 rounded bg-slate-100 [--meter-bg:theme(colors.sky.500)]"
        ></meter>
      </header>
      <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 shadow-sm">
        <div className="mb-3 text-sm text-slate-800">{state.question || '—'}</div>
        <fieldset className="grid gap-2" disabled={!!state.locked}>
          {(state.options || []).map((opt, idx) => {
            const isSelected = state.selectedIndex === idx;
            const isCorrect = state.correctIndex === idx;
            const baseClasses = 'rounded-lg border px-3 py-2 text-sm transition-colors';
            const className = isCorrect
              ? `${baseClasses} border-emerald-300 bg-emerald-50 text-emerald-900`
              : `${baseClasses} border-slate-200 bg-white hover:border-slate-300`;
            return (
              <label key={idx} className={className}>
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="quick-trivia-choice"
                    className="h-4 w-4"
                    checked={isSelected}
                    onChange={() => selectOption(idx)}
                    disabled={!!state.locked}
                  />
                  <span className="flex-1 text-left">{opt}</span>
                  {state.locked && isSelected ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      Locked
                    </span>
                  ) : null}
                  {state.correctIndex !== undefined && isCorrect ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      Correct
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>
    </div>
  );
};

export const QuickTriviaPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const controller = useQuickTriviaSession({ sessionId });
  return <QuickTriviaPanelView controller={controller} />;
};
