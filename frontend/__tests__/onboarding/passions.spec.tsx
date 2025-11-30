import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { vi } from "vitest";

import PassionsPage from "@/app/(onboarding)/passions/page";

const routerPush = vi.fn();
const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

const fetchProfileMock = vi.hoisted(() => vi.fn());
const patchProfileMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/identity", async () => {
	const actual = await vi.importActual<typeof import("@/lib/identity")>("@/lib/identity");
	return {
		...actual,
		fetchProfile: fetchProfileMock,
		patchProfile: patchProfileMock,
	};
});

vi.mock("@/lib/auth-storage", () => ({
	readAuthSnapshot: () => ({ user_id: "user-1" }),
}));

describe("Onboarding PassionsPage", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		fetchProfileMock.mockResolvedValue({
			campus_id: "campus-1",
			passions: ["AI"],
		});
		patchProfileMock.mockResolvedValue({});
	});

	it("requires at least 3 passions and saves then navigates to photos", async () => {
		render(<PassionsPage />);

		await screen.findByText(/pick your passions/i);

		// add two more passions
		const input = screen.getByPlaceholderText(/add another passion/i);
		fireEvent.change(input, { target: { value: "Startups" } });
		fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
		fireEvent.change(input, { target: { value: "Gaming" } });
		fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

		fireEvent.click(screen.getByRole("button", { name: /continue/i }));

		await waitFor(() => expect(patchProfileMock).toHaveBeenCalled());
		expect(patchProfileMock).toHaveBeenCalledWith("user-1", "campus-1", {
			passions: ["AI", "Startups", "Gaming"],
		});
		expect(routerPush).toHaveBeenCalledWith("/photos");
	});
});
