'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { modApi } from '@/lib/api-mod';
import { emitSafetyMetric } from '@/lib/obs/safety';

export type HashImportRow = {
	algo: string;
	hash: string;
	label?: string;
	source?: string;
	line: number;
	errors?: string[];
};

export type HashImportResult = {
	processed: number;
};

export type HashImportOptions = {
	defaultLabel?: string;
	defaultSource?: string;
};

const CHUNK_SIZE = 500;

function csvToRows(text: string): HashImportRow[] {
	const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	if (!lines.length) return [];
	const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
	const rows: HashImportRow[] = [];
	for (let i = 1; i < lines.length; i++) {
		const values = lines[i].split(',').map((value) => value.trim());
		const row: Partial<HashImportRow> = { line: i + 1 };
		header.forEach((key, index) => {
			const value = values[index];
			if (value === undefined || value === '') return;
			if (key === 'algo' || key === 'algorithm') {
				row.algo = value;
			} else if (key === 'hash') {
				row.hash = value;
			} else if (key === 'label') {
				row.label = value;
			} else if (key === 'source') {
				row.source = value;
			}
		});
		if (row.algo || row.hash || row.label || row.source) {
			rows.push(row as HashImportRow);
		}
	}
	return rows;
}

function jsonToRows(text: string): HashImportRow[] {
	const data = JSON.parse(text);
	const array = Array.isArray(data) ? data : data.rows;
	if (!Array.isArray(array)) {
		return [];
	}
	return array.map((entry, index) => ({
		algo: String(entry.algo ?? entry.algorithm ?? ''),
		hash: String(entry.hash ?? ''),
		label: entry.label ? String(entry.label) : undefined,
		source: entry.source ? String(entry.source) : undefined,
		line: index + 1,
	}));
}

function simpleYamlToRows(text: string): HashImportRow[] {
	const rows: HashImportRow[] = [];
	const blocks = text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
	blocks.forEach((block, blockIndex) => {
		const row: Partial<HashImportRow> = { line: blockIndex + 1 };
		block.split(/\r?\n/).forEach((line) => {
			const [rawKey, ...rest] = line.split(':');
			if (!rawKey || !rest.length) return;
			const key = rawKey.trim().toLowerCase();
			const value = rest.join(':').trim();
			if (!value) return;
			if (key === 'algo' || key === 'algorithm') {
				row.algo = value;
			} else if (key === 'hash') {
				row.hash = value;
			} else if (key === 'label') {
				row.label = value;
			} else if (key === 'source') {
				row.source = value;
			}
		});
		if (row.algo || row.hash) {
			rows.push(row as HashImportRow);
		}
	});
	return rows;
}

function validateRow(row: HashImportRow): HashImportRow {
	const errors: string[] = [];
	if (!row.algo) errors.push('Missing algo');
	if (!row.hash) errors.push('Missing hash');
	if (row.hash && row.hash.length < 8) errors.push('Hash too short');
	return errors.length ? { ...row, errors } : row;
}

async function importHashRows(rows: HashImportRow[]): Promise<HashImportResult> {
	let processed = 0;
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		const chunk = rows.slice(i, i + CHUNK_SIZE).map(({ algo, hash, label, source }) => ({ algo, hash, label, source }));
		await modApi.post('/hashes/import', { rows: chunk });
		processed += chunk.length;
	}
	return { processed };
}

export function useHashImport() {
	const [rows, setRows] = useState<HashImportRow[]>([]);
	const [parseError, setParseError] = useState<string | null>(null);

	const mutation = useMutation<HashImportResult, Error, HashImportRow[]>({
		mutationFn: importHashRows,
	});

	const parsedRows = useMemo(() => rows.map(validateRow), [rows]);

	const hasInvalid = parsedRows.some((row) => row.errors && row.errors.length > 0);

	const parseFile = useCallback(async (file: File) => {
		setParseError(null);
		setRows([]);
		const text = (await file.text()).trim();
		if (!text) {
			setParseError('File is empty');
			return;
		}
		let nextRows: HashImportRow[] = [];
		try {
			if (text.startsWith('{') || text.startsWith('[')) {
				nextRows = jsonToRows(text);
			} else if (text.includes(',') && text.split(/\r?\n/)[0].includes(',')) {
				nextRows = csvToRows(text);
			} else {
				nextRows = simpleYamlToRows(text);
			}
		} catch (error) {
			setParseError(error instanceof Error ? error.message : 'Unable to parse file');
			return;
		}
		if (!nextRows.length) {
			setParseError('No rows detected in file');
			return;
		}
		setRows(nextRows);
	}, []);

	const importRows = useCallback(async (options?: HashImportOptions) => {
		const validRows = parsedRows
			.filter((row) => !row.errors || row.errors.length === 0)
			.map((row) => ({
				algo: row.algo,
				hash: row.hash,
				label: row.label ?? options?.defaultLabel ?? undefined,
				source: row.source ?? options?.defaultSource ?? undefined,
				line: row.line,
			}));
		if (!validRows.length) {
			throw new Error('No valid rows to import');
		}
		const result = await mutation.mutateAsync(validRows);
		if (result.processed > 0) {
			emitSafetyMetric({ event: 'hash_import', count: result.processed });
		}
		return result;
	}, [mutation, parsedRows]);

	const reset = useCallback(() => {
		setRows([]);
		setParseError(null);
		mutation.reset();
	}, [mutation]);

	return {
		rows: parsedRows,
		parseFile,
		parseError,
		importRows,
		importing: mutation.isPending,
		result: mutation.data ?? null,
		reset,
		hasInvalid,
	};
}
