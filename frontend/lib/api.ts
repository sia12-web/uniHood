import axios from "axios";

const API_BASE =
	process.env.NEXT_PUBLIC_COMMUNITIES_API_BASE ??
	process.env.NEXT_PUBLIC_API_BASE_URL ??
	process.env.API_BASE_URL ??
	"/api/communities/v1";

export const api = axios.create({
	baseURL: API_BASE,
	withCredentials: true,
	headers: {
		"Content-Type": "application/json",
	},
});

api.interceptors.response.use(
	(response) => response,
	(error) => {
		if (process.env.NODE_ENV !== "production") {
			console.warn("communities api error", error);
		}
		return Promise.reject(error);
	},
);

export type ApiInstance = typeof api;
