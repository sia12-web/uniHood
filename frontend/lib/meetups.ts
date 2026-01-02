import { api } from "./api";

export type MeetupStatus = "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELLED";
export type MeetupRole = "HOST" | "PARTICIPANT";
export type MeetupCategory = "study" | "social" | "game" | "gym" | "food" | "other";
export type MeetupParticipantStatus = "JOINED" | "LEFT";

export type MeetupVisibility = "FRIENDS" | "CAMPUS" | "CITY";

export interface MeetupParticipant {
  user_id: string;
  role: MeetupRole;
  status: MeetupParticipantStatus;
  joined_at: string;
  left_at?: string;
  display_name?: string;
  avatar_url?: string;
}


export interface MeetupResponse {
  id: string;
  creator_user_id: string;
  campus_id: string;
  title: string;
  description?: string;
  location?: string;
  category: MeetupCategory;
  start_at: string;
  duration_min: number;
  status: MeetupStatus;
  room_id?: string;
  cancel_reason?: string;
  created_at: string;
  updated_at: string;
  participants_count: number;
  is_joined: boolean;
  my_role?: MeetupRole;
  current_user_id?: string;
  visibility: MeetupVisibility;
  capacity: number;
  creator_name?: string;
  creator_avatar_url?: string;
  recent_participants_avatars?: string[];
  banner_url?: string;
}

export interface MeetupDetailResponse extends MeetupResponse {
  participants: MeetupParticipant[];
}

export interface MeetupCreateRequest {
  title: string;
  description?: string;
  location?: string;
  category: MeetupCategory;
  start_at: string; // ISO string
  duration_min: number;
  campus_id?: string;
  visibility: MeetupVisibility;
  capacity: number;
  banner_url?: string;
}

export interface MeetupUpdateRequest {
  title?: string;
  description?: string;
  location?: string;
  category?: MeetupCategory;
  start_at?: string;
  duration_min?: number;
  visibility?: MeetupVisibility;
  capacity?: number;
  banner_url?: string;
}

export async function updateMeetup(id: string, data: MeetupUpdateRequest): Promise<MeetupResponse> {
  const response = await api.put(`/meetups/${id}`, data);
  return response.data;
}

export async function listMeetups(campusId?: string, category?: MeetupCategory): Promise<MeetupResponse[]> {
  const params = new URLSearchParams();
  if (campusId) params.set("campus_id", campusId);
  if (category) params.set("category", category);
  const response = await api.get(`/meetups/?${params.toString()}`);
  return response.data;
}

export async function createMeetup(data: MeetupCreateRequest): Promise<MeetupResponse> {
  const response = await api.post("/meetups/", data);
  return response.data;
}

export async function getMeetup(id: string): Promise<MeetupDetailResponse> {
  const response = await api.get(`/meetups/${id}`);
  return response.data;
}

export async function joinMeetup(id: string): Promise<void> {
  await api.post(`/meetups/${id}/join`);
}

export async function leaveMeetup(id: string): Promise<void> {
  await api.post(`/meetups/${id}/leave`);
}

export async function cancelMeetup(id: string, reason: string): Promise<void> {
  const params = new URLSearchParams({ reason });
  await api.post(`/meetups/${id}/cancel?${params.toString()}`);
}

export async function fetchUpcomingMeetupsCount(campusId?: string): Promise<number> {
  const params = new URLSearchParams();
  if (campusId) params.set("campus_id", campusId);
  const response = await api.get(`/meetups/count/upcoming?${params.toString()}`);
  return response.data;
}

export type MeetupUsage = {
  hosting_limit: number;
  hosting_usage: number;
  joining_limit: number;
  joining_usage: number;
  max_capacity: number;
  daily_create_limit: number;
  daily_create_usage: number;
  daily_join_limit: number;
  daily_join_usage: number;
};

export async function fetchMeetupUsage(): Promise<MeetupUsage> {
  const response = await api.get("/meetups/usage");
  return response.data;
}

export async function updateAttendance(meetupId: string, userIds: string[], status: "PRESENT" | "ABSENT"): Promise<void> {
  await api.post(`/meetups/${meetupId}/attendance`, { user_ids: userIds, status });
}
