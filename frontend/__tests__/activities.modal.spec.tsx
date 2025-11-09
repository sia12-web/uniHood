import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ChooseActivityModal } from '../app/features/activities/components/ChooseActivityModal';
import * as client from '../app/features/activities/api/client';

describe('ChooseActivityModal', () => {
  it('creates and starts a typing duel via activity API', async () => {
    const duelSpy = vi.spyOn(client, 'createTypingDuel').mockResolvedValue({ id: 'act-1', kind: 'typing_duel', state: 'new', user_a: 'me', user_b: 'peer', meta: {} });
    const startSpy = vi.spyOn(client, 'startActivity').mockResolvedValue({ id: 'act-1', kind: 'typing_duel', state: 'running', user_a: 'me', user_b: 'peer', meta: {} });
    const fn = vi.fn();
    render(<ChooseActivityModal peerUserId="peer" onStarted={fn} />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    await waitFor(() => expect(duelSpy).toHaveBeenCalled());
    expect(duelSpy).toHaveBeenCalledWith('peer');
    await waitFor(() => expect(startSpy).toHaveBeenCalledWith('act-1'));
    await waitFor(() => expect(fn).toHaveBeenCalledWith('act-1'));
  });
});
