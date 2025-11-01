"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import type { CurrentUser } from "@/lib/auth-guard";
import { useCreatePost } from "@/hooks/communities/use-create-post";
import { useUpload } from "@/hooks/communities/use-upload";

import { AttachmentGrid } from "./post-attachment-grid";
import { TagSelector } from "./tag-selector";

type ComposerProps = {
	groupId: string;
	currentUser: CurrentUser;
};

export function PostComposer({ groupId, currentUser }: ComposerProps) {
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [tags, setTags] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const {
		attachments,
		readyAttachments,
		onAddFiles,
		onRemove,
		onRetry,
		error: uploadError,
		reset,
		isUploading,
	} = useUpload();

	const mutation = useCreatePost(groupId, currentUser);

	const isSubmitting = mutation.isPending;
	const canSubmit = useMemo(() => {
		return !isSubmitting && !isUploading;
	}, [isSubmitting, isUploading]);

	const handleFileChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			if (event.target.files) {
				onAddFiles(event.target.files);
				event.target.value = "";
			}
		},
		[onAddFiles],
	);

	const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setError(null);
			try {
				await mutation.mutateAsync({
					title: title.trim() ? title.trim() : undefined,
					body,
					tags,
					attachments: readyAttachments,
				});
				setTitle("");
				setBody("");
				setTags([]);
				reset();
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
			} catch (submitError) {
				setError(submitError instanceof Error ? submitError.message : "Failed to post. Please try again.");
			}
		},
		[body, mutation, readyAttachments, reset, tags, title],
	);

	return (
		<form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="flex flex-col gap-1">
				<h2 className="text-base font-semibold text-slate-900">Share something with the group</h2>
				<p className="text-sm text-slate-500">Posts support optional titles, tags, and up to 10 attachments.</p>
			</header>
			<div className="grid gap-4">
				<div className="grid gap-2">
					<label htmlFor="post-title" className="text-sm font-medium text-slate-700">
						Title
					</label>
					<input
						type="text"
						id="post-title"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="Optional headline"
						maxLength={140}
						className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20"
						disabled={isSubmitting}
					/>
				</div>
				<div className="grid gap-2">
					<label htmlFor="post-body" className="text-sm font-medium text-slate-700">
						Message
					</label>
					<textarea
						id="post-body"
						value={body}
						onChange={(event) => setBody(event.target.value)}
						placeholder="What should everyone know?"
						rows={6}
						className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20"
						disabled={isSubmitting}
					/>
				</div>
				<TagSelector value={tags} onChange={setTags} disabled={isSubmitting} />
			</div>
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-3">
					<input
						ref={fileInputRef}
						id="post-attachments"
						type="file"
						multiple
						className="hidden"
						onChange={handleFileChange}
						disabled={isSubmitting}
					/>
					<label
						htmlFor="post-attachments"
						className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-midnight hover:text-midnight focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-midnight"
					>
						Add attachments
					</label>
					{uploadError ? <p className="text-sm text-amber-600">{uploadError}</p> : null}
				</div>
				<AttachmentGrid attachments={attachments} onRemove={onRemove} onRetry={onRetry} />
			</div>
			{error ? <p className="text-sm text-red-600">{error}</p> : null}
			<div className="flex items-center justify-end gap-3">
				<button
					type="submit"
					disabled={!canSubmit}
					className="inline-flex items-center gap-2 rounded-full bg-midnight px-5 py-2 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
				>
					{isSubmitting ? "Posting…" : "Post"}
				</button>
			</div>
		</form>
	);
}
