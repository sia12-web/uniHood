import { describe, expect, beforeEach, afterEach, it, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

const flagState = {
  enabled: true,
  ready: true,
};

const replaceMock = vi.fn();
const submitReportMock = vi.fn();
const dialogCalls: Array<Record<string, unknown>> = [];

vi.mock("@/app/lib/flags/useFlags", () => ({
  useFlags: () => ({
    has: () => flagState.enabled,
    ready: flagState.ready,
    values: {},
    variant: () => undefined,
    reload: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/app/features/moderation/useReport", () => ({
  useReport: () => ({
    submitReport: submitReportMock,
  }),
}));

vi.mock("@/app/features/moderation/ReportDialog", () => ({
  ReportDialogGuarded: (props: Record<string, unknown>) => {
    dialogCalls.push(props);
    return props.open ? <div data-testid="report-dialog" /> : null;
  },
}));

import { FLAGS } from "@/app/lib/flags/keys";
import { withFlag } from "@/app/lib/flags/withFlag";
import { RequireFlag } from "@/app/lib/guards/requireFlag";
import ReportProvider, { useReportLauncher } from "@/app/features/moderation/ReportProvider";

const TestConsumer = () => {
  const { openReport } = useReportLauncher();
  useEffect(() => {
    openReport({ kind: "post", targetId: "123" });
  }, [openReport]);
  return <div>consumer</div>;
};

describe("Phase Z0 flag gating", () => {
  beforeEach(() => {
    flagState.enabled = true;
    flagState.ready = true;
    replaceMock.mockReset();
    submitReportMock.mockReset();
    dialogCalls.length = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it("withFlag renders wrapped component when flag enabled", () => {
    const Base = () => <div>secret</div>;
    const Guarded = withFlag(FLAGS.MOD_UI)(Base);

    render(<Guarded />);

    expect(screen.getByText("secret")).toBeInTheDocument();
  });

  it("withFlag hides component when flag disabled", () => {
    const Base = () => <div>hidden</div>;
    const Guarded = withFlag(FLAGS.MOD_UI)(Base);
    flagState.enabled = false;

    render(<Guarded />);

    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("withFlag renders fallback when provided and flag disabled", () => {
    const Base = () => <div>hidden</div>;
    const Guarded = withFlag(FLAGS.MOD_UI, <div>fallback</div>)(Base);
    flagState.enabled = false;

    render(<Guarded />);

    expect(screen.getByText("fallback")).toBeInTheDocument();
  });

  it("RequireFlag shows loading until flags ready", () => {
    flagState.ready = false;

    render(
      <RequireFlag flag={FLAGS.MOD_UI} loading={<span>loading</span>}>
        <div>child</div>
      </RequireFlag>,
    );

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByText("child")).not.toBeInTheDocument();
  });

  it("RequireFlag redirects when flag disabled", async () => {
    flagState.enabled = false;

    render(
      <RequireFlag flag={FLAGS.MOD_UI} fallbackHref="/safe">
        <div>child</div>
      </RequireFlag>,
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/safe");
    });
    expect(screen.queryByText("child")).not.toBeInTheDocument();
  });

  it("RequireFlag renders children when flag enabled", () => {
    render(
      <RequireFlag flag={FLAGS.MOD_UI}>
        <div>allowed</div>
      </RequireFlag>,
    );

    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByText("allowed")).toBeInTheDocument();
  });

  it("ReportProvider bypasses dialog when flag disabled", () => {
    flagState.enabled = false;

    render(
      <ReportProvider>
        <TestConsumer />
      </ReportProvider>,
    );

    expect(screen.getByText("consumer")).toBeInTheDocument();
    expect(dialogCalls).toHaveLength(0);
  });

  it("ReportProvider opens dialog when flag enabled", async () => {
    render(
      <ReportProvider>
        <TestConsumer />
      </ReportProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("report-dialog")).toBeInTheDocument();
    });
    expect(dialogCalls.at(-1)).toMatchObject({ targetId: "123" });
  });
});
