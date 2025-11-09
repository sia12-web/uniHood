export function damerauLevenshtein(a: string, b: string): number {
  const alen = a.length; const blen = b.length;
  if (alen === 0) return blen; if (blen === 0) return alen;
  const dist: number[][] = Array.from({ length: alen + 1 }, () => Array(blen + 1).fill(0));
  for (let i = 0; i <= alen; i++) dist[i][0] = i;
  for (let j = 0; j <= blen; j++) dist[0][j] = j;
  for (let i = 1; i <= alen; i++) {
    for (let j = 1; j <= blen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dist[i][j] = Math.min(dist[i][j], dist[i - 2][j - 2] + cost);
      }
    }
  }
  return dist[alen][blen];
}

export function accuracy(sample: string, typed: string): number {
  const d = damerauLevenshtein(sample, typed);
  const maxLen = Math.max(sample.length, typed.length) || 1;
  return 1 - d / maxLen;
}
