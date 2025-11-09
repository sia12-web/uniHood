import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SummaryView } from '../app/features/activities/components/SummaryView';

describe('QuickTrivia Summary', () => {
  it('renders tie-break message', async () => {
    render(<SummaryView winnerUserId={undefined} tieBreakWinnerUserId={'alice'} onRematch={() => {}} />);
  // Text split across nested spans; use a custom matcher
  expect(screen.getByText((content, element) => /Winner by time advantage:/.test(content))).toBeTruthy();
  expect(screen.getByText('@alice')).toBeTruthy();
  });
});
