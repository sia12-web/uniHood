import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

import { ActivitiesQuickCard } from "@/app/features/activities/components/ActivitiesQuickCard";
import * as leaderboards from "@/lib/leaderboards";

const summaryFixture = {
  ymd: 20250101,
  campus_id: "campus-1",
  ranks: {
    overall: 3,
    social: null,
    engagement: 2,
    popularity: null,
  },
  scores: {
    overall: 128.4,
    social: null,
    engagement: 44.2,
    popularity: null,
  },
  streak: {
    current: 5,
    best: 8,
    last_active_ymd: 20250101,
  },
  badges: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ActivitiesQuickCard", () => {
  it("renders leaderboard stats when summary loads", async () => {
    vi.spyOn(leaderboards, "fetchMySummary").mockResolvedValue(summaryFixture);
    render(<ActivitiesQuickCard variant="home" />);

    await waitFor(() => {
      expect(screen.getByText("#3")).toBeInTheDocument();
    });
    expect(screen.getByText("128.4")).toBeInTheDocument();
    expect(screen.getByText("5 days")).toBeInTheDocument();
  });

  it("surface errors when summary fails", async () => {
    vi.spyOn(leaderboards, "fetchMySummary").mockRejectedValue(new Error("network"));
    render(<ActivitiesQuickCard variant="chat" />);

    await waitFor(() => {
      expect(screen.getByText(/network/i)).toBeInTheDocument();
    });
  });
});
