import axios from "axios";

const MOD_API_BASE =
	process.env.NEXT_PUBLIC_MOD_API_BASE ??
	process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "")?.concat("/mod/v1") ??
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
		if (process.env.NODE_ENV !== "production") {
			console.warn("moderation api error", error);
		}
		return Promise.reject(error);
	},
);

export type ModApiInstance = typeof modApi;
