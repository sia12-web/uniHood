import { describe, expect, it } from "vitest";

import { applyDiff } from "@/lib/diff";
import { canSendHeartbeat, clampHeartbeatAccuracy, formatDistance, roundToBucket } from "@/lib/geo";
import type { NearbyDiff, NearbyUser } from "@/lib/types";

describe("geo helpers", () => {
	it("formats distance", () => {
		expect(formatDistance(10)).toBe("10m");
		expect(formatDistance(null)).toBe("Approx");
	});

	it("rounds to bucket", () => {
		expect(roundToBucket(11, 10)).toBe(20);
		expect(roundToBucket(0, 10)).toBe(0);
	});

	it("tolerates coarse heartbeat accuracy", () => {
		expect(canSendHeartbeat(20)).toBe(true);
		expect(canSendHeartbeat(60)).toBe(true);
		expect(canSendHeartbeat(-1)).toBe(false);
		expect(canSendHeartbeat(Number.POSITIVE_INFINITY)).toBe(false);
	});

	it("clamps outgoing heartbeat accuracy", () => {
		expect(clampHeartbeatAccuracy(5)).toBe(5);
		expect(clampHeartbeatAccuracy(75)).toBe(50);
		expect(clampHeartbeatAccuracy(undefined)).toBe(50);
		expect(clampHeartbeatAccuracy(-10)).toBe(50);
	});
});

describe("applyDiff", () => {
	const base: NearbyUser[] = [
		{ user_id: "1", display_name: "A", handle: "a", distance_m: 10 },
		{ user_id: "2", display_name: "B", handle: "b", distance_m: 20 },
	];

	it("applies updates and additions", () => {
		const diff: NearbyDiff = {
			radius_m: 50,
			added: [{ user_id: "3", display_name: "C", handle: "c", distance_m: 15 }],
			removed: [],
			updated: [{ user_id: "2", display_name: "B2", handle: "b", distance_m: 5 }],
		};
		const result = applyDiff(base, diff, 50);
		expect(result.map((u) => u.user_id)).toEqual(["2", "1", "3"]);
		expect(result[0].display_name).toBe("B2");
	});

	it("ignores diff for other radius", () => {
		const diff: NearbyDiff = {
			radius_m: 10,
			added: [],
			removed: ["1"],
			updated: [],
		};
		const result = applyDiff(base, diff, 50);
		expect(result).toEqual(base);
	});
});
