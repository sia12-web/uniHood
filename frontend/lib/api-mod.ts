import axios from "axios";

const MOD_API_BASE =
	(typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_MOD_API_BASE : undefined) ??
	(typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "")?.concat("/mod/v1") : undefined) ??
	"/api/mod/v1";

export const modApi = axios.create({
	baseURL: MOD_API_BASE,
	withCredentials: true,
	headers: {
		"Content-Type": "application/json",
	},
});

modApi.interceptors.response.use(
	(response) => response,
	(error) => {
		if (typeof process !== 'undefined' && process.env?.NODE_ENV !== "production") {
			console.warn("moderation api error", error);
		}
		return Promise.reject(error);
	},
);

export type ModApiInstance = typeof modApi;
