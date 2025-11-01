"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { modApi } from "@/lib/api-mod";
import { emitSafetyMetric } from "@/lib/obs/safety";
import { getStaffSocket } from "@/lib/sockets-staff";

export type CaseLockState = {
	caseId: string;
	lockedBy: string | null;
	expiresAt: string | null;
};

export type UseClaimLockOptions = {
	caseId: string | null;
	moderatorId: string | null;
	initialLock?: CaseLockState | null;
	heartbeatMs?: number;
};

export function useClaimLock({ caseId, moderatorId, initialLock = null, heartbeatMs = 20_000 }: UseClaimLockOptions) {
	const [lock, setLock] = useState<CaseLockState | null>(initialLock);
	const [pending, setPending] = useState(false);
	const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);

	const clearHeartbeat = useCallback(() => {
		if (heartbeat.current) {
			clearInterval(heartbeat.current);
			heartbeat.current = null;
		}
	}, []);

	const scheduleHeartbeat = useCallback(() => {
		clearHeartbeat();
		if (!caseId) return;
		heartbeat.current = setInterval(() => {
			void modApi.patch(`/admin/cases/${caseId}/lock`, { heartbeat: true }).catch(() => undefined);
		}, heartbeatMs);
	}, [caseId, heartbeatMs, clearHeartbeat]);

	const claim = useCallback(async () => {
		if (!caseId || !moderatorId) return;
		setPending(true);
		try {
			await modApi.patch(`/admin/cases/${caseId}/lock`, { moderator_id: moderatorId });
			emitSafetyMetric({ event: "ui_triage_claim_total" });
			setLock({ caseId, lockedBy: moderatorId, expiresAt: null });
			scheduleHeartbeat();
		} catch (error) {
			emitSafetyMetric({ event: "ui_triage_conflict_total", reason: "claim_failed" });
			throw error;
		} finally {
			setPending(false);
		}
	}, [caseId, moderatorId, scheduleHeartbeat]);

	const release = useCallback(async () => {
		if (!caseId) return;
		setPending(true);
		try {
			await modApi.delete(`/admin/cases/${caseId}/lock`);
			setLock((current) => (current ? { ...current, lockedBy: null, expiresAt: null } : null));
			clearHeartbeat();
		} finally {
			setPending(false);
		}
	}, [caseId, clearHeartbeat]);

	useEffect(() => {
		setLock(initialLock ?? null);
	}, [initialLock?.lockedBy, initialLock?.expiresAt, initialLock?.caseId]);

	useEffect(() => {
		if (!caseId) {
			clearHeartbeat();
			return;
		}

		const socket = getStaffSocket();
		const handleLocked = (payload: CaseLockState) => {
			if (payload.caseId === caseId) {
				setLock(payload);
			}
		};
		const handleUnlocked = (payload: CaseLockState) => {
			if (payload.caseId === caseId) {
				setLock({ ...payload, lockedBy: null, expiresAt: null });
			}
		};
		socket.on("case.locked", handleLocked);
		socket.on("case.unlocked", handleUnlocked);

		return () => {
			socket.off("case.locked", handleLocked);
			socket.off("case.unlocked", handleUnlocked);
		};
	}, [caseId]);

	useEffect(() => clearHeartbeat, [clearHeartbeat]);

	return {
		takeLock: claim,
		releaseLock: release,
		lock,
		isLocked: Boolean(lock?.lockedBy && lock.lockedBy !== moderatorId),
		lockedByMe: Boolean(lock?.lockedBy && moderatorId && lock.lockedBy === moderatorId),
		pending,
	};
}
