import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";

import { FiltersBar } from "@/components/communities/events/filters-bar";
import { EventsCalendar } from "@/components/communities/events/calendar-view";
import type { EventSummary } from "@/lib/communities";
import { optimisticRsvpApply } from "@/hooks/communities/use-rsvp";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}));

function createEventSummary(overrides: Partial<EventSummary> = {}): EventSummary {
  const today = new Date();
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 5, 18, 0, 0));
  const end = new Date(base.getTime() + 2 * 60 * 60 * 1000);
  const now = new Date().toISOString();
  return {
    id: "event-1",
    group_id: "group-1",
    group_name: "Makers Guild",
    title: "Community Build Night",
    start_at: base.toISOString(),
    end_at: end.toISOString(),
    timezone: "UTC",
    all_day: false,
    venue: {
      kind: "physical",
      address_line1: "Innovation Lab",
      city: "Portland",
      country: "USA",
    },
    allow_guests: true,
    guests_max: 1,
    capacity: 40,
    going_count: 4,
    interested_count: 2,
    waitlist_count: 1,
    my_status: "none",
    my_guests: 0,
    tags: ["hardware"],
    status: "scheduled",
    cover_image_url: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("EventsCalendar", () => {
  it("moves the focused day with keyboard navigation", () => {
    render(<EventsCalendar events={[createEventSummary()]} />);

    const initialFocused = document.querySelector('[data-focused="true"]');
    expect(initialFocused).toBeTruthy();

    fireEvent.keyDown(initialFocused as HTMLElement, { key: "ArrowRight" });

    const nextFocused = document.querySelector('[data-focused="true"]');
    expect(nextFocused).toBeTruthy();
    expect(nextFocused).not.toBe(initialFocused);
  });

  it("opens the day drawer when a day is selected", async () => {
    render(<EventsCalendar events={[createEventSummary({ title: "Hardware Jam" })]} />);

    const eventCell = screen
      .getAllByRole("gridcell")
      .find((cell) => cell.textContent?.includes("Hardware Jam"));

    expect(eventCell).toBeDefined();

    fireEvent.click(eventCell as HTMLElement);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Hardware Jam").length).toBeGreaterThan(0);
  });
});

describe("FiltersBar", () => {
  it("fires onScopeChange when selecting a different timeframe", () => {
    const handleScope = vi.fn();
    const handleView = vi.fn();

    const { rerender } = render(
      <FiltersBar scope="upcoming" view="list" onScopeChange={handleScope} onViewChange={handleView} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "All" }));

    expect(handleScope).toHaveBeenCalledTimes(1);
    expect(handleScope).toHaveBeenCalledWith("all");

    rerender(<FiltersBar scope="all" view="list" onScopeChange={handleScope} onViewChange={handleView} />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not emit scope change when clicking the active option", () => {
    const handleScope = vi.fn();
    const handleView = vi.fn();

    render(<FiltersBar scope="past" view="calendar" onScopeChange={handleScope} onViewChange={handleView} />);

    const pastButton = screen.getByRole("button", { name: "Past" });
    fireEvent.click(pastButton);

    expect(handleScope).not.toHaveBeenCalled();
    expect(pastButton).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles the view without duplicate emissions", () => {
    const handleScope = vi.fn();
    const handleView = vi.fn();

    const { rerender } = render(
      <FiltersBar scope="upcoming" view="list" onScopeChange={handleScope} onViewChange={handleView} />,
    );

    const calendarButton = screen.getByRole("button", { name: "Calendar" });
    fireEvent.click(calendarButton);

    expect(handleView).toHaveBeenCalledTimes(1);
    expect(handleView).toHaveBeenCalledWith("calendar");

    rerender(<FiltersBar scope="upcoming" view="calendar" onScopeChange={handleScope} onViewChange={handleView} />);

    fireEvent.click(screen.getByRole("button", { name: "Calendar" }));
    expect(handleView).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Calendar" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("optimisticRsvpApply", () => {
  it("promotes a waitlisted attendee to going and adjusts counts", () => {
    const summary = createEventSummary({
      waitlist_count: 2,
      going_count: 5,
      my_status: "waitlist",
    });

    const result = optimisticRsvpApply(summary, { status: "going" });

    expect(result.going_count).toBe(6);
    expect(result.waitlist_count).toBe(1);
    expect(result.my_status).toBe("going");
  });

  it("increments interest when joining from none", () => {
    const summary = createEventSummary({
      interested_count: 3,
      my_status: "none",
    });

    const result = optimisticRsvpApply(summary, { status: "interested" });

    expect(result.interested_count).toBe(4);
    expect(result.my_status).toBe("interested");
  });
});
