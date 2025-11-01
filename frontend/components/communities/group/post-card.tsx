"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import type { CurrentUser } from "@/lib/auth-guard";
import { useDeletePost, useEditPost } from "@/hooks/communities/use-create-post";
import type { GroupPost } from "@/lib/communities";

import { ReactionBar } from "../post/reaction-bar";
import { CommentThread } from "../comments/comment-thread";
import { TagSelector } from "./tag-selector";

function formatDateTime(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	const formatter = new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	return formatter.format(date);
}

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

type PostCardProps = {
 post: GroupPost;
 groupId: string;
 currentUser: CurrentUser;
};

export function PostCard({ post, groupId, currentUser }: PostCardProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [title, setTitle] = useState(post.title ?? "");
	const [body, setBody] = useState(post.body);
	const [tags, setTags] = useState<string[]>(post.topic_tags ?? []);
	const [editError, setEditError] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
 	const [showDiscussion, setShowDiscussion] = useState(false);

	const editMutation = useEditPost(groupId);
	const deleteMutation = useDeletePost(groupId);

	useEffect(() => {
		setTitle(post.title ?? "");
		setBody(post.body);
		setTags(post.topic_tags ?? []);
	}, [post.body, post.id, post.title, post.topic_tags]);

	const authorName = useMemo(() => {
		return post.author.display_name || post.author.handle || "Unknown member";
	}, [post.author.display_name, post.author.handle]);
	const authorInitial = useMemo(() => authorName.charAt(0).toUpperCase(), [authorName]);
	const createdAt = useMemo(() => formatDateTime(post.created_at), [post.created_at]);
	const updatedAt = useMemo(() => (post.updated_at !== post.created_at ? formatDateTime(post.updated_at) : null), [post.created_at, post.updated_at]);
 	const commentCountLabel = useMemo(() => {
 		const count = post.comments_count ?? 0;
 		if (count === 0) {
 			return "No comments yet";
 		}
 		return count === 1 ? "1 comment" : `${count} comments`;
 	}, [post.comments_count]);

	const handleEditToggle = useCallback(() => {
		setIsEditing((prev) => !prev);
		setEditError(null);
	}, []);

	const handleCancelEdit = useCallback(() => {
		setIsEditing(false);
		setTitle(post.title ?? "");
		setBody(post.body);
		setTags(post.topic_tags ?? []);
		setEditError(null);
	}, [post.body, post.title, post.topic_tags]);

	const handleSave = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setEditError(null);
			try {
				await editMutation.mutateAsync({
					postId: post.id,
					title: title.trim() ? title.trim() : undefined,
					body,
					tags,
				});
				setIsEditing(false);
			} catch (error) {
				setEditError(error instanceof Error ? error.message : "Failed to update post.");
			}
		},
		[body, editMutation, post.id, tags, title],
	);

	const handleDelete = useCallback(async () => {
		setDeleteError(null);
		try {
			await deleteMutation.mutateAsync(post.id);
			setConfirmDelete(false);
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : "Failed to delete post.");
		}
	}, [deleteMutation, post.id]);

	return (
		<article id={`post-${post.id}`} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="flex items-start gap-3">
				<div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
					{post.author.avatar_url ? (
						/* eslint-disable-next-line @next/next/no-img-element */
						<img src={post.author.avatar_url} alt={authorName} className="h-full w-full object-cover" />
					) : (
						authorInitial
					)}
				</div>
				<div className="flex flex-1 flex-col">
					<p className="text-sm font-semibold text-slate-900">{authorName}</p>
					<p className="text-xs text-slate-500">
						{createdAt}
						{updatedAt ? ` • Updated ${updatedAt}` : ""}
					</p>
				</div>
				<div className="flex shrink-0 gap-2">
					{post.editable ? (
						<button
							type="button"
							onClick={handleEditToggle}
							className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-midnight hover:text-midnight"
						>
							{isEditing ? "Close" : "Edit"}
						</button>
					) : null}
					{post.deletable ? (
						<button
							type="button"
							onClick={() => setConfirmDelete((prev) => !prev)}
							className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:text-red-700"
						>
							Delete
						</button>
					) : null}
				</div>
			</header>

			{isEditing ? (
				<form onSubmit={handleSave} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
					<div className="grid gap-2">
						<label htmlFor={`edit-title-${post.id}`} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
							Title
						</label>
						<input
							type="text"
							id={`edit-title-${post.id}`}
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20"
						/>
					</div>
					<div className="grid gap-2">
						<label htmlFor={`edit-body-${post.id}`} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
							Message
						</label>
						<textarea
							id={`edit-body-${post.id}`}
							value={body}
							onChange={(event) => setBody(event.target.value)}
							rows={5}
							className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20"
						/>
					</div>
					<TagSelector value={tags} onChange={setTags} />
					{editError ? <p className="text-xs text-red-600">{editError}</p> : null}
					<div className="flex items-center justify-end gap-2">
						<button
							type="button"
							onClick={handleCancelEdit}
							className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={editMutation.isPending}
							className="rounded-full bg-midnight px-4 py-2 text-xs font-semibold text-white shadow-sm transition enabled:hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
						>
							{editMutation.isPending ? "Saving…" : "Save"}
						</button>
					</div>
				</form>
			) : (
				<div className="space-y-3">
					{post.title ? <h3 className="text-lg font-semibold text-slate-900">{post.title}</h3> : null}
					<p className="whitespace-pre-wrap text-sm text-slate-800">{post.body}</p>
					{post.topic_tags?.length ? (
						<ul className="flex flex-wrap gap-2 text-xs text-slate-600">
							{post.topic_tags.map((tag) => (
								<li key={tag} className="rounded-full bg-slate-100 px-3 py-1 font-semibold">
									#{tag}
								</li>
							))}
						</ul>
					) : null}
				</div>
			)}

			{post.attachments.length ? (
				<ul className="grid gap-3 sm:grid-cols-2">
					{post.attachments.map((attachment) => (
						<li key={attachment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
							<p className="font-medium text-slate-800" title={attachment.s3_key}>
								{attachment.s3_key.split("/").pop() ?? attachment.s3_key}
							</p>
							<p className="text-xs text-slate-500">{attachment.mime} • {formatFileSize(attachment.size_bytes)}</p>
							{attachment.url ? (
								<a
									href={attachment.url}
									target="_blank"
									rel="noreferrer"
									className="mt-2 inline-flex text-xs font-semibold text-midnight hover:underline"
								>
									Open file
								</a>
							) : null}
						</li>
					))}
				</ul>
			) : null}

			{confirmDelete ? (
				<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
					<p className="font-semibold">Delete this post?</p>
					<p className="text-red-600">This action cannot be undone.</p>
					{deleteError ? <p className="text-xs text-red-600">{deleteError}</p> : null}
					<div className="mt-3 flex gap-2">
						<button
							type="button"
							onClick={() => setConfirmDelete(false)}
							className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:text-red-700"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleDelete}
							disabled={deleteMutation.isPending}
							className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition enabled:hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
						>
							{deleteMutation.isPending ? "Deleting…" : "Delete"}
						</button>
					</div>
				</div>
			) : null}

			<footer className="space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<ReactionBar subject={{ type: "post", postId: post.id }} reactions={post.reactions ?? []} />
					<button
						type="button"
						onClick={() => setShowDiscussion((prev) => !prev)}
						className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-midnight hover:text-midnight"
						aria-expanded={showDiscussion ? "true" : "false"}
					>
						{showDiscussion ? "Hide comments" : `View comments (${post.comments_count ?? 0})`}
					</button>
				</div>
				<p className="text-xs text-slate-500">{commentCountLabel}</p>
				{showDiscussion ? <CommentThread postId={post.id} currentUser={currentUser} /> : null}
			</footer>
		</article>
	);
}
