import { describe, expect, it } from "vitest";

import { ActivitySummary, normalizeScoreboard, summaryToScoreboard } from "@/lib/activities";

describe("normalizeScoreboard", () => {
	it("maps totals and per-round entries", () => {
		const payload = {
			activity_id: "act-1",
			totals: { alice: 2.5, bob: 1.0 },
			per_round: [
				{ idx: 1, alice: 1.5, bob: 0.5 },
				{ idx: 2, alice: 1.0, bob: 0.5 },
			],
		};
		const board = normalizeScoreboard(payload);
		expect(board.totals.alice).toBeCloseTo(2.5);
		expect(board.totals.bob).toBeCloseTo(1.0);
		expect(board.perRound[1].alice).toBeCloseTo(1.5);
		expect(board.perRound[2].bob).toBeCloseTo(0.5);
	});
});

describe("summaryToScoreboard", () => {
	it("returns empty structures when score meta missing", () => {
		const summary = {
			id: "act-1",
			kind: "typing_duel",
			state: "completed",
			user_a: "alice",
			user_b: "bob",
			created_at: new Date().toISOString(),
			meta: {},
		} as ActivitySummary;
		const board = summaryToScoreboard(summary);
		expect(board.totals).toEqual({});
		expect(board.perRound).toEqual({});
	});

	it("hydrates score meta when present", () => {
		const summary = {
			id: "act-1",
			kind: "typing_duel",
			state: "completed",
			user_a: "alice",
			user_b: "bob",
			created_at: new Date().toISOString(),
			meta: {
				score: {
					totals: { alice: 3, bob: 2 },
					per_round: [
						{ idx: 1, alice: 2, bob: 1 },
						{ idx: 2, alice: 1, bob: 1 },
					],
				},
			},
		} as ActivitySummary;
		const board = summaryToScoreboard(summary);
		expect(board.totals.alice).toBe(3);
		expect(board.perRound[2].bob).toBe(1);
	});
});
