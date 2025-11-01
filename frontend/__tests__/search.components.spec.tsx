import "@testing-library/jest-dom/vitest";

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SearchBar from "@/components/SearchBar";
import RoomResultCard from "@/components/RoomResultCard";
import UserResultCard from "@/components/UserResultCard";
import type { RoomDiscoverResult, SearchUserResult } from "@/lib/types";

const sampleUser: SearchUserResult = {
	user_id: "user-1",
	handle: "sample",
	display_name: "Sample User",
	avatar_url: null,
	is_friend: false,
	mutual_count: 3,
	score: 0.87,
};

const friendUser: SearchUserResult = {
	...sampleUser,
	user_id: "friend-1",
	handle: "friend",
	display_name: "Friendly Person",
	is_friend: true,
};

const sampleRoom: RoomDiscoverResult = {
	room_id: "room-1",
	name: "Late Night Study",
	preset: "4-6",
	members_count: 5,
	msg_24h: 14,
	score: 1.23,
};

describe("SearchBar", () => {
	it("submits query and clears input", () => {
		const onChange = vi.fn();
		const onSubmit = vi.fn();
		render(<SearchBar value="alice" onChange={onChange} onSubmit={onSubmit} />);
			const searchInput = screen.getByRole("searchbox");
			fireEvent.submit(searchInput.closest("form")!);
		expect(onSubmit).toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: /clear/i }));
		expect(onChange).toHaveBeenCalledWith("");
	});
});

describe("UserResultCard", () => {
	it("renders user details and invite action", () => {
		const onAction = vi.fn();
		render(<UserResultCard user={sampleUser} onAction={onAction} />);
		expect(screen.getByText(sampleUser.display_name)).toBeInTheDocument();
		expect(screen.getByText(/mutual friends/i)).toHaveTextContent("Mutual friends: 3");
		fireEvent.click(screen.getByRole("button", { name: /invite/i }));
		expect(onAction).toHaveBeenCalledWith(sampleUser.user_id);
	});

	it("shows friends badge when already connected", () => {
		render(<UserResultCard user={friendUser} />);
		expect(screen.getByText(/^friends$/i)).toBeInTheDocument();
	});
});

describe("RoomResultCard", () => {
	it("displays room metrics", () => {
		render(<RoomResultCard room={sampleRoom} />);
		expect(screen.getByText(sampleRoom.name)).toBeInTheDocument();
		expect(screen.getByText(/messages last 24h:/i)).toHaveTextContent("14");
	});
});
