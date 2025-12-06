/** @type {import('next').NextConfig} */
const nextConfig = (() => {
	const remotePatterns = [];

	const backendOrigin = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
	try {
		const url = new URL(backendOrigin);
		const pattern = {
			protocol: url.protocol.replace(/:$/, ""),
			hostname: url.hostname,
			pathname: "/uploads/**",
		};
		if (url.port) {
			pattern.port = url.port;
		}
		remotePatterns.push(pattern);
	} catch (error) {
		console.warn("Invalid NEXT_PUBLIC_BACKEND_URL for image configuration", error);
	}

	remotePatterns.push({
		protocol: "https",
		hostname: "images.unsplash.com",
	});
	remotePatterns.push({
		protocol: "https",
		hostname: "i.pravatar.cc",
	});
	remotePatterns.push({
		protocol: "https",
		hostname: "picsum.photos",
	});

	return {
		// Enable standalone output for Docker deployment
		output: process.env.NODE_ENV === "production" ? "standalone" : undefined,
		eslint: {
			ignoreDuringBuilds: true,
		},
		typescript: {
			ignoreBuildErrors: true,
		},
		images: {
			remotePatterns,
		},
		// Performance optimizations
		experimental: {
			// Enable optimistic client cache for faster navigations
			optimisticClientCache: true,
		},
		// Modularize imports for common icon libraries to reduce bundle size
		modularizeImports: {
			"lucide-react": {
				transform: "lucide-react/dist/esm/icons/{{kebabCase member}}",
			},
		},
	};
})();

module.exports = nextConfig;
