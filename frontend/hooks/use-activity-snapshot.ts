import { useState, useEffect } from "react";
import { fetchMySummary } from "@/lib/leaderboards";
import { readAuthUser, onAuthChange } from "@/lib/auth-storage";

export type CachedActivitySnapshot = {
    totalGames: number;
    wins: number;
    socialScore: number;
    rank: number | null;
    updatedAt: string;
};

const ACTIVITY_SNAPSHOT_CACHE_KEY = "unihood.activitySnapshot.v1";

function readCachedActivitySnapshot(): CachedActivitySnapshot | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(ACTIVITY_SNAPSHOT_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<CachedActivitySnapshot>;
        if (typeof parsed.totalGames !== "number" || typeof parsed.wins !== "number" || typeof parsed.socialScore !== "number") {
            return null;
        }
        return {
            totalGames: Math.max(0, parsed.totalGames),
            wins: Math.max(0, parsed.wins),
            socialScore: Math.max(0, parsed.socialScore),
            rank: typeof parsed.rank === "number" ? parsed.rank : null,
            updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
        };
    } catch {
        return null;
    }
}

function writeCachedActivitySnapshot(snapshot: Omit<CachedActivitySnapshot, "updatedAt">): void {
    if (typeof window === "undefined") return;
    try {
        const payload: CachedActivitySnapshot = { ...snapshot, updatedAt: new Date().toISOString() };
        window.localStorage.setItem(ACTIVITY_SNAPSHOT_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // ignore cache write failures
    }
}

export function useActivitySnapshot() {
    const [snapshot, setSnapshot] = useState<{
        totalGames: number;
        wins: number;
        socialScore: number;
        rank: number | null;
        available: boolean;
        loading: boolean;
        error: string | null;
    }>({
        totalGames: 0,
        wins: 0,
        socialScore: 0,
        rank: null,
        available: false,
        loading: true,
        error: null,
    });

    const [authHydrated, setAuthHydrated] = useState(false);
    const [authUser, setAuthUser] = useState(readAuthUser());

    useEffect(() => {
        const hydrate = () => {
            setAuthUser(readAuthUser());
            setAuthHydrated(true);
        };
        hydrate();
        const unsubscribe = onAuthChange(hydrate);
        return () => unsubscribe();
    }, []);

    // Load cached activity snapshot on mount (client-only)
    useEffect(() => {
        const cached = readCachedActivitySnapshot();
        if (cached) {
            setSnapshot({
                totalGames: cached.totalGames,
                wins: cached.wins,
                socialScore: cached.socialScore,
                rank: cached.rank,
                available: true,
                loading: true,
                error: null,
            });
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            // Skip API call if user is not authenticated
            if (!authUser?.userId) {
                setSnapshot((prev) => ({ ...prev, loading: false, error: null }));
                return;
            }
            setSnapshot((prev) => ({ ...prev, loading: true, error: null }));
            try {
                const summary = await fetchMySummary({
                    userId: authUser?.userId,
                    campusId: authUser?.campusId ?? undefined,
                    signal: controller.signal,
                });
                // Use raw counts if available, otherwise fallback to scores (which are weighted)
                const totalGames = summary.counts?.games_played ?? Math.max(0, Math.round(summary.scores.engagement ?? 0));
                const wins = summary.counts?.wins ?? Math.max(0, Math.round(summary.scores.overall ?? 0));
                const socialScore = Math.max(0, Math.round(summary.scores.social ?? 0));
                const rank = summary.ranks.overall ?? null;
                writeCachedActivitySnapshot({ totalGames, wins, socialScore, rank });
                setSnapshot({ totalGames, wins, socialScore, rank, available: true, loading: false, error: null });
            } catch (err) {
                if (controller.signal.aborted) return;
                const message = err instanceof Error ? err.message : "Unable to load activity snapshot";
                setSnapshot((prev) => ({ ...prev, loading: false, error: message }));
            }
        };
        if (authHydrated) {
            void load();
        }
        return () => controller.abort();
    }, [authHydrated, authUser?.campusId, authUser?.userId]);

    return snapshot;
}
