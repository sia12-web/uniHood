"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { readAuthSnapshot } from "@/lib/auth-storage";
import { fetchProfile, getCampusById, type CampusRow } from "@/lib/identity";
import { getDemoCampusId } from "@/lib/env";

interface CampusContextValue {
    campus: CampusRow | null;
    campusId: string | null;
    isLoading: boolean;
    error: string | null;
    reloadCampus: () => Promise<void>;
}

const CampusContext = createContext<CampusContextValue | undefined>(undefined);

export function CampusProvider({ children }: { children: ReactNode }) {
    const [campus, setCampus] = useState<CampusRow | null>(null);
    const [campusId, setCampusId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadCampus = async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Try to get the user's campus from their profile
            const auth = readAuthSnapshot();
            if (auth?.user_id) {
                try {
                    const profile = await fetchProfile(auth.user_id, null);
                    if (profile.campus_id) {
                        setCampusId(profile.campus_id);
                        const campusData = await getCampusById(profile.campus_id);
                        setCampus(campusData);
                        return;
                    }
                } catch (err) {
                    console.warn("Failed to fetch user campus from profile", err);
                }
            }

            // Fallback to demo campus
            const demoCampusId = getDemoCampusId();
            setCampusId(demoCampusId);

            try {
                const campusData = await getCampusById(demoCampusId);
                setCampus(campusData);
            } catch (err) {
                // If we can't fetch the demo campus, just set the ID
                console.warn("Failed to fetch demo campus data", err);
            }
        } catch (err) {
            console.error("Error loading campus", err);
            setError("Failed to load campus information");

            // Set demo campus as fallback
            setCampusId(getDemoCampusId());
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadCampus();
    }, []);

    const value: CampusContextValue = {
        campus,
        campusId,
        isLoading,
        error,
        reloadCampus: loadCampus,
    };

    return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
}

/**
 * Hook to access the current campus context.
 * Returns the current campus information including ID, name, and logo URL.
 */
export function useCampus(): CampusContextValue {
    const context = useContext(CampusContext);
    if (context === undefined) {
        throw new Error("useCampus must be used within a CampusProvider");
    }
    return context;
}

/**
 * Hook to get just the campus ID with fallback to demo campus.
 * This is a convenient alternative when you only need the ID.
 */
export function useCampusId(): string {
    const { campusId } = useCampus();
    return campusId ?? getDemoCampusId();
}
