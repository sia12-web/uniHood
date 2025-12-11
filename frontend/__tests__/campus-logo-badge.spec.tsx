import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("next/image", () => ({
	__esModule: true,
	default: ({ priority, ...props }: any) => {
		// eslint-disable-next-line @next/next/no-img-element
		return <img {...props} />;
	},
}));

import CampusLogoBadge from "@/components/CampusLogoBadge";

describe("CampusLogoBadge", () => {
	it("renders generic badge with initials when no logo provided", () => {
		render(<CampusLogoBadge campusName="Test University" />);
		expect(screen.getByLabelText(/Test University/i)).toBeInTheDocument();
		expect(screen.getByText("T")).toBeInTheDocument(); // Initial
		expect(screen.getByText(/Test University/i)).toBeInTheDocument();
	});

	it("renders logo when logoUrl is provided", () => {
		render(<CampusLogoBadge campusName="McGill University" logoUrl="/brand/mcgill.svg" />);
		expect(screen.getByAltText(/McGill University logo/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/McGill University/i)).toBeInTheDocument();
	});
});
