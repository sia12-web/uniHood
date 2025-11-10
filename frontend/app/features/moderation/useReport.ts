"use client";

import { useCallback } from "react";
import { getOrCreateIdemKey } from "@/app/api/idempotency";
import { apiFetch } from "@/app/lib/http/client";
import { HttpError, IdemConflictError, NetworkError } from "@/app/lib/http/errors";
import { FLAGS } from "@/app/lib/flags/keys";
import { useFlags } from "@/app/lib/flags/useFlags";
import { enqueue } from "@/app/lib/metrics/clientMetrics";
import { useToast } from "@/hooks/use-toast";

export type ReportPayload = {
  kind: string;
  targetId: string;
  reasons: string[];
  note?: string;
  evidence?: string[];
};

export function useReport() {
  const { push } = useToast();
  const { has } = useFlags();
  const moderationEnabled = has(FLAGS.MOD_UI);
  const metricsEnabled = has(FLAGS.UX_METRICS);

  const submitReport = useCallback(
    async (payload: ReportPayload) => {
      if (!moderationEnabled) {
        throw new Error("Moderation UI is disabled.");
      }
      const { kind, targetId, reasons, note = "", evidence = [] } = payload;
      const idemKey = await getOrCreateIdemKey("/moderation/report", {
        kind,
        target_id: targetId,
        reasons,
        note,
      });

      try {
        await apiFetch("/moderation/report", {
          method: "POST",
          body: {
            kind,
            target_id: targetId,
            reasons,
            note,
            evidence,
          },
          idemKey,
        });

        if (metricsEnabled) {
          enqueue({ type: "report.submit", timestamp: Date.now(), payload: { kind, reasons, count: reasons.length } });
        }
        push({ title: "Thanks, we’re on it", variant: "success" });
        return;
      } catch (error) {
        if (error instanceof IdemConflictError) {
          if (metricsEnabled) {
            enqueue({ type: "report.submit", timestamp: Date.now(), payload: { kind, reasons, count: reasons.length } });
          }
          push({ title: "Thanks, we’re on it", variant: "success" });
          return;
        }

        const status = error instanceof HttpError ? error.status : undefined;
        const requestId = error instanceof HttpError || error instanceof NetworkError ? error.requestId : undefined;

        if (status === 429) {
          if (metricsEnabled) {
            enqueue({ type: "report.fail", timestamp: Date.now(), payload: { kind, reasons, code: 429 } });
          }
          push({ title: "Too many reports", description: "Try again later.", variant: "warning" });
          throw error;
        }

        if (status === 422) {
          if (metricsEnabled) {
            enqueue({ type: "report.fail", timestamp: Date.now(), payload: { kind, reasons, code: 422 } });
          }
          throw error;
        }

        if (metricsEnabled) {
          enqueue({
            type: "report.fail",
            timestamp: Date.now(),
            payload: { kind, reasons, code: status ?? "network" },
          });
        }

        const description = requestId ? `Request ID: ${requestId}` : undefined;
        push({ title: "Couldn’t submit report", description, variant: "error" });

        throw error;
      }
    },
    [metricsEnabled, moderationEnabled, push],
  );

  return { submitReport };
}
