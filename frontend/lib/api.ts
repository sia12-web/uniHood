import axios from "axios";
import { readAuthSnapshot } from "./auth-storage";

import { getBackendUrl } from "./env";

const API_BASE = getBackendUrl();

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
		if (typeof process !== 'undefined' && process.env?.NODE_ENV !== "production") {
			console.warn("communities api error", error);
		}
		return Promise.reject(error);
	},
);

export type ApiInstance = typeof api;
