"use client";

export type CookieConsent = {
    essential: boolean; // Always true
    functional: boolean;
    analytics: boolean;
    marketing: boolean;
    acknowledgedAt: string | null;
};

const STORAGE_KEY = "unihood.cookie_consent";

export const DEFAULT_CONSENT: CookieConsent = {
    essential: true,
    functional: false,
    analytics: false,
    marketing: false,
    acknowledgedAt: null,
};

export function getCookieConsent(): CookieConsent {
    if (typeof window === "undefined") return DEFAULT_CONSENT;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return DEFAULT_CONSENT;
        return JSON.parse(stored) as CookieConsent;
    } catch {
        return DEFAULT_CONSENT;
    }
}

export function setCookieConsent(consent: Partial<CookieConsent>) {
    if (typeof window === "undefined") return;
    const current = getCookieConsent();
    const next: CookieConsent = {
        ...current,
        ...consent,
        essential: true, // Safety override
        acknowledgedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    // Dispatch a custom event so other components can react
    window.dispatchEvent(new CustomEvent("cookie-consent-updated", { detail: next }));

    // In a real app, you would also initialize/disable tag managers (GA, FB Pixel, etc.) here
}

export function acceptAllCookies() {
    setCookieConsent({
        functional: true,
        analytics: true,
        marketing: true,
    });
}

export function declineOptionalCookies() {
    setCookieConsent({
        functional: false,
        analytics: false,
        marketing: false,
    });
}
