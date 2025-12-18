import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { vi } from "vitest";

import SelectCoursesPage from "@/app/(onboarding)/select-courses/page";

const routerPush = vi.fn();
const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

const fetchProfileMock = vi.hoisted(() => vi.fn());
const fetchPopularCoursesMock = vi.hoisted(() => vi.fn());
const fetchUserCoursesMock = vi.hoisted(() => vi.fn());
const saveProfileCoursesMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/identity", async () => {
	const actual = await vi.importActual<typeof import("@/lib/identity")>("@/lib/identity");
	return {
		...actual,
		fetchProfile: fetchProfileMock,
		fetchPopularCourses: fetchPopularCoursesMock,
		fetchUserCourses: fetchUserCoursesMock,
		saveProfileCourses: saveProfileCoursesMock,
	};
});

vi.mock("@/lib/auth-storage", () => ({
	readAuthSnapshot: () => ({ user_id: "user-1" }),
	resolveAuthHeaders: () => ({}),
}));

describe("Onboarding SelectCoursesPage", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		fetchProfileMock.mockResolvedValue({
			campus_id: "campus-1",
		});
		fetchPopularCoursesMock.mockResolvedValue([
			{ code: "COMP 250", name: "Intro to CS" },
			{ code: "MATH 201", name: "Calculus" },
		]);
		fetchUserCoursesMock.mockResolvedValue([]);
		saveProfileCoursesMock.mockResolvedValue({});
	});

	it("normalizes and dedupes course codes before save", async () => {
		render(<SelectCoursesPage />);

		// wait for popular courses to load
		await screen.findByText(/popular at your university/i);

		// select one from popular
		fireEvent.click(screen.getByRole("button", { name: /COMP 250/i }));
		// add a lowercase duplicate and another course
		const input = screen.getByPlaceholderText(/add a course/i);
		fireEvent.change(input, { target: { value: "comp 250" } });
		fireEvent.click(screen.getByLabelText(/add course/i));
		fireEvent.change(input, { target: { value: "math 201" } });
		fireEvent.click(screen.getByLabelText(/add course/i));

		fireEvent.click(screen.getByRole("button", { name: /continue/i }));

		await waitFor(() => expect(saveProfileCoursesMock).toHaveBeenCalled());
		// Should dedupe and uppercase
		expect(saveProfileCoursesMock).toHaveBeenCalledWith("user-1", "campus-1", ["COMP 250", "MATH 201"]);
		expect(routerPush).toHaveBeenCalledWith("/passions");
	});
});
