const RETRYABLE_STATUS = new Set([429, 503, 504]);
const RETRYABLE_CODES = new Set(["ECONNRESET", "ETIMEDOUT"]);

export type RetryPolicy = {
	maxAttempts: number;
	baseDelayMs: number;
	capDelayMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
	maxAttempts: 4,
	baseDelayMs: 250,
	capDelayMs: 5_000,
};

export function shouldRetryResponse(response: Response): boolean {
	return RETRYABLE_STATUS.has(response.status);
}

export function shouldRetryError(error: unknown): boolean {
	if (!error) {
		return false;
	}
	if (error instanceof DOMException && error.name === "AbortError") {
		return false;
	}
	const candidate = typeof error === "object" && error !== null ? (error as { code?: unknown }) : null;
	const code = typeof candidate?.code === "string" ? candidate.code.toUpperCase() : undefined;
	if (code && RETRYABLE_CODES.has(code)) {
		return true;
	}
	const message = typeof (error as { message?: unknown })?.message === "string" ? (error as { message: string }).message : "";
	return RETRYABLE_CODES.has(message.toUpperCase());
}

export function computeDelayMs(attempt: number, policy: RetryPolicy, response?: Response): number {
	if (attempt <= 0) {
		return policy.baseDelayMs;
	}
	const retryAfter = response ? parseRetryAfter(response.headers.get("Retry-After")) : null;
	if (retryAfter !== null) {
		return Math.min(retryAfter, policy.capDelayMs);
	}
	const exp = Math.min(policy.capDelayMs, policy.baseDelayMs * 2 ** attempt);
	const jitter = exp * 0.5 * Math.random();
	return Math.min(policy.capDelayMs, Math.floor(exp * 0.75 + jitter));
}

function parseRetryAfter(headerValue: string | null): number | null {
	if (!headerValue) {
		return null;
	}
	const trimmed = headerValue.trim();
	if (!trimmed) {
		return null;
	}
	const numeric = Number(trimmed);
	if (Number.isFinite(numeric)) {
		return Math.max(0, numeric * 1000);
	}
	const asDate = Date.parse(trimmed);
	if (Number.isNaN(asDate)) {
		return null;
	}
	const delta = asDate - Date.now();
	return delta > 0 ? delta : 0;
}

export async function sleep(ms: number): Promise<void> {
	if (ms <= 0) {
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, ms));
}
