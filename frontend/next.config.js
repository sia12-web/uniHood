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

	return {
		images: {
			remotePatterns,
		},
	};
})();

module.exports = nextConfig;
