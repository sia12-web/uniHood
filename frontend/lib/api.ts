import axios from "axios";
import { readAuthSnapshot } from "./auth-storage";

const API_BASE =
	process.env.NEXT_PUBLIC_COMMUNITIES_API_BASE ??
	process.env.NEXT_PUBLIC_API_BASE_URL ??
	process.env.API_BASE_URL ??
	"http://localhost:8001";

export const api = axios.create({
	baseURL: API_BASE,
	withCredentials: true,
	headers: {
		"Content-Type": "application/json",
	},
});

api.interceptors.request.use((config) => {
	const snapshot = readAuthSnapshot();
	if (snapshot?.access_token) {
		config.headers.Authorization = `Bearer ${snapshot.access_token}`;
	}
	return config;
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
