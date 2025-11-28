import { apiFetch as httpFetch, type ApiFetchOptions } from "@/app/lib/http/client";
import { io, Socket } from "socket.io-client";

export type ActivityKind = "typing_duel" | "story_alt" | "trivia" | "rps" | "tictactoe";
export type ActivityState = "lobby" | "active" | "running" | "completed" | "cancelled" | "expired";
export type RoundState = "pending" | "open" | "closed" | "scored";

export type ActivityOptions = {
	typing?: { duration_s?: number };
	story?: { turns?: number; turn_seconds?: number; max_chars_per_turn?: number };
	trivia?: { questions?: number; per_question_s?: number };
	rps?: { best_of?: number };
	tictactoe?: { time_limit_s?: number };
};

export type ActivitySummary = {
	id: string;
	kind: ActivityKind;
	state: ActivityState;
	user_a: string;
	user_b: string;
	created_at: string;
	started_at?: string | null;
	ended_at?: string | null;
	meta: Record<string, unknown>;
};

export type ActivityRound = {
	id: string;
	activity_id: string;
	idx: number;
	state: RoundState;
	opened_at?: string | null;
	closed_at?: string | null;
	meta: Record<string, unknown>;
};

export type ActivityDetail = ActivitySummary & {
	rounds: ActivityRound[];
};

export type ActivityScoreRow = { idx: number } & Record<string, number>;

export type ActivityScoreParticipantPayload = {
	user_id: string;
	handle?: string | null;
	display_name?: string | null;
	avatar_url?: string | null;
	score?: number;
};

export type ScoreboardParticipant = {
	userId: string;
	handle?: string | null;
	displayName?: string | null;
	avatarUrl?: string | null;
	score: number;
};

export type ActivityScorePayload = {
	activity_id: string;
	totals: Record<string, number>;
	per_round: ActivityScoreRow[];
	participants?: ActivityScoreParticipantPayload[] | null;
};

export type Scoreboard = {
	totals: Record<string, number>;
	perRound: Record<number, Record<string, number>>;
	participants: ScoreboardParticipant[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function parseScoreRow(entry: unknown): ActivityScoreRow | null {
	if (!isRecord(entry)) {
		return null;
	}
	const idx = coerceNumber(entry.idx, 0);
	const scores: Record<string, number> = {};
	Object.entries(entry).forEach(([key, value]) => {
		if (key === "idx") {
			return;
		}
		const numeric = coerceNumber(value, 0);
		if (Number.isFinite(numeric)) {
			scores[key] = numeric;
		}
	});
	return { idx, ...scores };
}

export type TypingPromptResponse = {
	prompt: string;
	duration_s: number;
	close_at_ms: number;
};

export type StoryAppendEvent = {
	activity_id: string;
	idx: number;
	user_id: string;
	content: string;
};

export type RoundOpenEvent = {
	activity_id: string;
	round_idx: number;
	prompt?: string;
	options?: string[];
	turn_idx?: number;
	who?: string;
	phase?: string;
	close_at_ms?: number;
};

export type RpsPhaseEvent = {
	activity_id: string;
	round_idx: number;
	phase: "commit" | "reveal" | "scored" | "done";
	close_at_ms?: number;
};

export type ActivitiesServerEvents = {
	"activities:ack": (payload: { ok: boolean }) => void;
	"activity:created": (payload: ActivitySummary) => void;
	"activity:state": (payload: ActivitySummary) => void;
	"activity:ended": (payload: { activity_id: string; reason: string }) => void;
	"round:open": (payload: RoundOpenEvent) => void;
	"round:close": (payload: RoundOpenEvent) => void;
	"score:update": (payload: ActivityScorePayload) => void;
	"story:append": (payload: StoryAppendEvent) => void;
	"trivia:question": (payload: RoundOpenEvent) => void;
	"rps:phase": (payload: RpsPhaseEvent) => void;
};

export type ActivitiesClientEvents = {
	activity_join: (payload: { activity_id: string }) => void;
	activity_leave: (payload: { activity_id: string }) => void;
};

export type ActivitiesSocket = Socket<ActivitiesServerEvents, ActivitiesClientEvents>;

type CreateActivityPayload = {
	kind: ActivityKind;
	options?: ActivityOptions;
};

type StorySubmitPayload = {
	activity_id: string;
	content: string;
};

type TriviaSubmitPayload = {
	activity_id: string;
	round_idx: number;
	choice_idx: number;
};

type TypingSubmitPayload = {
	activity_id: string;
	round_idx: number;
	text: string;
};

type RpsCommitPayload = {
	activity_id: string;
	round_idx: number;
	commit_hash: string;
};

type RpsRevealPayload = {
	activity_id: string;
	round_idx: number;
	choice: "rock" | "paper" | "scissors";
	commit_hash: string;
	nonce: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
// Activity HTTP endpoints live on the main backend (FastAPI); keep the core service URL for legacy session flows only.
const ACTIVITIES_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL ?? API_BASE ?? "").replace(/\/$/, "");
const SOCKET_BASE =
	process.env.NEXT_PUBLIC_ACTIVITIES_CORE_SOCKET_URL ??
	process.env.NEXT_PUBLIC_SOCKET_URL ??
	ACTIVITIES_BASE;

let socketInstance: ActivitiesSocket | null = null;

function resolveUrl(path: string): string {
	if (!ACTIVITIES_BASE) {
		return path;
	}
	return path.startsWith("/") ? `${ACTIVITIES_BASE}${path}` : `${ACTIVITIES_BASE}/${path}`;
}

async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
	return httpFetch<T>(resolveUrl(path), init);
}

async function apiPost<T>(path: string, body?: unknown, init?: ApiFetchOptions): Promise<T> {
	return apiFetch<T>(path, {
		method: "POST",
		body,
		...init,
	});
}

export function activitiesSocket(options?: { token?: string; baseUrl?: string }): ActivitiesSocket {
	if (socketInstance) {
		return socketInstance;
	}
	const url = options?.baseUrl ?? SOCKET_BASE;
	socketInstance = io(url, {
		path: "/socket.io",
		transports: ["websocket"],
		withCredentials: true,
		auth: options?.token ? { token: options.token } : undefined,
	}) as ActivitiesSocket;
	return socketInstance;
}

export function disconnectActivitiesSocket(): void {
	if (socketInstance) {
		socketInstance.disconnect();
		socketInstance = null;
	}
}

export async function createActivity(peerId: string, payload: CreateActivityPayload): Promise<ActivitySummary> {
	return apiPost<ActivitySummary>(`/activities/with/${peerId}`, payload);
}

export async function startActivity(activityId: string): Promise<ActivitySummary> {
	return apiPost<ActivitySummary>(`/activities/${activityId}/start`);
}

export async function cancelActivity(activityId: string, reason: "cancelled" | "expired" = "cancelled"): Promise<ActivitySummary> {
	return apiPost<ActivitySummary>(`/activities/${activityId}/cancel`, { reason });
}

export async function getActivity(activityId: string): Promise<ActivityDetail> {
	return apiFetch<ActivityDetail>(`/activities/${activityId}`);
}

export async function listActivities(): Promise<ActivitySummary[]> {
	return apiFetch<ActivitySummary[]>("/activities");
}

export async function fetchTypingPrompt(activityId: string): Promise<TypingPromptResponse> {
	return apiFetch<TypingPromptResponse>(`/activities/${activityId}/typing/prompt`);
}

export async function submitTyping(payload: TypingSubmitPayload): Promise<ActivityScorePayload> {
	return apiPost<ActivityScorePayload>("/activities/typing/submissions", payload);
}

export async function submitStory(payload: StorySubmitPayload): Promise<Record<string, unknown>> {
	return apiPost<Record<string, unknown>>("/activities/story/submissions", payload);
}

export async function submitTrivia(payload: TriviaSubmitPayload): Promise<ActivityScorePayload> {
	return apiPost<ActivityScorePayload>("/activities/trivia/answers", payload);
}

export async function rpsCommit(payload: RpsCommitPayload): Promise<Record<string, unknown>> {
	return apiPost<Record<string, unknown>>("/activities/rps/commit", payload);
}

export async function rpsReveal(payload: RpsRevealPayload): Promise<ActivityScorePayload> {
	return apiPost<ActivityScorePayload>("/activities/rps/reveal", payload);
}

export async function reseedTrivia(activityId: string, questions: number): Promise<ActivitySummary> {
	return apiPost<ActivitySummary>(`/activities/${activityId}/trivia/seed`, { questions });
}

export function normalizeScoreboard(payload?: ActivityScorePayload | null): Scoreboard {
	const totals: Record<string, number> = {};
	const perRound: Record<number, Record<string, number>> = {};
	const participantsMap = new Map<string, ScoreboardParticipant>();

	const mergeParticipant = (userId: string, partial?: Partial<ScoreboardParticipant>): void => {
		if (!userId) {
			return;
		}
		const existing = participantsMap.get(userId) ?? { userId, score: 0 };
		participantsMap.set(userId, {
			userId,
			score: partial?.score ?? existing.score ?? 0,
			handle: partial?.handle ?? existing.handle,
			displayName: partial?.displayName ?? existing.displayName,
			avatarUrl: partial?.avatarUrl ?? existing.avatarUrl,
		});
	};
	if (payload) {
		Object.entries(payload.totals ?? {}).forEach(([userId, value]) => {
			totals[userId] = coerceNumber(value, 0);
		});
		for (const row of payload.per_round ?? []) {
			const { idx, ...scores } = row;
			perRound[idx] = {};
			Object.entries(scores).forEach(([userId, value]) => {
				perRound[idx][userId] = coerceNumber(value, 0);
			});
		}
		if (Array.isArray(payload.participants)) {
			payload.participants.forEach((entry) => {
				if (!entry) {
					return;
				}
				const userId = entry.user_id ?? (entry as unknown as { userId?: string }).userId;
				if (!userId) {
					return;
				}
				const maybeScore = typeof entry.score === "number" ? entry.score : coerceNumber(entry.score, NaN);
				mergeParticipant(userId, {
					handle: entry.handle ?? null,
					displayName: entry.display_name ?? null,
					avatarUrl: entry.avatar_url ?? null,
					score: Number.isFinite(maybeScore) ? maybeScore : undefined,
				});
			});
		}
	}
	Object.entries(totals).forEach(([userId, score]) => {
		mergeParticipant(userId, { score });
	});
	const participants = Array.from(participantsMap.values()).map((participant) => ({
		...participant,
		score: totals[participant.userId] ?? participant.score ?? 0,
	}));
	participants.sort((a, b) => {
		const diff = b.score - a.score;
		if (Math.abs(diff) > 1e-6) {
			return diff;
		}
		const labelA = (a.displayName ?? a.handle ?? a.userId).toLowerCase();
		const labelB = (b.displayName ?? b.handle ?? b.userId).toLowerCase();
		return labelA.localeCompare(labelB);
	});
	return { totals, perRound, participants };
}

export function summaryToScoreboard(summary: ActivitySummary): Scoreboard {
	const summaryMeta = summary.meta ?? {};
	const raw = isRecord(summaryMeta) ? summaryMeta.score : undefined;
	if (!raw) {
		return { totals: {}, perRound: {}, participants: [] };
	}
	const totalsSource = isRecord(raw) && isRecord(raw.totals) ? raw.totals : {};
	const perRoundSource =
		isRecord(raw) && Array.isArray(raw.per_round)
			? raw.per_round
			: [];
	const participantsPayload: ActivityScoreParticipantPayload[] = [];
	const participantsSource = isRecord(raw) ? raw.participants : undefined;
	if (Array.isArray(participantsSource)) {
		participantsSource.forEach((entry) => {
			if (!isRecord(entry)) {
				return;
			}
			const userId = typeof entry.user_id === "string" ? entry.user_id : typeof entry.userId === "string" ? (entry.userId as string) : undefined;
			if (!userId) {
				return;
			}
			const maybeScore = typeof entry.score === "number" ? entry.score : coerceNumber(entry.score, NaN);
			participantsPayload.push({
				user_id: userId,
				handle: typeof entry.handle === "string" ? entry.handle : undefined,
				display_name: typeof entry.display_name === "string" ? entry.display_name : undefined,
				avatar_url: typeof entry.avatar_url === "string" ? entry.avatar_url : undefined,
				score: Number.isFinite(maybeScore) ? maybeScore : undefined,
			});
		});
	} else if (isRecord(participantsSource)) {
		Object.entries(participantsSource).forEach(([userId, value]) => {
			if (!isRecord(value)) {
				return;
			}
			const maybeScore = typeof value.score === "number" ? value.score : coerceNumber(value.score, NaN);
			participantsPayload.push({
				user_id: userId,
				handle: typeof value.handle === "string" ? value.handle : undefined,
				display_name: typeof value.display_name === "string" ? value.display_name : undefined,
				avatar_url: typeof value.avatar_url === "string" ? value.avatar_url : undefined,
				score: Number.isFinite(maybeScore) ? maybeScore : undefined,
			});
		});
	}
	const payload: ActivityScorePayload = {
		activity_id: summary.id,
		totals: Object.fromEntries(
			Object.entries(totalsSource).map(([userId, value]) => [userId, coerceNumber(value, 0)]),
		),
		per_round: perRoundSource
			.map((entry) => parseScoreRow(entry))
			.filter((row): row is ActivityScoreRow => row !== null),
		participants: participantsPayload,
	};
	return normalizeScoreboard(payload);
}
