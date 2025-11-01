import "@testing-library/jest-dom/vitest";

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { GroupPost } from "@/lib/communities";
import { PostComposer } from "@/components/communities/group/post-composer";
import { PostCard } from "@/components/communities/group/post-card";
import { useDeletePost, useEditPost, useCreatePost } from "@/hooks/communities/use-create-post";
import { useUpload } from "@/hooks/communities/use-upload";
import { useReaction } from "@/hooks/communities/use-reaction";

vi.mock("@/hooks/communities/use-create-post", () => ({
	useCreatePost: vi.fn(),
	useDeletePost: vi.fn(),
	useEditPost: vi.fn(),
}));

vi.mock("@/hooks/communities/use-upload", () => ({
	useUpload: vi.fn(),
}));

vi.mock("@/hooks/communities/use-reaction", () => ({
	useReaction: vi.fn(() => ({ addReaction: vi.fn(), removeReaction: vi.fn(), isProcessing: false })),
}));

vi.mock("@/components/communities/group/tag-selector", () => ({
	TagSelector: ({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) => (
		<div>
			<span data-testid="selected-tags">{value.join(",")}</span>
			<button type="button" onClick={() => onChange([...value, "design"])}>
				Add Tag
			</button>
		</div>
	),
}));

const readyAttachments = [
	{
		id: "upload-1",
		fileName: "mock.png",
		previewUrl: "blob://mock",
		meta: {
			s3_key: "mock/key.png",
			mime: "image/png",
			size_bytes: 1024,
			width: 100,
			height: 100,
		},
	},
];

const currentUser = {
	id: "user-1",
	display_name: "Skylar",
	handle: "skylar",
} as const;

const basePost: GroupPost = {
	id: "post-1",
	group_id: "group-1",
	title: "Prototype kickoff",
	body: "Grab your tools.",
	topic_tags: ["hardware"],
	attachments: [
		{
			id: "file-1",
			s3_key: "uploads/file-1",
			mime: "application/pdf",
			size_bytes: 2048,
			url: "https://example.com/file-1",
		},
	],
	author: {
		id: "user-1",
		display_name: "Skylar",
		handle: "skylar",
		avatar_url: null,
	},
	created_at: new Date("2025-10-24T10:00:00Z").toISOString(),
	updated_at: new Date("2025-10-24T10:00:00Z").toISOString(),
	pinned_at: null,
	editable: true,
	deletable: true,
	reactions: [],
	comments_count: 0,
};

const mutateAsyncMock = vi.fn();
const editMutateMock = vi.fn();
const deleteMutateMock = vi.fn();
const resetMock = vi.fn();
const useCreatePostMock = useCreatePost as unknown as Mock;
const useEditPostMock = useEditPost as unknown as Mock;
const useDeletePostMock = useDeletePost as unknown as Mock;
const useUploadMock = useUpload as unknown as Mock;
const useReactionMock = useReaction as unknown as Mock;

beforeEach(() => {
	mutateAsyncMock.mockReset().mockResolvedValue({ id: "post-created" });
	editMutateMock.mockReset().mockResolvedValue({ ...basePost, body: "Updated" });
	deleteMutateMock.mockReset().mockResolvedValue(undefined);
	resetMock.mockReset();

	useCreatePostMock.mockReturnValue({ mutateAsync: mutateAsyncMock, isPending: false });
	useEditPostMock.mockReturnValue({ mutateAsync: editMutateMock, isPending: false });
	useDeletePostMock.mockReturnValue({ mutateAsync: deleteMutateMock, isPending: false });
	useUploadMock.mockReturnValue({
		attachments: [],
		readyAttachments,
		onAddFiles: vi.fn(),
		onRemove: vi.fn(),
		onRetry: vi.fn(),
		error: null,
		reset: resetMock,
		isUploading: false,
	});
	useReactionMock.mockReturnValue({ addReaction: vi.fn(), removeReaction: vi.fn(), isProcessing: false });
});

describe("PostComposer", () => {
	it("submits composed data and resets the form", async () => {
		render(<PostComposer groupId="group-1" currentUser={currentUser} />);

		fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "  Campus Update  " } });
		fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "We shipped the beta." } });
		fireEvent.click(screen.getByRole("button", { name: "Add Tag" }));

		fireEvent.click(screen.getByRole("button", { name: "Post" }));

		await waitFor(() => {
			expect(mutateAsyncMock).toHaveBeenCalledWith({
				title: "Campus Update",
				body: "We shipped the beta.",
				tags: ["design"],
				attachments: readyAttachments,
			});
		});

		expect(resetMock).toHaveBeenCalled();
		expect(screen.getByLabelText(/title/i)).toHaveValue("");
		expect(screen.getByLabelText(/message/i)).toHaveValue("");
		expect(screen.getByTestId("selected-tags")).toHaveTextContent("");
	});
});

describe("PostCard", () => {
	it("allows editing the post body", async () => {
		render(<PostCard groupId="group-1" post={basePost} currentUser={currentUser} />);

		fireEvent.click(screen.getByRole("button", { name: /edit/i }));
		fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Updated announcement" } });

		fireEvent.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(editMutateMock).toHaveBeenCalledWith({
				postId: "post-1",
				title: "Prototype kickoff",
				body: "Updated announcement",
				tags: ["hardware"],
			});
		});
	});

	it("confirms and deletes a post", async () => {
		render(<PostCard groupId="group-1" post={basePost} currentUser={currentUser} />);

		fireEvent.click(screen.getByRole("button", { name: /delete/i }));

		const confirmPanel = screen.getByText(/delete this post\?/i).closest("div");
		if (!confirmPanel) {
			throw new Error("Confirm delete panel not rendered");
		}

		fireEvent.click(within(confirmPanel).getByRole("button", { name: /^delete$/i }));

		await waitFor(() => {
			expect(deleteMutateMock).toHaveBeenCalledWith("post-1");
		});
	});
});
