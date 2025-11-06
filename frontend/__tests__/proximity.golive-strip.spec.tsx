import "@testing-library/jest-dom/vitest";

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GoLiveStrip from "@/components/proximity/GoLiveStrip";

describe("GoLiveStrip", () => {
  it("renders radius options and highlights selected; clicking emits change", () => {
    const handleRadius = vi.fn();

    render(
      <GoLiveStrip
        enabled={true}
        heartbeatSeconds={2}
        radius={50}
        radiusOptions={[10, 50, 100]}
        onRadiusChange={handleRadius}
        onGoLive={() => undefined}
      />,
    );

    // Selected radius should have selected styles
    const selected = screen.getByText("50m");
    expect(selected).toBeInTheDocument();
    expect(selected.className).toMatch(/bg-slate-900/);

    // Clicking a different radius calls handler
    fireEvent.click(screen.getByText("100m"));
    expect(handleRadius).toHaveBeenCalledWith(100);
  });

  it("respects enabled/disabled state and aria label", () => {
    const { rerender } = render(
      <GoLiveStrip
        enabled={false}
        heartbeatSeconds={3}
        radius={10}
        radiusOptions={[10, 50, 100]}
        onRadiusChange={() => undefined}
        onGoLive={() => undefined}
      />,
    );

  const disabledBtn = screen.getByLabelText("Go live disabled");
  expect(disabledBtn).toBeDisabled();

    rerender(
      <GoLiveStrip
        enabled={true}
        heartbeatSeconds={3}
        radius={10}
        radiusOptions={[10, 50, 100]}
        onRadiusChange={() => undefined}
        onGoLive={() => undefined}
      />,
    );

    const enabledBtn = screen.getByRole("button", { name: /go live now/i });
    expect(enabledBtn).not.toBeDisabled();
    expect(enabledBtn.getAttribute("aria-label")).toMatch(/Heartbeats every 3s/);
  });

  it("shows presence status when provided", () => {
    render(
      <GoLiveStrip
        enabled={true}
        heartbeatSeconds={2}
        radius={50}
        radiusOptions={[10, 50, 100]}
        presenceStatus={"You’re visible on the map—others nearby can see you now."}
        onRadiusChange={() => undefined}
        onGoLive={() => undefined}
      />,
    );

    expect(
      screen.getByText("You’re visible on the map—others nearby can see you now."),
    ).toBeInTheDocument();
  });

  it("shows accuracy tip only when radius <= accuracyM", () => {
    const { rerender } = render(
      <GoLiveStrip
        enabled={true}
        heartbeatSeconds={2}
        radius={50}
        radiusOptions={[10, 50, 100]}
        accuracyM={60}
        onRadiusChange={() => undefined}
        onGoLive={() => undefined}
      />,
    );

    expect(screen.getByText(/Tip: your current location accuracy/i)).toBeInTheDocument();

    rerender(
      <GoLiveStrip
        enabled={true}
        heartbeatSeconds={2}
        radius={50}
        radiusOptions={[10, 50, 100]}
        accuracyM={40}
        onRadiusChange={() => undefined}
        onGoLive={() => undefined}
      />,
    );

    expect(screen.queryByText(/Tip: your current location accuracy/i)).not.toBeInTheDocument();
  });
});
