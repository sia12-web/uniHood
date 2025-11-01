import "@testing-library/jest-dom/vitest";

import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchTagsMock } = vi.hoisted(() => ({
	searchTagsMock: vi.fn(),
}));

vi.mock("@/lib/communities", async () => {
	const actual = await vi.importActual<typeof import("@/lib/communities")>("@/lib/communities");
	return {
		...actual,
		searchTags: searchTagsMock,
	};
});

import { TagSelector } from "@/components/communities/group/tag-selector";

function renderWithClient(ui: React.ReactElement) {
	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("TagSelector", () => {
	beforeEach(() => {
		searchTagsMock.mockReset();
	});

	it("debounces the query and displays suggestions", async () => {
		searchTagsMock.mockResolvedValue({ tags: ["design", "devops"] });

		function Harness() {
			const [tags, setTags] = useState<string[]>([]);
			return <TagSelector value={tags} onChange={setTags} />;
		}

		renderWithClient(<Harness />);

		const input = screen.getByPlaceholderText(/add up to/i);
		fireEvent.change(input, { target: { value: "de" } });

		await waitFor(() => expect(searchTagsMock).toHaveBeenCalledWith("de"));

		const suggestion = await screen.findByRole("button", { name: "#design" });
		fireEvent.click(suggestion);

		expect(screen.getByText("#design")).toBeInTheDocument();
	});

	it("enforces the tag limit and supports removal", () => {
		function Harness() {
			const [tags, setTags] = useState<string[]>(["alpha"]);
			return <TagSelector value={tags} onChange={setTags} limit={1} />;
		}

		renderWithClient(<Harness />);

		const input = screen.getByPlaceholderText("Tag limit reached");
		expect(input).toBeDisabled();
		expect(screen.getByText("#alpha")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /remove alpha/i }));

		expect(screen.queryByText("#alpha")).not.toBeInTheDocument();
		expect(screen.getByPlaceholderText(/add up to 1 more/i)).not.toBeDisabled();
	});
});
