export type ErrorDetail = unknown;

export class HttpError extends Error {
	readonly status: number;
	readonly detail: ErrorDetail;
	readonly requestId?: string;

	constructor(status: number, message: string, detail?: ErrorDetail, requestId?: string) {
		super(message || `HTTP ${status}`);
		this.name = "HttpError";
		this.status = status;
		this.detail = detail;
		this.requestId = requestId;
	}
}

export class AuthError extends HttpError {
	constructor(detail?: ErrorDetail, requestId?: string) {
		super(401, "Authentication required", detail, requestId);
		this.name = "AuthError";
	}
}

export class ForbiddenError extends HttpError {
	constructor(detail?: ErrorDetail, requestId?: string) {
		super(403, "Access forbidden", detail, requestId);
		this.name = "ForbiddenError";
	}
}

export class IdemConflictError extends HttpError {
	constructor(detail?: ErrorDetail, requestId?: string) {
		super(409, "Idempotency conflict", detail, requestId);
		this.name = "IdemConflictError";
	}
}

export class GoneError extends HttpError {
	constructor(detail?: ErrorDetail, requestId?: string) {
		let message = "Resource is gone";
		if (typeof detail === "string" && detail.trim().length > 0) {
			message = detail;
		} else if (detail && typeof detail === "object") {
			const record = detail as Record<string, unknown>;
			const nested = typeof record.detail === "string" && record.detail.trim().length > 0
				? record.detail
				: typeof record.message === "string" && record.message.trim().length > 0
					? record.message
					: undefined;
			if (nested) {
				message = nested;
			}
		}
		super(410, message, detail, requestId);
		this.name = "GoneError";
	}
}

export class NetworkError extends Error {
	readonly cause?: Error;
	readonly requestId?: string;

	constructor(message: string, opts?: { cause?: Error; requestId?: string }) {
		super(message);
		this.name = "NetworkError";
		this.cause = opts?.cause;
		this.requestId = opts?.requestId;
	}
}
