"use client";

import React, { useEffect, useMemo, useState } from "react";

import { FLAGS } from "@/app/lib/flags/keys";
import { withFlag } from "@/app/lib/flags/withFlag";
import ReasonChips from "../../components/ReasonChips";
import type { ErrorDetail } from "@/app/lib/http/errors";
import { HttpError } from "@/app/lib/http/errors";
import type { ReportableKind } from "@/app/lib/safety/kinds";
import { REPORT_REASONS, type ReportReason } from "@/app/lib/safety/reporting";

export type ReportDialogProps = {
  open: boolean;
  kind: ReportableKind;
  targetId: string;
  prefilledReason?: ReportReason;
  onClose: () => void;
  onSubmit: (data: { reasons: ReportReason[]; note: string; evidence: string[] }) => Promise<void>;
};

type FieldErrors = Partial<Record<"reasons" | "note" | "evidence" | "general", string>>;

export function ReportDialog({ open, kind, targetId, prefilledReason, onClose, onSubmit }: ReportDialogProps) {
  const [reasons, setReasons] = useState<ReportReason[]>(prefilledReason ? [prefilledReason] : []);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (open) {
      setReasons(prefilledReason ? [prefilledReason] : []);
      setNote("");
      setEvidence([]);
      setFieldErrors({});
    }
  }, [open, prefilledReason]);

  const dialogTitle = useMemo(() => `Report ${kind}`, [kind]);

  const handleReasonToggle = (reason: ReportReason) => {
    setReasons((prev) => (prev.includes(reason) ? prev.filter((value) => value !== reason) : [...prev, reason]));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});

    if (reasons.length === 0) {
      setFieldErrors({ reasons: "Select at least one reason." });
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ reasons, note, evidence });
      onClose();
    } catch (error) {
      if (error instanceof HttpError && error.status === 422) {
        setFieldErrors(extractFieldErrors(error.detail));
      } else if (error instanceof Error) {
        setFieldErrors({ general: error.message });
      } else {
        setFieldErrors({ general: "Failed to submit report." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onSubmit={handleSubmit}
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="report-dialog-title" className="text-lg font-semibold text-slate-900">
              {dialogTitle}
            </h2>
            <p className="text-xs text-slate-500">Content ID: {targetId}</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
            onClick={onClose}
            disabled={submitting}
          >
            Close
          </button>
        </header>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reasons</p>
            <ReasonChips reasons={REPORT_REASONS} selected={reasons} onToggle={handleReasonToggle} />
            {fieldErrors.reasons ? <p className="mt-2 text-xs text-rose-600">{fieldErrors.reasons}</p> : null}
          </div>

          <div>
            <label htmlFor="report-note" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Details (optional)
            </label>
            <textarea
              id="report-note"
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-900 focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20"
              maxLength={500}
              placeholder="Add details to help our moderators—500 characters max."
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
            />
            {fieldErrors.note ? <p className="mt-1 text-xs text-rose-600">{fieldErrors.note}</p> : null}
          </div>

          <div>
            <label htmlFor="report-evidence" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Evidence URLs (optional)
            </label>
            <input
              id="report-evidence"
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-900 focus:border-midnight focus:outline-none focus:ring-2 focus:ring-midnight/20"
              placeholder="Paste one or more URLs, separated by commas"
              value={evidence.join(", ")}
              onChange={(event) =>
                setEvidence(
                  event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                )
              }
            />
            {fieldErrors.evidence ? <p className="mt-1 text-xs text-rose-600">{fieldErrors.evidence}</p> : null}
          </div>

          {fieldErrors.general ? <p className="text-sm text-rose-600">{fieldErrors.general}</p> : null}
        </div>

        <footer className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition enabled:hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={submitting || reasons.length === 0}
          >
            {submitting ? "Submitting…" : "Submit report"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export const ReportDialogGuarded = withFlag<ReportDialogProps>(FLAGS.MOD_UI)(ReportDialog);

function extractFieldErrors(detail: ErrorDetail): FieldErrors {
  if (!detail) {
    return { general: "Unable to submit report." };
  }

  if (typeof detail === "string") {
    return { general: detail };
  }

  if (Array.isArray(detail)) {
    const mapped: FieldErrors = {};
    for (const entry of detail) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as { loc?: unknown; msg?: unknown; message?: unknown };
      const loc = Array.isArray(record.loc) ? record.loc[record.loc.length - 1] : record.loc;
      const msg = typeof record.msg === "string" ? record.msg : typeof record.message === "string" ? record.message : null;
      if (typeof loc === "string" && msg) {
        mapped[loc as keyof FieldErrors] = msg;
      }
    }
    return Object.keys(mapped).length > 0 ? mapped : { general: "Unable to submit report." };
  }

  if (typeof detail === "object") {
    const mapped: FieldErrors = {};
    for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
      if (typeof value === "string") {
        mapped[key as keyof FieldErrors] = value;
      } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
        mapped[key as keyof FieldErrors] = value[0];
      }
    }
    return Object.keys(mapped).length > 0 ? mapped : { general: "Unable to submit report." };
  }

  return { general: "Unable to submit report." };
}
