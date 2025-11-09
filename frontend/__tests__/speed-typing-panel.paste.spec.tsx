import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/features/activities/hooks/useSpeedTypingSession', () => {
  const markPasteDetected = vi.fn();
  return {
    useSpeedTypingSession: () => ({
      state: { phase: 'running' },
      typedText: '',
      setTypedText: vi.fn(),
      metrics: { wpm: 0, accuracy: 1, progress: 0 },
      submitted: false,
      submit: vi.fn(),
      onKeyDown: vi.fn(),
      markPasteDetected,
      textSample: 'sample text',
      toast: null,
    }),
  };
});

import { SpeedTypingPanel } from '@/app/features/activities/components/SpeedTypingPanel';

describe('SpeedTypingPanel paste prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('prevents paste and shows toast', async () => {
    render(<SpeedTypingPanel sessionId="s1" />);
    const textarea = screen.getByRole('textbox');
    // Focus element
    textarea.focus();
    // Dispatch native paste event (cancelable) which component prevents
    const evt = new Event('paste', { bubbles: true, cancelable: true });
    const allowed = textarea.dispatchEvent(evt);
    expect(allowed).toBe(false);
    // Flush microtasks so toast renders
    await Promise.resolve();
    expect(screen.getByText(/paste blocked/i)).toBeInTheDocument();
  });
});
