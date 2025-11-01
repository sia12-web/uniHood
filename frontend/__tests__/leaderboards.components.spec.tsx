import "@testing-library/jest-dom/vitest";

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LeaderboardTable from "@/components/LeaderboardTable";
import StreakBadge from "@/components/StreakBadge";
import type { LeaderboardRow } from "@/lib/types";

describe("LeaderboardTable", () => {
	const rows: LeaderboardRow[] = [
		{ rank: 1, user_id: "11111111-1111-1111-1111-111111111111", score: 120.5 },
		{ rank: 2, user_id: "22222222-2222-2222-2222-222222222222", score: 95.1 },
	];

	it("renders loading state", () => {
		render(<LeaderboardTable scope="overall" items={[]} isLoading />);
		expect(screen.getByText(/loading overall leaderboard/i)).toBeInTheDocument();
	});

	it("highlights the current user row", () => {
		render(<LeaderboardTable scope="overall" items={rows} highlightUserId="22222222-2222-2222-2222-222222222222" />);
		const highlighted = screen.getByText("#2").closest("tr");
		expect(highlighted).toHaveClass("bg-amber-50");
	});
});

describe("StreakBadge", () => {
	it("shows streak metrics", () => {
		render(<StreakBadge current={12} best={20} lastActiveYmd={20251024} />);
		expect(screen.getByText("12")).toBeInTheDocument();
		expect(screen.getByText(/best streak: 20d/i)).toBeInTheDocument();
		expect(screen.getByText(/progress to 30-day badge/i)).toBeInTheDocument();
	});
});
