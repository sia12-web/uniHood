import "@testing-library/jest-dom/vitest";

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FriendList } from "@/components/FriendList";
import { InviteInbox } from "@/components/InviteInbox";
import type { FriendRow, InviteSummary } from "@/lib/types";

describe("InviteInbox", () => {
	const baseInvite: InviteSummary = {
		id: "inv-1",
		from_user_id: "user-a",
		to_user_id: "user-b",
		status: "sent",
		created_at: new Date("2025-01-01T00:00:00Z").toISOString(),
		updated_at: new Date("2025-01-01T00:00:00Z").toISOString(),
		expires_at: new Date("2025-01-08T00:00:00Z").toISOString(),
		from_handle: "user.a",
		from_display_name: "User A",
		to_handle: "user.b",
		to_display_name: "User B",
	};

	it("renders empty states", () => {
		render(
			<InviteInbox
				inbox={[]}
				outbox={[]}
				loading={false}
				onAccept={() => undefined}
				onDecline={() => undefined}
				onCancel={() => undefined}
				profileData={{}}
			/>,
		);
			expect(screen.queryAllByRole("listitem")).toHaveLength(0);
	});

	it("calls action callbacks", () => {
		const handleAccept = vi.fn();
		const handleDecline = vi.fn();
		const handleCancel = vi.fn();

		render(
			<InviteInbox
				inbox={[baseInvite]}
				outbox={[{ ...baseInvite, id: "inv-2" }]}
				loading={false}
				onAccept={handleAccept}
				onDecline={handleDecline}
				onCancel={handleCancel}
				profileData={{}}
			/>,
		);

		fireEvent.click(screen.getByText("Accept invite"));
		expect(handleAccept).toHaveBeenCalledWith("inv-1");

		fireEvent.click(screen.getByText("Decline"));
		expect(handleDecline).toHaveBeenCalledWith("inv-1");

		fireEvent.click(screen.getByText("Cancel invite"));
		expect(handleCancel).toHaveBeenCalledWith("inv-2");
	});
});

describe("FriendList", () => {
	const acceptedFriend: FriendRow = {
		user_id: "me",
		friend_id: "friend-1",
		status: "accepted",
		created_at: new Date("2025-01-01T00:00:00Z").toISOString(),
		friend_handle: "friend.one",
		friend_display_name: "Friend One",
	};

	const blockedFriend: FriendRow = {
		user_id: "me",
		friend_id: "friend-2",
		status: "blocked",
		created_at: new Date("2025-01-02T00:00:00Z").toISOString(),
		friend_handle: "friend.two",
		friend_display_name: "Friend Two",
	};

	it("emits filter changes", () => {
		const onChangeFilter = vi.fn();
		render(
			<FriendList
				friends={[]}
				filter="accepted"
				onChangeFilter={onChangeFilter}
				onBlock={() => undefined}
				onUnblock={() => undefined}
				onRemove={() => undefined}
				onChat={() => undefined}
				profileData={{}}
				onSelect={() => undefined}
				selectedFriendId={null}
			/>,
		);

		fireEvent.click(screen.getByText("Blocked"));
		expect(onChangeFilter).toHaveBeenCalledWith("blocked");
	});

	it("calls block and unblock handlers", () => {
		const onBlock = vi.fn();
		const onUnblock = vi.fn();
		const onRemove = vi.fn();
		const onChange = vi.fn();

		const { rerender } = render(
			<FriendList
				friends={[acceptedFriend]}
				filter="accepted"
				onChangeFilter={onChange}
				onBlock={onBlock}
				onUnblock={onUnblock}
				onRemove={onRemove}
				onChat={() => undefined}
				profileData={{}}
				onSelect={() => undefined}
				selectedFriendId={null}
			/>,
		);

		fireEvent.click(screen.getByText("Block"));
		expect(onBlock).toHaveBeenCalledWith("friend-1");
		fireEvent.click(screen.getByText("Remove"));
		expect(onRemove).toHaveBeenCalledWith("friend-1");
		expect(screen.getByText("Chat")).toBeInTheDocument();

		rerender(
			<FriendList
				friends={[blockedFriend]}
				filter="blocked"
				onChangeFilter={onChange}
				onBlock={onBlock}
				onUnblock={onUnblock}
				onRemove={onRemove}
				onChat={() => undefined}
				profileData={{}}
				onSelect={() => undefined}
				selectedFriendId={null}
			/>,
		);

		fireEvent.click(screen.getByText("Unblock"));
		expect(onUnblock).toHaveBeenCalledWith("friend-2");
	});

	it("calls chat handler for accepted friends", () => {
		const onChat = vi.fn();
		render(
			<FriendList
				friends={[acceptedFriend]}
				filter="accepted"
				onChangeFilter={() => undefined}
				onBlock={() => undefined}
				onUnblock={() => undefined}
				onRemove={() => undefined}
				onChat={onChat}
				profileData={{}}
				onSelect={() => undefined}
				selectedFriendId={null}
			/>,
		);

		fireEvent.click(screen.getByText("Chat"));
		expect(onChat).toHaveBeenCalledWith("friend-1");
	});
});
