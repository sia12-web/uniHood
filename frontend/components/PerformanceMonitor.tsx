"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initPerformanceMonitoring } from "@/lib/performance";

/**
 * PerformanceMonitor - Real User Monitoring (RUM) for Web Vitals
 * 
 * Collects Core Web Vitals (LCP, CLS, INP, FCP, TTFB) from real users
 * and sends them to the analytics endpoint for dashboarding.
 * 
 * Sample rate: 10% of users in production
 * Debug mode: 100% sampling + console logging in development
 */
export default function PerformanceMonitor() {
    const pathname = usePathname() || "/";

    useEffect(() => {
        const isProduction = process.env.NODE_ENV === "production";
        const isDevelopment = process.env.NODE_ENV === "development";

        // Initialize performance monitoring
        const cleanup = initPerformanceMonitoring({
            // Log to console in dev
            debug: isDevelopment,

            // Send metrics to analytics endpoint in production
            analyticsEndpoint: isProduction
                ? "/api/ops/ui-metrics"
                : undefined,

            // 10% sampling in prod, 100% in dev for testing
            sampleRate: isProduction ? 0.1 : 1.0,

            // Add route context to metrics
            tags: {
                route: pathname || "/",
                env: process.env.NODE_ENV || "development",
            },

            // Instrument fetch for API latency tracking
            instrumentFetch: true,

            // API latency budgets (warn if exceeded)
            apiBudgets: [
                { endpoint: /\/api\//, maxLatencyMs: 500 },
            ],
        });

        return () => {
            cleanup?.cleanup();
        };
    }, [pathname]);

    return null;
}
