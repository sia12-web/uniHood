import { describe, it, expect } from "vitest";
import { LEVEL_LABELS, LEVEL_THRESHOLDS, getLevelProgress } from "../lib/xp";

describe("XP System Logic", () => {
    it("should have correct level labels", () => {
        expect(LEVEL_LABELS[1]).toBe("Newcomer");
        expect(LEVEL_LABELS[2]).toBe("Explorer");
        expect(LEVEL_LABELS[3]).toBe("Connector");
        expect(LEVEL_LABELS[4]).toBe("Verified Resident");
        expect(LEVEL_LABELS[5]).toBe("Social Leader");
        expect(LEVEL_LABELS[6]).toBe("Campus Icon");
    });

    it("should calculate correct progress percentage", () => {
        // Lvl 1: 0, Lvl 2: 100
        expect(getLevelProgress(50, 1, 100)).toBe(50);
        expect(getLevelProgress(100, 1, 100)).toBe(100);
        expect(getLevelProgress(0, 1, 100)).toBe(0);

        // Lvl 2: 100, Lvl 3: 500
        // Progress between 100 and 500. XP is 300. (300-100)/(500-100) = 200/400 = 50%
        expect(getLevelProgress(300, 2, 500)).toBe(50);
    });

    it("should handle exhausted levels", () => {
        expect(getLevelProgress(20000, 6, null)).toBe(100);
    });
});
