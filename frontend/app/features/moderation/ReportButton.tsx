"use client";

import React, { useCallback } from "react";

import ShieldIcon from "@/app/components/ShieldIcon";
import { FLAGS } from "@/app/lib/flags/keys";
import { withFlag } from "@/app/lib/flags/withFlag";
import type { ReportableKind } from "@/app/lib/safety/kinds";
import type { ReportReason } from "@/app/lib/safety/reporting";

import { useReportLauncher } from "./ReportProvider";

export type ReportButtonProps = {
  kind: ReportableKind;
  targetId: string;
  prefilledReason?: ReportReason;
  className?: string;
  onOpen?: () => void;
};

function ReportButtonBase({ kind, targetId, prefilledReason, className, onOpen }: ReportButtonProps) {
  const { openReport } = useReportLauncher();

  const handleClick = useCallback(() => {
    openReport({ kind, targetId, prefilledReason });
    onOpen?.();
  }, [kind, targetId, prefilledReason, openReport, onOpen]);

  const label = `Report ${kind.replace(/_/g, " ")}`;
  const buttonClasses = [
    "inline-flex items-center justify-center rounded-full p-1 text-rose-600 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={buttonClasses}
      onClick={handleClick}
      data-kind={kind}
      data-target-id={targetId}
    >
      <ShieldIcon className="h-4 w-4" />
    </button>
  );
}

const ReportButtonGuarded = withFlag<ReportButtonProps>(FLAGS.MOD_UI)(ReportButtonBase);

export const ReportButton = ReportButtonGuarded;
export const ReportUI = ReportButtonGuarded;

export default ReportButtonGuarded;
