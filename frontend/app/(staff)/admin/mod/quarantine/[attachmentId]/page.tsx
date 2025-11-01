"use client";

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { OcrDrawer } from '@/components/mod/safety/ocr-drawer';
import { QuarantineDetail } from '@/components/mod/safety/quarantine-detail';
import { useAudit } from '@/hooks/mod/use-audit';
import { useReputation } from '@/hooks/mod/use-reputation';
import { useQuarantineDecision } from '@/hooks/mod/use-quarantine-decision';
import { useQuarantineItem } from '@/hooks/mod/safety/use-quarantine-item';
import { useQuarantineReveal } from '@/hooks/mod/safety/use-quarantine-reveal';

function isInputElement(target: EventTarget | null) {
	if (!target || !(target instanceof HTMLElement)) return false;
	const tag = target.tagName.toLowerCase();
	return tag === 'input' || tag === 'textarea' || target.getAttribute('contenteditable') === 'true';
}

export default function QuarantineAttachmentPage() {
	const params = useParams<{ attachmentId: string }>();
	const router = useRouter();
	const searchParams = useSearchParams();
	const attachmentId = params.attachmentId;

	const { data, isLoading, error } = useQuarantineItem(attachmentId);
	const { mutateAsync: decide, isPending: decisionPending } = useQuarantineDecision();
	const { mutateAsync: reveal, isPending: revealing } = useQuarantineReveal();

	const attachment = data?.attachment ?? null;
	const textScan = data?.textScan ?? null;

	const auditTargetId = attachment?.audit_target_id ?? null;
	const { data: auditData } = useAudit(auditTargetId);
	const ownerId = attachment?.owner_id ?? null;
	const { data: reputation } = useReputation(ownerId);

	const [revealed, setRevealed] = useState(false);
	const [ocrOpen, setOcrOpen] = useState(false);
	const [revealError, setRevealError] = useState<string | null>(null);

	useEffect(() => {
		if (attachment?.metadata && typeof attachment.metadata === 'object') {
			const flag = (attachment.metadata as Record<string, unknown>).revealed;
			if (flag === true) {
				setRevealed(true);
			}
		}
	}, [attachment?.metadata]);

	const prevId = searchParams.get('prev');
	const nextId = searchParams.get('next');

	const handleNavigate = useCallback(
		(targetId: string | null) => {
		if (!targetId) return;
		const paramsObj = new URLSearchParams(searchParams.toString());
		paramsObj.set('from', attachmentId);
		router.push(`/admin/mod/quarantine/${targetId}?${paramsObj.toString()}`);
		},
		[attachmentId, router, searchParams]
	);

	useEffect(() => {
		function handleKey(event: KeyboardEvent) {
			if (isInputElement(event.target)) return;
			if (event.key.toLowerCase() === 'j' && nextId) {
				event.preventDefault();
				handleNavigate(nextId);
			}
			if (event.key.toLowerCase() === 'k' && prevId) {
				event.preventDefault();
				handleNavigate(prevId);
			}
		}
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	}, [handleNavigate, nextId, prevId]);

	const handleReveal = async (note: string) => {
		if (!attachmentId) return;
		setRevealError(null);
		try {
			await reveal({ attachmentId, note });
			setRevealed(true);
		} catch (mutationError) {
			setRevealError(mutationError instanceof Error ? mutationError.message : 'Unable to reveal media');
			throw mutationError;
		}
	};

	const handleDecision = async ({ verdict, note }: { verdict: 'clean' | 'tombstone' | 'blocked'; note?: string }) => {
		if (!attachmentId) return;
		await decide({ id: attachmentId, verdict, note });
	};

	const pageError = error ? (error instanceof Error ? error.message : 'Unable to load attachment') : revealError;

	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
				<div className="h-[480px] animate-pulse rounded-3xl bg-slate-100" />
			</div>
		);
	}

	if (!attachment) {
		return <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Attachment not found.</p>;
	}

	return (
		<div className="space-y-6">
			{pageError && (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageError}</div>
			)}
			<QuarantineDetail
				attachment={attachment}
				textScan={textScan}
				revealed={revealed}
				onReveal={handleReveal}
				revealing={revealing}
				onDecision={handleDecision}
				decisionBusy={decisionPending}
				auditEntries={auditData?.items ?? []}
				reputation={reputation ?? null}
				onOpenOcr={() => setOcrOpen(true)}
				onPrev={prevId ? () => handleNavigate(prevId) : undefined}
				onNext={nextId ? () => handleNavigate(nextId) : undefined}
				hasPrev={Boolean(prevId)}
				hasNext={Boolean(nextId)}
			/>
			<OcrDrawer open={ocrOpen} onClose={() => setOcrOpen(false)} text={revealed ? textScan?.ocr ?? null : null} />
		</div>
	);
}
