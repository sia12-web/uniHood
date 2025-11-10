import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

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

const guardDetachMock = vi.hoisted(() => ({ detach: vi.fn() }));

vi.mock('@/app/features/activities/guards/typingBoxGuards', () => ({
  attachTypingBoxGuards: vi.fn(() => guardDetachMock.detach),
}));

import { SpeedTypingPanel } from '@/app/features/activities/components/SpeedTypingPanel';

describe('SpeedTypingPanel paste prevention', () => {
  it('prevents paste and shows toast', () => {
    render(<SpeedTypingPanel sessionId="s1" />);
    const textarea = screen.getByRole('textbox');
    textarea.focus();
    act(() => {
      const result = fireEvent.paste(textarea);
      expect(result).toBe(false);
    });
    expect(screen.getByText(/paste blocked/i)).toBeInTheDocument();
  });
});
