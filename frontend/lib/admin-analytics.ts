
import { getBackendUrl } from "./env";
import { readAuthSnapshot, resolveAuthHeaders } from "./auth-storage";

export interface AnalyticsOverview {
    total_meetups_created: number;
    total_games_played: number;
    active_meetups_count: number;
    active_games_count: number;
}

export interface PopularGameItem {
    game_kind: string;
    play_count: number;
    last_played_at: string | null;
}

export interface PopularMeetupTypeItem {
    category: string;
    count: number;
}

export interface ActivityLogItem {
    id: number;
    user_id: string;
    event: string;
    meta: Record<string, unknown>;
    created_at: string;
    user_display_name?: string;
    user_avatar_url?: string;
}

async function fetchAdmin<T>(path: string): Promise<T> {
    const snapshot = readAuthSnapshot();
    const headers = resolveAuthHeaders(snapshot);
    const res = await fetch(`${getBackendUrl()}/admin/analytics${path}`, {
        headers: {
            ...headers,
            "Content-Type": "application/json",
        },
    });

    if (!res.ok) {
        throw new Error(`Admin API Error: ${res.statusText}`);
    }
    return res.json();
}

export const adminAnalytics = {
    getOverview: () => fetchAdmin<AnalyticsOverview>("/overview"),
    getPopularGames: (limit = 5) => fetchAdmin<PopularGameItem[]>(`/games/popular?limit=${limit}`),
    getPopularMeetupTypes: (limit = 5) => fetchAdmin<PopularMeetupTypeItem[]>(`/meetups/popular-types?limit=${limit}`),
    getActivityLog: (limit = 20) => fetchAdmin<ActivityLogItem[]>(`/activity-log?limit=${limit}`),
};
