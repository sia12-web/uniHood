import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToolJobDetailCard } from "@/components/mod/tools/tool-job-detail";
import { ToolJobList } from "@/components/mod/tools/tool-job-list";
import type { ToolJobRecord, ToolJobDetail } from "@/hooks/mod/tools/use-jobs";

const JOBS: ToolJobRecord[] = [
	{
		id: "job-1",
		type: "bundle_import",
		status: "running",
		dry_run: true,
		total: 10,
		succeeded: 3,
		failed: 1,
		started_at: "2025-10-30T12:00:00Z",
		finished_at: null,
		initiated_by: "alice",
	},
	{
		id: "job-2",
		type: "macro_execute",
		status: "completed",
		dry_run: false,
		total: 5,
		succeeded: 5,
		failed: 0,
		started_at: "2025-10-29T12:00:00Z",
		finished_at: "2025-10-29T12:05:00Z",
		initiated_by: "bob",
	},
];

describe("ToolJobList", () => {
	it("renders empty state when no jobs are provided", () => {
		render(<ToolJobList jobs={[]} selectedJobId={null} onSelect={() => undefined} />);
		expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument();
	});

	it("invokes onSelect when a job row is clicked", async () => {
		const user = userEvent.setup();
		const handleSelect = vi.fn();
		render(<ToolJobList jobs={JOBS} selectedJobId={null} onSelect={handleSelect} />);
		await user.click(screen.getByRole("button", { name: /bundle_import/i }));
		expect(handleSelect).toHaveBeenCalledWith("job-1");
	});

	it("highlights progress counts when totals are known", () => {
		render(<ToolJobList jobs={JOBS} selectedJobId="job-1" onSelect={() => undefined} />);
		expect(screen.getByText("3/10")).toBeInTheDocument();
	});
});

describe("ToolJobDetailCard", () => {
	it("renders placeholder when no job is selected", () => {
		render(<ToolJobDetailCard job={null} />);
		expect(screen.getByText(/select a job/i)).toBeInTheDocument();
	});

	it("shows job metadata, progress, results, and download link", () => {
		const detail: ToolJobDetail = {
			...JOBS[1],
			status: "completed",
			progress: { total: 5, succeeded: 5, failed: 0 },
			results: [
				{ target: "case-1", ok: true, message: "ok" },
				{ target: "case-2", ok: false, message: "failed" },
			],
			ndjson_url: "https://example.com/job-2.ndjson",
		};

		render(<ToolJobDetailCard job={detail} />);

		expect(screen.getByRole("heading", { name: /job job-2/i })).toBeInTheDocument();
		expect(screen.getByText(/completed/)).toBeInTheDocument();
		expect(screen.getByText(/Succeeded:/i).textContent).toMatch(/Succeeded:\s*5/);
		expect(screen.getByText(/Failed:/i).textContent).toMatch(/Failed:\s*0/);
		expect(screen.getByText("case-1")).toBeInTheDocument();
		expect(screen.getByText("Download NDJSON")).toHaveAttribute("href", detail.ndjson_url);
	});
});
