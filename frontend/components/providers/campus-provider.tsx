"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { listCampuses, type CampusRow } from "@/lib/identity";

type CampusContextValue = {
    campuses: CampusRow[];
    loading: boolean;
    error: string | null;
    getCampus: (id: string | null | undefined) => CampusRow | undefined;
};

const CampusContext = createContext<CampusContextValue | null>(null);

export function CampusProvider({ children }: { children: ReactNode }) {
    const [campuses, setCampuses] = useState<CampusRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const rows = await listCampuses();
                if (!cancelled) {
                    setCampuses(rows);
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error("Failed to list campuses", err);
                    setError("Failed to load campus data");
                    setLoading(false);
                }
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const value = useMemo<CampusContextValue>(() => {
        const map = new Map<string, CampusRow>();
        for (const c of campuses) {
            if (c.id) map.set(c.id, c);
        }

        return {
            campuses,
            loading,
            error,
            getCampus: (id) => (id ? map.get(id) : undefined),
        };
    }, [campuses, loading, error]);

    return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
}

export function useCampuses() {
    const context = useContext(CampusContext);
    if (!context) {
        throw new Error("useCampuses must be used within a CampusProvider");
    }
    return context;
}
