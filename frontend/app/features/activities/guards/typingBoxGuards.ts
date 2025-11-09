// Plain JS-style guards implemented in TypeScript for type safety.
// Attaches strong copy/paste/cut/select/ctxmenu prevention to a typing textarea.

export function attachTypingBoxGuards(el: HTMLTextAreaElement): () => void {
  const ac = new AbortController();
  const signal = ac.signal;

  let composing = false;

  // Utility to add listeners with signal and optional capture
  const on = <K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ) => {
    el.addEventListener(type, handler as EventListener, { signal, ...opts });
  };

  // Blockers
  const block = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Composition tracking (IME)
  on('compositionstart', () => { composing = true; });
  on('compositionend', () => { composing = false; });

  // Basic UI events
  on('copy', block);
  on('cut', block);
  on('paste', block);
  on('contextmenu', block);
  on('drop', block);
  // Prevent dropping by ignoring dragover default (otherwise drop may still fire)
  on('dragover', (e) => { e.preventDefault(); });

  // Keyboard shortcuts: Ctrl/Cmd + C/V/X, Shift+Insert (paste)
  on('keydown', (e) => {
    const ke = e as KeyboardEvent;
    const key = ke.key;
    const mod = ke.ctrlKey || ke.metaKey;
    if ((mod && (key === 'c' || key === 'C' || key === 'v' || key === 'V' || key === 'x' || key === 'X')) ||
        (ke.shiftKey && key === 'Insert')) {
      ke.preventDefault();
      ke.stopPropagation();
    }
  });

  // Block paste-like beforeinput when not composing
  on('beforeinput', (ev) => {
    const ie = ev as unknown as InputEvent & { data?: string; inputType?: string };
    const t = typeof ie.inputType === 'string' ? ie.inputType : '';
    const data = typeof ie.data === 'string' ? ie.data : '';
    if (!composing) {
      const isBatch =
        t.startsWith('insertFromPaste') ||
        t === 'insertFromDrop' ||
        t === 'insertReplacementText' ||
        (t === 'insertText' && data.length > 1);
      if (isBatch) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }
  }, { capture: true });

  // Cleanup
  return () => ac.abort();
}
