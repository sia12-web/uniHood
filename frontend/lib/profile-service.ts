import { api } from "./api";
import { MeetupResponse } from "./meetups";

export interface MutualFriend {
    user_id: string;
    display_name: string;
    handle: string;
    avatar_url?: string | null;
}

export interface UserSummary {
    ranks: { overall: number; social?: number; engagement?: number; popularity?: number };
    scores: { overall: number; social?: number; engagement?: number; popularity?: number };
    streak: { current: number; best: number; last_active_ymd: number };
}

export async function getMutualFriends(userId: string): Promise<MutualFriend[]> {
    const { data } = await api.get(`/friends/${userId}/mutual`);
    return data;
}

export async function getUserSummary(userId: string): Promise<UserSummary> {
    const { data } = await api.get(`/leaderboards/users/${userId}/summary`);
    return data;
}

export async function getUserMeetups(participantId: string): Promise<MeetupResponse[]> {
    const { data } = await api.get(`/meetups/?user_id=${participantId}`);
    return data;
}
