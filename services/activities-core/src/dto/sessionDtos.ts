import { z } from "zod";

export const createSessionDto = z.object({
  activityKey: z.literal("speed_typing"),
  creatorUserId: z.string().min(1),
  participants: z
    .array(z.string().min(1))
    .length(2)
  .refine((values: string[]) => new Set(values).size === values.length, {
      message: "participants must be unique",
    }),
});

export type CreateSessionDto = z.infer<typeof createSessionDto>;

// QuickTrivia specific create session DTO
export const createQuickTriviaSessionDto = z.object({
  activityKey: z.literal("quick_trivia"),
  creatorUserId: z.string().min(1),
  participants: z
    .array(z.string().min(1))
    .length(2)
    .refine((values: string[]) => new Set(values).size === values.length, {
      message: "participants must be unique",
    }),
  config: z
    .object({
      rounds: z.number().int().positive().max(30).optional(),
      timeLimitMs: z.number().int().min(12_000).max(25_000).optional(),
      difficulties: z.array(z.enum(["E", "M", "H"]))
        .min(1)
        .max(3)
        .optional(),
    })
    .optional(),
});
export type CreateQuickTriviaSessionDto = z.infer<typeof createQuickTriviaSessionDto>;

export const joinSessionDto = z.object({
  userId: z.string().min(1),
});

export type JoinSessionDto = z.infer<typeof joinSessionDto>;

export const leaveSessionDto = joinSessionDto;
export type LeaveSessionDto = z.infer<typeof leaveSessionDto>;

export const readyStateDto = z.object({
  userId: z.string().min(1),
  ready: z.boolean().optional().default(true),
});

export type ReadyStateDto = z.infer<typeof readyStateDto>;

export const submitRoundDto = z.object({
  userId: z.string().min(1),
  typedText: z.string().min(1),
  clientMs: z.number().int().nonnegative().optional(),
});

export type SubmitRoundDto = z.infer<typeof submitRoundDto>;

// QuickTrivia round submission (single answer only)
export const submitQuickTriviaRoundDto = z.object({
  userId: z.string().min(1),
  choiceIndex: z.number().int().min(0).max(3),
  clientMs: z.number().int().nonnegative().optional(),
});
export type SubmitQuickTriviaRoundDto = z.infer<typeof submitQuickTriviaRoundDto>;

export const keystrokeSampleDto = z.object({
  userId: z.string().min(1),
  tClientMs: z.number().int(),
  len: z.number().int().nonnegative(),
  isPaste: z.boolean().optional(),
});

export type KeystrokeSampleDto = z.infer<typeof keystrokeSampleDto>;

export const pingDto = z.object({
  tClientMs: z.number().int(),
});

export type PingDto = z.infer<typeof pingDto>;

export const participantView = z.object({
  userId: z.string(),
  score: z.number().int(),
});

export const lobbyPresenceView = z.object({
  userId: z.string(),
  joined: z.boolean(),
  ready: z.boolean(),
});

export type LobbyPresenceView = z.infer<typeof lobbyPresenceView>;

export const roundStateView = z.object({
  index: z.number().int().nonnegative(),
  state: z.enum(["queued", "running", "done"]),
});

export const sessionView = z.object({
  id: z.string(),
  status: z.enum(["pending", "running", "ended"]),
  activityKey: z.literal("speed_typing"),
  participants: z.array(participantView),
  currentRoundIndex: z.number().int().nonnegative().optional(),
  rounds: z.array(roundStateView),
  lobbyPhase: z.boolean().optional(),
  lobbyReady: z.boolean().optional(),
  presence: z.array(lobbyPresenceView).optional(),
  countdown: z
    .object({
      startedAt: z.number().int().nonnegative(),
      durationMs: z.number().int().positive(),
      endsAt: z.number().int().positive(),
    })
    .optional(),
});

export type SessionView = z.infer<typeof sessionView>;

export const roundView = z.object({
  index: z.number().int().nonnegative(),
  state: z.enum(["queued", "running", "done"]),
  payload: z.object({
    textSample: z.string().min(1),
    timeLimitMs: z.number().int().positive(),
  }),
});

export type RoundView = z.infer<typeof roundView>;

// QuickTrivia round view
export const quickTriviaRoundView = z.object({
  index: z.number().int().nonnegative(),
  state: z.enum(["queued", "running", "done"]),
  payload: z.object({
    qId: z.string().min(1),
    question: z.string().min(1),
    options: z.array(z.string().min(1)).length(4),
    timeLimitMs: z.number().int().positive(),
  }),
});
export type QuickTriviaRoundView = z.infer<typeof quickTriviaRoundView>;

export const scoreboardView = z.object({
  participants: z.array(participantView),
  lastDelta: z
    .object({
      userId: z.string(),
      delta: z.number().int(),
    })
    .optional(),
});

export type ScoreboardView = z.infer<typeof scoreboardView>;
