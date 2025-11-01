'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { createRoom } from '@/lib/rooms';

const presets = [
  { label: '2-4 members', value: '2-4' },
  { label: '4-6 members', value: '4-6' },
  { label: '12+ members', value: '12+' },
];

export default function CreateRoomPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [preset, setPreset] = useState('4-6');
  const [visibility, setVisibility] = useState<'private' | 'link'>('link');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const summary = await createRoom({ name, preset, visibility });
      router.push(`/rooms/${summary.id}`);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to create room');
    }
  }

  return (
    <div className="p-8 max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create a Room</h1>
        <p className="text-sm text-muted-foreground">Group chat rooms support link or private visibility.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="name">
            Room name
          </label>
          <input
            id="name"
            className="border rounded w-full p-2"
            placeholder="Study group"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="preset">
            Size preset
          </label>
          <select
            id="preset"
            className="border rounded w-full p-2"
            value={preset}
            onChange={(event) => setPreset(event.target.value)}
          >
            {presets.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="block text-sm font-medium mb-1">Visibility</span>
          <label className="mr-4 text-sm">
            <input
              type="radio"
              name="visibility"
              value="link"
              checked={visibility === 'link'}
              onChange={() => setVisibility('link')}
            />{' '}
            Link (join by code)
          </label>
          <label className="text-sm">
            <input
              type="radio"
              name="visibility"
              value="private"
              checked={visibility === 'private'}
              onChange={() => setVisibility('private')}
            />{' '}
            Private (invite only)
          </label>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="bg-blue-600 text-white px-4 py-2 rounded" type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Create room'}
        </button>
      </form>
    </div>
  );
}
