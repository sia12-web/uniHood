"use client";

import type { UploadAttachment } from "@/hooks/communities/use-upload";

function formatFileSize(bytes: number) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function AttachmentGrid({
	attachments,
	onRemove,
	onRetry,
}: {
	attachments: UploadAttachment[];
	onRemove: (id: string) => void;
	onRetry: (id: string) => void;
}) {
	if (attachments.length === 0) {
		return null;
	}

	return (
		<ul className="grid gap-3 sm:grid-cols-2">
			{attachments.map((attachment) => {
				const isImage = attachment.mime.startsWith("image/");
				const isVideo = attachment.mime.startsWith("video/");
				return (
					<li key={attachment.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
						<div className="h-16 w-16 overflow-hidden rounded-xl bg-slate-100">
							{isImage ? (
								/* eslint-disable-next-line @next/next/no-img-element */
								<img src={attachment.previewUrl} alt={attachment.fileName} className="h-full w-full object-cover" />
							) : (
								<div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
									{isVideo ? "Video" : "File"}
								</div>
							)}
						</div>
						<div className="flex flex-1 flex-col gap-1 text-sm">
							<p className="font-medium text-slate-900" title={attachment.fileName}>
								{attachment.fileName}
							</p>
							<p className="text-xs text-slate-500">{formatFileSize(attachment.size)}</p>
							{attachment.status === "uploading" ? (
								<p className="text-xs text-slate-500">Uploading {attachment.progress}%</p>
							) : null}
							{attachment.status === "error" ? <p className="text-xs text-amber-600">{attachment.error ?? "Upload failed"}</p> : null}
						</div>
						<div className="flex flex-col items-end gap-2">
							{attachment.status === "error" ? (
								<button
									type="button"
									onClick={() => onRetry(attachment.id)}
									className="rounded-full border border-amber-400 px-3 py-1 text-xs font-semibold text-amber-600 transition hover:border-amber-500 hover:text-amber-700"
								>
									Retry
								</button>
							) : null}
							<button
								type="button"
								onClick={() => onRemove(attachment.id)}
								className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
							>
								Remove
							</button>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
