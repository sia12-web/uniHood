import React, { useEffect, useRef, useState } from 'react';
import { UncopyableSnippet } from './UncopyableSnippet';
import { useSpeedTypingSession } from '../hooks/useSpeedTypingSession';
import { attachTypingBoxGuards } from '../guards/typingBoxGuards';

export const SpeedTypingPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const {
    state,
    typedText,
    setTypedText,
    metrics,
    submitted,
    submit,
    onKeyDown,
    markPasteDetected,
    textSample,
    toast: sessionToast,
  } = useSpeedTypingSession({ sessionId });
  // no container ref needed
  const [localToast, setLocalToast] = useState<string | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const blockNextChangeRef = useRef(false);
  const composingRef = useRef(false);
  useEffect(() => {
    if (!localToast) return;
    const id = setTimeout(() => setLocalToast(null), 2000);
    return () => clearTimeout(id);
  }, [localToast]);

  // Global hard block: intercept paste/beforeinput/drop at capture phase for the textarea
  useEffect(() => {
    const ta = textAreaRef.current;
    if (!ta) return;
    // Attach modular guards directly to the textarea
    const detach = attachTypingBoxGuards(ta);
    return () => {
      detach();
    };
  }, [markPasteDetected]);

  const toast = sessionToast || localToast;

  return (
    <div className="p-4 border rounded">
      {state.phase === 'running' && (
        <>
          <UncopyableSnippet
            text={textSample}
            widthPx={560}
            font="14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            lineHeight={20}
            padding={12}
            antiOcrNoise={false}
          />
          <textarea
            ref={textAreaRef}
            value={typedText}
            id="typing-box"
            className="w-full h-32 p-2 border rounded select-none"
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            onChange={(e) => {
              // 1) consume the block flag set by beforeinput/paste and revert DOM
              if (blockNextChangeRef.current) {
                blockNextChangeRef.current = false;
                e.currentTarget.value = typedText;
                return;
              }
              const next = e.currentTarget.value;
              const delta = next.length - typedText.length;
              // 2) If not composing (IME), only allow deletions and single-char inserts
              if (!composingRef.current) {
                if (delta > 1) {
                  setLocalToast('Paste blocked');
                  markPasteDetected();
                  e.currentTarget.value = typedText;
                  return;
                }
                if (delta === 0 && next !== typedText) { // deny same-length replacement
                  setLocalToast('Paste blocked');
                  markPasteDetected();
                  e.currentTarget.value = typedText;
                  return;
                }
              }
              // allow deletions, single insert, or IME commit
              setTypedText(next);
            }}
            onKeyDown={(e) => {
              // hard-block paste shortcuts and set block flag so next change is reverted
              if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
                e.preventDefault();
                setLocalToast('Paste blocked');
                markPasteDetected();
                blockNextChangeRef.current = true;
              }
              if (e.shiftKey && e.key === 'Insert') {
                e.preventDefault();
                setLocalToast('Paste blocked');
                markPasteDetected();
                blockNextChangeRef.current = true;
              }
              onKeyDown(e);
            }}
            onPaste={(e) => { e.preventDefault(); markPasteDetected(); setLocalToast('Paste blocked'); blockNextChangeRef.current = true; }}
            onBeforeInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
              const ne = e.nativeEvent as unknown as { inputType?: string; data?: string };
              const t = typeof ne.inputType === 'string' ? ne.inputType : '';
              const data = typeof ne.data === 'string' ? ne.data : '';
              const ta = textAreaRef.current!;
              const selLen = ta.selectionEnd! - ta.selectionStart!;
              const batch =
                t.startsWith('insertFromPaste') ||
                t === 'insertFromDrop' ||
                t === 'insertReplacementText' ||
                (t === 'insertText' && data.length > 1) ||
                (t === 'insertText' && selLen > 1);
              if (batch) {
                e.preventDefault();
                markPasteDetected();
                setLocalToast('Paste blocked');
                blockNextChangeRef.current = true;
              }
            }}
            onDrop={(e) => { e.preventDefault(); setLocalToast('Drop blocked'); }}
            onCopy={(e) => { e.preventDefault(); setLocalToast('Copy disabled'); }}
            onCut={(e) => { e.preventDefault(); setLocalToast('Cut disabled'); }}
            onContextMenu={(e) => { e.preventDefault(); setLocalToast('Context menu disabled'); }}
            disabled={submitted}
            aria-describedby="typing-stats"
            placeholder="Start typing here…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
          />
          <div id="typing-stats" className="flex gap-4 text-sm text-gray-700 mt-2">
            <div>WPM: {metrics.wpm.toFixed(1)}</div>
            <div>Accuracy: {(metrics.accuracy * 100).toFixed(0)}%</div>
            <div>Progress: {(metrics.progress * 100).toFixed(0)}%</div>
          </div>
          {toast && <div className="mt-2 text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded inline-block">{toast}</div>}
          <div className="mt-2">
            <button onClick={submit} disabled={submitted} className="px-3 py-2 bg-blue-600 text-white rounded">Submit</button>
          </div>
        </>
      )}
      {state.phase !== 'running' && (
        <div className="text-sm text-gray-600">Waiting for round…</div>
      )}
    </div>
  );
};
