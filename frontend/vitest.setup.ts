import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

if (typeof HTMLCanvasElement !== "undefined") {
	HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

const flagsResponse = new Response(
	JSON.stringify({
		flags: {},
		values: {},
		variants: {},
	}),
	{
		status: 200,
		headers: { "content-type": "application/json" },
	},
);

const defaultFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
	if (typeof url === "string" && url.includes("/flags/evaluate")) {
		return flagsResponse.clone();
	}
	return new Response(null, { status: 404 });
});

vi.stubGlobal("fetch", defaultFetch);
