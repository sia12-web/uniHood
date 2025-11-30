import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("next/image", () => ({
	__esModule: true,
	default: ({ priority, ...props }: any) => {
		// eslint-disable-next-line @next/next/no-img-element
		return <img {...props} />;
	},
}));

import CampusLogoBadge, { MCGILL_ID } from "@/components/CampusLogoBadge";

describe("CampusLogoBadge", () => {
	it("renders McGill badge when campus id matches", () => {
		render(<CampusLogoBadge campusId={MCGILL_ID} campusName="McGill University" />);

		expect(screen.getByLabelText(/mcgill university/i)).toBeInTheDocument();
		expect(screen.getByAltText(/mcgill crest/i)).toBeInTheDocument();
		expect(screen.getByText(/mcgill/i)).toBeInTheDocument();
	});

	it("does not render when campus is not McGill", () => {
		const { container } = render(<CampusLogoBadge campusId="different-campus" campusName="Other University" />);

		expect(container.firstChild).toBeNull();
	});
});
