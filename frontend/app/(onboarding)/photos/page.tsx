"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchProfile, presignAvatar, commitAvatar } from "@/lib/identity";
import { readAuthSnapshot } from "@/lib/auth-storage";

type PresignResponse = Awaited<ReturnType<typeof presignAvatar>>;

export default function PhotosPage() {
	const router = useRouter();
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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

	const canContinue = useMemo(() => Boolean(avatarUrl || previewUrl), [avatarUrl, previewUrl]);

	const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		setError(null);
		setUploading(true);
		try {
			const auth = readAuthSnapshot();
			if (!auth?.user_id) {
				router.replace("/login");
				return;
			}
			const presigned: PresignResponse = await presignAvatar(auth.user_id, campusId, {
				mime: file.type || "application/octet-stream",
				bytes: file.size,
			});
			await fetch(presigned.url, {
				method: "PUT",
				headers: {
					"Content-Type": file.type || "application/octet-stream",
				},
				body: file,
			});
			const key = (presigned as any).fields?.key ?? presigned.key ?? presigned.url;
			const updated = await commitAvatar(auth.user_id, campusId, key);
			setAvatarUrl(updated.avatar_url ?? null);
			setPreviewUrl(null);
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
			// No extra fields; avatar is already committed. Proceed.
			router.push("/select-courses");
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
		<div className="w-full flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
			<div className="w-full max-w-2xl space-y-8">
				<div className="flex flex-col items-center">
					<h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900">
						Add a photo
					</h2>
					<p className="mt-2 text-center text-sm text-slate-600">
						Profiles with a photo get more connections. You can change this later.
					</p>
				</div>

				{error && (
					<div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
						{error}
					</div>
				)}

				<div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
					<div className="relative h-36 w-36 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
						{avatarUrl || previewUrl ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={previewUrl ?? avatarUrl ?? ""}
								alt="Avatar preview"
								className="h-full w-full object-cover"
							/>
						) : (
							<div className="flex h-full w-full items-center justify-center text-slate-400">
								No photo
							</div>
						)}
					</div>
					<label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
						<input
							type="file"
							accept="image/*"
							className="hidden"
							disabled={uploading}
							onChange={handleFileChange}
						/>
						{uploading ? "Uploading..." : "Upload a photo"}
					</label>
					<p className="text-xs text-slate-500">JPG or PNG. Square crops look best.</p>
				</div>

				<div className="flex items-center justify-between">
					<button
						type="button"
						onClick={() => router.push("/passions")}
						className="text-sm font-semibold text-slate-600 hover:text-slate-900"
					>
						Back
					</button>
					<button
						type="button"
						onClick={handleContinue}
						disabled={saving || !canContinue}
						className="group relative flex justify-center rounded-md border border-transparent bg-[#d64045] px-4 py-2 text-sm font-medium text-white hover:bg-[#c7343a] focus:outline-none focus:ring-2 focus:ring-[#f2b8bf] focus:ring-offset-2 disabled:opacity-70"
					>
						{saving ? "Saving..." : "Continue"}
					</button>
				</div>
			</div>
		</div>
	);
}
