import { describe, it, expect } from "vitest";
import { getCoverTransform, constrainOffset } from "./utils";

describe("getCoverTransform", () => {
    it("scales image to fit height when image is wider than frame", () => {
        const imgSize = { width: 200, height: 100 }; // 2:1
        const frameSize = { width: 100, height: 100 }; // 1:1
        const zoom = 1;
        const offset = { x: 0, y: 0 };

        const { scale, x, y } = getCoverTransform(imgSize, frameSize, zoom, offset);

        // Should scale by 1 (height 100 -> 100)
        expect(scale).toBe(1);
        // Width becomes 200, centered in 100 frame -> -50
        expect(x).toBe(-50);
        expect(y).toBe(0);
    });

    it("scales image to fit width when image is taller than frame", () => {
        const imgSize = { width: 100, height: 200 }; // 1:2
        const frameSize = { width: 100, height: 100 }; // 1:1
        const zoom = 1;
        const offset = { x: 0, y: 0 };

        const { scale, x, y } = getCoverTransform(imgSize, frameSize, zoom, offset);

        // Should scale by 1 (width 100 -> 100)
        expect(scale).toBe(1);
        expect(x).toBe(0);
        // Height becomes 200, centered in 100 frame -> -50
        expect(y).toBe(-50);
    });

    it("applies zoom correctly", () => {
        const imgSize = { width: 100, height: 100 };
        const frameSize = { width: 100, height: 100 };
        const zoom = 2;
        const offset = { x: 0, y: 0 };

        const { scale, x, y } = getCoverTransform(imgSize, frameSize, zoom, offset);

        expect(scale).toBe(2);
        // 200x200 centered in 100x100 -> -50, -50
        expect(x).toBe(-50);
        expect(y).toBe(-50);
    });

    it("applies offset correctly", () => {
        const imgSize = { width: 100, height: 100 };
        const frameSize = { width: 100, height: 100 };
        const zoom = 1;
        const offset = { x: 10, y: -10 };

        const { x, y } = getCoverTransform(imgSize, frameSize, zoom, offset);

        expect(x).toBe(10);
        expect(y).toBe(-10);
    });
});

describe("constrainOffset", () => {
    it("allows no movement when image fits exactly", () => {
        const imgSize = { width: 100, height: 100 };
        const frameSize = { width: 100, height: 100 };
        const zoom = 1;
        const offset = { x: 10, y: 10 };

        const constrained = constrainOffset(imgSize, frameSize, zoom, offset);

        expect(constrained).toEqual({ x: 0, y: 0 });
    });

    it("allows movement when zoomed in", () => {
        const imgSize = { width: 100, height: 100 };
        const frameSize = { width: 100, height: 100 };
        const zoom = 2; // Image is now 200x200
        // Max offset is (200 - 100) / 2 = 50

        const constrained = constrainOffset(imgSize, frameSize, zoom, { x: 60, y: -60 });

        expect(constrained).toEqual({ x: 50, y: -50 });
    });
});
