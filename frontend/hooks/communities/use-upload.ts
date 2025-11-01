import { useCallback, useEffect, useMemo, useState } from "react";

import { presignUpload, type PresignResponse } from "@/lib/communities";

const MAX_ATTACHMENTS = 10;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/", "video/", "application/pdf"];

export type UploadStatus = "idle" | "uploading" | "uploaded" | "error";

type UploadedMeta = {
	s3_key: string;
	mime: string;
	size_bytes: number;
	width?: number | null;
	height?: number | null;
};

export type UploadAttachment = {
	id: string;
	file: File;
	fileName: string;
	mime: string;
	size: number;
	previewUrl: string;
	status: UploadStatus;
	progress: number;
	error?: string;
	meta?: UploadedMeta;
};

export type ReadyAttachment = {
	id: string;
	fileName: string;
	previewUrl: string;
	meta: UploadedMeta;
};

function isAllowedMime(mime: string) {
	return ALLOWED_MIME_PREFIXES.some((prefix) => (prefix.endsWith("/") ? mime.startsWith(prefix) : mime === prefix));
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number } | undefined> {
	if (!file.type.startsWith("image/")) {
		return undefined;
	}
	const url = URL.createObjectURL(file);
	try {
		const dimensions = await new Promise<{ width: number; height: number } | undefined>((resolve) => {
			const image = new Image();
			image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
			image.onerror = () => resolve(undefined);
			image.src = url;
		});
		return dimensions;
	} finally {
		URL.revokeObjectURL(url);
	}
}

function uploadWithProgress(presign: PresignResponse, file: File, onProgress: (value: number) => void) {
	return new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.upload.onprogress = (event) => {
			if (!event.lengthComputable) {
				return;
			}
			onProgress(Math.round((event.loaded / event.total) * 100));
		};
		xhr.onerror = () => reject(new Error("Upload failed"));
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				onProgress(100);
				resolve();
			} else {
				reject(new Error(`Upload failed: ${xhr.status}`));
			}
		};

		if (presign.fields) {
			const form = new FormData();
			Object.entries(presign.fields).forEach(([key, value]) => {
				form.append(key, value);
			});
			form.append("file", file);
			xhr.open("POST", presign.url, true);
			xhr.send(form);
			return;
		}

		xhr.open(presign.method ?? "PUT", presign.url, true);
		if (presign.headers) {
			Object.entries(presign.headers).forEach(([key, value]) => {
				xhr.setRequestHeader(key, value);
			});
		}
		xhr.setRequestHeader("Content-Type", file.type);
		xhr.send(file);
	});
}

export function useUpload() {
	const [attachments, setAttachments] = useState<UploadAttachment[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		return () => {
			attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
		};
	}, [attachments]);

	const startUpload = useCallback(async (id: string, file: File) => {
		try {
			const presign = await presignUpload({ mime: file.type, size_bytes: file.size, purpose: "post" });
			await uploadWithProgress(presign, file, (progress) => {
				setAttachments((prev) =>
					prev.map((item) =>
						item.id === id ? { ...item, progress, status: progress === 100 ? "uploaded" : "uploading" } : item,
					),
				);
			});
			const dimensions = await getImageDimensions(file);
			setAttachments((prev) =>
				prev.map((item) =>
					item.id === id
						? {
							...item,
							status: "uploaded",
							progress: 100,
							meta: {
								s3_key: presign.key,
								mime: file.type,
								size_bytes: file.size,
								width: dimensions?.width ?? null,
								height: dimensions?.height ?? null,
							},
						}
						: item,
				),
			);
		} catch (uploadError) {
			console.warn("Attachment upload failed", uploadError);
			setAttachments((prev) =>
				prev.map((item) => (item.id === id ? { ...item, status: "error", error: "Upload failed", progress: 0 } : item)),
			);
		}
	}, []);

	const addFiles = useCallback(
		(files: FileList | File[]) => {
			const list = Array.from(files instanceof FileList ? Array.from(files) : files);
			if (attachments.length + list.length > MAX_ATTACHMENTS) {
				setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
				return;
			}

			for (const file of list) {
				if (file.size > MAX_FILE_SIZE_BYTES) {
					setError("Files must be 100MB or smaller.");
					continue;
				}
				if (!isAllowedMime(file.type)) {
					setError("Unsupported file type.");
					continue;
				}

				const id = crypto.randomUUID();
				const previewUrl = URL.createObjectURL(file);
				setAttachments((prev) => [
					...prev,
					{
						id,
						file,
						fileName: file.name,
						mime: file.type,
						size: file.size,
						previewUrl,
						status: "uploading",
						progress: 0,
					},
				]);
				void startUpload(id, file);
			}
		},
		[attachments.length, startUpload],
	);

	const removeAttachment = useCallback((id: string) => {
		setAttachments((prev) => {
			const target = prev.find((item) => item.id === id);
			if (target) {
				URL.revokeObjectURL(target.previewUrl);
			}
			return prev.filter((item) => item.id !== id);
		});
	}, []);

	const retryAttachment = useCallback(
		(id: string) => {
			setAttachments((prev) =>
				prev.map((item) =>
					item.id === id
						? {
							...item,
							status: "uploading",
							error: undefined,
							progress: 0,
						}
						: item,
				),
			);
			const target = attachments.find((item) => item.id === id);
			if (target) {
				void startUpload(id, target.file);
			}
		},
		[attachments, startUpload],
	);

	const reset = useCallback(() => {
		attachments.forEach((item) => URL.revokeObjectURL(item.previewUrl));
		setAttachments([]);
		setError(null);
	}, [attachments]);

	const readyAttachments = useMemo<ReadyAttachment[]>(
		() =>
			attachments
				.filter((item): item is UploadAttachment & { meta: UploadedMeta } => item.status === "uploaded" && Boolean(item.meta))
				.map((item) => ({ id: item.id, fileName: item.fileName, previewUrl: item.previewUrl, meta: item.meta })),
		[attachments],
	);

	return {
		attachments,
		readyAttachments,
		onAddFiles: addFiles,
		onRemove: removeAttachment,
		onRetry: retryAttachment,
		error,
		reset,
		isUploading: attachments.some((item) => item.status === "uploading"),
	};
}
