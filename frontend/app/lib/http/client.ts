import { readAuthSnapshot } from "@/lib/auth-storage";
import { AuthError, ForbiddenError, GoneError, HttpError, IdemConflictError, NetworkError, type ErrorDetail } from "./errors";
import { DEFAULT_RETRY_POLICY, computeDelayMs, shouldRetryError, shouldRetryResponse, sleep, type RetryPolicy } from "./retry";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export type ApiFetchOptions = Omit<RequestInit, "body" | "headers"> & {
	body?: unknown;
	headers?: HeadersInit;
	idemKey?: string;
	retry?: Partial<RetryPolicy>;
};

export async function apiFetch<T>(input: string | URL | Request, options: ApiFetchOptions = {}): Promise<T> {
	const {
		idemKey,
		retry: retryOverrides,
		body: rawBody,
		headers: initHeaders,
		...rest
	} = options;

	const policy: RetryPolicy = {
		...DEFAULT_RETRY_POLICY,
		...retryOverrides,
	};

	const baseHeaders = new Headers(initHeaders ?? undefined);
	let requestId = baseHeaders.get("X-Request-Id") ?? baseHeaders.get("x-request-id") ?? randomRequestId();
	baseHeaders.set("X-Request-Id", requestId);

	if (idemKey && !baseHeaders.has("X-Idempotency-Key")) {
		baseHeaders.set("X-Idempotency-Key", idemKey);
	}

	const { body, contentType } = normaliseBody(rawBody);
	if (contentType && !baseHeaders.has("Content-Type")) {
		baseHeaders.set("Content-Type", contentType);
	}

	const snapshot = readAuthSnapshot();
	const token = snapshot?.access_token;
	if (token && !baseHeaders.has("Authorization")) {
		baseHeaders.set("Authorization", `Bearer ${token}`);
	}

	const resolved = resolveInput(input);

	let attempt = 0;
	// eslint-disable-next-line no-constant-condition -- loop managed via returns
	while (true) {
		const headers = new Headers(baseHeaders);
		const headerInit = Object.fromEntries(headers.entries());
		try {
			const response = await fetch(resolved, {
				credentials: rest.credentials ?? "include",
				...rest,
				headers: headerInit,
				body,
			});

			const responseRequestId = getHeader(response, "x-request-id") ?? requestId;
			requestId = responseRequestId ?? requestId;

			if (response.ok) {
				return (await decodeSuccess<T>(response)) as T;
			}

			if (shouldRetryResponse(response) && attempt < policy.maxAttempts) {
				attempt += 1;
				await sleep(computeDelayMs(attempt, policy, response));
				continue;
			}

			const detail = await parseErrorDetail(response);
			if (response.status === 403 && isAdminRequired(detail)) {
				if (typeof window !== "undefined") {
					window.location.assign("/403");
				}
			}
			throw mapToError(response, detail, requestId);
		} catch (error) {
			if (error instanceof HttpError || error instanceof NetworkError) {
				throw error;
			}
			if (shouldRetryError(error) && attempt < policy.maxAttempts) {
				attempt += 1;
				await sleep(computeDelayMs(attempt, policy));
				continue;
			}
			throw new NetworkError("Network request failed", {
				cause: error instanceof Error ? error : undefined,
				requestId,
			});
		}
	}
}

function resolveInput(input: string | URL | Request): string | URL | Request {
	if (input instanceof Request) {
		return input;
	}
	if (input instanceof URL) {
		return input;
	}
	if (typeof input === "string") {
		if (/^https?:/i.test(input)) {
			return input;
		}
		if (!API_BASE) {
			return input;
		}
		const prefix = input.startsWith("/") ? "" : "/";
		return `${API_BASE}${prefix}${input}`;
	}
	return input;
}

function normaliseBody(body: RequestInit["body"] | unknown): { body?: BodyInit; contentType?: string } {
	if (body === undefined || body === null) {
		return {};
	}
	if (typeof body === "string") {
		return { body, contentType: "application/json" };
	}
	if (isFormData(body) || isBlob(body) || isArrayBufferBody(body) || isReadableStream(body)) {
		return { body: body as BodyInit };
	}
	if (body instanceof URLSearchParams) {
		return { body, contentType: "application/x-www-form-urlencoded" };
	}
	if (ArrayBuffer.isView(body)) {
		return { body: body as BodyInit };
	}
	return { body: JSON.stringify(body), contentType: "application/json" };
}

function getHeader(response: Response, key: string): string | null {
	const headers = (response as { headers?: { get?: (name: string) => string | null } }).headers;
	if (!headers || typeof headers.get !== "function") {
		return null;
	}
	try {
		return headers.get(key) ?? null;
	} catch {
		return null;
	}
}

function isFormData(value: unknown): value is FormData {
	return typeof FormData !== "undefined" && value instanceof FormData;
}

function isBlob(value: unknown): value is Blob {
	return typeof Blob !== "undefined" && value instanceof Blob;
}

function isReadableStream(value: unknown): value is ReadableStream {
	return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
}

function isArrayBufferBody(value: unknown): value is ArrayBuffer {
	return (
		typeof ArrayBuffer !== "undefined" &&
		(value instanceof ArrayBuffer || ArrayBuffer.isView(value))
	);
}

async function decodeSuccess<T>(response: Response): Promise<T | undefined> {
	if (response.status === 204 || response.status === 205) {
		return undefined;
	}
	const contentType = getHeader(response, "content-type") ?? "";
	const canReadJson = contentType.includes("json") || typeof (response as { json?: unknown }).json === "function";
	if (canReadJson) {
		try {
			return (await response.json()) as T;
		} catch {
			/* fall through to text parsing */
		}
	}
	if (typeof (response as { text?: unknown }).text === "function") {
		const text = await response.text();
		return text as unknown as T;
	}
	return undefined;
}

async function parseErrorDetail(response: Response): Promise<ErrorDetail> {
	const contentType = getHeader(response, "content-type") ?? "";
	const canReadJson = contentType.includes("json") || typeof (response as { json?: unknown }).json === "function";
	if (canReadJson) {
		try {
			return await response.json();
		} catch {
			return null;
		}
	}
	if (typeof (response as { text?: unknown }).text === "function") {
		try {
			const text = await response.text();
			return text || null;
		} catch {
			return null;
		}
	}
	return null;
}

function extractDetail(detail: ErrorDetail): { message: string; detail: ErrorDetail } {
	if (typeof detail === "string") {
		return { message: detail, detail };
	}
	if (detail && typeof detail === "object") {
		const record = detail as Record<string, unknown>;
		const message =
			typeof record.message === "string"
				? record.message
				: typeof record.detail === "string"
					? record.detail
					: typeof record.error === "string"
						? record.error
						: "";
		return { message, detail };
	}
	return { message: "", detail };
}

function mapToError(response: Response, payload: ErrorDetail, requestId?: string): HttpError {
	const { message, detail } = extractDetail(payload);
	if (response.status === 401) {
		return new AuthError(detail, requestId);
	}
	if (response.status === 403) {
		return new ForbiddenError(detail, requestId);
	}
	if (response.status === 409 && detail && typeof detail === "object" && (detail as { detail?: unknown }).detail === "idempotency_conflict") {
		return new IdemConflictError(detail, requestId);
	}
	if (response.status === 410) {
		return new GoneError(detail, requestId);
	}
	const fallback = message || response.statusText || `Request failed (${response.status})`;
	return new HttpError(response.status, fallback, detail, requestId);
}

function isAdminRequired(detail: ErrorDetail): boolean {
	if (!detail) {
		return false;
	}
	if (typeof detail === "string") {
		return detail === "admin_required";
	}
	if (typeof detail === "object") {
		const record = detail as Record<string, unknown>;
		if (typeof record.detail === "string" && record.detail === "admin_required") {
			return true;
		}
		if (typeof record.code === "string" && record.code === "admin_required") {
			return true;
		}
	}
	return false;
}

function randomRequestId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
	return template.replace(/[xy]/g, (char) => {
		const rnd = (Math.random() * 16) | 0;
		const value = char === "x" ? rnd : (rnd & 0x3) | 0x8;
		return value.toString(16);
	});
}
