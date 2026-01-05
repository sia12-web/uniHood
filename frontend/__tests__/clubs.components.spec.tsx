import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ClubCard from "@/app/features/clubs/components/ClubCard";

const mockClub = {
    id: "123",
    name: "Chess Club",
    description: "A club for chess enthusiasts",
    owner_id: "user-1",
    created_at: new Date().toISOString(),
    member_count: 5,
};

describe("ClubCard", () => {
    it("renders club name and member count", () => {
        render(<ClubCard club={mockClub} />);

        expect(screen.getByText("Chess Club")).toBeInTheDocument();
        expect(screen.getByText("5 members")).toBeInTheDocument();
    });

    it("renders description", () => {
        render(<ClubCard club={mockClub} />);
        expect(screen.getByText("A club for chess enthusiasts")).toBeInTheDocument();
    });

    it("renders placeholder when no description", () => {
        const noDescClub = { ...mockClub, description: undefined };
        render(<ClubCard club={noDescClub} />);
        expect(screen.getByText("No description provided.")).toBeInTheDocument();
    });

    it("has a link to the club detail page", () => {
        render(<ClubCard club={mockClub} />);
        const link = screen.getByRole("link", { name: /view club/i });
        expect(link).toHaveAttribute("href", "/clubs/123");
    });
});
