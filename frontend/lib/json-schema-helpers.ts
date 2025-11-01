export type JsonParseSuccess<T> = {
	ok: true;
	value: T;
	meta: { position: number; line: number; column: number } | null;
};

export type JsonParseFailure = {
	ok: false;
	error: { message: string; position: number; line: number; column: number };
};

export type JsonParseResult<T = unknown> = JsonParseSuccess<T> | JsonParseFailure;

function computeLineColumn(input: string, position: number): { line: number; column: number } {
	let line = 1;
	let column = 1;
	for (let index = 0; index < position && index < input.length; index += 1) {
		if (input[index] === "\n") {
			line += 1;
			column = 1;
		} else {
			column += 1;
		}
	}
	return { line, column };
}

export function parseJsonWithMeta<T = unknown>(raw: string): JsonParseResult<T> {
	try {
		const value = JSON.parse(raw) as T;
		return { ok: true, value, meta: null };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid JSON";
		const match = /position (\d+)/i.exec(message);
		const position = match ? Number(match[1]) : 0;
		const { line, column } = computeLineColumn(raw, position);
		return {
			ok: false,
			error: {
				message,
				position,
				line,
				column,
			},
		};
	}
}

export type ActionSpecValidation = {
	valid: boolean;
	errors: string[];
	warnings: string[];
};

export function validateActionSpec(input: unknown): ActionSpecValidation {
	const errors: string[] = [];
	const warnings: string[] = [];
	if (!input || typeof input !== "object") {
		errors.push("Spec must be a JSON object");
		return { valid: false, errors, warnings };
	}
	const spec = input as Record<string, unknown>;
	if (typeof spec.name !== "string" || spec.name.trim().length === 0) {
		errors.push("Spec requires a non-empty `name` field");
	}
	if (!Array.isArray(spec.steps) || spec.steps.length === 0) {
		errors.push("Spec must include a non-empty `steps` array");
	} else {
		for (const [index, step] of spec.steps.entries()) {
			if (!step || typeof step !== "object") {
				errors.push(`Step #${index + 1} must be an object`);
				continue;
			}
			if (typeof (step as Record<string, unknown>).use !== "string") {
				errors.push(`Step #${index + 1} missing \\"use\\" string`);
			}
		}
	}
	if (spec.guards && !Array.isArray(spec.guards)) {
		errors.push("`guards` must be an array when provided");
	}
	if (spec.sample && typeof spec.sample !== "number") {
		warnings.push("`sample` is optional but should be numeric when present");
	}
	return { valid: errors.length === 0, errors, warnings };
}

export const GUARD_SPEC_SNIPPETS: string[] = [
	"{\n  \"guards\": [\n    { \"when\": { \"scope\": 'campus:north' }, \"allow\": true }\n  ]\n}\n",
	"{\n  \"guards\": [\n    { \"when\": { \"reason\": 'appeal' }, \"allow\": false, \"message\": 'Escalate to admin' }\n  ]\n}\n",
];

export function buildJsonErrorMessage(result: JsonParseResult): string | null {
	if (result.ok) return null;
	const { message, line, column } = result.error;
	return `${message} (line ${line}, column ${column})`;
}
