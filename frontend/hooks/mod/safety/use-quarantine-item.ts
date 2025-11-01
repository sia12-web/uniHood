'use client';

import { useQuery } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';

export type SafetySignalScores = {
	nsfw?: number;
	gore?: number;
	toxicity?: number;
	[signal: string]: number | undefined;
};

export type PerceptualHashMatch = {
	algo: string;
	hash: string;
	label?: string | null;
	source?: string | null;
	score?: number | null;
};

export type QuarantineAttachment = {
	id: string;
	type: 'image' | 'video' | 'file' | 'text';
	status: 'needs_review' | 'quarantined' | 'released';
	preview_url?: string | null;
	download_url?: string | null;
	owner_id?: string | null;
	owner_handle?: string | null;
	subject_id?: string | null;
	subject_type?: string | null;
	subject_url?: string | null;
	campus_id?: string | null;
	created_at: string;
	safety_status?: string | null;
	reporter_count?: number | null;
	signals?: SafetySignalScores;
	hash_match?: PerceptualHashMatch | null;
	audit_target_id?: string | null;
	metadata?: Record<string, unknown>;
};

export type TextScanRecord = {
	id: string;
	subject_type: string;
	subject_id: string;
	ocr?: string | null;
	score_summary?: SafetySignalScores;
	created_at: string;
};

export type QuarantineItemResult = {
	attachment: QuarantineAttachment;
	textScan?: TextScanRecord | null;
};

async function fetchQuarantineAttachment(attachmentId: string): Promise<QuarantineAttachment> {
	const res = await modApi.get<QuarantineAttachment>(`/attachments/${attachmentId}`);
	return res.data;
}

async function fetchTextScan(attachment: QuarantineAttachment): Promise<TextScanRecord | null> {
	if (!attachment.subject_type || !attachment.subject_id) {
		return null;
	}
	const res = await modApi.get<{ items: TextScanRecord[] }>(`/text_scans`, {
		params: {
			subject_type: attachment.subject_type,
			subject_id: attachment.subject_id,
			limit: 1,
		},
	});
	return res.data.items?.[0] ?? null;
}

export function useQuarantineItem(attachmentId: string | null) {
	return useQuery<QuarantineItemResult>({
		queryKey: ['mod:q:item', attachmentId],
		enabled: Boolean(attachmentId),
		staleTime: 10_000,
		queryFn: async () => {
			if (!attachmentId) {
				throw new Error('attachmentId is required');
			}
			const attachment = await fetchQuarantineAttachment(attachmentId);
			const textScan = await fetchTextScan(attachment);
			return { attachment, textScan };
		},
	});
}
