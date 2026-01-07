import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { readAuthSnapshot } from '@/lib/auth-storage';
import {
	createSession,
	fetchSessionSnapshot,
	getSelf,
	joinSession,
	leaveSession,
	setSessionReady,
	startSession,
} from '../api/client';

export type LobbyParticipant = {
	userId: string;
	joined: boolean;
	ready: boolean;
	displayName?: string | null;
	handle?: string | null;
	avatarUrl?: string | null;
};

export type ScoreboardEntry = {
	userId: string;
	score: number;
	displayName?: string | null;
	handle?: string | null;
	avatarUrl?: string | null;
};

type ConnectionQuality = 'Good' | 'Fair' | 'Poor';

type CountdownState = {
	startedAt: number;
	durationMs: number;
	endsAt: number;
	reason?: 'lobby' | 'intermission';
	nextRoundIndex?: number;
};

export type SessionPhase =
	| 'idle'
	| 'connecting'
	| 'lobby'
	| 'countdown'
	| 'running'
	| 'ended'
	| 'error';

export type SessionState = {
	phase: SessionPhase;
	sessionId?: string;
	activityKey?: 'speed_typing';
	currentRound?: number;
	scoreboard: ScoreboardEntry[];
	countdown?: CountdownState;
	lobby?: {
		participants: LobbyParticipant[];
		ready: boolean;
		phase?: 'lobby' | 'countdown' | 'running';
	};
	winnerUserId?: string;
	penalty?: { message: string; kind?: string } | null;
	skewEstimateMs?: number;
	rttMs?: number;
	connectionQuality?: ConnectionQuality;
	error?: string;
	leaveReason?: 'opponent_left' | 'forfeit' | null;
};

export type UseSpeedTypingOptions = {
	sessionId?: string;
	autoStart?: boolean;
	peerId?: string;
};

type OutboundMessage =
	| { type: 'keystroke'; payload: { userId: string; tClientMs: number; len: number; isPaste?: boolean } }
	| { type: 'submit'; payload: { userId: string; typedText: string; clientMs?: number } }
	| { type: 'ping'; payload: { tClientMs: number } };

type SessionSnapshotPayload = {
	id: string;
	status: 'pending' | 'running' | 'ended';
	activityKey: 'speed_typing';
	participants: Array<{ userId: string; score: number }>;
	currentRoundIndex?: number;
	rounds: Array<{ index: number; state: 'queued' | 'running' | 'done' }>;
	lobbyReady?: boolean;
	lobbyPhase?: boolean;
	presence?: Array<{ userId: string; joined: boolean; ready: boolean }>;
	countdown?: CountdownState | null;
};

type RoundStartedPayload = {
	sessionId: string;
	index: number;
	payload?: { textSample?: string; timeLimitMs?: number } | null;
};

type RoundEndedPayload = {
	sessionId: string;
	index: number;
	scoreboard: {
		participants: Array<{ userId: string; score: number }>;
	};
};

type ScoreUpdatedPayload = {
	sessionId: string;
	userId: string;
	delta: number;
	total: number;
};

type SessionStartedPayload = {
	sessionId: string;
	currentRound: number;
};

type SessionEndedPayload = {
	sessionId: string;
	finalScoreboard?: {
		participants: Array<{ userId: string; score: number }>;
		winnerUserId?: string;
	};
	winnerUserId?: string;
	reason?: 'opponent_left' | 'forfeit';
};

type PresenceEventPayload = {
	sessionId: string;
	participants: Array<{ userId: string; joined: boolean; ready: boolean }>;
	lobbyReady?: boolean;
	phase?: 'lobby' | 'countdown' | 'running';
};

type CountdownEventPayload = {
	sessionId: string;
	startedAt: number;
	durationMs: number;
	endsAt: number;
	reason?: 'lobby' | 'intermission';
	nextRoundIndex?: number;
};

type CountdownCancelledPayload = {
	sessionId: string;
	reason: string;
};

type PenaltyAppliedPayload = {
	sessionId: string;
	userId: string;
	amount?: number;
	incidents?: Array<{ type: string;[key: string]: unknown }>;
};

type PongPayload = {
	tServerMs: number;
	skewEstimateMs?: number;
};

type ErrorPayload = {
	code?: string;
	details?: unknown;
};

type ServerMessage = {
	type: string;
	payload?: unknown;
};

const CORE_BASE = (process.env.NEXT_PUBLIC_ACTIVITIES_CORE_URL || '/api').replace(/\/$/, '');
const PING_INTERVAL_MS = 10_000;
const SHOULD_LOG_WS_EVENTS = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

function classifyLatency(rtt: number | undefined): ConnectionQuality | undefined {
	if (rtt == null) {
		return undefined;
	}
	if (rtt < 200) {
		return 'Good';
	}
	if (rtt < 400) {
		return 'Fair';
	}
	return 'Poor';
}

function resolveStreamUrl(sessionId: string, token?: string, userId?: string): string {
	const isAbsolute = CORE_BASE.startsWith('http://') || CORE_BASE.startsWith('https://');
	let origin: string;
	if (isAbsolute) {
		origin = CORE_BASE.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
	} else if (typeof window !== 'undefined') {
		const { origin: currentOrigin } = window.location;
		const wsOrigin = currentOrigin.startsWith('https://')
			? `wss://${currentOrigin.slice('https://'.length)}`
			: currentOrigin.startsWith('http://')
				? `ws://${currentOrigin.slice('http://'.length)}`
				: `ws://${currentOrigin}`;
		const prefix = CORE_BASE ? (CORE_BASE.startsWith('/') ? CORE_BASE : `/${CORE_BASE}`) : '';
		origin = `${wsOrigin}${prefix}`;
	} else {
		origin = `ws://localhost${CORE_BASE.startsWith('/') ? CORE_BASE : CORE_BASE ? `/${CORE_BASE}` : ''}`;
	}
	const base = `${origin}/activities/session/${sessionId}/stream`;
	const params: Record<string, string> = {};
	if (token) {
		params.authToken = token;
	}
	if (userId) {
		params.userId = userId;
	}
	const keys = Object.keys(params);
	if (keys.length === 0) {
		return base;
	}
	const query = keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
	const glue = base.includes('?') ? (base.endsWith('?') ? '' : '&') : '?';
	return `${base}${glue}${query}`;
}

function mergeScoreboard(current: ScoreboardEntry[], updates: Array<{ userId: string; score: number }>): ScoreboardEntry[] {
	const map = new Map<string, ScoreboardEntry>();
	for (const entry of current) {
		map.set(entry.userId, { ...entry });
	}
	for (const update of updates) {
		const existing = map.get(update.userId);
		map.set(update.userId, {
			userId: update.userId,
			score: update.score,
			displayName: existing?.displayName ?? null,
			handle: existing?.handle ?? null,
			avatarUrl: existing?.avatarUrl ?? null,
		});
	}
	return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

export function useSpeedTypingSession(options: UseSpeedTypingOptions) {
	const { sessionId: initialSessionId, autoStart = false, peerId } = options;
	const selfUserIdRef = useRef<string>(getSelf());

	const [state, setState] = useState<SessionState>({ phase: 'idle', scoreboard: [], penalty: null });
	const [textSample, setTextSample] = useState('');
	const [timeLimitMs, setTimeLimitMs] = useState<number | undefined>(undefined);
	const [typedText, setTypedText] = useState('');
	const [submitted, setSubmitted] = useState(false);
	const [countdownTick, setCountdownTick] = useState(0); // drives countdown re-render cadence

	const wsRef = useRef<WebSocket | null>(null);
	const sessionIdRef = useRef<string | null>(initialSessionId ?? null);
	const joinedRef = useRef(false);
	const closingRef = useRef(false);
	const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const toastRef = useRef<{ message: string; timeoutId: ReturnType<typeof setTimeout> | null }>({ message: '', timeoutId: null });
	const creatingRef = useRef(false);
	const lastPingSentRef = useRef<number>(0);
	const autoStartTriggeredRef = useRef(false);

	const pushToast = useCallback((message: string, ttl = 2500) => {
		if (toastRef.current.timeoutId) {
			clearTimeout(toastRef.current.timeoutId);
		}
		toastRef.current.message = message;
		toastRef.current.timeoutId = setTimeout(() => {
			toastRef.current.message = '';
			toastRef.current.timeoutId = null;
		}, ttl);
	}, []);

	const handleSnapshot = useCallback((payload: SessionSnapshotPayload) => {
		setState((prev) => {
			const nextScoreboard = mergeScoreboard(prev.scoreboard, payload.participants);
			const participants = payload.presence?.map((entry) => {
				const existing = prev.lobby?.participants.find((candidate) => candidate.userId === entry.userId);
				return {
					userId: entry.userId,
					joined: entry.joined,
					ready: entry.ready,
					displayName: existing?.displayName ?? null,
					handle: existing?.handle ?? null,
					avatarUrl: existing?.avatarUrl ?? null,
				};
			}) ?? prev.lobby?.participants ?? [];

			let nextPhase: SessionPhase = prev.phase;
			if (payload.status === 'ended') {
				nextPhase = 'ended';
			} else if (payload.countdown) {
				nextPhase = 'countdown';
			} else if (payload.status === 'running') {
				nextPhase = 'running';
			} else if (prev.phase === 'idle' || prev.phase === 'connecting') {
				nextPhase = 'lobby';
			}

			// Grace period: avoid a snapshot instantly overwriting an active countdown
			// when backend snapshot emission lags the separate countdown event.
			const now = Date.now();
			const countdownActive = prev.phase === 'countdown' && prev.countdown && typeof prev.countdown.endsAt === 'number' && prev.countdown.endsAt > now;
			if (!payload.countdown && countdownActive && payload.status !== 'running' && payload.status !== 'ended') {
				nextPhase = 'countdown';
			}

			return {
				...prev,
				phase: nextPhase,
				sessionId: payload.id,
				activityKey: payload.activityKey,
				currentRound: payload.currentRoundIndex,
				scoreboard: nextScoreboard,
				countdown: payload.countdown ?? (nextPhase === 'countdown' ? prev.countdown : undefined),
				lobby: payload.presence
					? {
						participants,
						ready: Boolean(payload.lobbyReady),
						phase: payload.countdown || (nextPhase === 'countdown' && countdownActive) ? 'countdown' : nextPhase === 'running' ? 'running' : 'lobby',
					}
					: prev.lobby,
				error: undefined,
			};
		});
		setSubmitted(false);
		setTypedText('');
		setCountdownTick((tick) => tick + 1);
	}, []);

	const handlePresenceEvent = useCallback((payload: PresenceEventPayload) => {
		setState((prev) => ({
			...prev,
			phase: payload.phase ?? prev.phase,
			lobby: {
				participants: payload.participants.map((participant) => {
					const existing = prev.lobby?.participants.find((entry) => entry.userId === participant.userId);
					return {
						userId: participant.userId,
						joined: participant.joined,
						ready: participant.ready,
						displayName: existing?.displayName ?? null,
						handle: existing?.handle ?? null,
						avatarUrl: existing?.avatarUrl ?? null,
					};
				}),
				ready: Boolean(payload.lobbyReady),
				phase: payload.phase ?? prev.lobby?.phase ?? 'lobby',
			},
		}));
	}, []);

	const handleCountdownEvent = useCallback((payload: CountdownEventPayload) => {
		setState((prev) => ({
			...prev,
			phase: 'countdown',
			countdown: {
				startedAt: payload.startedAt,
				durationMs: payload.durationMs,
				endsAt: payload.endsAt,
				reason: payload.reason,
				nextRoundIndex: payload.nextRoundIndex,
			},
		}));
		setCountdownTick((tick) => tick + 1);
	}, []);

	const handleCountdownCancelled = useCallback((payload: CountdownCancelledPayload) => {
		setState((prev) => ({
			...prev,
			phase: prev.phase === 'countdown' ? 'lobby' : prev.phase,
			countdown: undefined,
			error: payload.reason === 'participant_unready' ? 'Opponent is no longer ready.' : prev.error,
		}));
	}, []);

	const handleRoundStarted = useCallback((payload: RoundStartedPayload) => {
		setState((prev) => ({
			...prev,
			phase: 'running',
			currentRound: payload.index,
			countdown: undefined,
			lobby: undefined,
		}));
		setSubmitted(false);
		setTypedText('');
		setTextSample(payload.payload?.textSample ?? '');
		setTimeLimitMs(payload.payload?.timeLimitMs ?? undefined);
	}, []);

	const handleRoundEnded = useCallback((payload: RoundEndedPayload) => {
		setState((prev) => ({
			...prev,
			scoreboard: mergeScoreboard(prev.scoreboard, payload.scoreboard.participants),
		}));
	}, []);

	const handleScoreUpdated = useCallback((payload: ScoreUpdatedPayload) => {
		setState((prev) => ({
			...prev,
			scoreboard: mergeScoreboard(prev.scoreboard, [{ userId: payload.userId, score: payload.total }]),
		}));
	}, []);

	const handleSessionStarted = useCallback((payload: SessionStartedPayload) => {
		setState((prev) => ({
			...prev,
			phase: 'running',
			currentRound: payload.currentRound,
			countdown: undefined,
		}));
	}, []);

	const handleSessionEnded = useCallback((payload: SessionEndedPayload) => {
		setState((prev) => ({
			...prev,
			phase: 'ended',
			winnerUserId: payload.winnerUserId ?? payload.finalScoreboard?.winnerUserId,
			countdown: undefined,
			lobby: undefined,
			scoreboard: payload.finalScoreboard
				? mergeScoreboard(prev.scoreboard, payload.finalScoreboard.participants)
				: prev.scoreboard,
			leaveReason: payload.reason === 'opponent_left' ? 'opponent_left' : undefined,
		}));
	}, []);

	const handlePenaltyApplied = useCallback((payload: PenaltyAppliedPayload) => {
		const labels = payload.incidents?.map((incident) => incident.type).filter(Boolean) ?? [];
		const message = labels.length > 0 ? labels.join(', ') : 'Penalty applied';
		const suffix = payload.amount ? ` (-${payload.amount})` : '';
		const fullMessage = `${message}${suffix}`;
		setState((prev) => ({
			...prev,
			penalty: { message: fullMessage, kind: labels[0] },
		}));
		setTimeout(() => {
			setState((prev) => (prev.penalty?.message === fullMessage ? { ...prev, penalty: null } : prev));
		}, 1_200);
	}, []);

	const handlePong = useCallback((payload: PongPayload) => {
		const now = performance.now();
		const rtt = now - lastPingSentRef.current;
		setState((prev) => ({
			...prev,
			skewEstimateMs: payload.skewEstimateMs,
			rttMs: rtt,
			connectionQuality: classifyLatency(rtt),
		}));
	}, []);

	const handleErrorMessage = useCallback((payload: ErrorPayload | undefined) => {
		const code = payload?.code ?? 'session_error';
		if (typeof window !== 'undefined') {
			(window as unknown as { __activitiesLastError?: ErrorPayload | undefined }).__activitiesLastError = payload;
		}
		// Surface detailed payload in the console so we can pinpoint backend failures quickly.
		if (process.env.NODE_ENV !== 'production') {
			// eslint-disable-next-line no-console
			console.error('[speed-typing] session error payload', payload);
		}
		setState((prev) => ({ ...prev, error: code }));
		const details = payload && 'details' in payload ? JSON.stringify(payload.details) : undefined;
		pushToast(`Session error: ${code}${details ? ` — ${details}` : ''}`);
	}, [pushToast]);

	const handleServerMessage = useCallback(
		(event: MessageEvent<string>) => {
			let parsed: ServerMessage | null = null;
			try {
				parsed = JSON.parse(event.data) as ServerMessage;
			} catch {
				return;
			}
			if (!parsed || typeof parsed.type !== 'string') {
				return;
			}
			switch (parsed.type) {
				case 'session.snapshot':
					if (SHOULD_LOG_WS_EVENTS) {
						// eslint-disable-next-line no-console
						console.debug('[speed-typing] ws snapshot', { sessionId: sessionIdRef.current });
					}
					handleSnapshot(parsed.payload as SessionSnapshotPayload);
					break;
				case 'activity.round.started':
					if (SHOULD_LOG_WS_EVENTS) {
						const payload = parsed.payload as RoundStartedPayload | undefined;
						if (payload) {
							// eslint-disable-next-line no-console
							console.debug('[speed-typing] ws round.started', {
								sessionId: payload.sessionId,
								index: payload.index,
							});
						}
					}
					handleRoundStarted(parsed.payload as RoundStartedPayload);
					break;
				case 'activity.round.ended':
					if (SHOULD_LOG_WS_EVENTS) {
						const payload = parsed.payload as RoundEndedPayload | undefined;
						if (payload) {
							// eslint-disable-next-line no-console
							console.debug('[speed-typing] ws round.ended', {
								sessionId: payload.sessionId,
								index: payload.index,
							});
						}
					}
					handleRoundEnded(parsed.payload as RoundEndedPayload);
					break;
				case 'activity.session.started':
					handleSessionStarted(parsed.payload as SessionStartedPayload);
					break;
				case 'activity.session.ended':
					if (SHOULD_LOG_WS_EVENTS) {
						const payload = parsed.payload as SessionEndedPayload | undefined;
						if (payload) {
							// eslint-disable-next-line no-console
							console.debug('[speed-typing] ws session.ended', {
								sessionId: payload.sessionId,
								winnerUserId: payload.winnerUserId ?? payload.finalScoreboard?.winnerUserId,
							});
						}
					}
					handleSessionEnded(parsed.payload as SessionEndedPayload);
					break;
				case 'activity.session.presence':
					handlePresenceEvent(parsed.payload as PresenceEventPayload);
					break;
				case 'activity.session.countdown':
					if (SHOULD_LOG_WS_EVENTS) {
						const payload = parsed.payload as CountdownEventPayload | undefined;
						if (payload) {
							const secondsRemaining =
								typeof payload.endsAt === 'number'
									? Math.max(Math.round((payload.endsAt - Date.now()) / 1000), 0)
									: undefined;
							// eslint-disable-next-line no-console
							console.debug('[speed-typing] ws session.countdown', {
								sessionId: payload.sessionId,
								reason: payload.reason,
								nextRoundIndex: payload.nextRoundIndex,
								secondsRemaining,
							});
						}
					}
					handleCountdownEvent(parsed.payload as CountdownEventPayload);
					break;
				case 'activity.session.countdown.cancelled':
					handleCountdownCancelled(parsed.payload as CountdownCancelledPayload);
					break;
				case 'activity.score.updated':
					handleScoreUpdated(parsed.payload as ScoreUpdatedPayload);
					break;
				case 'activity.penalty.applied':
					handlePenaltyApplied(parsed.payload as PenaltyAppliedPayload);
					break;
				case 'ack': {
					// After submission acknowledgement, request fresh participants for scoreboard merge.
					const id = sessionIdRef.current;
					if (id) {
						void fetchSessionSnapshot(id)
							.then((snap) => {
								if (!snap) return;
								const participants = Array.isArray((snap as { participants?: Array<{ userId: string; score: number }> }).participants)
									? (snap as { participants: Array<{ userId: string; score: number }> }).participants
									: [];
								setState((prev) => ({
									...prev,
									scoreboard: mergeScoreboard(prev.scoreboard, participants),
								}));
							})
							.catch(() => undefined);
					}
					break;
				}
				case 'pong':
					handlePong(parsed.payload as PongPayload);
					break;
				case 'error':
					handleErrorMessage(parsed.payload as ErrorPayload);
					break;
				default:
					break;
			}
		},
		[
			handleCountdownCancelled,
			handleCountdownEvent,
			handleErrorMessage,
			handlePenaltyApplied,
			handlePong,
			handlePresenceEvent,
			handleRoundEnded,
			handleRoundStarted,
			handleScoreUpdated,
			handleSessionEnded,
			handleSessionStarted,
			handleSnapshot,
		],
	);

	const disconnectSocket = useCallback(() => {
		const socket = wsRef.current;
		if (!socket) {
			return;
		}
		closingRef.current = true;
		try {
			socket.close(1000, 'component_disposed');
		} catch {
			/* ignore close errors */
		}
		wsRef.current = null;
	}, []);

	const connectStream = useCallback(
		(id: string) => {
			if (typeof window === 'undefined') {
				return;
			}
			const auth = readAuthSnapshot();
			const token = auth?.access_token;
			const selfId = selfUserIdRef.current;
			const url = resolveStreamUrl(id, token, selfId);
			if (process.env.NODE_ENV !== 'production') {
				// eslint-disable-next-line no-console
				console.debug('[speed-typing] opening stream', url);
			}
			const socket = new WebSocket(url);
			wsRef.current = socket;
			closingRef.current = false;

			socket.addEventListener('open', () => {
				setState((prev) => ({ ...prev, phase: prev.phase === 'idle' ? 'connecting' : prev.phase }));
			});

			socket.addEventListener('message', handleServerMessage);

			socket.addEventListener('close', (event) => {
				if (process.env.NODE_ENV !== 'production') {
					// eslint-disable-next-line no-console
					console.warn('[speed-typing] stream closed', { code: event.code, reason: event.reason });
				}
				if (wsRef.current === socket) {
					wsRef.current = null;
				}
				// Fallback: if we missed 'session.ended', try a final snapshot to resolve winner/scoreboard
				const currentId = sessionIdRef.current;
				if (currentId && !closingRef.current) {
					void fetchSessionSnapshot(currentId)
						.then((snap) => {
							if (!snap) return;
							const participants = Array.isArray(snap.participants) ? snap.participants : [];
							const roundsHolder = (snap as unknown as { rounds?: Array<{ state: string }> });
							const rounds = Array.isArray(roundsHolder.rounds) ? roundsHolder.rounds : [];
							const allDone = rounds.length > 0 && rounds.every((r) => r.state === 'done');
							const statusHolder = snap as unknown as { status?: string };
							if (allDone || statusHolder.status === 'ended') {
								setState((prev) => {
									const merged = mergeScoreboard(prev.scoreboard, participants);
									const winnerId = merged[0]?.userId;
									return {
										...prev,
										phase: 'ended',
										winnerUserId: winnerId ?? prev.winnerUserId,
										scoreboard: merged,
										connectionQuality: undefined,
									};
								});
								return;
							}
							// Not ended; mark as error unless already ended
							setState((prev) => ({ ...prev, phase: prev.phase === 'ended' ? prev.phase : 'error', connectionQuality: undefined }));
						})
						.catch(() => {
							setState((prev) => ({ ...prev, phase: prev.phase === 'ended' ? prev.phase : 'error', connectionQuality: undefined }));
						});
				} else {
					setState((prev) => ({ ...prev, phase: prev.phase === 'ended' ? prev.phase : 'error', connectionQuality: undefined }));
				}
				closingRef.current = false;
			});

			socket.addEventListener('error', (event) => {
				if (process.env.NODE_ENV !== 'production') {
					// eslint-disable-next-line no-console
					console.error('[speed-typing] stream error', event);
				}
				setState((prev) => ({ ...prev, phase: prev.phase === 'ended' ? prev.phase : 'error' }));
			});
		},
		[handleServerMessage],
	);

	const sendSocketMessage = useCallback((message: OutboundMessage) => {
		const socket = wsRef.current;
		if (socket && socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify(message));
		}
	}, []);

	useEffect(() => {
		// Capture the current timeout id so cleanup doesn't rely on a potentially changed ref
		const activeTimeout = toastRef.current.timeoutId;
		return () => {
			if (activeTimeout) {
				clearTimeout(activeTimeout);
			}
		};
	}, []);

	useEffect(() => {
		if (state.countdown && !countdownIntervalRef.current) {
			countdownIntervalRef.current = setInterval(() => {
				setCountdownTick((tick) => tick + 1);
			}, 150);
		} else if (!state.countdown && countdownIntervalRef.current) {
			clearInterval(countdownIntervalRef.current);
			countdownIntervalRef.current = null;
		}
	}, [state.countdown]);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return () => undefined;
		}

		// Capture the current self user id at effect start to use in async flows and cleanup
		const selfIdStable = selfUserIdRef.current;

		let cancelled = false;

		const initialise = async () => {
			const selfId = selfIdStable;
			setState((prev) => ({ ...prev, phase: 'connecting', error: undefined }));

			try {
				let targetSessionId = initialSessionId;
				if (!targetSessionId) {
					if (!peerId) {
						throw new Error('peer_required');
					}
					if (creatingRef.current) {
						return;
					}
					creatingRef.current = true;
					const created = await createSession('speed_typing', [selfId, peerId]);
					targetSessionId = created.sessionId;
				}

				if (cancelled || !targetSessionId) {
					return;
				}

				sessionIdRef.current = targetSessionId;

				const sessionToJoin = targetSessionId;
				if (!sessionToJoin) {
					throw new Error("missing_session");
				}

				const waitForRoster = async () => {
					if (typeof fetchSessionSnapshot !== 'function') {
						return true;
					}
					const maxChecks = 6;
					for (let attempt = 0; attempt < maxChecks; attempt += 1) {
						try {
							const snapshot = await fetchSessionSnapshot(sessionToJoin);
							const participants = snapshot?.participants ?? [];
							const presence = snapshot?.presence ?? [];
							const exists = participants.some((entry) => entry.userId === selfId) || presence.some((entry) => entry.userId === selfId);
							if (exists) {
								return true;
							}
						} catch {
							// Ignore snapshot fetch errors and retry; join retry handles hard failures.
						}
						const delay = 200 * Math.pow(2, attempt);
						await new Promise((resolve) => setTimeout(resolve, delay));
					}
					return false;
				};

				const joinWithRetry = async () => {
					const maxAttempts = 5;
					let attempt = 0;
					let lastError: unknown = null;
					while (attempt < maxAttempts) {
						try {
							await joinSession(sessionToJoin, selfId);
							return true;
						} catch (error) {
							lastError = error;
							const message = error instanceof Error ? error.message : "";
							if (!message.includes("participant_not_found")) {
								break;
							}
							const delay = 200 * Math.pow(2, attempt);
							await new Promise((resolve) => setTimeout(resolve, delay));
							attempt += 1;
						}
					}
					throw lastError ?? new Error("join_failed");
				};

				const rosterReady = await waitForRoster();
				if (cancelled) {
					return;
				}
				if (!rosterReady) {
					throw new Error('participant_not_registered');
				}

				await joinWithRetry();
				if (cancelled) {
					return;
				}

				joinedRef.current = true;
				connectStream(targetSessionId);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'session_init_failed';
				if (!cancelled) {
					setState((prev) => ({ ...prev, phase: 'error', error: message }));
					pushToast(`Unable to join session: ${message}`);
				}
			} finally {
				creatingRef.current = false;
			}
		};

		disconnectSocket();
		if (countdownIntervalRef.current) {
			clearInterval(countdownIntervalRef.current);
			countdownIntervalRef.current = null;
		}

		void initialise();

		return () => {
			cancelled = true;
			disconnectSocket();
			if (countdownIntervalRef.current) {
				clearInterval(countdownIntervalRef.current);
				countdownIntervalRef.current = null;
			}
			const currentId = sessionIdRef.current;
			// Guard: only attempt leave if we still have an active session id
			// and we previously joined. Once leave reports that the session is
			// ended, clear local state so we don't reuse stale IDs.
			if (currentId && joinedRef.current) {
				joinedRef.current = false;
				void leaveSession(currentId, selfIdStable)
					.then((result) => {
						if (result === 'session_ended') {
							pushToast('Session ended, start a new session to play again.');
							// Clear client-side session tracking so no further /leave or
							// /ready calls are made with a stale id.
							sessionIdRef.current = null;
							setState((prev) => ({
								...prev,
								phase: 'idle',
								sessionId: undefined,
							}));
						}
					})
					.catch(() => undefined);
			}
		};
	}, [connectStream, disconnectSocket, initialSessionId, peerId, pushToast, selfUserIdRef]);

	const markReady = useCallback(
		async (ready: boolean) => {
			const id = sessionIdRef.current;
			if (!id) {
				return;
			}
			try {
				await setSessionReady(id, selfUserIdRef.current, ready);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'ready_failed';
				pushToast(message);
			}
		},
		[pushToast],
	);

	const recordKeystroke = useCallback(
		(len: number, isPaste?: boolean) => {
			const now = performance.now();
			if (now - lastPingSentRef.current > PING_INTERVAL_MS) {
				lastPingSentRef.current = now;
				sendSocketMessage({ type: 'ping', payload: { tClientMs: Date.now() } });
			}
			sendSocketMessage({
				type: 'keystroke',
				payload: {
					userId: selfUserIdRef.current,
					tClientMs: Date.now(),
					len,
					isPaste,
				},
			});
		},
		[sendSocketMessage],
	);

	const onChangeText = useCallback(
		(value: string) => {
			setTypedText(value);
			recordKeystroke(value.length);
		},
		[recordKeystroke],
	);

	const submit = useCallback(() => {
		if (submitted || state.phase !== 'running') {
			return;
		}
		sendSocketMessage({
			type: 'submit',
			payload: {
				userId: selfUserIdRef.current,
				typedText,
				clientMs: Date.now(),
			},
		});
		setSubmitted(true);
	}, [sendSocketMessage, state.phase, submitted, typedText]);

	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if ((event.ctrlKey || event.metaKey) && (event.key === 'v' || event.key === 'V')) {
				event.preventDefault();
				pushToast('Paste blocked');
				recordKeystroke(typedText.length, true);
				return;
			}
			if (event.shiftKey && event.key === 'Insert') {
				event.preventDefault();
				pushToast('Paste blocked');
				recordKeystroke(typedText.length, true);
				return;
			}
			if (event.key === 'Enter' && textSample && typedText.length >= textSample.length) {
				event.preventDefault();
				submit();
			}
		},
		[pushToast, recordKeystroke, submit, textSample, typedText.length],
	);

	const markPasteDetected = useCallback(() => {
		recordKeystroke(typedText.length, true);
	}, [recordKeystroke, typedText.length]);

	const readyUp = useCallback(async () => {
		await markReady(true);
	}, [markReady]);

	const unready = useCallback(async () => {
		await markReady(false);
	}, [markReady]);

	const leave = useCallback(async () => {
		const id = sessionIdRef.current;
		const selfId = selfUserIdRef.current;
		if (!id || !selfId) return;

		// Send leave via WebSocket first for immediate feedback
		const ws = wsRef.current;
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({
				type: 'leave',
				payload: { userId: selfId }
			}));
		}

		// Also call REST API as backup
		try {
			await leaveSession(id, selfId);
		} catch {
			// Ignore errors, websocket should handle it
		}
	}, []);

	const startCountdown = useCallback(async () => {
		const id = sessionIdRef.current;
		if (!id) {
			return;
		}
		try {
			await startSession(id);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'start_failed';
			setState((prev) => ({ ...prev, error: message }));
			pushToast(`Unable to start session: ${message}`);
		}
	}, [pushToast]);

	useEffect(() => {
		if (state.phase === 'lobby') {
			autoStartTriggeredRef.current = false;
		}
		if (state.phase === 'lobby' && autoStart && !autoStartTriggeredRef.current) {
			autoStartTriggeredRef.current = true;
			const id = sessionIdRef.current;
			if (!id) {
				return;
			}
			void startSession(id).catch((error: unknown) => {
				const message = error instanceof Error ? error.message : 'start_failed';
				setState((prev) => ({ ...prev, error: message }));
				pushToast(`Unable to start session: ${message}`);
			});
		}
	}, [autoStart, pushToast, state.phase]);


	// NOTE: Game outcome is recorded by the backend activities-core service via WebSocket
	// Do NOT record from frontend to avoid double-counting stats
	// The useEffect that called maybeRecordOutcome has been removed

	const remainingMs = useMemo(() => {
		// include countdownTick to drive updates at ~150ms cadence while countdown is active
		void countdownTick;
		if (!state.countdown) {
			return undefined;
		}
		return Math.max(0, state.countdown.endsAt - Date.now());
	}, [state.countdown, countdownTick]);

	const remainingSeconds = remainingMs != null ? Math.ceil(remainingMs / 1000) : undefined;
	const countdownFinal = Boolean(remainingMs !== undefined && remainingMs <= 4000);

	const progress = useMemo(() => {
		if (!textSample || state.phase !== 'running') {
			return 0;
		}
		return Math.min(1, typedText.length / textSample.length);
	}, [state.phase, textSample, typedText.length]);

	const wpm = useMemo(() => {
		if (state.phase !== 'running') {
			return 0;
		}
		const minutes = timeLimitMs ? timeLimitMs / 60000 : 0.5;
		return minutes > 0 ? (typedText.length / 5) / minutes : 0;
	}, [state.phase, timeLimitMs, typedText.length]);

	const accuracy = useMemo(() => {
		if (state.phase !== 'running' || !textSample) {
			return 1;
		}
		let matches = 0;
		const bound = Math.min(textSample.length, typedText.length);
		for (let index = 0; index < bound; index += 1) {
			if (textSample[index] === typedText[index]) {
				matches += 1;
			}
		}
		return textSample.length === 0 ? 1 : matches / textSample.length;
	}, [state.phase, textSample, typedText]);


	return {
		state,
		typedText,
		setTypedText: onChangeText,
		submit,
		onKeyDown,
		markPasteDetected,
		readyUp,
		unready,
		leave,
		startCountdown,
		textSample,
		timeLimitMs,
		metrics: {
			wpm,
			accuracy,
			progress,
		},
		submitted,
		toast: toastRef.current.message,
		connection: {
			rttMs: state.rttMs,
			quality: state.connectionQuality,
		},
		countdown: {
			seconds: remainingSeconds,
			remainingMs,
			finalCountdown: countdownFinal,
			reason: state.countdown?.reason,
			nextRoundIndex: state.countdown?.nextRoundIndex,
		},
		selfUserId: selfUserIdRef.current,
	};
}
