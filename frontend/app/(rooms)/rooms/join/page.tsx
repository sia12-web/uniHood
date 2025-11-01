'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { joinByCode } from '@/lib/rooms';

export default function JoinRoomPage() {
	const router = useRouter();
	const [joinCode, setJoinCode] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		const trimmed = joinCode.trim();
		if (!trimmed) {
			setError('Enter a valid join code');
			return;
		}
		setError(null);
		setLoading(true);
		try {
			const summary = await joinByCode(trimmed);
			router.push(`/rooms/${summary.id}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unable to join room');
			setLoading(false);
		}
	}

	return (
		<div className="p-8 max-w-md mx-auto space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Join a Room</h1>
				<p className="text-sm text-muted-foreground">Paste the invite code shared with you.</p>
			</div>
			<form className="space-y-4" onSubmit={handleSubmit}>
				<div>
					<label className="block text-sm font-medium mb-1" htmlFor="join-code">
						Join code
					</label>
					<input
						id="join-code"
						className="border rounded w-full p-2"
						placeholder="ULID123..."
						value={joinCode}
						onChange={(event) => setJoinCode(event.target.value)}
						required
						disabled={loading}
					/>
				</div>
				{error ? <p className="text-sm text-red-600">{error}</p> : null}
				<button className="bg-blue-600 text-white px-4 py-2 rounded" type="submit" disabled={loading}>
					{loading ? 'Joining…' : 'Join room'}
				</button>
			</form>
		</div>
	);
}
