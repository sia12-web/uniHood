"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { formatDistance } from "@/lib/geo";
import type { NearbyUser, ProfileGalleryImage, PublicProfile } from "@/lib/types";

type ProfileWithGallery = PublicProfile & { gallery?: ProfileGalleryImage[] };

type NearbyProfileState = {
  profile: ProfileWithGallery | null;
  loading: boolean;
  error: string | null;
};

interface NearbyListProps {
	users: NearbyUser[];
	loading: boolean;
	error?: string | null;
	onInvite?: (userId: string) => void;
	invitePendingId?: string | null;
	onChat?: (userId: string) => void;
  	onSelect?: (user: NearbyUser) => void;
  	selectedUserId?: string | null;
  	profileStates?: Record<string, NearbyProfileState>;
}

export function NearbyList({
  users,
  loading,
  error,
  onInvite,
  invitePendingId,
  onChat,
  onSelect,
  selectedUserId,
  profileStates,
}: NearbyListProps) {
	const [preview, setPreview] = useState<{ url: string; alt: string } | null>(null);

	const closePreview = useCallback(() => {
		setPreview(null);
	}, []);

	useEffect(() => {
		if (!preview) {
			return;
		}
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				closePreview();
			}
		};
		window.addEventListener("keydown", handleKey);
		const body = typeof document !== "undefined" ? document.body : null;
		if (body) {
			const original = body.style.overflow;
			body.style.overflow = "hidden";
			return () => {
				window.removeEventListener("keydown", handleKey);
				body.style.overflow = original;
			};
		}
		return () => {
			window.removeEventListener("keydown", handleKey);
		};
	}, [closePreview, preview]);

	if (error) {
		return <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>;
	}

	if (loading) {
		return <p className="text-sm text-slate-500">Looking for nearby friends…</p>;
	}

	if (users.length === 0) {
		return <p className="text-sm text-slate-500">Nobody is nearby yet.</p>;
	}

	const activePreview = preview;

	return (
		<>
			<ul className="flex flex-col gap-3">
			{users.map((user) => {
				const username = user.display_name || user.handle;
				const majorLabel = user.major?.trim() || "Major not listed";
				const isSelected = selectedUserId === user.user_id;
				const state = profileStates?.[user.user_id];
				const passions = state?.profile?.interests ?? [];
				const profileWithGallery = state?.profile as ProfileWithGallery | null;
				const galleryItems = profileWithGallery?.gallery?.filter((item) => Boolean(item?.url)).slice(0, 4) ?? [];
				return (
					<li
						key={user.user_id}
						className={`rounded-2xl border bg-white/95 px-4 py-3 shadow-sm transition ${
							isSelected ? "border-midnight shadow-md" : "border-slate-200 hover:border-slate-300"
						}`}
					>
						<div className="flex items-center justify-between gap-4">
							<button
								type="button"
								onClick={() => onSelect?.(user)}
								className={`flex flex-1 items-center gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight ${onSelect ? "cursor-pointer" : ""}`}
							>
								{user.avatar_url ? (
									<Image
										src={user.avatar_url}
										alt={username}
										width={64}
										height={64}
										sizes="64px"
										className="h-16 w-16 rounded-2xl object-cover shadow-sm"
									/>
								) : (
									<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-lg font-semibold text-slate-500">
										{(username || "?").slice(0, 1).toUpperCase()}
									</div>
								)}
								<div className="flex flex-col gap-1">
									<p className="text-sm font-semibold leading-tight text-slate-900">{username}</p>
									<p className="text-xs text-slate-600">{majorLabel}</p>
								</div>
							</button>
							<div className="flex flex-col items-end gap-2 text-right">
								<span className="text-xs font-medium text-slate-500">
									{formatDistance(user.distance_m ?? null)} away
								</span>
								{user.is_friend ? (
									<span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[0.65rem] font-semibold text-emerald-600">
										Friend
									</span>
								) : null}
																{onChat && user.is_friend ? (
									<button
										type="button"
																			className="inline-flex items-center rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-sky-500"
										onClick={() => onChat(user.user_id)}
									>
										Chat
									</button>
								) : null}
								{onInvite && !user.is_friend ? (
									<button
										type="button"
										className="inline-flex items-center rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
										onClick={() => onInvite(user.user_id)}
										disabled={invitePendingId === user.user_id}
									>
										{invitePendingId === user.user_id ? "Sending…" : "Invite"}
									</button>
								) : null}
							</div>
						</div>
						{isSelected ? (
							<div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
								{state?.loading ? (
									<p className="text-xs text-slate-500">Loading profile…</p>
								) : state?.error ? (
									<p className="text-xs text-rose-600">{state.error}</p>
								) : (
									<>
										{galleryItems.length > 0 ? (
											<div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
												{galleryItems.map((item) => (
													<button
														key={item.key ?? item.url}
														type="button"
														className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 transition hover:ring-slate-300"
														onClick={() => {
															const url = item.url ? String(item.url) : null;
															if (url) {
																setPreview({ url, alt: `${username} gallery photo` });
															}
														}}
														aria-label={`View ${username} photo`}
													>
														<Image
															src={String(item.url)}
															alt={`${username} gallery photo`}
															fill
															sizes="(max-width: 640px) 25vw, 120px"
															className="object-cover"
														/>
													</button>
												))}
											</div>
										) : (
											<p className="mb-3 text-xs text-slate-500">No gallery photos yet.</p>
										)}
										{passions.length > 0 ? (
											<div className="flex flex-wrap gap-1.5">
												{passions.slice(0, 6).map((passion) => (
													<span
														key={passion}
														className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-medium text-amber-800"
													>
														{passion}
													</span>
												))}
											</div>
										) : (
											<p className="text-xs text-slate-500">No passions shared yet.</p>
										)}
									</>
								)}
							</div>
						) : null}
					</li>
				);
			})}
			</ul>
			{activePreview ? (
			<div
				className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4"
				role="dialog"
				aria-modal="true"
				aria-label="Profile photo preview"
				onClick={closePreview}
			>
				<div
					className="relative w-full max-w-3xl"
					onClick={(event) => {
						event.stopPropagation();
					}}
				>
					<button
						type="button"
						className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
						onClick={closePreview}
						aria-label="Close photo preview"
					>
						×
					</button>
					<div className="overflow-hidden rounded-3xl bg-black">
						<Image
							src={activePreview.url}
							alt={activePreview.alt}
							width={1200}
							height={1600}
							className="h-auto w-full max-h-[80vh] object-contain"
							priority
						/>
					</div>
				</div>
			</div>
			) : null}
		</>
	);
}
