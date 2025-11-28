import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { vi } from "vitest";

import { StaffProvider } from "@/components/providers/staff-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import TriageQueuePage from "@/app/(staff)/admin/mod/triage/[queueKey]/page";
import { CaseDrawer } from "@/components/mod/triage/case-drawer";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: routerPush }),
}));

vi.mock("next/link", () => ({
	__esModule: true,
	default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

const useQueueMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/mod/triage/use-queue", async () => {
	const actual = await vi.importActual<typeof import("@/hooks/mod/triage/use-queue")>("@/hooks/mod/triage/use-queue");
	return {
		...actual,
		useQueue: useQueueMock as any,
	};
});

const useQueueSummariesMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/mod/triage/use-queue-summaries", () => ({
	useQueueSummaries: useQueueSummariesMock as any,
}));

const useCaseActionsMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/mod/triage/use-case-actions", () => ({
	useCaseActions: (...args: unknown[]) => useCaseActionsMock(...args),
}));

const useCaseMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/mod/use-case", () => ({
	useCase: useCaseMock as any,
}));

const useCannedActionsMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/mod/triage/use-canned", () => ({
	useCannedActions: useCannedActionsMock as any,
}));

const useClaimLockMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/mod/triage/use-claim-lock", () => ({
	useClaimLock: useClaimLockMock as any,
}));

const useSlaTargetsMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/mod/triage/use-sla", () => ({
	useSlaTargets: useSlaTargetsMock as any,
}));

const emitSafetyMetricMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/obs/safety", () => ({
	emitSafetyMetric: emitSafetyMetricMock as any,
}));

beforeEach(() => {
	vi.clearAllMocks();
	window.localStorage.clear();
	useCaseActionsMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
	useQueueSummariesMock.mockImplementation((entries: Array<{ key: string }>) =>
		entries.map((entry) => ({
			status: "success",
			data: { key: entry.key, count: 5, slaBreaches: 1 },
			isLoading: false,
			isFetching: false,
		}))
	);
	useCannedActionsMock.mockReturnValue({ data: { items: [] } });
	useClaimLockMock.mockReturnValue({
		takeLock: vi.fn(),
		releaseLock: vi.fn(),
		lock: null,
		lockedByMe: false,
		isLocked: false,
		pending: false,
	});
	useSlaTargetsMock.mockReturnValue({
		getState: () => ({
			severity: 4,
			targetMinutes: 15,
			elapsedMinutes: 1,
			ratio: 0.1,
			badge: "ok" as const,
			remainingText: "00:59",
		}),
	});
	useCaseMock.mockImplementation((caseId: string) => ({
		data: caseId
			? {
				id: caseId,
				status: "open",
				subject_type: "user",
				subject_id: `user-${caseId}`,
				reason: "test",
			}
			: null,
		isLoading: false,
		isError: false,
		error: null,
		refetch: vi.fn(),
	}));
});

function renderWithProviders(node: React.ReactNode) {
	const client = new QueryClient();
	return render(
		<QueryClientProvider client={client}>
			<ToastProvider>
				<StaffProvider profile={{ id: "mod-1", scopes: [], campuses: [] }} activeCampus={null} campuses={[]}>
					{node}
				</StaffProvider>
			</ToastProvider>
		</QueryClientProvider>
	);
}

describe("triage keyboard navigation", () => {
	test("moves focus and submits actions via shortcuts", async () => {
		const cases = [
			{
				id: "case-1",
				severity: 4,
				status: "open",
				subject: "user-1",
				reason: "spam",
				assigned_to: null,
				created_at: new Date().toISOString(),
				sla_due_at: new Date(Date.now() + 60_000).toISOString(),
			},
			{
				id: "case-2",
				severity: 4,
				status: "open",
				subject: "user-2",
				reason: "harassment",
				assigned_to: null,
				created_at: new Date().toISOString(),
				sla_due_at: new Date(Date.now() + 120_000).toISOString(),
			},
		];

		useQueueMock.mockReturnValue({
			data: { pages: [{ items: cases, next: null, total: 2 }] },
			error: null,
			isLoading: false,
			isFetching: false,
			isFetchingNextPage: false,
			hasNextPage: false,
			fetchNextPage: vi.fn(),
		});

		const keyboardMutate = vi.fn().mockResolvedValue(undefined);
		const drawerMutate = vi.fn().mockResolvedValue(undefined);
		let invocation = 0;
		useCaseActionsMock.mockImplementation(() => {
			const result = invocation % 2 === 0 ? keyboardMutate : drawerMutate;
			invocation += 1;
			return { mutateAsync: result, isPending: false };
		});

		renderWithProviders(<TriageQueuePage params={{ queueKey: "sev4" }} />);

		const rows = screen.getAllByRole("row");
		expect(rows[1]).toHaveAttribute("aria-selected", "true");

		fireEvent.keyDown(window, { key: "j" });
		await waitFor(() => expect(rows[2]).toHaveAttribute("aria-selected", "true"));

		fireEvent.keyDown(window, { key: "k" });
		await waitFor(() => expect(rows[1]).toHaveAttribute("aria-selected", "true"));

		fireEvent.keyDown(window, { key: "Enter" });
		await screen.findByRole("dialog", { name: /Case case-1 drawer/i });

		fireEvent.keyDown(window, { key: "a" });

		await waitFor(() =>
			expect(keyboardMutate).toHaveBeenCalledWith({
				caseId: "case-1",
				type: "assign",
				payload: { moderator_id: "mod-1" },
			})
		);

		await screen.findByRole("dialog", { name: /Case case-2 drawer/i });
		await waitFor(() => expect(rows[2]).toHaveAttribute("aria-selected", "true"));
	});
});

describe("case drawer locks", () => {
	test("disables actions when another moderator holds the lock", () => {
		useCaseActionsMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
		useClaimLockMock.mockReturnValue({
			takeLock: vi.fn(),
			releaseLock: vi.fn(),
			lock: { lockedBy: "mod-2", caseId: "case-9", expiresAt: null },
			lockedByMe: false,
			isLocked: true,
			pending: false,
		});

		renderWithProviders(
			<CaseDrawer
				open
				caseId="case-9"
				summary={{
					id: "case-9",
					severity: 4,
					status: "open",
					subject: "user-9",
					reason: "spam",
					assigned_to: null,
					created_at: new Date().toISOString(),
					sla_due_at: null,
				}}
				onClose={() => undefined}
				onToggleSkip={() => undefined}
				skipAfterAction
			/>
		);

		expect(screen.getByRole("button", { name: /Assign to me/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /Escalate/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /^Tombstone$/i })).toBeDisabled();
		expect(screen.getByRole("button", { name: /Claim lock|Locked/i })).toBeDisabled();
	});
});
