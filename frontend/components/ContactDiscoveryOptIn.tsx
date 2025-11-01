"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
	fetchContactSalt,
	matchContactHashes,
	updateContactOptIn,
	uploadContactHashes,
} from "@/lib/account";
import { getDemoUserCampus, getDemoUserId } from "@/lib/env";
import type { ContactSaltResponse } from "@/lib/types";

type ContactDiscoveryOptInProps = {
	userId?: string;
	campusId?: string | null;
};

function normaliseCampusId(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

type ContactInput = {
	kind: "email" | "phone";
	value: string;
};

function parseContact(line: string): ContactInput | null {
	const raw = line.trim();
	if (!raw) {
		return null;
	}
	const parts = raw.split(":", 2);
	if (parts.length === 2 && parts[0]) {
		const prefix = parts[0].trim().toLowerCase();
		const rest = parts[1].trim();
		if (!rest) {
			return null;
		}
		if (prefix === "phone") {
			return { kind: "phone", value: rest };
		}
		if (prefix === "email") {
			return { kind: "email", value: rest };
		}
	}
	if (raw.startsWith("+")) {
		return { kind: "phone", value: raw };
	}
	return { kind: "email", value: raw };
}

async function hashContactValue(input: ContactInput, salt: string): Promise<string> {
	if (!crypto?.subtle) {
		throw new Error("Web Crypto API not available in this environment");
	}
	const formatted = input.kind === "email" ? input.value.trim().toLowerCase() : input.value.trim().replace(/\s+/g, "");
	const payload = `${formatted}|${salt}`;
	const encoded = new TextEncoder().encode(payload);
	const digest = await crypto.subtle.digest("SHA-256", encoded);
	const bytes = Array.from(new Uint8Array(digest));
	return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function ContactDiscoveryOptIn({ userId, campusId }: ContactDiscoveryOptInProps) {
	const resolvedUserId = useMemo(() => userId ?? getDemoUserId(), [userId]);
		const resolvedCampusId = useMemo(
			() => normaliseCampusId(campusId ?? getDemoUserCampus()),
			[campusId],
		);
	const [salt, setSalt] = useState<ContactSaltResponse | null>(null);
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [contacts, setContacts] = useState<string>("email:friend@example.edu\nphone:+15555557890");
	const [hashed, setHashed] = useState<string>("");
	const [matchInput, setMatchInput] = useState<string>("");
	const [matches, setMatches] = useState<string[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const init = async () => {
			setLoading(true);
			setError(null);
			try {
				const saltResponse = await fetchContactSalt();
				if (!cancelled) {
					setSalt(saltResponse);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Unable to load discovery salt");
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};
		void init();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleRefreshSalt = async () => {
		setLoading(true);
		setError(null);
		setMessage(null);
		try {
			const saltResponse = await fetchContactSalt();
			setSalt(saltResponse);
			setMessage("Salt refreshed (demo environment fetch)");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to refresh salt");
		} finally {
			setLoading(false);
		}
	};

	const handleOptIn = async (next: boolean) => {
		setLoading(true);
		setError(null);
		setMessage(null);
		try {
			const response = await updateContactOptIn(resolvedUserId, resolvedCampusId, next);
			setEnabled(response.enabled);
			setMessage(response.enabled ? "Contact discovery enabled" : "Contact discovery disabled");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update opt-in");
		} finally {
			setLoading(false);
		}
	};

	const handleHashAndUpload = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!salt) {
			setError("Fetch the current salt before hashing contacts.");
			return;
		}
		if (enabled === false) {
			setError("Enable contact discovery before uploading hashes.");
			return;
		}
		setLoading(true);
		setError(null);
		setMessage(null);
		try {
			const lines = contacts
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => line.length > 0);
			if (lines.length === 0) {
				setError("Provide at least one contact to hash.");
				setLoading(false);
				return;
			}
			const parsed = lines.map((line) => parseContact(line)).filter((value): value is ContactInput => Boolean(value));
			if (parsed.length === 0) {
				setError("Unable to parse any contacts.");
				setLoading(false);
				return;
			}
			const digests = await Promise.all(parsed.map((value) => hashContactValue(value, salt.salt)));
			const payload = digests.map((digest, index) => `${parsed[index].kind}:${digest}`);
			await uploadContactHashes(resolvedUserId, resolvedCampusId, payload);
			const joined = payload.join("\n");
			setHashed(joined);
			setMatchInput(joined);
			setMessage(`Uploaded ${payload.length} contact hashes`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to upload contact hashes");
		} finally {
			setLoading(false);
		}
	};

	const handleMatch = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const hashes = matchInput
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		if (hashes.length === 0) {
			setError("Paste contact hashes to match.");
			return;
		}
		setLoading(true);
		setError(null);
		setMessage(null);
		try {
			const response = await matchContactHashes(resolvedUserId, resolvedCampusId, hashes);
			setMatches(response.handles);
			setMessage(`Matched ${response.handles.length} users`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to run match");
		} finally {
			setLoading(false);
		}
	};

	return (
		<section className="space-y-5 rounded border border-slate-200 bg-white p-4 shadow-sm">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold text-slate-900">Contact discovery</h2>
				<p className="text-sm text-slate-500">
					Rotate the shared salt, opt users into hashed uploads, then upload email/phone digests to test matching.
				</p>
			</header>
			{error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}
			{message ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
			) : null}
			<section className="space-y-2 rounded border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p>
						<span className="font-semibold text-slate-700">Current salt:</span> {salt ? salt.salt : "—"}
					</p>
					<button
						type="button"
						onClick={() => void handleRefreshSalt()}
						className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-white disabled:opacity-50"
						disabled={loading}
					>
						Refresh salt
					</button>
				</div>
				<p>Rotates at: {salt ? new Date(salt.rotates_at).toLocaleString() : "unknown"}</p>
				<p>Status: {enabled === null ? "not set" : enabled ? "opted in" : "opted out"}</p>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => void handleOptIn(true)}
						className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white disabled:bg-indigo-300"
						disabled={loading}
					>
						Enable
					</button>
					<button
						type="button"
						onClick={() => void handleOptIn(false)}
						className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50"
						disabled={loading}
					>
						Disable
					</button>
				</div>
			</section>
			<form className="space-y-3" onSubmit={handleHashAndUpload}>
				<label className="flex flex-col gap-1 text-sm">
					<span className="text-xs font-medium uppercase tracking-wide text-slate-500">Contacts to hash</span>
					<textarea
						value={contacts}
						onChange={(event) => setContacts(event.target.value)}
						placeholder="email:friend@example.edu"
						className="h-32 rounded border border-slate-300 px-3 py-2 font-mono text-xs shadow-sm"
						disabled={loading}
					/>
				</label>
				<button
					type="submit"
					className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:bg-indigo-300"
					disabled={loading}
				>
					Hash &amp; upload
				</button>
			</form>
			<section className="space-y-3 border-t border-slate-200 pt-3">
				<label className="flex flex-col gap-1 text-sm">
					<span className="text-xs font-medium uppercase tracking-wide text-slate-500">Hashed payload (debug)</span>
					<textarea
						value={hashed}
						readOnly
						className="h-28 rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600"
					/>
				</label>
				<form className="space-y-3" onSubmit={handleMatch}>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-xs font-medium uppercase tracking-wide text-slate-500">Hashes to match</span>
						<textarea
							value={matchInput}
							onChange={(event) => setMatchInput(event.target.value)}
							placeholder="email:abc123…"
							className="h-32 rounded border border-slate-300 px-3 py-2 font-mono text-xs shadow-sm"
							disabled={loading}
						/>
					</label>
					<button
						type="submit"
						className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-600"
						disabled={loading}
					>
						Match contacts
					</button>
				</form>
				<div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
					<p className="font-semibold text-slate-700">Matches</p>
					{matches.length === 0 ? (
						<p>No matches yet.</p>
					) : (
						<ul className="list-disc pl-4">
							{matches.map((handle) => (
								<li key={handle}>{handle}</li>
							))}
						</ul>
					)}
				</div>
			</section>
		</section>
	);
}
