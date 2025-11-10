"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { FLAGS } from "@/app/lib/flags/keys";
import { withFlag } from "@/app/lib/flags/withFlag";
import type { ReportableKind } from "@/app/lib/safety/kinds";
import type { ReportReason } from "@/app/lib/safety/reporting";

import { ReportDialogGuarded as ReportDialog } from "./ReportDialog";
import { useReport } from "./useReport";

type ReportRequest = {
  kind: ReportableKind;
  targetId: string;
  prefilledReason?: ReportReason;
};

type ReportContextValue = {
  openReport(request: ReportRequest): void;
};

const ReportContext = createContext<ReportContextValue | null>(null);

export function useReportLauncher(): ReportContextValue {
  const context = useContext(ReportContext);
  if (!context) {
    throw new Error("useReportLauncher must be used within a ReportProvider");
  }
  return context;
}

type ReportProviderProps = {
  children: ReactNode;
};

type DialogState =
  | { open: false }
  | {
      open: true;
      request: ReportRequest;
    };

function ReportProviderBase({ children }: ReportProviderProps) {
  const [state, setState] = useState<DialogState>({ open: false });
  const { submitReport } = useReport();

  const openReport = useCallback((request: ReportRequest) => {
    setState({ open: true, request });
  }, []);

  const handleClose = useCallback(() => {
    setState({ open: false });
  }, []);

  const handleSubmit = useCallback(
    async (form: { reasons: ReportReason[]; note: string; evidence: string[] }) => {
      if (!state.open) {
        return;
      }
      const { request } = state;
      await submitReport({
        kind: request.kind,
        targetId: request.targetId,
        reasons: form.reasons,
        note: form.note,
        evidence: form.evidence,
      });
    },
    [state, submitReport],
  );

  const value = useMemo<ReportContextValue>(() => ({ openReport }), [openReport]);

  const dialog = state.open ? (
    <ReportDialog
      open
      kind={state.request.kind}
      targetId={state.request.targetId}
      prefilledReason={state.request.prefilledReason}
      onClose={handleClose}
      onSubmit={handleSubmit}
    />
  ) : null;

  return (
    <ReportContext.Provider value={value}>
      {children}
      {dialog}
    </ReportContext.Provider>
  );
}

const DisabledReportProvider = ({ children }: ReportProviderProps) => (
  <ReportContext.Provider value={{ openReport: () => undefined }}>{children}</ReportContext.Provider>
);

export const ReportProvider = withFlag<ReportProviderProps>(FLAGS.MOD_UI, DisabledReportProvider)(ReportProviderBase);

export default ReportProvider;
