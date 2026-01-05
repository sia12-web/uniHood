import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CreateClubPage from "@/app/(communities)/clubs/create/page";
import { clubsApi } from "@/lib/clubs";

// Mock dependencies
jest.mock("@/lib/clubs", () => ({
    clubsApi: {
        createClub: jest.fn(),
    },
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

jest.mock("next/link", () => {
    return ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    );
});

describe("CreateClubPage", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders the creation form", () => {
        render(<CreateClubPage />);
        expect(screen.getByLabelText(/club name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /create club/i })).toBeInTheDocument();
    });

    it("shows error if user is not level 6 (403 error)", async () => {
        (clubsApi.createClub as jest.Mock).mockRejectedValue({
            status: 403,
            response: { status: 403, data: { detail: "Level 6 required" } }
        });

        render(<CreateClubPage />);

        fireEvent.change(screen.getByLabelText(/club name/i), { target: { value: "Admin Club" } });
        fireEvent.click(screen.getByRole("button", { name: /create club/i }));

        await waitFor(() => {
            expect(screen.getByText(/You must be Level 6/i)).toBeInTheDocument();
        });
    });

    it("redirects to clubs list on success", async () => {
        (clubsApi.createClub as jest.Mock).mockResolvedValue({ id: "new-id" });

        render(<CreateClubPage />);

        fireEvent.change(screen.getByLabelText(/club name/i), { target: { value: "New Club" } });
        fireEvent.click(screen.getByRole("button", { name: /create club/i }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/clubs");
        });
    });
});
