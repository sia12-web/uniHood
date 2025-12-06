
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ghost, Camera, Sparkles } from "lucide-react";

import { fetchProfile, presignAvatar, commitAvatar } from "@/lib/identity";
import { readAuthSnapshot } from "@/lib/auth-storage";
import PhotoAdjuster from "@/components/photo-adjuster/PhotoAdjuster";
import AvatarCreator from "@/components/avatar-creator/AvatarCreator";
import { AvatarState } from "@/components/avatar-creator/types";

type PresignResponse = Awaited<ReturnType<typeof presignAvatar>>;

export default function PhotosPage() {
	const router = useRouter();
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

	const [uploading, setUploading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [campusId, setCampusId] = useState<string | null>(null);

	const [showAvatarCreator, setShowAvatarCreator] = useState(false);

	useEffect(() => {
		const load = async () => {
			try {
				const auth = readAuthSnapshot();
				if (!auth?.user_id) {
					router.replace("/login");
					return;
				}
				const profile = await fetchProfile(auth.user_id, null);
				setAvatarUrl(profile.avatar_url ?? null);
				setCampusId(profile.campus_id ?? null);
			} catch (err) {
				console.error("Failed to load profile", err);
				setError("Unable to load your profile. Please try again.");
			} finally {
				setLoading(false);
			}
		};
		void load();
	}, [router]);

	const canContinue = useMemo(() => Boolean(avatarUrl), [avatarUrl]);

	const [avatarState, setAvatarState] = useState<AvatarState | undefined>(undefined);

	useEffect(() => {
		// Load saved avatar state
		try {
			const saved = localStorage.getItem("divan.avatar_state");
			if (saved) {
				setAvatarState(JSON.parse(saved));
			}
		} catch {
			// ignore
		}
	}, []);

	const handlePhotoConfirm = async (blob: Blob, state?: AvatarState) => {
		setError(null);
		setUploading(true);
		setShowAvatarCreator(false);

		if (state) {
			try {
				localStorage.setItem("divan.avatar_state", JSON.stringify(state));
				setAvatarState(state);
			} catch {
				// ignore
			}
		}

		try {
			const auth = readAuthSnapshot();
			if (!auth?.user_id) {
				router.replace("/login");
				return;
			}

			// 1. Get presigned URL
			const presigned: PresignResponse = await presignAvatar(auth.user_id, campusId, {
				mime: blob.type,
				bytes: blob.size,
			});

			// 2. Upload to S3/Storage
			await fetch(presigned.url, {
				method: "PUT",
				headers: {
					"Content-Type": blob.type,
				},
				body: blob,
			});

			// 3. Commit the upload
			const key = (presigned as { fields?: { key?: string } }).fields?.key ?? presigned.key ?? presigned.url;
			const updated = await commitAvatar(auth.user_id, campusId, key);

			setAvatarUrl(updated.avatar_url ?? null);
		} catch (err) {
			console.error("Upload failed", err);
			setError("Failed to upload photo. Please try again.");
		} finally {
			setUploading(false);
		}
	};

	const handleContinue = async () => {
		setSaving(true);
		try {
			const auth = readAuthSnapshot();
			if (!auth?.user_id) {
				router.replace("/login");
				return;
			}
			router.push("/set-profile");
		} catch (err) {
			console.error(err);
			setError("Failed to continue. Please try again.");
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return <div className="flex min-h-[60vh] items-center justify-center text-slate-500">Loading...</div>;
	}

	return (
		<div className="flex min-h-screen w-full flex-col bg-slate-50">
			{/* Modal Overlay for Avatar Creator */}
			{showAvatarCreator && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
					<div className="w-full max-w-4xl animate-in fade-in zoom-in duration-200">
						<AvatarCreator
							onSave={handlePhotoConfirm}
							onCancel={() => setShowAvatarCreator(false)}
							initialState={avatarState}
							className="max-h-[90vh]"
						/>
					</div>
				</div>
			)}

			<div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-4 sm:p-6 lg:py-12">

				{/* Header Section */}
				<div className="flex flex-col items-center text-center">
					<h2 className="text-3xl font-bold tracking-tight text-slate-900">
						Choose Your Look
					</h2>
					<p className="mt-2 text-lg text-slate-600">
						Be yourself or go incognito. You can change this anytime.
					</p>
				</div>

				{/* Current Photo Display */}
				<div className="flex flex-col items-center">
					<div className="relative h-40 w-40 overflow-hidden rounded-full border-4 border-white shadow-xl ring-1 ring-slate-100">
						{avatarUrl ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={avatarUrl}
								alt="Current avatar"
								className="h-full w-full object-cover"
							/>
						) : (
							<div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
								No photo
							</div>
						)}

						{uploading && (
							<div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
								<div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
							</div>
						)}
					</div>
					<p className="mt-3 text-sm font-medium text-slate-500 uppercase tracking-wider">Current Photo</p>
				</div>

				{error && (
					<div className="mx-auto w-full max-w-md rounded-xl bg-red-50 p-4 text-center text-sm text-red-700 border border-red-100">
						{error}
					</div>
				)}

				{/* Split Layout Options */}
				<div className="grid gap-8 lg:grid-cols-2 lg:gap-12">

					{/* Option 1: Real Me */}
					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-3 px-2">
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
								<Camera className="h-5 w-5" />
							</div>
							<div>
								<h3 className="text-lg font-bold text-slate-900">Real Me</h3>
								<p className="text-sm text-slate-500">Upload a photo to get 3x more connections.</p>
							</div>
						</div>

						<PhotoAdjuster
							onConfirm={handlePhotoConfirm}
							onCancel={() => { }}
							aspectRatio="square"
							className="w-full shadow-md"
						/>
					</div>

					{/* Option 2: Ghost Mode */}
					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-3 px-2">
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
								<Ghost className="h-5 w-5" />
							</div>
							<div>
								<h3 className="text-lg font-bold text-slate-900">Ghost Mode</h3>
								<p className="text-sm text-slate-500">Create a custom avatar to stay anonymous.</p>
							</div>
						</div>

						<div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-md transition-all hover:shadow-lg">
							<div className="mb-6 rounded-full bg-indigo-50 p-6">
								<Sparkles className="h-12 w-12 text-indigo-500" />
							</div>
							<h4 className="text-xl font-bold text-slate-900">Design Your Avatar</h4>
							<p className="mt-2 max-w-xs text-slate-600">
								Mix and match styles to create a unique look that represents you.
							</p>
							<button
								onClick={() => setShowAvatarCreator(true)}
								className="mt-8 rounded-xl bg-indigo-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-transform hover:scale-105 hover:bg-indigo-700 active:scale-95"
							>
								Open Creator
							</button>
						</div>
					</div>
				</div>

				{/* Navigation Footer */}
				<div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-8">
					<button
						type="button"
						onClick={() => router.push("/passions")}
						className="text-sm font-semibold text-slate-600 hover:text-slate-900"
					>
						Back
					</button>
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => router.push("/set-profile")}
							className="text-sm font-medium text-slate-500 hover:text-slate-700"
						>
							Skip
						</button>
						<button
							type="button"
							onClick={handleContinue}
							disabled={saving || !canContinue}
							className="group relative flex justify-center rounded-xl bg-[#d64045] px-8 py-3 text-base font-bold text-white shadow-md transition hover:bg-[#c7343a] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
						>
							{saving ? "Saving..." : "Continue"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

