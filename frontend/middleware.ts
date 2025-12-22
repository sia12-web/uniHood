import { NextResponse, type NextRequest } from "next/server";
import { UNSELECTED_CAMPUS_IDS } from "@/lib/onboarding";

// Allow unauthenticated access to explicit public routes and static assets.
const PUBLIC_PATHS = new Set([
	"/login",
	"/join",
	"/signup",
	"/onboarding",
	"/features",
	"/reset-password",
	"/forgot-password",
	"/select-university",
	"/select-university",
	"/select-courses",
	"/admin-login",
]);

const FAVICON_PATHS = new Set([
	"/favicon.ico",
	"/favicon.svg",
	"/apple-touch-icon.svg",
]);

const ONBOARDING_PATHS = new Set([
	"/select-university",
	"/select-courses",
	"/major-year",
	"/passions",
	"/photos",
	"/set-profile",
	"/vision",
	"/welcome",
]);

function decodeJwtPayload(token: string): Record<string, unknown> | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const payload = parts[1];
	try {
		// base64url -> base64
		const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized + "===".slice((normalized.length + 3) % 4);
		const json = atob(padded);
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function getCampusIdFromToken(token: string): string | null {
	if (!token) return null;
	// JWT
	if (token.split(".").length === 3) {
		const payload = decodeJwtPayload(token);
		const campusId = payload?.campus_id ?? payload?.campus;
		return typeof campusId === "string" ? campusId : null;
	}
	// Legacy synthetic token
	if (token.includes(";") && token.includes(":")) {
		const campus = token
			.split(";")
			.map((chunk) => chunk.trim())
			.map((chunk) => chunk.split(":", 2))
			.find(([k]) => (k || "").trim().toLowerCase() === "campus")?.[1];
		return campus ? campus.trim() : null;
	}
	return null;
}

function isPublicPath(pathname: string): boolean {
	if (pathname === "/") return false;
	if (PUBLIC_PATHS.has(pathname)) return true;
	if (pathname.startsWith("/verify")) return true; // Allow verification routes
	if (pathname.startsWith("/onboarding")) return true; // Allow onboarding wizard
	if (pathname === "/verify-email") return true; // Allow legacy verification route
	if (pathname.startsWith("/api/")) return true;
	// Allow static and Next internals
	if (pathname.startsWith("/_next/")) return true;
	if (pathname.startsWith("/static/")) return true;
	if (pathname.startsWith("/brand/")) return true; // Allow brand assets

	if (FAVICON_PATHS.has(pathname)) return true;
	if (pathname === "/robots.txt" || pathname === "/manifest.json" || pathname === "/radius-logo.png" || pathname === "/unihood-logo.png" || pathname === "/site.webmanifest") return true;
	return false;
}

export function middleware(req: NextRequest) {
	const { pathname, search } = req.nextUrl;

	if (isPublicPath(pathname)) {
		return NextResponse.next();
	}

	// Basic auth detection: cookie or Authorization header already attached.
	const hasAuthCookie =
		req.cookies.get("divan.auth") ||
		req.cookies.get("divan_auth") ||
		req.cookies.get("session") ||
		req.cookies.get("access_token");
	const hasAuthHeader = req.headers.get("authorization");

	if (hasAuthCookie || hasAuthHeader) {
		// Onboarding gate: if campus is still placeholder/unselected, force university selection
		// before allowing access to protected (non-onboarding) routes.
		if (!ONBOARDING_PATHS.has(pathname)) {
			let token: string | null = null;
			const authHeader = hasAuthHeader;
			if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
				token = authHeader.slice(7).trim();
			} else {
				const cookie = req.cookies.get("divan.auth")?.value ?? req.cookies.get("access_token")?.value;
				if (cookie) {
					try {
						token = decodeURIComponent(cookie);
					} catch {
						token = cookie;
					}
				}
			}
			const campusId = token ? getCampusIdFromToken(token) : null;

			// Admin Gate
			if (pathname.startsWith("/admin")) {
				const payload = token ? decodeJwtPayload(token) : null;
				const roles = (payload?.roles as string[]) || [];
				if (!roles.includes("admin")) {
					const redirectUrl = req.nextUrl.clone();
					redirectUrl.pathname = "/";
					return NextResponse.redirect(redirectUrl);
				}
			}

			if (campusId && UNSELECTED_CAMPUS_IDS.has(campusId)) {
				const redirectUrl = req.nextUrl.clone();
				redirectUrl.pathname = "/select-university";
				redirectUrl.searchParams.set("redirect", `${pathname}${search}`);
				return NextResponse.redirect(redirectUrl);
			}
		}
		return NextResponse.next();
	}

	// Redirect unauthenticated users to login/join with return path preserved.
	const redirectUrl = req.nextUrl.clone();
	redirectUrl.pathname = "/login";
	if (pathname) {
		redirectUrl.searchParams.set("redirect", `${pathname}${search}`);
	}
	return NextResponse.redirect(redirectUrl);
}

export const config = {
	// Apply to all routes except for API routes, Next internals, and static files we already filter.
	matcher: [
		"/((?!api/|_next/static|_next/image|favicon.ico|favicon.svg|apple-touch-icon.svg|favicon-16x16.png|favicon-32x32.png|favicon-180x180.png|favicon-192x192.png|favicon-512x512.png|robots.txt|manifest.json).*)",
	],
};
