import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { vi } from "vitest";

import MajorYearPage from "@/app/(onboarding)/major-year/page";

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
	resolveAuthHeaders: () => ({}),
}));

describe("Onboarding MajorYearPage", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		fetchProfileMock.mockResolvedValue({
			campus_id: "campus-1",
			major: "",
			graduation_year: null,
		});
		patchProfileMock.mockResolvedValue({});
	});

	it("saves major and graduation year then navigates to select courses", async () => {
		render(<MajorYearPage />);

		const majorInput = await screen.findByLabelText(/major or program/i);
		const yearInput = screen.getByLabelText(/graduation year/i);

		fireEvent.change(majorInput, { target: { value: "Computer Science" } });
		fireEvent.change(yearInput, { target: { value: new Date().getFullYear() + 1 } });

		fireEvent.click(screen.getByRole("button", { name: /continue/i }));

		await waitFor(() => expect(patchProfileMock).toHaveBeenCalled());
		expect(patchProfileMock).toHaveBeenCalledWith("user-1", "campus-1", {
			major: "Computer Science",
			graduation_year: new Date().getFullYear() + 1,
		});
		expect(routerPush).toHaveBeenCalledWith("/select-courses");
	});
});
