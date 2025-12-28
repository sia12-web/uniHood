import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DiscoveryFeed from "@/components/DiscoveryFeed";

// Mocks
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => ({ get: vi.fn().mockReturnValue({ get: () => null }) }),
}));

vi.mock("@/components/providers/campus-provider", () => ({
    useCampuses: () => ({ getCampus: vi.fn().mockReturnValue({ name: "Test Campus" }) }),
}));

vi.mock("@/lib/auth-storage", () => ({
    readAuthUser: vi.fn(),
    onAuthChange: vi.fn().mockReturnValue(() => { }),
    AuthUser: {} as any,
}));

vi.mock("@/lib/identity", () => ({
    fetchProfile: vi.fn(),
    fetchUserCourses: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/app/lib/http/client", () => ({
    apiFetch: vi.fn().mockImplementation((url: string) => {
        if (url === "/discovery/prompts") return Promise.resolve([]);
        if (url === "/discovery/profile") return Promise.resolve({ auto_tags: ["Existing"] });
        if (url.startsWith("/discovery/feed")) return Promise.resolve({ items: [], total: 0 });
        return Promise.resolve({});
    }),
}));

vi.mock("@/lib/social", () => ({
    sendInvite: vi.fn(),
    fetchFriends: vi.fn().mockResolvedValue([]),
    fetchInviteOutbox: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/idem", () => ({
    getOrCreateIdemKey: vi.fn().mockResolvedValue("test-key"),
}));

vi.mock("@/lib/socket", () => ({
    disconnectPresenceSocket: vi.fn(),
    getPresenceSocket: vi.fn().mockReturnValue({
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
    }),
    initialiseNearbyAccumulator: vi.fn().mockReturnValue({}),
    applyNearbyEvent: vi.fn().mockReturnValue({}),
    nearbyAccumulatorToArray: vi.fn().mockReturnValue([]),
}));

import { readAuthUser } from "@/lib/auth-storage";
import { fetchProfile } from "@/lib/identity";

describe("DiscoveryFeed Access Control", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const setupUser = (level: number, verified: boolean) => {
        (readAuthUser as any).mockReturnValue({
            userId: "test-user",
            campusId: "test-campus",
            isUniversityVerified: verified,
        });
        (fetchProfile as any).mockResolvedValue({
            level: level,
            is_university_verified: verified,
        });
    };

    it("restricts Room Mode for users below Level 4", async () => {
        setupUser(1, true);
        render(<DiscoveryFeed />);

        await waitFor(() => expect(fetchProfile).toHaveBeenCalled());

        const roomButton = await screen.findByText("Room");
        fireEvent.click(roomButton.closest('button') || roomButton);

        await waitFor(() => {
            expect(screen.getByText(/Level 4 required for Room Mode/i)).toBeInTheDocument();
        });
    });

    it("restricts Room Mode for Level 4 users who are NOT verified", async () => {
        setupUser(4, false);
        render(<DiscoveryFeed />);

        await waitFor(() => expect(fetchProfile).toHaveBeenCalled());

        const roomButton = await screen.findByText("Room");
        fireEvent.click(roomButton.closest('button') || roomButton);

        await waitFor(() => {
            expect(screen.getByText(/Elite Verification required for Room Mode/i)).toBeInTheDocument();
        });
    });

    it("allows Room Mode for Level 4+ users who ARE verified", async () => {
        setupUser(4, true);
        render(<DiscoveryFeed />);

        await waitFor(() => expect(fetchProfile).toHaveBeenCalled());

        const roomButton = await screen.findByText("Room");
        fireEvent.click(roomButton.closest('button') || roomButton);

        await waitFor(() => {
            expect(screen.getByText(/Enter Proximity Mode\?/i)).toBeInTheDocument();
        });
    });

    it("restricts City Mode for users below Level 2", async () => {
        setupUser(1, true);
        render(<DiscoveryFeed />);

        await waitFor(() => expect(fetchProfile).toHaveBeenCalled());

        const cityButton = await screen.findByText("City");
        fireEvent.click(cityButton.closest('button') || cityButton);

        await waitFor(() => {
            expect(screen.getByText(/Level 2 required for City Mode/i)).toBeInTheDocument();
        });
    });

    it("allows City Mode for Level 2+ users", async () => {
        setupUser(2, true);
        render(<DiscoveryFeed />);

        await waitFor(() => expect(fetchProfile).toHaveBeenCalled());

        const cityButton = await screen.findByText("City");
        fireEvent.click(cityButton.closest('button') || cityButton);

        expect(screen.queryByText(/Level 2 required for City Mode/i)).not.toBeInTheDocument();
    });

    it("shows Elite Verification banner for Level 4+ unverified users", async () => {
        setupUser(4, false);
        render(<DiscoveryFeed />);

        await waitFor(() => expect(fetchProfile).toHaveBeenCalled());

        expect(screen.getByText(/Unlock Room Mode: Elite Verification/i)).toBeInTheDocument();
        expect(screen.getByText(/verify your Student Email, Phone Number, and Identity/i)).toBeInTheDocument();
    });
});
