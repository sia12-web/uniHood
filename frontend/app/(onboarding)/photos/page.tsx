
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Camera } from "lucide-react";

import { fetchProfile, presignAvatar, commitAvatar } from "@/lib/identity";
import { readAuthSnapshot } from "@/lib/auth-storage";


// Dynamic imports for heavy components - only load when needed
const PhotoAdjuster = dynamic(() => import("@/components/photo-adjuster/PhotoAdjuster"), {
	loading: () => <div className="w-full h-48 bg-slate-100 animate-pulse rounded-xl" />,
	ssr: false,
});



type PresignResponse = Awaited<ReturnType<typeof presignAvatar>>;

export default function PhotosPage() {
	const router = useRouter();
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

	const [uploading, setUploading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [campusId, setCampusId] = useState<string | null>(null);



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



	const handlePhotoConfirm = async (blob: Blob) => {
		setError(null);
		setUploading(true);


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
			router.push("/welcome");
		} catch (err) {
			console.error(err);
			setError("Failed to continue. Please try again.");
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="w-full flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
				<div className="w-full max-w-2xl space-y-8">
					{/* Skeleton header */}
					<div className="flex flex-col items-center">
						<div className="h-9 w-48 bg-slate-200 rounded-lg animate-pulse mt-6" />
						<div className="h-5 w-64 bg-slate-100 rounded animate-pulse mt-2" />
					</div>
					{/* Skeleton avatar */}
					<div className="mt-8 flex flex-col items-center">
						<div className="h-32 w-32 rounded-full bg-slate-200 animate-pulse" />
					</div>
					{/* Skeleton options */}
					<div className="mt-8 grid gap-8 sm:grid-cols-2">
						<div className="h-48 bg-slate-100 rounded-xl animate-pulse" />
						<div className="h-48 bg-slate-100 rounded-xl animate-pulse" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<>
			{/* Modal Overlay for Avatar Creator */}


			<div className="w-full flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
				<div className="w-full max-w-2xl space-y-8">
					<div className="flex flex-col items-center">
						<h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900">
							Choose Your Look
						</h2>
						<p className="mt-2 text-center text-sm text-slate-600">
							Be yourself or go incognito. You can change this anytime.
						</p>
					</div>

					<div className="mt-8 flex flex-col items-center">
						<div className="relative h-32 w-32 overflow-hidden rounded-full border-4 border-white shadow-xl ring-1 ring-slate-100">
							{avatarUrl ? (
								<Image
									src={avatarUrl}
									alt="Current avatar"
									fill
									className="object-cover"
									sizes="128px"
									priority
									unoptimized
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
					</div>

					{error && (
						<div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
							{error}
						</div>
					)}

					<div className="mt-8 mx-auto w-full max-w-sm">
						{/* Option 1: Real Me */}
						<div className="flex flex-col gap-3">
							<div className="flex items-center gap-2 px-1">
								<div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-rose-600">
									<Camera className="h-4 w-4" />
								</div>
								<h3 className="text-sm font-bold text-slate-900">Real Me</h3>
							</div>

							<PhotoAdjuster
								onConfirm={handlePhotoConfirm}
								onCancel={() => { }}
								aspectRatio="square"
								className="w-full shadow-sm"
							/>
						</div>


					</div>

					<div className="flex items-center justify-between pt-6">
						<button
							type="button"
							onClick={() => router.push("/vision")}
							className="text-sm font-medium text-slate-600 hover:text-slate-900"
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
								className="group relative flex justify-center rounded-md bg-indigo-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
							>
								{saving ? "Saving..." : "Continue"}
							</button>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

