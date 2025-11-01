"use client";

export function downloadBlob(payload: Blob, filename: string): void {
	const href = URL.createObjectURL(payload);
	const anchor = document.createElement("a");
	anchor.href = href;
	anchor.download = filename;
	anchor.rel = "noopener";
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(href), 1_000);
}

type QueryValue = string | number | boolean | undefined | null;

type QueryLike = Record<string, QueryValue | QueryValue[]>;

export function buildQueryString(query: QueryLike): string {
	const params = new URLSearchParams();
	Object.entries(query).forEach(([key, value]) => {
		if (value === undefined || value === null) {
			return;
		}
		if (Array.isArray(value)) {
			value.forEach((entry) => {
				if (entry === undefined || entry === null) {
					return;
				}
				params.append(key, String(entry));
			});
			return;
		}
		params.append(key, String(value));
	});
	return params.toString();
}

export function buildCurlCommand(endpoint: string, query: QueryLike, headers: Record<string, string>): string {
	const queryString = buildQueryString(query);
	const headerFlags = Object.entries(headers)
		.map(([key, value]) => `-H "${key}: ${value}"`)
		.join(" ");
	const url = queryString ? `${endpoint}?${queryString}` : endpoint;
	return `curl ${headerFlags} "${url}"`;
}
