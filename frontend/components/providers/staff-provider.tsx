"use client";

import { createContext, useContext } from "react";

import type { StaffProfile } from "@/lib/staff-auth-guard";

export type StaffContextValue = {
	profile: StaffProfile;
	activeCampus: string | null;
	campuses: string[];
};

const StaffContext = createContext<StaffContextValue | null>(null);

export type StaffProviderProps = StaffContextValue & {
	children: React.ReactNode;
};

export function StaffProvider({ profile, activeCampus, campuses, children }: StaffProviderProps) {
	return <StaffContext.Provider value={{ profile, activeCampus, campuses }}>{children}</StaffContext.Provider>;
}

export function useStaffIdentity(): StaffContextValue {
	const value = useContext(StaffContext);
	if (!value) {
		throw new Error("useStaffIdentity must be used within a StaffProvider");
	}
	return value;
}
