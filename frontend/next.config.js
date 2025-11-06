// Allow local development avatar previews from the backend origin.
/** @type {import("next").NextConfig} */
const nextConfig = {
	images: {
		remotePatterns: [
			{
				protocol: "http",
				hostname: "localhost",
				port: "8000",
				pathname: "/uploads/avatars/**",
			},
		],
	},
	async rewrites() {
		if (process.env.NODE_ENV !== "development") {
			return [];
		}
		// Proxy identity and chat API endpoints to the backend in dev to avoid CORS while keeping Next.js pages local
		return [
			{ source: "/profile/:path*", destination: "http://localhost:8000/profile/:path*" },
			{ source: "/auth/:path*", destination: "http://localhost:8000/auth/:path*" },
			{ source: "/privacy/:path*", destination: "http://localhost:8000/privacy/:path*" },
			{ source: "/chat/conversations/:path*", destination: "http://localhost:8000/chat/conversations/:path*" },
			{ source: "/chat/messages", destination: "http://localhost:8000/chat/messages" },
		];
	},
};

module.exports = nextConfig;
