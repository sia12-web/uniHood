import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SpeedTypingPanel } from '../app/features/activities/components/SpeedTypingPanel';
import { useSpeedTypingSession } from '../app/features/activities/hooks/useSpeedTypingSession';

// Basic render smoke test (sessionId omitted -> idle state)

describe('SpeedTypingPanel', () => {
  it('shows waiting message when not running', () => {
    render(<SpeedTypingPanel sessionId="session-x" />);
    expect(screen.getByText(/waiting for round/i)).toBeTruthy();
  });
});
