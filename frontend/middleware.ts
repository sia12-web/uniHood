import { NextResponse, type NextRequest } from "next/server";

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
	"/select-courses",
]);

const FAVICON_PATHS = new Set([
	"/favicon.ico",
	"/favicon.png",
	"/favicon.svg",
	"/favicon-16x16.png",
	"/favicon-32x32.png",
	"/favicon-180x180.png",
	"/favicon-192x192.png",
	"/favicon-512x512.png",
]);

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
	if (pathname.startsWith("/university-logos/")) return true; // Allow university logo assets
	if (FAVICON_PATHS.has(pathname)) return true;
	if (pathname === "/robots.txt" || pathname === "/manifest.json") return true;
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
		"/((?!api/|_next/static|_next/image|favicon.ico|favicon-16x16.png|favicon-32x32.png|favicon-180x180.png|favicon-192x192.png|favicon-512x512.png|robots.txt|manifest.json).*)",
	],
};
