import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ClubsPage from "@/app/(communities)/clubs/page";
import { clubsApi } from "@/lib/clubs";

// Mock the API and Next.js Link
jest.mock("@/lib/clubs", () => ({
    clubsApi: {
        listClubs: jest.fn(),
    },
}));

jest.mock("next/link", () => {
    return ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    );
});

describe("ClubsPage", () => {
    it("renders loading state initially", () => {
        (clubsApi.listClubs as jest.Mock).mockReturnValue(new Promise(() => { }));
        render(<ClubsPage />);
        // Check for skeleton loaders (mocked by animate-pulse divs)
        const skeletons = document.querySelectorAll(".animate-pulse");
        expect(skeletons.length).toBeGreaterThan(0);
    });

    it("renders empty state when no clubs are found", async () => {
        (clubsApi.listClubs as jest.Mock).mockResolvedValue([]);
        render(<ClubsPage />);

        await waitFor(() => {
            expect(screen.getByText("No clubs found")).toBeInTheDocument();
        });
    });

    it("renders list of clubs when data is loaded", async () => {
        const mockClubs = [
            { id: "1", name: "Hiking Club", member_count: 10 },
            { id: "2", name: "Coding Club", member_count: 20 },
        ];
        (clubsApi.listClubs as jest.Mock).mockResolvedValue(mockClubs);

        render(<ClubsPage />);

        await waitFor(() => {
            expect(screen.getByText("Hiking Club")).toBeInTheDocument();
            expect(screen.getByText("Coding Club")).toBeInTheDocument();
        });
    });

    it("renders error message on API failure", async () => {
        (clubsApi.listClubs as jest.Mock).mockRejectedValue(new Error("API Error"));
        render(<ClubsPage />);

        await waitFor(() => {
            expect(screen.getByText("Failed to load clubs. Please try again.")).toBeInTheDocument();
        });
    });
});
